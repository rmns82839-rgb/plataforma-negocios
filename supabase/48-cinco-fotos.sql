-- ============================================================
-- 48 · Hasta 5 fotos por producto en el catálogo universal (+ filtro «sin código»)
-- Se corre DESPUÉS del 47. Es aditivo e idempotente: se puede volver a correr.
--  · La foto de siempre pasa a ser la PRINCIPAL (la primera de la lista). Las tiendas reciben todas.
--  · Archivos en el espacio «catalogo»: <id>.webp (principal), <id>-2.webp … <id>-5.webp
--  · «Fotos en tiendas» actualiza los productos cuyas fotos son todas del catálogo (nunca pisa una foto propia de la tienda).
-- ============================================================

alter table catalogo_base add column if not exists fotos text[] not null default '{}';
alter table catalogo_base drop constraint if exists catalogo_base_fotos_max;
alter table catalogo_base add constraint catalogo_base_fotos_max check (cardinality(fotos) <= 5);
update catalogo_base set fotos = array[foto] where foto is not null and cardinality(fotos) = 0;

-- ---------- Espacio de fotos: ahora también <id>-2.webp … <id>-5.webp ----------
drop policy if exists catalogo_subir   on storage.objects;
drop policy if exists catalogo_cambiar on storage.objects;
create policy catalogo_subir   on storage.objects for insert to authenticated with check (bucket_id = 'catalogo' and soy_administrador_plataforma() and name ~ '^[0-9]+(-[2-5])?\.webp$');
create policy catalogo_cambiar on storage.objects for update to authenticated using (bucket_id = 'catalogo' and soy_administrador_plataforma()) with check (bucket_id = 'catalogo' and soy_administrador_plataforma() and name ~ '^[0-9]+(-[2-5])?\.webp$');

-- ---------- Poner la lista completa de fotos de un producto (máximo 5; la primera es la principal) ----------
create or replace function catalogo_admin_fotos(p_id bigint, p_urls text[])
returns void
language plpgsql security definer set search_path = public
as $$
declare v_actuales text[]; u text;
begin
  if not soy_administrador_plataforma() then raise exception 'Solo el administrador de la plataforma'; end if;
  select fotos into v_actuales from catalogo_base where id = p_id;
  if not found then raise exception 'Producto no encontrado'; end if;
  p_urls := coalesce(p_urls, '{}');
  if cardinality(p_urls) > 5 then raise exception 'Máximo 5 fotos por producto'; end if;
  foreach u in array p_urls loop
    if not (u = any (v_actuales)) and u !~ ('^https://[^/]+/storage/v1/object/public/catalogo/' || p_id || '(-[2-5])?\.webp(\?v=[0-9]+)?$') then
      raise exception 'La dirección de la foto no es válida';
    end if;
  end loop;
  if (select count(distinct u2) from unnest(p_urls) u2) <> cardinality(p_urls) then raise exception 'Hay una foto repetida'; end if;
  update catalogo_base set fotos = p_urls, foto = p_urls[1], foto_version = foto_version + 1, actualizado_en = now(),
         tanda_n = case when cardinality(p_urls) > 0 then null else tanda_n end
   where id = p_id;
end;
$$;

-- ---------- La función de una sola foto sigue funcionando (modo rápido, zip, tanda): cambia la PRINCIPAL ----------
create or replace function catalogo_admin_foto(p_id bigint, p_url text)
returns void
language plpgsql security definer set search_path = public
as $$
declare v_f text[];
begin
  if not soy_administrador_plataforma() then raise exception 'Solo el administrador de la plataforma'; end if;
  if p_url is not null and p_url !~ ('^https://[^/]+/storage/v1/object/public/catalogo/' || p_id || '\.webp(\?v=[0-9]+)?$') then
    raise exception 'La dirección de la foto no es válida';
  end if;
  select fotos into v_f from catalogo_base where id = p_id;
  if not found then raise exception 'Producto no encontrado'; end if;
  if p_url is null then
    v_f := coalesce(v_f[2:5], '{}');                                   -- quitar la principal: la siguiente sube
  else
    v_f := (array[p_url] || array(select x from unnest(v_f) x where split_part(x, '?', 1) <> split_part(p_url, '?', 1)))[1:5];
  end if;
  update catalogo_base set fotos = v_f, foto = v_f[1], foto_version = foto_version + 1, actualizado_en = now(),
         tanda_n = case when p_url is not null then null else tanda_n end
   where id = p_id;
end;
$$;

-- ---------- Listado: devuelve las fotos y suma el filtro «sin_codigo» ----------
create or replace function catalogo_admin_listar(p_texto text default null, p_categoria text default null, p_filtro text default 'todos', p_desde int default 0, p_limite int default 60)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare v_texto text := nullif(btrim(coalesce(p_texto, '')), ''); v_total int; v_filas jsonb; v_num int;
begin
  if not soy_administrador_plataforma() then raise exception 'Solo el administrador de la plataforma'; end if;
  if p_filtro not in ('todos', 'sin_foto', 'con_foto', 'sin_descripcion', 'eliminados', 'tanda', 'sin_codigo') then raise exception 'Filtro no válido'; end if;
  v_num := case when v_texto ~ '^[0-9]{1,3}$' then v_texto::int end;
  select count(*) into v_total from catalogo_base b
   where (v_texto is null or b.nombre ilike '%' || v_texto || '%' or b.codigo = v_texto or b.tanda_n = v_num)
     and (p_categoria is null or b.categoria = p_categoria)
     and ((p_filtro = 'eliminados') = (b.eliminado_en is not null))
     and (p_filtro in ('todos', 'eliminados') or (p_filtro = 'sin_foto' and b.foto is null) or (p_filtro = 'con_foto' and b.foto is not null)
          or (p_filtro = 'sin_descripcion' and b.descripcion is null) or (p_filtro = 'tanda' and b.tanda_n is not null) or (p_filtro = 'sin_codigo' and b.codigo is null));
  select coalesce(jsonb_agg(to_jsonb(t) order by t.ord), '[]'::jsonb) into v_filas from (
    select b.id, b.codigo, b.nombre, b.categoria, b.unidad, b.presentacion, b.descripcion, b.foto, b.fotos, b.foto_version, b.tanda_n, (b.eliminado_en is not null) as eliminado,
           row_number() over (order by case when p_filtro = 'tanda' then b.tanda_n end, b.nombre, b.id) as ord
      from catalogo_base b
     where (v_texto is null or b.nombre ilike '%' || v_texto || '%' or b.codigo = v_texto or b.tanda_n = v_num)
       and (p_categoria is null or b.categoria = p_categoria)
       and ((p_filtro = 'eliminados') = (b.eliminado_en is not null))
       and (p_filtro in ('todos', 'eliminados') or (p_filtro = 'sin_foto' and b.foto is null) or (p_filtro = 'con_foto' and b.foto is not null)
            or (p_filtro = 'sin_descripcion' and b.descripcion is null) or (p_filtro = 'tanda' and b.tanda_n is not null) or (p_filtro = 'sin_codigo' and b.codigo is null))
     order by case when p_filtro = 'tanda' then b.tanda_n end, b.nombre, b.id
     offset greatest(coalesce(p_desde, 0), 0) limit least(greatest(coalesce(p_limite, 60), 1), 200)
  ) t;
  return jsonb_build_object('total', v_total, 'filas', v_filas);
end;
$$;

-- ---------- Las tiendas reciben todas las fotos ----------
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
     where b.categoria = any (p_categorias) and b.eliminado_en is null
       and not exists (select 1 from productos p
                        where p.negocio_id = p_negocio_id
                          and ((b.codigo is not null and p.codigo = b.codigo) or lower(p.nombre) = lower(b.nombre)))
  ), nuevos as (
    insert into productos (negocio_id, codigo, nombre, categoria, unidad, descripcion, imagenes, precio_venta, precio_compra, publicado, activo)
    select p_negocio_id, e.codigo, e.nombre, e.categoria, e.unidad, e.descripcion,
           case when cardinality(e.fotos) > 0 then e.fotos when e.foto is null then '{}'::text[] else array[e.foto] end, 0, 0, false, true
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

-- ---------- Actualizar las fotos en las tiendas ----------
--  · Producto de la tienda SIN fotos  → recibe las del catálogo.
--  · Producto cuyas fotos son TODAS del catálogo y cambiaron → se actualizan.
--  · Si la tienda puso alguna foto propia → no se toca.
create or replace function catalogo_admin_sincronizar_fotos(p_simular boolean default true)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare v_nuevas int; v_refrescadas int; v_tiendas int;
begin
  if not soy_administrador_plataforma() then raise exception 'Solo el administrador de la plataforma'; end if;
  create temporary table if not exists _sync_fotos (negocio_id uuid, id uuid, fotos text[], era_vacia boolean) on commit drop;
  delete from _sync_fotos;
  insert into _sync_fotos
  select distinct on (p.negocio_id, p.id) p.negocio_id, p.id, b.fotos, cardinality(p.imagenes) = 0
    from productos p
    join catalogo_base b on b.eliminado_en is null and cardinality(b.fotos) > 0
                        and ((b.codigo is not null and p.codigo = b.codigo) or lower(p.nombre) = lower(b.nombre))
   where cardinality(p.imagenes) = 0
      or (p.imagenes is distinct from b.fotos
          and not exists (select 1 from unnest(p.imagenes) x where x not like '%/storage/v1/object/public/catalogo/%'))
   order by p.negocio_id, p.id, b.id;
  select count(*) filter (where era_vacia), count(*) filter (where not era_vacia), count(distinct negocio_id) into v_nuevas, v_refrescadas, v_tiendas from _sync_fotos;
  if not coalesce(p_simular, true) then
    update productos p set imagenes = s.fotos from _sync_fotos s where p.negocio_id = s.negocio_id and p.id = s.id;
  end if;
  return jsonb_build_object('nuevas', v_nuevas, 'refrescadas', v_refrescadas, 'tiendas', v_tiendas, 'aplicado', not coalesce(p_simular, true));
end;
$$;

-- ---------- Autocompletar por código de barras: también devuelve todas las fotos ----------
create or replace function catalogo_base_buscar(p_negocio_id uuid, p_codigo text)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare r record;
begin
  if not es_personal(p_negocio_id) then raise exception 'Sin acceso'; end if;
  if p_codigo is null or char_length(btrim(p_codigo)) < 3 then return null; end if;
  select nombre, categoria, unidad, foto, fotos into r from catalogo_base where codigo = btrim(p_codigo) and eliminado_en is null;
  if not found then return null; end if;
  return jsonb_build_object('nombre', r.nombre, 'categoria', r.categoria, 'unidad', r.unidad, 'foto', r.foto, 'fotos', to_jsonb(r.fotos));
end;
$$;

revoke all on function catalogo_admin_fotos(bigint, text[]), catalogo_admin_foto(bigint, text), catalogo_admin_listar(text, text, text, int, int),
  cargar_catalogo_base(uuid, text[]), catalogo_admin_sincronizar_fotos(boolean), catalogo_base_buscar(uuid, text) from public, anon;
grant execute on function catalogo_admin_fotos(bigint, text[]), catalogo_admin_foto(bigint, text), catalogo_admin_listar(text, text, text, int, int),
  cargar_catalogo_base(uuid, text[]), catalogo_admin_sincronizar_fotos(boolean), catalogo_base_buscar(uuid, text) to authenticated;

notify pgrst, 'reload schema';

-- ---------- VERIFICACIÓN: las 5 filas deben decir ok = true ----------
select chequeo, ok from (
  select 1 as n, 'verificar_aislamiento: todo en orden' as chequeo, (select bool_and(ok) from verificar_aislamiento()) as ok
  union all select 2, 'existe la lista de fotos (máximo 5)', exists (select 1 from information_schema.columns where table_name = 'catalogo_base' and column_name = 'fotos')
  union all select 3, 'las fotos de siempre quedaron como principal', not exists (select 1 from catalogo_base where foto is not null and (cardinality(fotos) = 0 or fotos[1] is distinct from foto))
  union all select 4, 'la función de varias fotos es solo para quien inició sesión', not has_function_privilege('anon', 'catalogo_admin_fotos(bigint, text[])', 'execute') and has_function_privilege('authenticated', 'catalogo_admin_fotos(bigint, text[])', 'execute')
  union all select 5, 'las tiendas reciben todas las fotos al cargar', position('e.fotos' in pg_get_functiondef('cargar_catalogo_base(uuid, text[])'::regprocedure)) > 0
) t order by n;
