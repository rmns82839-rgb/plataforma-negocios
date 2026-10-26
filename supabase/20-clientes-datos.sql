-- =====================================================================
-- 20. C6b: datos del cliente para fiar, segundo contacto y recordatorio a los dos
--     · clientes.contacto2_nombre / contacto2_telefono: otra persona a quien también se le recuerda la deuda.
--     · Para fiar hace falta conocer al cliente: documento, teléfono y dirección (igual que ya pasaba con los préstamos).
--       Esto lo exige la base, no solo la pantalla.
--     Es aditivo e idempotente: se puede correr dos veces.
-- =====================================================================

alter table clientes add column if not exists contacto2_nombre   text;
alter table clientes add column if not exists contacto2_telefono text;
do $$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'clientes'::regclass and conname = 'clientes_contacto2_largo') then
    alter table clientes add constraint clientes_contacto2_largo
      check (coalesce(char_length(contacto2_nombre), 0) <= 60 and coalesce(char_length(contacto2_telefono), 0) <= 20);
  end if;
end $$;

-- Qué datos le faltan a un cliente para poder fiarle ('' si no le falta nada)
create or replace function datos_credito_faltantes(c clientes) returns text
language sql immutable
as $$
  select array_to_string(array_remove(array[
    case when nullif(btrim(coalesce(c.documento, '')), '') is null then 'documento' end,
    case when nullif(btrim(coalesce(c.telefono, '')), '') is null then 'teléfono' end,
    case when nullif(btrim(coalesce(c.direccion, '')), '') is null then 'dirección' end], null), ', ')
$$;
revoke all on function datos_credito_faltantes(clientes) from public, anon;
grant execute on function datos_credito_faltantes(clientes) to authenticated;

-- El fiado de una venta exige esos datos (venta de productos y de ropa; los pedidos atendidos pasan por registrar_venta)
do $$
declare
  v_firma text;
  v_def   text;
  v_viejo constant text := E'select * into cli from clientes where negocio_id = p_negocio_id and id = p_cliente_id for update;\n    if not found then raise exception ''Cliente no encontrado''; end if;';
  v_nuevo constant text := v_viejo || E'\n    if datos_credito_faltantes(cli) <> '''' then\n      raise exception ''Para fiar a %, completa en Clientes su: %'', cli.nombre, datos_credito_faltantes(cli);\n    end if;';
begin
  foreach v_firma in array array[
    'registrar_venta(uuid,jsonb,jsonb,uuid,text,date,numeric,jsonb)',
    'registrar_venta_ropa(uuid,jsonb,jsonb,uuid,text,numeric,uuid,date,jsonb)'] loop
    v_def := pg_get_functiondef(v_firma::regprocedure);
    if position('datos_credito_faltantes' in v_def) = 0 then
      if position(v_viejo in v_def) = 0 then raise exception 'No se pudo actualizar %', v_firma; end if;
      execute replace(v_def, v_viejo, v_nuevo);
    end if;
  end loop;
end $$;

-- Corregir un movimiento de fiado hecho a mano (abono, deuda anotada, recargo). Solo el dueño y con motivo.
-- Las compras a fiado se corrigen anulando la venta. No deja la cuenta del cliente en negativo.
create or replace function corregir_movimiento_fiado(p_negocio_id uuid, p_movimiento_id uuid, p_motivo text)
returns void
language plpgsql
as $$
declare
  m       fiado_movimientos%rowtype;
  v_saldo numeric;
begin
  if not es_dueno(p_negocio_id) then raise exception 'Solo el dueño puede corregir un movimiento'; end if;
  perform exigir_modulo(p_negocio_id, 'fiados');
  if char_length(btrim(coalesce(p_motivo, ''))) < 3 then raise exception 'Escribe el motivo de la corrección'; end if;

  select * into m from fiado_movimientos where negocio_id = p_negocio_id and id = p_movimiento_id for update;
  if not found then raise exception 'Movimiento no encontrado'; end if;
  if m.venta_id is not null then raise exception 'Esa deuda viene de una venta: para corregirla anula la venta en el resumen del día'; end if;

  perform 1 from clientes where negocio_id = p_negocio_id and id = m.cliente_id for update;
  select coalesce(sum(case tipo when 'cargo' then monto else -monto end), 0)
    into v_saldo from fiado_movimientos where negocio_id = p_negocio_id and cliente_id = m.cliente_id;
  if m.tipo = 'cargo' and v_saldo - m.monto < 0 then
    raise exception 'No se puede quitar esa deuda: el cliente ya tiene abonos que dependen de ella. Corrige primero esos abonos';
  end if;

  -- Queda escrito en la auditoría quién lo corrigió y por qué (el cambio de nota y el borrado se registran solos)
  update fiado_movimientos set nota = left(coalesce(nota || ' · ', '') || 'CORREGIDO: ' || btrim(p_motivo), 300)
   where negocio_id = p_negocio_id and id = p_movimiento_id;
  delete from fiado_movimientos where negocio_id = p_negocio_id and id = p_movimiento_id;
end;
$$;
revoke all on function corregir_movimiento_fiado(uuid, uuid, text) from public, anon;
grant execute on function corregir_movimiento_fiado(uuid, uuid, text) to authenticated;

notify pgrst, 'reload schema';

-- Verificación: debe dar 6 filas en true
select 'clientes tiene el segundo contacto (nombre y teléfono)' as chequeo,
       (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'clientes'
          and column_name in ('contacto2_nombre', 'contacto2_telefono')) = 2 as ok
union all
select 'La función de datos que faltan existe',
       to_regprocedure('datos_credito_faltantes(clientes)') is not null
union all
select 'registrar_venta exige los datos del cliente para fiar',
       position('datos_credito_faltantes' in pg_get_functiondef('registrar_venta(uuid,jsonb,jsonb,uuid,text,date,numeric,jsonb)'::regprocedure)) > 0
union all
select 'registrar_venta_ropa también',
       position('datos_credito_faltantes' in pg_get_functiondef('registrar_venta_ropa(uuid,jsonb,jsonb,uuid,text,numeric,uuid,date,jsonb)'::regprocedure)) > 0
union all
select 'Solo usuarios con sesión usan la función (anon no)',
       has_function_privilege('authenticated', 'datos_credito_faltantes(clientes)', 'execute')
       and not has_function_privilege('anon', 'datos_credito_faltantes(clientes)', 'execute')
union all
select 'El dueño puede corregir movimientos de fiado (solo usuarios con sesión)',
       has_function_privilege('authenticated', 'corregir_movimiento_fiado(uuid,uuid,text)', 'execute')
       and not has_function_privilege('anon', 'corregir_movimiento_fiado(uuid,uuid,text)', 'execute');
