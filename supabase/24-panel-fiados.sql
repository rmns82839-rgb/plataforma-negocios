-- ============================================================
-- Plataforma multi-negocio — 24: lo que necesitan Fiados y Préstamos del panel de Cibus
--   · Pagar una factura en específico (no solo "lo más viejo primero").        (registrar_abono_factura)
--   · Préstamo rápido a un cliente ("préstamame 2.000").                        (registrar_prestamo_rapido)
--   · Corregir un movimiento mal digitado (valor, fecha, nota, fecha límite).   (corregir_movimiento_fiado, versión de edición)
--   · Segundo contacto del cliente (esposo/a, familiar) para el cobro por WhatsApp.
--   · Vista clientes_saldo con compras y préstamos; mora calculada sobre lo que de verdad falta de cada factura.
--   · Los abonos y préstamos rápidos también se pueden hacer sin internet (ejecutar_offline).
-- Solo AGREGA. No cambia ni borra datos. Se puede ejecutar más de una vez.
-- ============================================================

-- =====================================================================
-- 1. Columnas nuevas
-- =====================================================================
alter table clientes add column if not exists contacto2 text check (contacto2 is null or char_length(contacto2) <= 80);
alter table clientes add column if not exists telefono2 text check (telefono2 is null or char_length(telefono2) <= 30);

-- aplica_a: en un abono, la factura (cargo) que se pagó. Vacío = abono general (se aplica a lo más viejo).
alter table fiado_movimientos add column if not exists aplica_a uuid;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'fiado_aplica_a_fk') then
    alter table fiado_movimientos add constraint fiado_aplica_a_fk
      foreign key (negocio_id, aplica_a) references fiado_movimientos (negocio_id, id) on delete set null (aplica_a);
  end if;
end $$;
-- concepto: 'prestamo' para los préstamos rápidos (vacío = fiado de una venta o saldo anterior)
alter table fiado_movimientos add column if not exists concepto text;
alter table fiado_movimientos drop constraint if exists fiado_concepto_check;
alter table fiado_movimientos add constraint fiado_concepto_check check (concepto is null or concepto in ('prestamo'));
create index if not exists fiado_aplica_idx on fiado_movimientos (negocio_id, aplica_a) where aplica_a is not null;
create index if not exists ventas_cliente_idx on ventas (negocio_id, cliente_id) where cliente_id is not null;

-- =====================================================================
-- 2. Qué falta pagar de cada factura
--    Primero se descuentan los abonos dirigidos a esa factura; los abonos generales se aplican a lo más viejo.
-- =====================================================================
create or replace view fiado_pendiente with (security_invoker = true) as
with dir as (
  select negocio_id, aplica_a as cargo_id, sum(monto) as dirigido
  from fiado_movimientos where tipo = 'abono' and aplica_a is not null group by negocio_id, aplica_a
),
gen as (
  select negocio_id, cliente_id, sum(monto) as general
  from fiado_movimientos where tipo = 'abono' and aplica_a is null group by negocio_id, cliente_id
),
ch as (
  select m.negocio_id, m.id, m.cliente_id, m.fecha, m.fecha_limite, m.monto,
         greatest(m.monto - coalesce(d.dirigido, 0), 0) as residual
  from fiado_movimientos m left join dir d on d.negocio_id = m.negocio_id and d.cargo_id = m.id
  where m.tipo = 'cargo'
),
ac as (
  select ch.*, sum(ch.residual) over (partition by ch.negocio_id, ch.cliente_id order by ch.fecha, ch.id) as acum from ch
)
select ac.negocio_id, ac.id as cargo_id, ac.cliente_id, ac.fecha, ac.fecha_limite, ac.monto, ac.residual,
       least(ac.residual, ac.acum - coalesce(g.general, 0)) as pendiente
from ac left join gen g on g.negocio_id = ac.negocio_id and g.cliente_id = ac.cliente_id
where ac.residual > 0 and ac.acum > coalesce(g.general, 0);
revoke all on fiado_pendiente from anon, authenticated;
grant select on fiado_pendiente to authenticated;

-- =====================================================================
-- 3. Saldos y mora usan esa misma cuenta (las columnas de antes quedan igual y en el mismo orden; las nuevas van al final)
-- =====================================================================
create or replace view clientes_saldo with (security_invoker = true) as
select c.id, c.negocio_id, c.nombre, c.telefono, c.creado_en, c.dias_credito, c.cupo_credito, c.tipo_documento, c.documento,
       c.email, c.direccion, c.tipo_cliente, c.mora_cobrada_hasta, c.acepta_datos_en, c.acepta_promos, c.acepta_promos_en,
       c.origen, c.politica_version,
       coalesce(s.saldo, 0) as saldo,
       d.deuda_desde,
       d.vence_el,
       coalesce(d.prestamo_pendiente, 0) as prestamo_pendiente,   -- cuánto de lo que debe viene de préstamos rápidos
       coalesce(a.compras, 0) as compras,                         -- actividad del cliente en la tienda
       a.ultima_compra,
       coalesce(a.total_comprado, 0) as total_comprado,
       c.contacto2, c.telefono2
from clientes c
left join (
  select negocio_id, cliente_id, count(*) as compras, max(fecha) as ultima_compra, sum(total) as total_comprado
  from ventas where cliente_id is not null and not coalesce(anulada, false) group by negocio_id, cliente_id
) a on a.negocio_id = c.negocio_id and a.cliente_id = c.id
left join (
  select negocio_id, cliente_id, sum(case tipo when 'cargo' then monto else -monto end) as saldo
  from fiado_movimientos group by negocio_id, cliente_id
) s on s.negocio_id = c.negocio_id and s.cliente_id = c.id
left join lateral (
  select min(k.fecha) as deuda_desde,
         min(coalesce(k.fecha_limite,
                      case when c.dias_credito > 0 then (k.fecha + c.dias_credito * interval '1 day')::date end)) as vence_el,
         sum(k.pendiente) filter (where m.concepto = 'prestamo') as prestamo_pendiente
  from fiado_pendiente k
  join fiado_movimientos m on m.negocio_id = k.negocio_id and m.id = k.cargo_id
  where k.negocio_id = c.negocio_id and k.cliente_id = c.id
) d on true;
grant select on clientes_saldo to authenticated;

create or replace view clientes_mora with (security_invoker = true) as
with pen as (
  select p.negocio_id, p.cliente_id, p.pendiente, c.mora_cobrada_hasta,
         coalesce(p.fecha_limite,
                  case when c.dias_credito > 0 then (p.fecha + c.dias_credito * interval '1 day')::date end) as limite
  from fiado_pendiente p join clientes c on c.negocio_id = p.negocio_id and c.id = p.cliente_id
)
select p.negocio_id, p.cliente_id,
       sum(p.pendiente) as vencido,
       min(p.limite) as vence_desde,
       hoy_colombia() - min(p.limite) as dias_atraso,
       round(sum(p.pendiente * greatest(hoy_colombia() - greatest(p.limite, coalesce(p.mora_cobrada_hasta, p.limite)), 0))
             * r.mora_mensual / 100 / 30) as recargo
from pen p join negocio_reglas r on r.negocio_id = p.negocio_id
where p.limite is not null and p.limite < hoy_colombia()
group by p.negocio_id, p.cliente_id, r.mora_mensual;
grant select on clientes_mora to authenticated;

-- =====================================================================
-- 4. Pagar una factura en específico
-- =====================================================================
create or replace function registrar_abono_factura(
  p_negocio_id uuid, p_cargo_id uuid, p_monto numeric, p_metodo text default 'efectivo', p_nota text default null
) returns uuid
language plpgsql
as $$
declare
  v_cargo fiado_movimientos%rowtype;
  v_pend  numeric;
  v_monto numeric := round(p_monto);
  v_id    uuid;
begin
  if not es_personal(p_negocio_id) then raise exception 'Sin acceso'; end if;
  perform exigir_modulo(p_negocio_id, 'fiados');
  if v_monto is null or v_monto <= 0 then raise exception 'El abono debe ser mayor que cero'; end if;

  select * into v_cargo from fiado_movimientos where negocio_id = p_negocio_id and id = p_cargo_id and tipo = 'cargo';
  if not found then raise exception 'Esa factura no existe'; end if;

  perform 1 from clientes where negocio_id = p_negocio_id and id = v_cargo.cliente_id for update;      -- un abono a la vez por cliente

  select pendiente into v_pend from fiado_pendiente where negocio_id = p_negocio_id and cargo_id = p_cargo_id;
  if coalesce(v_pend, 0) <= 0 then raise exception 'Esa factura ya está pagada'; end if;
  if v_monto > v_pend then
    raise exception 'El abono (%) es mayor que lo que falta de esa factura (%)', v_monto, v_pend;
  end if;

  insert into fiado_movimientos (negocio_id, cliente_id, tipo, monto, metodo, nota, aplica_a)
  values (p_negocio_id, v_cargo.cliente_id, 'abono', v_monto, p_metodo, nullif(trim(coalesce(p_nota, '')), ''), p_cargo_id)
  returning id into v_id;
  return v_id;
end;
$$;

-- =====================================================================
-- 5. Préstamo rápido a un cliente (suma a lo que debe, sin venta; guarda para qué fue)
-- =====================================================================
create or replace function registrar_prestamo_rapido(
  p_negocio_id uuid, p_cliente_id uuid, p_monto numeric, p_metodo text default 'efectivo', p_nota text default null,
  p_fecha_limite date default null
) returns uuid
language plpgsql
as $$
declare
  v_monto numeric := round(p_monto);
  v_id    uuid;
begin
  if not es_dueno(p_negocio_id) then raise exception 'Solo el dueño puede prestar dinero'; end if;
  perform exigir_modulo(p_negocio_id, 'fiados');
  if v_monto is null or v_monto <= 0 then raise exception 'El valor debe ser mayor que cero'; end if;
  perform 1 from clientes where negocio_id = p_negocio_id and id = p_cliente_id;
  if not found then raise exception 'Cliente no encontrado'; end if;

  insert into fiado_movimientos (negocio_id, cliente_id, tipo, monto, metodo, nota, concepto, fecha_limite)
  values (p_negocio_id, p_cliente_id, 'cargo', v_monto, coalesce(p_metodo, 'efectivo'),
          coalesce(nullif(trim(coalesce(p_nota, '')), ''), 'Préstamo rápido'), 'prestamo', p_fecha_limite)
  returning id into v_id;
  return v_id;
end;
$$;

-- =====================================================================
-- 6. Corregir un movimiento (solo el dueño): valor, fecha, nota y fecha límite. No toca los fiados que vienen de una venta.
--    (La otra versión de este nombre, con motivo, borra el movimiento; esta lo edita.)
-- =====================================================================
create or replace function corregir_movimiento_fiado(
  p_negocio_id uuid, p_id uuid, p_monto numeric, p_fecha date default null, p_nota text default null, p_fecha_limite date default null
) returns void
language plpgsql
as $$
declare
  m       fiado_movimientos%rowtype;
  v_monto numeric := round(p_monto);
  v_otros numeric;
  v_cargo numeric;
begin
  if not es_dueno(p_negocio_id) then raise exception 'Solo el dueño puede corregir movimientos'; end if;
  perform exigir_modulo(p_negocio_id, 'fiados');
  if v_monto is null or v_monto <= 0 then raise exception 'El valor debe ser mayor que cero'; end if;
  select * into m from fiado_movimientos where negocio_id = p_negocio_id and id = p_id for update;
  if not found then raise exception 'Ese movimiento no existe'; end if;
  if m.venta_id is not null then
    raise exception 'Este fiado viene de una venta: para corregirlo anula la venta y hazla de nuevo';
  end if;

  if m.tipo = 'cargo' then
    select coalesce(sum(monto), 0) into v_otros from fiado_movimientos where negocio_id = p_negocio_id and tipo = 'abono' and aplica_a = m.id;
    if v_monto < v_otros then
      raise exception 'Ya se pagaron % a esta factura: el valor no puede ser menor', v_otros;
    end if;
  elsif m.aplica_a is not null then
    select monto into v_cargo from fiado_movimientos where negocio_id = p_negocio_id and id = m.aplica_a;
    select coalesce(sum(monto), 0) into v_otros from fiado_movimientos
     where negocio_id = p_negocio_id and tipo = 'abono' and aplica_a = m.aplica_a and id <> m.id;
    if v_monto + v_otros > coalesce(v_cargo, 0) then
      raise exception 'El abono supera lo que se debía de esa factura (%)', coalesce(v_cargo, 0) - v_otros;
    end if;
  end if;

  update fiado_movimientos set
    monto        = v_monto,
    nota         = case when p_nota is null then nota else nullif(trim(p_nota), '') end,
    fecha        = case when p_fecha is null then fecha else ((p_fecha::timestamp + interval '12 hours') at time zone 'America/Bogota') end,
    fecha_limite = case when m.tipo = 'cargo' then p_fecha_limite else fecha_limite end
  where negocio_id = p_negocio_id and id = p_id;
end;
$$;

-- =====================================================================
-- 7. Sin internet: ahora también los abonos a una factura y los préstamos rápidos
-- =====================================================================
create or replace function ejecutar_offline(p_negocio_id uuid, p_clave uuid, p_fecha timestamptz, p_rpc text, p_args jsonb)
returns uuid
language plpgsql
as $$
declare v_id uuid;
begin
  if not es_personal(p_negocio_id) then raise exception 'Sin acceso'; end if;
  if p_clave is null then raise exception 'Falta la clave'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_negocio_id::text || p_clave::text, 1));
  select resultado into v_id from acciones_claves where negocio_id = p_negocio_id and clave = p_clave;
  if found then return v_id; end if;

  if p_rpc = 'registrar_abono' then
    v_id := registrar_abono(p_negocio_id, (p_args->>'p_cliente_id')::uuid, (p_args->>'p_monto')::numeric,
                            coalesce(p_args->>'p_metodo', 'efectivo'), p_args->>'p_nota');
  elsif p_rpc = 'registrar_abono_factura' then
    v_id := registrar_abono_factura(p_negocio_id, (p_args->>'p_cargo_id')::uuid, (p_args->>'p_monto')::numeric,
                                    coalesce(p_args->>'p_metodo', 'efectivo'), p_args->>'p_nota');
  elsif p_rpc = 'registrar_prestamo_rapido' then
    v_id := registrar_prestamo_rapido(p_negocio_id, (p_args->>'p_cliente_id')::uuid, (p_args->>'p_monto')::numeric,
                                      coalesce(p_args->>'p_metodo', 'efectivo'), p_args->>'p_nota',
                                      nullif(p_args->>'p_fecha_limite', '')::date);
  else
    raise exception 'Acción no permitida sin conexión: %', p_rpc;
  end if;

  insert into acciones_claves (negocio_id, clave, resultado) values (p_negocio_id, p_clave, v_id);
  if v_id is not null and p_fecha is not null and p_fecha < now() - interval '2 minutes' and p_fecha > now() - interval '30 days' then
    update fiado_movimientos set fecha = p_fecha where negocio_id = p_negocio_id and id = v_id;
  end if;
  return v_id;
end;
$$;

-- =====================================================================
-- 8. Permisos (las funciones nuevas nacen abiertas a PUBLIC: se cierran a mano)
-- =====================================================================
revoke all on function registrar_abono_factura(uuid, uuid, numeric, text, text),
                       registrar_prestamo_rapido(uuid, uuid, numeric, text, text, date),
                       corregir_movimiento_fiado(uuid, uuid, numeric, date, text, date),
                       ejecutar_offline(uuid, uuid, timestamptz, text, jsonb) from public, anon;
grant execute on function registrar_abono_factura(uuid, uuid, numeric, text, text),
                          registrar_prestamo_rapido(uuid, uuid, numeric, text, text, date),
                          corregir_movimiento_fiado(uuid, uuid, numeric, date, text, date),
                          ejecutar_offline(uuid, uuid, timestamptz, text, jsonb) to authenticated;

notify pgrst, 'reload schema';

-- ---------- VERIFICACIÓN: las 15 filas deben decir ok = true ----------
select chequeo, ok from (
  select 1 as n, chequeo, ok from verificar_aislamiento()
  union all select 2, 'Columnas nuevas del fiado (aplica_a, concepto) y del cliente (segundo contacto)',
         (select count(*) from information_schema.columns where table_schema = 'public'
           and ((table_name = 'fiado_movimientos' and column_name in ('aplica_a', 'concepto')) or (table_name = 'clientes' and column_name in ('contacto2', 'telefono2')))) = 4
  union all select 3, 'Vista fiado_pendiente existe y es solo del negocio de quien consulta',
         to_regclass('public.fiado_pendiente') is not null and has_table_privilege('authenticated', 'fiado_pendiente', 'select')
         and not has_table_privilege('anon', 'fiado_pendiente', 'select')
  union all select 4, 'Anónimo no puede pagar facturas, prestar ni corregir',
         not has_function_privilege('anon', 'registrar_abono_factura(uuid,uuid,numeric,text,text)', 'execute')
         and not has_function_privilege('anon', 'registrar_prestamo_rapido(uuid,uuid,numeric,text,text,date)', 'execute')
         and not has_function_privilege('anon', 'corregir_movimiento_fiado(uuid,uuid,numeric,date,text,date)', 'execute')
         and not has_function_privilege('anon', 'ejecutar_offline(uuid,uuid,timestamptz,text,jsonb)', 'execute')
  union all select 5, 'Saldos de clientes incluyen compras y préstamos',
         (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'clientes_saldo'
           and column_name in ('prestamo_pendiente', 'compras', 'ultima_compra', 'total_comprado', 'contacto2', 'telefono2')) = 6
) t order by n, chequeo;
