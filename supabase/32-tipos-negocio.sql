-- ============================================================
-- Plataforma multi-negocio — 32: nuevos tipos de negocio
-- Celulares y tecnología, ferretería, miscelánea, papelería y veterinaria.
-- Se corre DESPUÉS del 31. Aditivo e idempotente. No cambia ningún negocio existente.
-- ============================================================

-- 1. Los tipos permitidos (negocios, solicitudes y directorio externo)
do $$
declare r record;
begin
  for r in select c.conrelid::regclass t, c.conname from pg_constraint c
            where c.contype = 'c' and c.conrelid in ('negocios'::regclass, 'solicitudes_negocio'::regclass, 'directorio_externo'::regclass)
              and pg_get_constraintdef(c.oid) like '%''repuestos''%' and pg_get_constraintdef(c.oid) like '%tipo%' loop
    execute format('alter table %s drop constraint %I', r.t, r.conname);
  end loop;
end $$;
alter table negocios            add constraint negocios_tipo_check            check (tipo in ('tienda','ropa','repuestos','mixto','tecnologia','ferreteria','miscelanea','papeleria','veterinaria'));
alter table solicitudes_negocio add constraint solicitudes_negocio_tipo_check check (tipo in ('tienda','ropa','repuestos','mixto','tecnologia','ferreteria','miscelanea','papeleria','veterinaria'));
alter table directorio_externo  add constraint directorio_externo_tipo_check  check (tipo in ('tienda','ropa','repuestos','mixto','tecnologia','ferreteria','miscelanea','papeleria','veterinaria'));

-- 2. Módulos base de cada tipo (el plan agrega el resto)
create or replace function _plantilla_modulos(p_tipo text) returns text[]
language sql immutable as $$
  select case p_tipo
    when 'tienda'      then array['productos']
    when 'ropa'        then array['ropa']
    when 'repuestos'   then array['productos','repuestos']
    when 'mixto'       then array['productos','ropa']
    when 'tecnologia'  then array['productos','repuestos']   -- referencias y compatibilidad (fundas, pantallas, cargadores)
    when 'ferreteria'  then array['productos','repuestos']   -- referencias y medidas
    when 'miscelanea'  then array['productos']
    when 'papeleria'   then array['productos']
    when 'veterinaria' then array['productos']
  end
$$;

-- 3. La solicitud de negocio acepta los tipos nuevos (se parchea la función vigente)
do $$
declare v text := pg_get_functiondef('enviar_solicitud_negocio(jsonb)'::regprocedure);
begin
  if position('veterinaria' in v) = 0 then
    v := replace(v, '''repuestos'', ''mixto''', '''repuestos'', ''mixto'', ''tecnologia'', ''ferreteria'', ''miscelanea'', ''papeleria'', ''veterinaria''');
    if position('veterinaria' in v) = 0 then raise exception 'No se pudo actualizar enviar_solicitud_negocio'; end if;
    execute v;
  end if;
end $$;

-- 4. Vitrina de la portada: productos reales de las tiendas que están en el directorio (con foto, disponibles y con precio)
--    Solo datos que ya son públicos en el catálogo de cada tienda. Máximo 2 productos por tienda para que se vea variedad.
create or replace function vitrina_plataforma(p_limite int default 12)
returns jsonb
language sql stable security definer set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'slug', t.slug, 'tienda', t.tienda, 'tipo', t.tipo, 'nombre', t.nombre,
           'precio', t.precio_venta, 'unidad', t.unidad, 'imagen', t.imagen) order by t.orden), '[]'::jsonb)
    from (
      select x.*, row_number() over (order by x.rn, x.azar) as orden
        from (
          select n.slug, c.nombre_comercial as tienda, n.tipo, p.nombre, p.precio_venta, p.unidad, p.imagenes[1] as imagen,
                 row_number() over (partition by n.id order by random()) as rn, random() as azar
            from negocios n
            join negocio_config c on c.negocio_id = n.id
            join productos p on p.negocio_id = n.id
           where n.estado = 'activo' and n.publicada and c.en_directorio
             and exists (select 1 from negocio_modulos m where m.negocio_id = n.id and m.modulo = 'catalogo_publico' and m.activo)
             and exists (select 1 from negocio_modulos m where m.negocio_id = n.id and m.modulo = 'directorio_red' and m.activo)
             and p.activo and p.publicado and p.precio_venta > 0 and cardinality(p.imagenes) > 0
             and (case when p.controla_stock then p.stock > 0 else p.disponible end)
        ) x where x.rn <= 2
    ) t
   where t.orden <= least(greatest(coalesce(p_limite, 12), 1), 24)
$$;
revoke all on function vitrina_plataforma(int) from public;
grant execute on function vitrina_plataforma(int) to anon, authenticated;

-- 5. La función pública nueva entra en la lista de verificar_aislamiento (se parchea la vigente)
do $$
declare v text := pg_get_functiondef('verificar_aislamiento()'::regprocedure); n int;
begin
  if position('vitrina_plataforma' in v) = 0 then
    n := (regexp_match(v, 'ejecuta las (\d+) funciones'))[1]::int;
    v := replace(v, '''directorio_tiendas''', '''directorio_tiendas'',''vitrina_plataforma''');
    v := replace(v, 'ejecuta las ' || n || ' funciones', 'ejecuta las ' || (n + 1) || ' funciones');
    if position('vitrina_plataforma' in v) = 0 then raise exception 'No se pudo actualizar verificar_aislamiento'; end if;
    execute v;
  end if;
end $$;

notify pgrst, 'reload schema';

-- ---------- VERIFICACIÓN: las 5 filas deben decir ok = true ----------
select chequeo, ok from (
  select 1 as n, 'verificar_aislamiento: todo en orden' as chequeo, (select bool_and(ok) from verificar_aislamiento()) as ok
  union all select 2, 'los 9 tipos tienen módulos base', (select bool_and(_plantilla_modulos(t) is not null) from unnest(array['tienda','ropa','repuestos','mixto','tecnologia','ferreteria','miscelanea','papeleria','veterinaria']) t)
  union all select 3, 'negocios acepta veterinaria', (select pg_get_constraintdef(oid) like '%veterinaria%' from pg_constraint where conname = 'negocios_tipo_check')
  union all select 4, 'enviar_solicitud_negocio acepta veterinaria', (select pg_get_functiondef('enviar_solicitud_negocio(jsonb)'::regprocedure) like '%veterinaria%')
  union all select 5, 'la portada puede pedir la vitrina sin iniciar sesión', has_function_privilege('anon', 'vitrina_plataforma(int)', 'execute')
) t order by n;
