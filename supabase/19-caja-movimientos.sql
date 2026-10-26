-- =====================================================================
-- 19. C6a-2: retiros e ingresos de dinero en la caja, y gastos con la forma de pago con que salieron
--     · caja_movimientos: retiros (sacar plata de la caja) e ingresos (meter plata) con motivo; no se editan ni se borran
--       (un error se corrige con el movimiento contrario).
--     · gastos.metodo: de dónde salió la plata del gasto. Solo los gastos en efectivo bajan el efectivo de la caja.
--     · caja_dia: ahora cuenta movimientos y descuenta solo los gastos en efectivo.
--     Es aditivo e idempotente: se puede correr dos veces.
-- =====================================================================

alter table gastos add column if not exists metodo text not null default 'efectivo';
do $$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'gastos'::regclass and conname = 'gastos_metodo_fk') then
    alter table gastos add constraint gastos_metodo_fk foreign key (negocio_id, metodo) references formas_pago (negocio_id, id) not valid;
  end if;
end $$;

create table if not exists caja_movimientos (
  id         uuid not null default gen_random_uuid(),
  negocio_id uuid not null references negocios(id),
  fecha      timestamptz not null default now(),
  tipo       text not null check (tipo in ('retiro', 'ingreso')),
  monto      numeric not null check (monto > 0 and monto <= 1000000000),
  motivo     text not null check (char_length(btrim(motivo)) between 3 and 120),
  usuario    uuid default auth.uid(),
  primary key (negocio_id, id)
);
create index if not exists caja_mov_neg_fecha_idx on caja_movimientos (negocio_id, fecha desc);

select _aplicar_politicas('caja_movimientos', 'p', 'p', null, null);   -- lo ve y lo crea el personal; nadie lo cambia
revoke all on caja_movimientos from anon, authenticated, public;
grant select, insert on caja_movimientos to authenticated;
grant all on caja_movimientos to service_role;

-- Los mismos candados que las demás tablas: el soporte solo lee y el negocio de una fila no se cambia
drop trigger if exists aaa_solo_lectura on caja_movimientos;
create trigger aaa_solo_lectura before insert or update or delete on caja_movimientos for each row execute function bloquear_soporte();
drop trigger if exists bbb_negocio_inmutable on caja_movimientos;
create trigger bbb_negocio_inmutable before update on caja_movimientos for each row execute function negocio_id_inmutable();

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
    'gastos',       coalesce((select jsonb_agg(to_jsonb(g) order by g.fecha) from gas g), '[]'::jsonb),
    'gastos_total', coalesce((select sum(monto) from gas), 0),
    'movimientos',    coalesce((select jsonb_agg(to_jsonb(m) order by m.fecha) from mov m), '[]'::jsonb),
    'ingresos_total', coalesce((select sum(monto) from mov where tipo = 'ingreso'), 0),
    'retiros_total',  coalesce((select sum(monto) from mov where tipo = 'retiro'), 0),
    -- Efectivo que debe haber: ventas y abonos en efectivo + ingresos − retiros − gastos pagados con efectivo
    'efectivo_esperado',
        coalesce((select sum(monto) from pagos where tipo = 'efectivo'), 0)
      + coalesce((select sum(monto) from abo where metodo = 'efectivo'), 0)
      + coalesce((select sum(monto) from mov where tipo = 'ingreso'), 0)
      - coalesce((select sum(monto) from mov where tipo = 'retiro'), 0)
      - coalesce((select sum(monto) from gas where metodo = 'efectivo'), 0),
    'lista',        coalesce((select jsonb_agg(to_jsonb(l) order by l.fecha desc) from lista l), '[]'::jsonb)
  ) into v_res;
  return v_res;
end;
$$;

revoke all on function caja_dia(uuid, date) from public, anon;
grant execute on function caja_dia(uuid, date) to authenticated;

notify pgrst, 'reload schema';

-- Verificación: debe dar 5 filas en true
select 'La tabla caja_movimientos existe, con RLS y sin cambios ni borrados' as chequeo,
       coalesce((select relrowsecurity from pg_class where oid = to_regclass('public.caja_movimientos')), false)
       and not has_table_privilege('anon', 'caja_movimientos', 'select')
       and not has_table_privilege('authenticated', 'caja_movimientos', 'update')
       and not has_table_privilege('authenticated', 'caja_movimientos', 'delete') as ok
union all
select 'Los gastos guardan con qué forma de pago salieron',
       exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'gastos' and column_name = 'metodo')
union all
select 'La caja del día cuenta los retiros e ingresos',
       position('caja_movimientos' in pg_get_functiondef('caja_dia(uuid,date)'::regprocedure)) > 0
union all
select 'Solo los gastos en efectivo bajan el efectivo de la caja',
       position('from gas where metodo = ''efectivo''' in pg_get_functiondef('caja_dia(uuid,date)'::regprocedure)) > 0
union all
select 'Solo usuarios con sesión ven la caja (anon no)',
       has_function_privilege('authenticated', 'caja_dia(uuid,date)', 'execute') and not has_function_privilege('anon', 'caja_dia(uuid,date)', 'execute');
