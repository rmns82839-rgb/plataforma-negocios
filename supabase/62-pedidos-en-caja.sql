-- 62 · Pedidos de la tienda en línea que ya pasaron a la Caja.
-- Al pulsar «Pasar a la Caja» el pedido deja de salir como «pedido nuevo» y queda en «En proceso».
alter table pedidos_tienda add column if not exists en_caja boolean not null default false;
notify pgrst, 'reload schema';

-- ---------- VERIFICACIÓN: las 2 filas deben decir ok = true ----------
select chequeo, ok from (
  select 1 as n, 'verificar_aislamiento: todo en orden' as chequeo, (select bool_and(ok) from verificar_aislamiento()) as ok
  union all select 2, 'pedidos_tienda tiene la columna en_caja',
    exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'pedidos_tienda' and column_name = 'en_caja')
) t order by n;
