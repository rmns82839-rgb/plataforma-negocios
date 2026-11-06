-- Diagnóstico de lentitud · SOLO LEE, no cambia nada. Sirve igual en la base de Nelson y en la de la plataforma.
-- Pega aquí el resultado completo (son unas 25 filas).
select seccion, detalle, valor from (
  select 1 as o, 0 as r, 'Tamaño total de la base (el plan gratis permite 500 MB)' as seccion, current_database()::text as detalle, pg_size_pretty(pg_database_size(current_database())) as valor
  union all
  select * from (
    select 2, row_number() over (order by pg_total_relation_size(c.oid) desc)::int, 'Tablas más pesadas (datos + índices)', c.relname::text,
           pg_size_pretty(pg_total_relation_size(c.oid)) || ' · ~' || greatest(c.reltuples, 0)::bigint || ' filas'
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind = 'r'
     order by pg_total_relation_size(c.oid) desc limit 10) a
  union all
  select 3, 0, 'Productos: cuántos y cuánto pesa cada uno en promedio', count(*)::text || ' en total · ' || count(*) filter (where activo)::text || ' activos',
         pg_size_pretty((sum(pg_column_size(p.*)) / greatest(count(*), 1))::bigint) || ' por producto · ' || pg_size_pretty(sum(pg_column_size(p.*))::bigint) || ' en total'
    from productos p
  union all
  select * from (
    select 4, row_number() over (order by n_dead_tup desc)::int, 'Tablas con basura sin limpiar (filas muertas)', relname::text, n_dead_tup::text || ' muertas de ' || n_live_tup::text
      from pg_stat_user_tables where n_dead_tup > 1000 order by n_dead_tup desc limit 5) b
  union all
  select * from (
    select 5, row_number() over (order by seq_tup_read desc)::int, 'Tablas que se leen completas muchas veces (falta un índice)', relname::text,
           seq_scan::text || ' lecturas completas · ' || seq_tup_read::text || ' filas leídas'
      from pg_stat_user_tables where seq_scan > 100 and n_live_tup > 1000 order by seq_tup_read desc limit 5) c
  union all
  select * from (
    select 6, row_number() over (order by pg_relation_size(i.indexrelid) desc)::int, 'Índices grandes que nunca se usan (ocupan sitio y frenan)', i.indexrelname::text,
           pg_size_pretty(pg_relation_size(i.indexrelid))
      from pg_stat_user_indexes i where i.idx_scan = 0 and pg_relation_size(i.indexrelid) > 1048576 order by pg_relation_size(i.indexrelid) desc limit 5) d
  union all
  select 7, 0, 'Conexiones abiertas ahora', 'activas', count(*)::text from pg_stat_activity where datname = current_database()
) t order by o, r;

-- (Opcional, aparte) Fotos y archivos guardados, por carpeta. El plan gratis permite 1 GB:
-- select bucket_id, count(*) as archivos, pg_size_pretty(sum((metadata->>'size')::bigint)) as peso from storage.objects group by bucket_id order by sum((metadata->>'size')::bigint) desc;
