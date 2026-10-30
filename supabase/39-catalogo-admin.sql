-- ============================================================
-- 39 · Administración del catálogo base (para la herramienta catalogo-matriz)
-- Solo el administrador de la plataforma (soy_administrador_plataforma) puede ver el panel
-- de edición y cambiar el catálogo. Las fotos van a su propio espacio «catalogo»,
-- una por producto, con enlace fijo: catalogo/<id>.webp
-- ============================================================

alter table catalogo_base add column if not exists presentacion text check (presentacion is null or char_length(presentacion) <= 60);
alter table catalogo_base add column if not exists descripcion  text check (descripcion  is null or char_length(descripcion)  <= 400);
alter table catalogo_base add column if not exists foto_version integer not null default 0;
alter table catalogo_base add column if not exists actualizado_en timestamptz not null default now();

-- ---------- Espacio de fotos del catálogo (público para leer, solo el administrador escribe) ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('catalogo', 'catalogo', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = true, file_size_limit = 2097152, allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];

drop policy if exists catalogo_leer    on storage.objects;
drop policy if exists catalogo_subir   on storage.objects;
drop policy if exists catalogo_cambiar on storage.objects;
drop policy if exists catalogo_borrar  on storage.objects;
create policy catalogo_leer    on storage.objects for select to authenticated using (bucket_id = 'catalogo' and soy_administrador_plataforma());
create policy catalogo_subir   on storage.objects for insert to authenticated with check (bucket_id = 'catalogo' and soy_administrador_plataforma() and name ~ '^[0-9]+\.webp$');
create policy catalogo_cambiar on storage.objects for update to authenticated using (bucket_id = 'catalogo' and soy_administrador_plataforma()) with check (bucket_id = 'catalogo' and soy_administrador_plataforma() and name ~ '^[0-9]+\.webp$');
create policy catalogo_borrar  on storage.objects for delete to authenticated using (bucket_id = 'catalogo' and soy_administrador_plataforma());

-- ---------- Funciones del administrador ----------
-- 1. Resumen: totales y avance por categoría
create or replace function catalogo_admin_resumen()
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
begin
  if not soy_administrador_plataforma() then raise exception 'Solo el administrador de la plataforma'; end if;
  return jsonb_build_object(
    'total', (select count(*) from catalogo_base),
    'con_foto', (select count(*) from catalogo_base where foto is not null),
    'categorias', coalesce((select jsonb_agg(jsonb_build_object('categoria', categoria, 'total', n, 'con_foto', f) order by n desc, categoria)
                              from (select categoria, count(*) n, count(*) filter (where foto is not null) f from catalogo_base group by categoria) x), '[]'::jsonb));
end;
$$;

-- 2. Lista paginada con búsqueda y filtros
create or replace function catalogo_admin_listar(p_texto text default null, p_categoria text default null, p_filtro text default 'todos', p_desde int default 0, p_limite int default 60)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare v_texto text := nullif(btrim(coalesce(p_texto, '')), ''); v_total int; v_filas jsonb;
begin
  if not soy_administrador_plataforma() then raise exception 'Solo el administrador de la plataforma'; end if;
  if p_filtro not in ('todos', 'sin_foto', 'con_foto', 'sin_descripcion') then raise exception 'Filtro no válido'; end if;
  select count(*) into v_total from catalogo_base b
   where (v_texto is null or b.nombre ilike '%' || v_texto || '%' or b.codigo = v_texto)
     and (p_categoria is null or b.categoria = p_categoria)
     and (p_filtro = 'todos' or (p_filtro = 'sin_foto' and b.foto is null) or (p_filtro = 'con_foto' and b.foto is not null) or (p_filtro = 'sin_descripcion' and b.descripcion is null));
  select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) into v_filas from (
    select b.id, b.codigo, b.nombre, b.categoria, b.unidad, b.presentacion, b.descripcion, b.foto, b.foto_version
      from catalogo_base b
     where (v_texto is null or b.nombre ilike '%' || v_texto || '%' or b.codigo = v_texto)
       and (p_categoria is null or b.categoria = p_categoria)
       and (p_filtro = 'todos' or (p_filtro = 'sin_foto' and b.foto is null) or (p_filtro = 'con_foto' and b.foto is not null) or (p_filtro = 'sin_descripcion' and b.descripcion is null))
     order by b.nombre, b.id
     offset greatest(coalesce(p_desde, 0), 0) limit least(greatest(coalesce(p_limite, 60), 1), 200)
  ) t;
  return jsonb_build_object('total', v_total, 'filas', v_filas);
end;
$$;

-- 3. Guardar los datos de un producto (nombre, presentación, categoría, descripción, código)
create or replace function catalogo_admin_guardar(p_id bigint, p_nombre text, p_presentacion text, p_categoria text, p_descripcion text, p_codigo text)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not soy_administrador_plataforma() then raise exception 'Solo el administrador de la plataforma'; end if;
  update catalogo_base set
    nombre = btrim(p_nombre), presentacion = nullif(btrim(coalesce(p_presentacion, '')), ''),
    categoria = coalesce(nullif(btrim(coalesce(p_categoria, '')), ''), 'Otros'),
    descripcion = nullif(btrim(coalesce(p_descripcion, '')), ''),
    codigo = nullif(btrim(coalesce(p_codigo, '')), ''), actualizado_en = now()
   where id = p_id;
  if not found then raise exception 'Producto no encontrado'; end if;
end;
$$;

-- 4. Crear un producto nuevo en el catálogo
create or replace function catalogo_admin_crear(p_nombre text, p_categoria text, p_codigo text default null, p_presentacion text default null)
returns bigint
language plpgsql security definer set search_path = public
as $$
declare v_id bigint;
begin
  if not soy_administrador_plataforma() then raise exception 'Solo el administrador de la plataforma'; end if;
  insert into catalogo_base (nombre, categoria, codigo, presentacion)
  values (btrim(p_nombre), coalesce(nullif(btrim(coalesce(p_categoria, '')), ''), 'Otros'), nullif(btrim(coalesce(p_codigo, '')), ''), nullif(btrim(coalesce(p_presentacion, '')), ''))
  returning id into v_id;
  return v_id;
end;
$$;

-- 5. Fijar o quitar la foto (el archivo ya se subió a catalogo/<id>.webp)
create or replace function catalogo_admin_foto(p_id bigint, p_url text)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not soy_administrador_plataforma() then raise exception 'Solo el administrador de la plataforma'; end if;
  if p_url is not null and p_url !~ ('^https://[^/]+/storage/v1/object/public/catalogo/' || p_id || '\.webp(\?v=[0-9]+)?$') then
    raise exception 'La dirección de la foto no es válida';
  end if;
  update catalogo_base set foto = p_url, foto_version = foto_version + 1, actualizado_en = now() where id = p_id;
  if not found then raise exception 'Producto no encontrado'; end if;
end;
$$;

revoke all on function catalogo_admin_resumen(), catalogo_admin_listar(text, text, text, int, int), catalogo_admin_guardar(bigint, text, text, text, text, text),
  catalogo_admin_crear(text, text, text, text), catalogo_admin_foto(bigint, text) from public, anon;
grant execute on function catalogo_admin_resumen(), catalogo_admin_listar(text, text, text, int, int), catalogo_admin_guardar(bigint, text, text, text, text, text),
  catalogo_admin_crear(text, text, text, text), catalogo_admin_foto(bigint, text) to authenticated;

-- ---------- La carga a las tiendas ahora también copia la descripción ----------
create or replace function cargar_catalogo_base(p_negocio_id uuid, p_categorias text[])
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare v_tipo text; v_n int;
begin
  if not es_dueno(p_negocio_id) then raise exception 'Solo el dueño puede cargar productos base'; end if;
  perform exigir_modulo(p_negocio_id, 'productos');
  if p_categorias is null or cardinality(p_categorias) = 0 then raise exception 'Elige al menos una categoría'; end if;
  if cardinality(p_categorias) > 80 then raise exception 'Demasiadas categorías'; end if;
  select tipo into v_tipo from negocios where id = p_negocio_id;

  with elegidos as (
    select distinct on (coalesce(b.codigo, lower(b.nombre))) b.*
      from catalogo_base b
      join catalogo_base_categoria c on c.categoria = b.categoria and v_tipo = any (c.tipos)
     where b.categoria = any (p_categorias)
       and not exists (select 1 from productos p
                        where p.negocio_id = p_negocio_id
                          and ((b.codigo is not null and p.codigo = b.codigo) or lower(p.nombre) = lower(b.nombre)))
  ), nuevos as (
    insert into productos (negocio_id, codigo, nombre, categoria, unidad, descripcion, imagenes, precio_venta, precio_compra, publicado, activo)
    select p_negocio_id, e.codigo, e.nombre, e.categoria, e.unidad, e.descripcion,
           case when e.foto is null then '{}'::text[] else array[e.foto] end, 0, 0, false, true
      from elegidos e
    on conflict do nothing
    returning 1
  )
  select count(*) into v_n from nuevos;

  insert into categorias (negocio_id, nombre)
  select p_negocio_id, c from unnest(p_categorias) c
   where exists (select 1 from productos p where p.negocio_id = p_negocio_id and p.categoria = c)
  on conflict (negocio_id, nombre) do nothing;

  return jsonb_build_object('cargados', v_n);
end;
$$;
revoke all on function cargar_catalogo_base(uuid, text[]) from public, anon;
grant execute on function cargar_catalogo_base(uuid, text[]) to authenticated;

notify pgrst, 'reload schema';

-- ---------- VERIFICACIÓN: las 5 filas deben decir ok = true ----------
select chequeo, ok from (
  select 1 as n, 'verificar_aislamiento: todo en orden' as chequeo, (select bool_and(ok) from verificar_aislamiento()) as ok
  union all select 2, 'existe el espacio de fotos «catalogo»', exists (select 1 from storage.buckets where id = 'catalogo' and public)
  union all select 3, 'las 5 funciones de administración son solo para quien inició sesión', not has_function_privilege('anon', 'catalogo_admin_listar(text, text, text, int, int)', 'execute') and has_function_privilege('authenticated', 'catalogo_admin_foto(bigint, text)', 'execute')
  union all select 4, 'el catálogo tiene los campos nuevos', (select count(*) = 4 from information_schema.columns where table_name = 'catalogo_base' and column_name in ('presentacion', 'descripcion', 'foto_version', 'actualizado_en'))
  union all select 5, 'tu usuario es administrador de la plataforma (si dice false, ver la nota)', exists (select 1 from plataforma_admins where nivel = 'administrador')
) t order by n;
