-- ============================================================
-- Plataforma multi-negocio — 22: saldo prepago (con bono) y resumen semanal   (grupo B de Cibus)
--   · Saldo prepago: el cliente deja plata adelantada y la va gastando en la caja.     módulo: prepago (plan Gestión y Completo)
--       - Recargar, devolver y corregir: SOLO el dueño. Todo queda en el historial y en la auditoría.
--       - El historial NO se edita ni se borra: lo equivocado se corrige con un movimiento contrario.
--       - El saldo nunca baja de cero, aunque dos cajeros cobren a la vez.
--       - Bono opcional en la recarga (con fecha límite). Se gasta primero el bono que vence antes; el bono NO se devuelve en plata.
--       - Anular una venta pagada con saldo devuelve la plata (y el bono, si aún no venció).
--       - Forma de pago «Saldo prepago» en la caja (se crea sola para cada negocio con el módulo).
--       - La caja del día suma las recargas en efectivo y resta las devoluciones en efectivo.
--   · Resumen semanal para el dueño (visitas, pedidos, ventas, más pedidos, clientes nuevos, opiniones).   módulo: resumen_semanal
-- Solo AGREGA (y reemplaza caja_dia con la misma lógica más lo de prepago). No borra datos. Se puede ejecutar más de una vez.
-- ============================================================

-- =====================================================================
-- 1. Módulo nuevo y planes
-- =====================================================================
insert into modulos (clave, nombre, depende_de) values ('prepago', 'Saldo prepago de clientes', '{caja}') on conflict (clave) do nothing;
insert into plan_modulos (plan, modulo) values ('gestion', 'prepago'), ('completo', 'prepago') on conflict do nothing;

-- Los negocios que ya tienen caja en esos planes lo reciben encendido
insert into negocio_modulos (negocio_id, modulo, activo, origen)
select n.id, 'prepago', true, 'plan'
  from negocios n
 where n.plan in ('gestion', 'completo') and modulo_activo(n.id, 'caja')
on conflict (negocio_id, modulo) do nothing;

-- =====================================================================
-- 2. Forma de pago «Saldo prepago»
-- =====================================================================
do $$
declare c record;
begin
  for c in select conname from pg_constraint
            where conrelid = 'formas_pago'::regclass and contype = 'c' and pg_get_constraintdef(oid) ilike '%tipo%' loop
    execute format('alter table formas_pago drop constraint %I', c.conname);
  end loop;
end $$;
alter table formas_pago add constraint formas_pago_tipo_check check (tipo in ('efectivo', 'digital', 'datafono', 'fiado', 'prepago'));

-- Cada vez que el módulo se enciende o se apaga en un negocio, la forma de pago lo sigue
create or replace function sincronizar_forma_prepago() returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if new.modulo <> 'prepago' then return new; end if;
  insert into formas_pago (negocio_id, id, nombre, tipo, activa, orden)
  values (new.negocio_id, 'prepago', 'Saldo prepago', 'prepago', new.activo, 70)
  on conflict (negocio_id, id) do update set activa = excluded.activa;
  return new;
end;
$$;
drop trigger if exists ccc_forma_prepago on negocio_modulos;
create trigger ccc_forma_prepago after insert or update of activo on negocio_modulos
  for each row execute function sincronizar_forma_prepago();

-- Los negocios que ya tenían el módulo encendido (por el insert de arriba o antes)
insert into formas_pago (negocio_id, id, nombre, tipo, activa, orden)
select m.negocio_id, 'prepago', 'Saldo prepago', 'prepago', m.activo, 70 from negocio_modulos m where m.modulo = 'prepago'
on conflict (negocio_id, id) do update set activa = excluded.activa;

-- =====================================================================
-- 3. Historial de movimientos (nunca se edita ni se borra)
-- =====================================================================
create table if not exists prepago_movimientos (
  id         uuid not null default gen_random_uuid(),
  negocio_id uuid not null references negocios(id),
  cliente_id uuid not null,
  tipo       text not null check (tipo in ('recarga', 'consumo', 'reverso', 'devolucion', 'ajuste_mas', 'ajuste_menos', 'bono')),
  monto      numeric(12,0) not null check (monto > 0),
  metodo     text check (metodo is null or metodo ~ '^[a-z0-9_]{2,30}$'),      -- con qué entró o salió la plata (recarga / devolución)
  venta_id   uuid,                                                              -- consumo o reverso: de qué venta
  nota       text check (nota is null or char_length(nota) <= 200),
  clave      uuid,                                                              -- evita que un reintento duplique la recarga
  vence      date,                                                              -- solo en los bonos
  monto_bono numeric(12,0) not null default 0,                                  -- en consumos y reversos: cuánto salió del bono
  fecha      timestamptz not null default now(),
  creado_por uuid default auth.uid(),
  primary key (negocio_id, id),
  unique (negocio_id, clave),
  foreign key (negocio_id, cliente_id) references clientes (negocio_id, id),
  foreign key (negocio_id, venta_id)   references ventas (negocio_id, id),
  constraint prepago_bono_check check (monto_bono >= 0 and monto_bono <= monto)
);
create index if not exists prepago_cliente_idx on prepago_movimientos (negocio_id, cliente_id, fecha desc);
create index if not exists prepago_venta_idx   on prepago_movimientos (negocio_id, venta_id) where venta_id is not null;
create index if not exists prepago_dia_idx     on prepago_movimientos (negocio_id, fecha desc);

create table if not exists prepago_bono_usos (
  id          uuid not null default gen_random_uuid(),
  negocio_id  uuid not null references negocios(id),
  bono_id     uuid not null,
  consumo_id  uuid not null,
  monto       numeric(12,0) not null check (monto <> 0),     -- positivo: gastó del bono · negativo: se devolvió (venta anulada)
  fecha       timestamptz not null default now(),
  primary key (negocio_id, id),
  foreign key (negocio_id, bono_id)    references prepago_movimientos (negocio_id, id),
  foreign key (negocio_id, consumo_id) references prepago_movimientos (negocio_id, id)
);
create index if not exists prepago_usos_bono_idx    on prepago_bono_usos (negocio_id, bono_id);
create index if not exists prepago_usos_consumo_idx on prepago_bono_usos (negocio_id, consumo_id);

select _aplicar_politicas('prepago_movimientos', 'p', null, null, null);   -- el personal lee; todo se escribe con las funciones de abajo
select _aplicar_politicas('prepago_bono_usos',   'p', null, null, null);
select _triggers_tabla('prepago_movimientos');
select _triggers_tabla('prepago_bono_usos');

create or replace function prepago_inmutable() returns trigger language plpgsql as $$
begin
  raise exception 'El historial del saldo prepago no se modifica ni se borra: corrígelo con un ajuste';
end $$;
drop trigger if exists prepago_no_cambiar on prepago_movimientos;
create trigger prepago_no_cambiar before update or delete on prepago_movimientos for each row execute function prepago_inmutable();
drop trigger if exists prepago_usos_no_cambiar on prepago_bono_usos;
create trigger prepago_usos_no_cambiar before update or delete on prepago_bono_usos for each row execute function prepago_inmutable();

drop trigger if exists aud_prepago_ins on prepago_movimientos;
create trigger aud_prepago_ins after insert on prepago_movimientos for each row execute function auditar();

-- =====================================================================
-- 4. Saldo de cada cliente: plata propia + bono vigente
-- =====================================================================
drop view if exists prepago_saldos;
create view prepago_saldos with (security_invoker = true) as
with propio as (
  select negocio_id, cliente_id,
         sum(case tipo when 'recarga' then monto when 'ajuste_mas' then monto
                       when 'reverso' then monto - monto_bono
                       when 'consumo' then -(monto - monto_bono)
                       when 'devolucion' then -monto when 'ajuste_menos' then -monto else 0 end) as saldo_real,
         sum(case when tipo = 'recarga' then monto else 0 end) as recargado,
         max(fecha) as ultimo_movimiento
    from prepago_movimientos group by negocio_id, cliente_id
), bonos as (
  select b.negocio_id, b.cliente_id,
         sum(b.monto - coalesce(u.usado, 0)) as bono,
         min(b.vence) filter (where b.vence is not null) as bono_vence
    from prepago_movimientos b
    left join (select negocio_id, bono_id, sum(monto) as usado from prepago_bono_usos group by negocio_id, bono_id) u
           on u.negocio_id = b.negocio_id and u.bono_id = b.id
   where b.tipo = 'bono' and (b.vence is null or b.vence >= hoy_colombia()) and b.monto - coalesce(u.usado, 0) > 0
   group by b.negocio_id, b.cliente_id
)
select p.negocio_id, p.cliente_id,
       p.saldo_real + coalesce(bo.bono, 0) as saldo,        -- lo que puede gastar hoy
       p.recargado,
       p.ultimo_movimiento,
       p.saldo_real,                                        -- la plata que dejó (esto es lo que se le debe)
       coalesce(bo.bono, 0) as bono,                        -- bono vigente sin gastar
       bo.bono_vence                                        -- cuándo vence el primero (null = sin fecha)
  from propio p left join bonos bo using (negocio_id, cliente_id);

-- =====================================================================
-- 5. Cobrar con saldo: primero el bono que vence antes, después la plata del cliente.
--    Se engancha al pago de la venta: si el saldo no alcanza, TODA la venta se cancela (nada queda a medias).
-- =====================================================================
create or replace function prepago_al_pagar() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_tipo text; v_cli uuid; v_nombre text; v_real numeric; v_bono numeric; v_de_bono numeric; v_resta numeric; v_uso numeric;
  v_cid uuid := gen_random_uuid(); g record;
begin
  select tipo into v_tipo from formas_pago where negocio_id = new.negocio_id and id = new.metodo;
  if v_tipo is distinct from 'prepago' then return new; end if;
  perform exigir_modulo(new.negocio_id, 'prepago');
  select cliente_id into v_cli from ventas where negocio_id = new.negocio_id and id = new.venta_id;
  if v_cli is null then raise exception 'Elige el cliente para cobrar con su saldo prepago'; end if;
  select nombre into v_nombre from clientes where negocio_id = new.negocio_id and id = v_cli for update;   -- dos cobros a la vez hacen fila

  select coalesce(sum(case tipo when 'recarga' then monto when 'ajuste_mas' then monto when 'reverso' then monto - monto_bono
                                when 'consumo' then -(monto - monto_bono) when 'devolucion' then -monto when 'ajuste_menos' then -monto else 0 end), 0)
    into v_real from prepago_movimientos where negocio_id = new.negocio_id and cliente_id = v_cli;
  select coalesce(sum(b.monto - coalesce((select sum(u.monto) from prepago_bono_usos u where u.negocio_id = b.negocio_id and u.bono_id = b.id), 0)), 0)
    into v_bono from prepago_movimientos b
   where b.negocio_id = new.negocio_id and b.cliente_id = v_cli and b.tipo = 'bono' and (b.vence is null or b.vence >= hoy_colombia());
  v_bono := greatest(v_bono, 0);

  if new.monto > v_real + v_bono then
    raise exception 'Saldo prepago insuficiente: % tiene % disponible', v_nombre, (v_real + v_bono);
  end if;

  v_de_bono := least(new.monto, v_bono);
  insert into prepago_movimientos (id, negocio_id, cliente_id, tipo, monto, venta_id, monto_bono)
  values (v_cid, new.negocio_id, v_cli, 'consumo', new.monto, new.venta_id, v_de_bono);

  v_resta := v_de_bono;
  for g in
    select b.id, b.monto - coalesce((select sum(u.monto) from prepago_bono_usos u where u.negocio_id = b.negocio_id and u.bono_id = b.id), 0) as queda
      from prepago_movimientos b
     where b.negocio_id = new.negocio_id and b.cliente_id = v_cli and b.tipo = 'bono' and (b.vence is null or b.vence >= hoy_colombia())
     order by b.vence nulls last, b.fecha
  loop
    exit when v_resta <= 0;
    if g.queda > 0 then
      v_uso := least(g.queda, v_resta);
      insert into prepago_bono_usos (negocio_id, bono_id, consumo_id, monto) values (new.negocio_id, g.id, v_cid, v_uso);
      v_resta := v_resta - v_uso;
    end if;
  end loop;
  return new;
end $$;
drop trigger if exists prepago_pago on venta_pagos;
create trigger prepago_pago after insert on venta_pagos for each row execute function prepago_al_pagar();

-- Anular la venta devuelve la plata y el bono
create or replace function prepago_al_anular() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_cons numeric; v_bono numeric; v_cli uuid;
begin
  if not (new.anulada and not coalesce(old.anulada, false)) then return new; end if;
  if exists (select 1 from prepago_movimientos where negocio_id = new.negocio_id and venta_id = new.id and tipo = 'reverso') then return new; end if;
  select cliente_id, coalesce(sum(monto), 0), coalesce(sum(monto_bono), 0) into v_cli, v_cons, v_bono
    from prepago_movimientos where negocio_id = new.negocio_id and venta_id = new.id and tipo = 'consumo' group by cliente_id;
  if v_cons is null or v_cons = 0 then return new; end if;
  insert into prepago_movimientos (negocio_id, cliente_id, tipo, monto, monto_bono, venta_id, nota)
  values (new.negocio_id, v_cli, 'reverso', v_cons, v_bono, new.id, 'Venta anulada');
  insert into prepago_bono_usos (negocio_id, bono_id, consumo_id, monto)
  select u.negocio_id, u.bono_id, u.consumo_id, -u.monto from prepago_bono_usos u
    join prepago_movimientos c on c.negocio_id = u.negocio_id and c.id = u.consumo_id
   where c.negocio_id = new.negocio_id and c.venta_id = new.id and c.tipo = 'consumo' and u.monto > 0;
  return new;
end $$;
drop trigger if exists prepago_anulacion on ventas;
create trigger prepago_anulacion after update of anulada on ventas for each row execute function prepago_al_anular();

-- =====================================================================
-- 6. Recargar (con bono opcional), devolver y ajustar: solo el dueño
-- =====================================================================
create or replace function prepago_recargar(p_negocio_id uuid, p_cliente_id uuid, p_monto numeric, p_metodo text, p_nota text default null,
                                            p_clave uuid default null, p_bono numeric default 0, p_bono_vence date default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_monto numeric := round(p_monto); v_bono numeric := round(coalesce(p_bono, 0));
begin
  if not es_dueno(p_negocio_id) then raise exception 'Solo el dueño puede recargar saldo'; end if;
  perform exigir_modulo(p_negocio_id, 'prepago');
  if p_clave is not null then select id into v_id from prepago_movimientos where negocio_id = p_negocio_id and clave = p_clave; if found then return v_id; end if; end if;
  if v_monto is null or v_monto <= 0 then raise exception 'El valor de la recarga debe ser mayor a cero'; end if;
  if v_monto > 5000000 then raise exception 'Una recarga no puede pasar de $5.000.000'; end if;
  if v_bono < 0 then raise exception 'El bono no puede ser negativo'; end if;
  if v_bono > v_monto then raise exception 'El bono no puede ser mayor que la recarga'; end if;
  if v_bono > 0 and p_bono_vence is not null and p_bono_vence <= hoy_colombia() then raise exception 'La fecha límite del bono debe ser después de hoy'; end if;
  if not exists (select 1 from formas_pago where negocio_id = p_negocio_id and id = p_metodo and activa and tipo in ('efectivo', 'digital', 'datafono')) then
    raise exception 'Elige con qué pagó el cliente la recarga';
  end if;
  perform 1 from clientes where negocio_id = p_negocio_id and id = p_cliente_id for update;
  if not found then raise exception 'Cliente no encontrado'; end if;
  insert into prepago_movimientos (negocio_id, cliente_id, tipo, monto, metodo, nota, clave)
  values (p_negocio_id, p_cliente_id, 'recarga', v_monto, p_metodo, nullif(trim(coalesce(p_nota, '')), ''), p_clave) returning id into v_id;
  if v_bono > 0 then
    insert into prepago_movimientos (negocio_id, cliente_id, tipo, monto, vence, nota)
    values (p_negocio_id, p_cliente_id, 'bono', v_bono, p_bono_vence, 'Bono por recarga');
  end if;
  return v_id;
end $$;

-- Devolver: solo la plata que el cliente dejó (el bono no se devuelve en plata)
create or replace function prepago_devolver(p_negocio_id uuid, p_cliente_id uuid, p_monto numeric, p_metodo text, p_motivo text, p_clave uuid default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_monto numeric := round(p_monto); v_real numeric;
begin
  if not es_dueno(p_negocio_id) then raise exception 'Solo el dueño puede devolver saldo'; end if;
  perform exigir_modulo(p_negocio_id, 'prepago');
  if p_clave is not null then select id into v_id from prepago_movimientos where negocio_id = p_negocio_id and clave = p_clave; if found then return v_id; end if; end if;
  if v_monto is null or v_monto <= 0 then raise exception 'El valor debe ser mayor a cero'; end if;
  if p_motivo is null or length(trim(p_motivo)) < 3 then raise exception 'Escribe el motivo de la devolución'; end if;
  if not exists (select 1 from formas_pago where negocio_id = p_negocio_id and id = p_metodo and activa and tipo in ('efectivo', 'digital', 'datafono')) then
    raise exception 'Elige con qué se le devuelve la plata';
  end if;
  perform 1 from clientes where negocio_id = p_negocio_id and id = p_cliente_id for update;
  if not found then raise exception 'Cliente no encontrado'; end if;
  select coalesce(sum(case tipo when 'recarga' then monto when 'ajuste_mas' then monto when 'reverso' then monto - monto_bono
                                when 'consumo' then -(monto - monto_bono) when 'devolucion' then -monto when 'ajuste_menos' then -monto else 0 end), 0)
    into v_real from prepago_movimientos where negocio_id = p_negocio_id and cliente_id = p_cliente_id;
  if v_monto > v_real then raise exception 'Solo se puede devolver la plata que dejó el cliente (%). El bono no se devuelve', v_real; end if;
  insert into prepago_movimientos (negocio_id, cliente_id, tipo, monto, metodo, nota, clave)
  values (p_negocio_id, p_cliente_id, 'devolucion', v_monto, p_metodo, trim(p_motivo), p_clave) returning id into v_id;
  return v_id;
end $$;

-- Corregir un error (una recarga mal digitada): suma (monto positivo) o resta (negativo). No mueve plata de la caja.
create or replace function prepago_ajustar(p_negocio_id uuid, p_cliente_id uuid, p_monto numeric, p_motivo text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_monto numeric := round(p_monto); v_real numeric;
begin
  if not es_dueno(p_negocio_id) then raise exception 'Solo el dueño puede corregir el saldo'; end if;
  perform exigir_modulo(p_negocio_id, 'prepago');
  if v_monto is null or v_monto = 0 then raise exception 'El ajuste no puede ser cero'; end if;
  if p_motivo is null or length(trim(p_motivo)) < 3 then raise exception 'Escribe el motivo del ajuste'; end if;
  perform 1 from clientes where negocio_id = p_negocio_id and id = p_cliente_id for update;
  if not found then raise exception 'Cliente no encontrado'; end if;
  select coalesce(sum(case tipo when 'recarga' then monto when 'ajuste_mas' then monto when 'reverso' then monto - monto_bono
                                when 'consumo' then -(monto - monto_bono) when 'devolucion' then -monto when 'ajuste_menos' then -monto else 0 end), 0)
    into v_real from prepago_movimientos where negocio_id = p_negocio_id and cliente_id = p_cliente_id;
  if v_monto < 0 and -v_monto > v_real then raise exception 'El saldo no puede quedar negativo (tiene %)', v_real; end if;
  insert into prepago_movimientos (negocio_id, cliente_id, tipo, monto, nota)
  values (p_negocio_id, p_cliente_id, case when v_monto > 0 then 'ajuste_mas' else 'ajuste_menos' end, abs(v_monto), trim(p_motivo)) returning id into v_id;
  return v_id;
end $$;

-- =====================================================================
-- 7. Caja del día: ahora cuenta las recargas y devoluciones de prepago
--    (misma función del archivo 19; se agregan 'recargas', 'devoluciones' y se ajusta 'efectivo_esperado')
-- =====================================================================
create or replace function caja_dia(p_negocio_id uuid, p_dia date default null)
returns jsonb
language plpgsql stable
as $$
declare
  v_dia date := coalesce(p_dia, hoy_colombia());
  v_res jsonb;
begin
  if not (es_personal(p_negocio_id) or es_soporte(p_negocio_id)) then raise exception 'No autorizado'; end if;
  perform exigir_modulo(p_negocio_id, 'caja');

  with
  vs as (
    select v.* from ventas v
     where v.negocio_id = p_negocio_id and (v.fecha at time zone 'America/Bogota')::date = v_dia
  ),
  pagos as (
    select vp.metodo, coalesce(fp.nombre, vp.metodo) as nombre, coalesce(fp.tipo, 'digital') as tipo,
           sum(vp.monto) as monto, count(distinct vp.venta_id)::int as ventas
      from venta_pagos vp
      join vs on vs.id = vp.venta_id and not vs.anulada
      left join formas_pago fp on fp.negocio_id = vp.negocio_id and fp.id = vp.metodo
     where vp.negocio_id = p_negocio_id
     group by vp.metodo, fp.nombre, fp.tipo
  ),
  abo as (
    select metodo, sum(monto) as monto, count(*)::int as abonos
      from fiado_movimientos
     where negocio_id = p_negocio_id and tipo = 'abono' and (fecha at time zone 'America/Bogota')::date = v_dia
     group by metodo
  ),
  gas as (
    select id, tipo, descripcion, monto, fecha, metodo from gastos
     where negocio_id = p_negocio_id and (fecha at time zone 'America/Bogota')::date = v_dia
  ),
  mov as (
    select id, tipo, monto, motivo, fecha from caja_movimientos
     where negocio_id = p_negocio_id and (fecha at time zone 'America/Bogota')::date = v_dia
  ),
  rec as (
    select metodo, sum(monto) as monto, count(*)::int as recargas from prepago_movimientos
     where negocio_id = p_negocio_id and tipo = 'recarga' and (fecha at time zone 'America/Bogota')::date = v_dia
     group by metodo
  ),
  dev as (
    select metodo, sum(monto) as monto, count(*)::int as devoluciones from prepago_movimientos
     where negocio_id = p_negocio_id and tipo = 'devolucion' and (fecha at time zone 'America/Bogota')::date = v_dia
     group by metodo
  ),
  lista as (
    select vs.id, vs.numero, vs.fecha, vs.total, vs.metodo, vs.anulada, vs.domicilio, c.nombre as cliente
      from vs left join clientes c on c.negocio_id = vs.negocio_id and c.id = vs.cliente_id
     order by vs.fecha desc limit 60
  )
  select jsonb_build_object(
    'dia', v_dia,
    'ventas',       (select count(*) from vs where not anulada),
    'anuladas',     (select count(*) from vs where anulada),
    'vendido',      coalesce((select sum(total) from vs where not anulada), 0),
    'fiado',        coalesce((select sum(monto) from pagos where tipo = 'fiado'), 0),
    'por_pago',     coalesce((select jsonb_agg(to_jsonb(p) order by p.monto desc) from pagos p), '[]'::jsonb),
    'abonos',       coalesce((select jsonb_agg(to_jsonb(a)) from abo a), '[]'::jsonb),
    'abonos_total', coalesce((select sum(monto) from abo), 0),
    'recargas',       coalesce((select jsonb_agg(to_jsonb(r)) from rec r), '[]'::jsonb),
    'recargas_total', coalesce((select sum(monto) from rec), 0),
    'devoluciones',       coalesce((select jsonb_agg(to_jsonb(d)) from dev d), '[]'::jsonb),
    'devoluciones_total', coalesce((select sum(monto) from dev), 0),
    'gastos',       coalesce((select jsonb_agg(to_jsonb(g) order by g.fecha) from gas g), '[]'::jsonb),
    'gastos_total', coalesce((select sum(monto) from gas), 0),
    'movimientos',    coalesce((select jsonb_agg(to_jsonb(m) order by m.fecha) from mov m), '[]'::jsonb),
    'ingresos_total', coalesce((select sum(monto) from mov where tipo = 'ingreso'), 0),
    'retiros_total',  coalesce((select sum(monto) from mov where tipo = 'retiro'), 0),
    -- Efectivo que debe haber: ventas, abonos y recargas en efectivo + ingresos − retiros − gastos y devoluciones en efectivo
    'efectivo_esperado',
        coalesce((select sum(monto) from pagos where tipo = 'efectivo'), 0)
      + coalesce((select sum(monto) from abo where metodo = 'efectivo'), 0)
      + coalesce((select sum(monto) from rec where metodo = 'efectivo'), 0)
      + coalesce((select sum(monto) from mov where tipo = 'ingreso'), 0)
      - coalesce((select sum(monto) from mov where tipo = 'retiro'), 0)
      - coalesce((select sum(monto) from gas where metodo = 'efectivo'), 0)
      - coalesce((select sum(monto) from dev where metodo = 'efectivo'), 0),
    'lista',        coalesce((select jsonb_agg(to_jsonb(l) order by l.fecha desc) from lista l), '[]'::jsonb)
  ) into v_res;
  return v_res;
end;
$$;

-- =====================================================================
-- 8. Resumen semanal para el dueño
--    Compara los últimos p_dias días (7 por defecto) con los p_dias anteriores. Los pedidos cancelados y de práctica no cuentan.
-- =====================================================================
create or replace function resumen_semanal(p_negocio_id uuid, p_dias int default 7)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  v_n   int := least(greatest(coalesce(p_dias, 7), 1), 31);
  v_f2  timestamptz := now();
  v_f1  timestamptz := now() - make_interval(days => v_n);
  v_f0  timestamptz := now() - make_interval(days => v_n * 2);
  v_hoy date := hoy_colombia();
  v_res jsonb;
begin
  if not (es_dueno(p_negocio_id) or es_soporte(p_negocio_id)) then raise exception 'Solo el dueño puede ver el resumen'; end if;
  perform exigir_modulo(p_negocio_id, 'resumen_semanal');

  select jsonb_build_object(
    'dias', v_n, 'desde', v_f1, 'hasta', v_f2,
    'pedidos', jsonb_build_object(
      'actual',   (select count(*) from pedidos_tienda where negocio_id = p_negocio_id and not es_practica and creado_en >= v_f1 and creado_en < v_f2 and estado <> 'cancelado'),
      'anterior', (select count(*) from pedidos_tienda where negocio_id = p_negocio_id and not es_practica and creado_en >= v_f0 and creado_en < v_f1 and estado <> 'cancelado')),
    'ventas', jsonb_build_object(
      'actual',   (select coalesce(sum(total), 0) from pedidos_tienda where negocio_id = p_negocio_id and not es_practica and creado_en >= v_f1 and creado_en < v_f2 and estado <> 'cancelado'),
      'anterior', (select coalesce(sum(total), 0) from pedidos_tienda where negocio_id = p_negocio_id and not es_practica and creado_en >= v_f0 and creado_en < v_f1 and estado <> 'cancelado')),
    'cancelados', (select count(*) from pedidos_tienda where negocio_id = p_negocio_id and not es_practica and creado_en >= v_f1 and creado_en < v_f2 and estado = 'cancelado'),
    'domicilios', (select count(*) from pedidos_tienda where negocio_id = p_negocio_id and not es_practica and creado_en >= v_f1 and creado_en < v_f2 and estado <> 'cancelado' and entrega = 'domicilio'),
    'recoger',    (select count(*) from pedidos_tienda where negocio_id = p_negocio_id and not es_practica and creado_en >= v_f1 and creado_en < v_f2 and estado <> 'cancelado' and entrega <> 'domicilio'),
    'visitas', jsonb_build_object(
      'actual',   (select count(*) from visitas where negocio_id = p_negocio_id and catalogo = 'tienda' and dia > v_hoy - v_n and dia <= v_hoy),
      'anterior', (select count(*) from visitas where negocio_id = p_negocio_id and catalogo = 'tienda' and dia > v_hoy - v_n * 2 and dia <= v_hoy - v_n)),
    'clientes_nuevos', (select count(*) from clientes where negocio_id = p_negocio_id and creado_en >= v_f1 and creado_en < v_f2),
    'opiniones', jsonb_build_object(
      'nuevas',     (select count(*) from opiniones where negocio_id = p_negocio_id and creado_en >= v_f1 and creado_en < v_f2),
      'pendientes', (select count(*) from opiniones where negocio_id = p_negocio_id and estado = 'pendiente'),
      'promedio',   (select coalesce(round(avg(estrellas)::numeric, 1), 0) from opiniones where negocio_id = p_negocio_id and creado_en >= v_f1 and creado_en < v_f2)),
    'productos', coalesce((
      select jsonb_agg(x order by (x->>'cantidad')::numeric desc, x->>'nombre')
        from (select jsonb_build_object('nombre', i.nombre, 'cantidad', round(sum(i.cantidad), 2), 'veces', count(distinct i.pedido_id)) as x
                from pedido_tienda_items i
                join pedidos_tienda p on p.negocio_id = i.negocio_id and p.id = i.pedido_id
               where p.negocio_id = p_negocio_id and not p.es_practica and p.creado_en >= v_f1 and p.creado_en < v_f2 and p.estado <> 'cancelado'
               group by i.nombre order by sum(i.cantidad) desc, i.nombre limit 5) t), '[]'::jsonb),
    'mejor_dia', (
      select jsonb_build_object('dow', d.dow, 'pedidos', d.n)
        from (select extract(dow from creado_en at time zone 'America/Bogota')::int as dow, count(*) as n
                from pedidos_tienda where negocio_id = p_negocio_id and not es_practica and creado_en >= v_f1 and creado_en < v_f2 and estado <> 'cancelado'
               group by 1 order by 2 desc, 1 limit 1) d)
  ) into v_res;
  return v_res;
end;
$$;

-- =====================================================================
-- 9. Permisos (las funciones nuevas nacen abiertas a PUBLIC: se cierran a mano)
-- =====================================================================
revoke all on table prepago_movimientos, prepago_bono_usos from public, anon, authenticated;
revoke all on prepago_saldos from public, anon, authenticated;
grant select on prepago_movimientos, prepago_bono_usos, prepago_saldos to authenticated;      -- el RLS decide quién y en qué tienda
grant all on all tables in schema public to service_role;

revoke all on function sincronizar_forma_prepago(), prepago_inmutable(), prepago_al_pagar(), prepago_al_anular() from public, anon, authenticated;
revoke all on function prepago_recargar(uuid, uuid, numeric, text, text, uuid, numeric, date),
                       prepago_devolver(uuid, uuid, numeric, text, text, uuid), prepago_ajustar(uuid, uuid, numeric, text),
                       resumen_semanal(uuid, int), caja_dia(uuid, date) from public, anon;
grant execute on function prepago_recargar(uuid, uuid, numeric, text, text, uuid, numeric, date),
                          prepago_devolver(uuid, uuid, numeric, text, text, uuid), prepago_ajustar(uuid, uuid, numeric, text),
                          resumen_semanal(uuid, int), caja_dia(uuid, date) to authenticated;

notify pgrst, 'reload schema';

-- ---------- VERIFICACIÓN: las 16 filas deben decir ok = true ----------
select chequeo, ok from (
  select 1 as n, chequeo, ok from verificar_aislamiento()
  union all select 2, 'Tablas de prepago con seguridad por fila (RLS)',
         (select count(*) from pg_class where relnamespace = 'public'::regnamespace and relname in ('prepago_movimientos', 'prepago_bono_usos') and relrowsecurity) = 2
  union all select 3, 'Vista prepago_saldos con permisos de quien consulta',
         coalesce('security_invoker=true' = any (select unnest(reloptions) from pg_class where oid = 'public.prepago_saldos'::regclass), false)
  union all select 4, 'El cobro con saldo y la anulación están enganchados',
         (select count(*) from pg_trigger where tgname in ('prepago_pago', 'prepago_anulacion') and not tgisinternal) = 2
  union all select 5, 'Anónimo no puede recargar ni ver el resumen',
         not has_function_privilege('anon', 'prepago_recargar(uuid,uuid,numeric,text,text,uuid,numeric,date)', 'execute')
         and not has_function_privilege('anon', 'resumen_semanal(uuid,int)', 'execute')
  union all select 6, 'Los negocios con módulo prepago tienen su forma de pago',
         not exists (select 1 from negocio_modulos m where m.modulo = 'prepago' and not exists
                      (select 1 from formas_pago f where f.negocio_id = m.negocio_id and f.id = 'prepago' and f.activa = m.activo))
) t order by n, chequeo;
