-- ============================================================
-- Plataforma multi-negocio — 60: Fiados con colores: última actividad y abonos por cliente
--   Vista nueva clientes_actividad_fiado (por negocio; no toca ninguna tabla ni vista existente). La lista de Fiados la usa para ordenar
--   «los más recientes arriba» y pintar quién abonó (dorado), quién pagó todo (verde) y quién está vencido (rojo).
--   Se corre DESPUÉS del 59. Idempotente.
-- ============================================================
create or replace view clientes_actividad_fiado with (security_invoker = true) as
select negocio_id, cliente_id,
       max(fecha)                                              as ultimo_movimiento,
       max(fecha) filter (where tipo = 'abono')                as ultimo_abono,
       (array_agg(monto order by fecha desc, id desc) filter (where tipo = 'abono'))[1] as ultimo_abono_monto,
       coalesce(sum(monto) filter (where tipo = 'abono'), 0)   as abonado_total,
       coalesce(sum(monto) filter (where tipo = 'cargo'), 0)   as cargado_total
from fiado_movimientos
group by negocio_id, cliente_id;
revoke all on clientes_actividad_fiado from public, anon;
grant select on clientes_actividad_fiado to authenticated;
notify pgrst, 'reload schema';

-- ---------- VERIFICACIÓN: las 4 filas deben decir ok = true ----------
select chequeo, ok from (
  select 1 as n, 'verificar_aislamiento: todo en orden' as chequeo, (select bool_and(ok) from verificar_aislamiento()) as ok
  union all select 2, 'la vista clientes_actividad_fiado existe', exists (select 1 from information_schema.views where table_name = 'clientes_actividad_fiado')
  union all select 3, 'anónimo no puede leerla', not has_table_privilege('anon', 'clientes_actividad_fiado', 'select')
  union all select 4, 'lo abonado + lo que se debe = lo cargado (cuadra con clientes_saldo)',
         (select coalesce(sum(cargado_total - abonado_total), 0) from clientes_actividad_fiado) = (select coalesce(sum(saldo), 0) from clientes_saldo)
) t order by n;
