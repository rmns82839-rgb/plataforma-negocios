-- ============================================================
-- 44 · Catálogo base: eliminar duplicados/malos (borrado suave) y actualizar fotos en las tiendas
-- Se corre DESPUÉS del 43. Es aditivo e idempotente: se puede volver a correr.
--  · Eliminar NO borra la fila: la marca como eliminada (se puede restaurar). Los productos
--    eliminados dejan de verse en el catálogo, en la carga a tiendas y en la búsqueda por código.
--  · Actualizar fotos en tiendas: copia la foto del catálogo a los productos ya cargados que
--    NO tienen foto, y refresca la versión de las que siguen usando la foto del catálogo.
--    Nunca pisa una foto que la tienda puso o cambió.
-- ============================================================

alter table catalogo_base add column if not exists eliminado_en timestamptz;
create index if not exists catalogo_base_vivos_idx on catalogo_base (categoria) where eliminado_en is null;

-- ---------- Resumen y listado: ocultan lo eliminado (nuevo filtro «eliminados» para restaurar) ----------
create or replace function catalogo_admin_resumen()
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
begin
  if not soy_administrador_plataforma() then raise exception 'Solo el administrador de la plataforma'; end if;
  return jsonb_build_object(
    'total', (select count(*) from catalogo_base where eliminado_en is null),
    'con_foto', (select count(*) from catalogo_base where eliminado_en is null and foto is not null),
    'eliminados', (select count(*) from catalogo_base where eliminado_en is not null),
    'categorias', coalesce((select jsonb_agg(jsonb_build_object('categoria', categoria, 'total', n, 'con_foto', f) order by n desc, categoria)
                              from (select categoria, count(*) n, count(*) filter (where foto is not null) f from catalogo_base where eliminado_en is null group by categoria) x), '[]'::jsonb));
end;
$$;

create or replace function catalogo_admin_listar(p_texto text default null, p_categoria text default null, p_filtro text default 'todos', p_desde int default 0, p_limite int default 60)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare v_texto text := nullif(btrim(coalesce(p_texto, '')), ''); v_total int; v_filas jsonb;
begin
  if not soy_administrador_plataforma() then raise exception 'Solo el administrador de la plataforma'; end if;
  if p_filtro not in ('todos', 'sin_foto', 'con_foto', 'sin_descripcion', 'eliminados') then raise exception 'Filtro no válido'; end if;
  select count(*) into v_total from catalogo_base b
   where (v_texto is null or b.nombre ilike '%' || v_texto || '%' or b.codigo = v_texto)
     and (p_categoria is null or b.categoria = p_categoria)
     and ((p_filtro = 'eliminados') = (b.eliminado_en is not null))
     and (p_filtro in ('todos', 'eliminados') or (p_filtro = 'sin_foto' and b.foto is null) or (p_filtro = 'con_foto' and b.foto is not null) or (p_filtro = 'sin_descripcion' and b.descripcion is null));
  select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) into v_filas from (
    select b.id, b.codigo, b.nombre, b.categoria, b.unidad, b.presentacion, b.descripcion, b.foto, b.foto_version, (b.eliminado_en is not null) as eliminado
      from catalogo_base b
     where (v_texto is null or b.nombre ilike '%' || v_texto || '%' or b.codigo = v_texto)
       and (p_categoria is null or b.categoria = p_categoria)
       and ((p_filtro = 'eliminados') = (b.eliminado_en is not null))
       and (p_filtro in ('todos', 'eliminados') or (p_filtro = 'sin_foto' and b.foto is null) or (p_filtro = 'con_foto' and b.foto is not null) or (p_filtro = 'sin_descripcion' and b.descripcion is null))
     order by b.nombre, b.id
     offset greatest(coalesce(p_desde, 0), 0) limit least(greatest(coalesce(p_limite, 60), 1), 200)
  ) t;
  return jsonb_build_object('total', v_total, 'filas', v_filas);
end;
$$;

-- ---------- Eliminar / restaurar (borrado suave) ----------
create or replace function catalogo_admin_eliminar(p_id bigint, p_restaurar boolean default false)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not soy_administrador_plataforma() then raise exception 'Solo el administrador de la plataforma'; end if;
  update catalogo_base set eliminado_en = case when coalesce(p_restaurar, false) then null else now() end, actualizado_en = now() where id = p_id;
  if not found then raise exception 'Producto no encontrado'; end if;
end;
$$;

-- ---------- Actualizar las fotos en las tiendas (p_simular = true solo cuenta, no cambia nada) ----------
create or replace function catalogo_admin_sincronizar_fotos(p_simular boolean default true)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare v_nuevas int; v_refrescadas int; v_tiendas int;
begin
  if not soy_administrador_plataforma() then raise exception 'Solo el administrador de la plataforma'; end if;
  create temporary table if not exists _sync_fotos (negocio_id uuid, id uuid, foto text, era_vacia boolean) on commit drop;
  delete from _sync_fotos;
  insert into _sync_fotos
  select distinct on (p.negocio_id, p.id) p.negocio_id, p.id, b.foto, cardinality(p.imagenes) = 0
    from productos p
    join catalogo_base b on b.eliminado_en is null and b.foto is not null
                        and ((b.codigo is not null and p.codigo = b.codigo) or lower(p.nombre) = lower(b.nombre))
   where cardinality(p.imagenes) = 0
      or (cardinality(p.imagenes) = 1 and p.imagenes[1] <> b.foto
          and p.imagenes[1] like '%/storage/v1/object/public/catalogo/%'
          and split_part(p.imagenes[1], '?', 1) = split_part(b.foto, '?', 1))
   order by p.negocio_id, p.id, b.id;
  select count(*) filter (where era_vacia), count(*) filter (where not era_vacia), count(distinct negocio_id) into v_nuevas, v_refrescadas, v_tiendas from _sync_fotos;
  if not coalesce(p_simular, true) then
    update productos p set imagenes = array[s.foto] from _sync_fotos s where p.negocio_id = s.negocio_id and p.id = s.id;
  end if;
  return jsonb_build_object('nuevas', v_nuevas, 'refrescadas', v_refrescadas, 'tiendas', v_tiendas, 'aplicado', not coalesce(p_simular, true));
end;
$$;

revoke all on function catalogo_admin_eliminar(bigint, boolean), catalogo_admin_sincronizar_fotos(boolean) from public, anon;
grant execute on function catalogo_admin_eliminar(bigint, boolean), catalogo_admin_sincronizar_fotos(boolean) to authenticated;

-- ---------- Lo eliminado tampoco se ofrece a las tiendas ----------
create or replace function catalogo_base_categorias(p_negocio_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare v_tipo text;
begin
  if not es_dueno(p_negocio_id) then raise exception 'Solo el dueño puede cargar productos base'; end if;
  perform exigir_modulo(p_negocio_id, 'productos');
  select tipo into v_tipo from negocios where id = p_negocio_id;
  return coalesce((
    select jsonb_agg(jsonb_build_object('categoria', t.categoria, 'total', t.total, 'nuevos', t.nuevos) order by t.total desc, t.categoria)
      from (
        select b.categoria, count(*) as total,
               count(*) filter (where not exists (
                 select 1 from productos p
                  where p.negocio_id = p_negocio_id
                    and ((b.codigo is not null and p.codigo = b.codigo) or lower(p.nombre) = lower(b.nombre)))) as nuevos
          from catalogo_base b
          join catalogo_base_categoria c on c.categoria = b.categoria and v_tipo = any (c.tipos)
         where b.eliminado_en is null
         group by b.categoria
      ) t
  ), '[]'::jsonb);
end;
$$;

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

create or replace function catalogo_base_buscar(p_negocio_id uuid, p_codigo text)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare r record;
begin
  if not es_personal(p_negocio_id) then raise exception 'Sin acceso'; end if;
  if p_codigo is null or char_length(btrim(p_codigo)) < 3 then return null; end if;
  select nombre, categoria, unidad, foto into r from catalogo_base where codigo = btrim(p_codigo) and eliminado_en is null;
  if not found then return null; end if;
  return jsonb_build_object('nombre', r.nombre, 'categoria', r.categoria, 'unidad', r.unidad, 'foto', r.foto);
end;
$$;

revoke all on function catalogo_base_categorias(uuid), cargar_catalogo_base(uuid, text[]), catalogo_base_buscar(uuid, text) from public, anon;
grant execute on function catalogo_base_categorias(uuid), cargar_catalogo_base(uuid, text[]), catalogo_base_buscar(uuid, text) to authenticated;

notify pgrst, 'reload schema';

-- ---------- VERIFICACIÓN: las 5 filas deben decir ok = true ----------
select chequeo, ok from (
  select 1 as n, 'verificar_aislamiento: todo en orden' as chequeo, (select bool_and(ok) from verificar_aislamiento()) as ok
  union all select 2, 'existe la columna de borrado suave', exists (select 1 from information_schema.columns where table_name = 'catalogo_base' and column_name = 'eliminado_en')
  union all select 3, 'eliminar y actualizar fotos son solo para quien inició sesión', not has_function_privilege('anon', 'catalogo_admin_eliminar(bigint, boolean)', 'execute') and has_function_privilege('authenticated', 'catalogo_admin_sincronizar_fotos(boolean)', 'execute')
  union all select 4, 'las tiendas no ven productos eliminados', position('eliminado_en is null' in pg_get_functiondef('cargar_catalogo_base(uuid, text[])'::regprocedure)) > 0
  union all select 5, 'tu usuario es administrador de la plataforma (si dice false, ver la nota)', exists (select 1 from plataforma_admins where nivel = 'administrador')
) t order by n;
