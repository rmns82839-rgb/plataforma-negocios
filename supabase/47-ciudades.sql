-- ============================================================
-- 47 · Ciudades: «Bogota», «Bogotá» y «bogotá » ahora cuentan como la misma ciudad
-- Se corre DESPUÉS del 46. Es aditivo e idempotente: se puede volver a correr.
--  · La ciudad del negocio y la del domiciliario se comparan sin importar mayúsculas, tildes ni espacios.
--  · Así un domiciliario ve y toma las entregas de las tiendas de su ciudad aunque lo hayan escrito distinto.
--  · En la pantalla, la ciudad ahora se elige de una lista (empezando por el Atlántico).
-- ============================================================

create or replace function ciudad_clave(p text)
returns text
language sql immutable
as $$ select translate(lower(btrim(coalesce(p, ''))), 'áéíóúüñ', 'aeiouun') $$;

-- Las funciones de domiciliarios que comparaban ciudades ahora usan la clave (sin tildes)
do $$
declare r record; v text;
begin
  for r in select p.oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and (p.prosrc like '%lower(btrim(d.ciudad))%' or p.prosrc like '%lower(btrim(ciudad))%') loop
    v := pg_get_functiondef(r.oid);
    v := replace(v, 'lower(btrim(d.ciudad))', 'ciudad_clave(d.ciudad)');
    v := replace(v, 'lower(btrim(ciudad))', 'ciudad_clave(ciudad)');
    execute v;
  end loop;
end $$;

-- Las entregas ya ofrecidas guardan la ciudad sin tildes
update entregas set ciudad = ciudad_clave(ciudad) where ciudad is distinct from ciudad_clave(ciudad);
create index if not exists domiciliarios_ciudad_clave_idx on domiciliarios (ciudad_clave(ciudad)) where estado = 'aprobado';

revoke all on function ciudad_clave(text) from public, anon;
grant execute on function ciudad_clave(text) to authenticated;

notify pgrst, 'reload schema';

-- ---------- VERIFICACIÓN: las 5 filas deben decir ok = true ----------
select chequeo, ok from (
  select 1 as n, 'verificar_aislamiento: todo en orden' as chequeo, (select bool_and(ok) from verificar_aislamiento()) as ok
  union all select 2, '«Bogotá » y «bogota» son la misma ciudad', ciudad_clave(' Bogotá ') = ciudad_clave('bogota') and ciudad_clave('Santo Tomás') = 'santo tomas'
  union all select 3, 'ninguna función de domiciliarios compara ciudades con tildes', not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and (p.prosrc like '%lower(btrim(d.ciudad))%' or p.prosrc like '%lower(btrim(ciudad))%'))
  union all select 4, 'las entregas ofrecidas tienen la ciudad normalizada', not exists (select 1 from entregas where ciudad is distinct from ciudad_clave(ciudad))
  union all select 5, 'la comparación por ciudad usa la clave', position('ciudad_clave' in pg_get_functiondef('ofertas_disponibles()'::regprocedure)) > 0
) t order by n;
