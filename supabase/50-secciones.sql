-- 50 · Secciones del catálogo: listar productos de varias categorías a la vez (una sección = un grupo de categorías).
-- Solo agrega una función de lectura nueva; no toca ni cambia nada existente.

create or replace function catalogo_admin_listar_secciones(p_categorias text[], p_sin_categoria boolean default false, p_texto text default null, p_filtro text default 'todos', p_desde int default 0, p_limite int default 60)
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
     and (b.categoria = any(coalesce(p_categorias, '{}')) or (coalesce(p_sin_categoria, false) and nullif(btrim(coalesce(b.categoria, '')), '') is null))
     and ((p_filtro = 'eliminados') = (b.eliminado_en is not null))
     and (p_filtro in ('todos', 'eliminados') or (p_filtro = 'sin_foto' and b.foto is null) or (p_filtro = 'con_foto' and b.foto is not null)
          or (p_filtro = 'sin_descripcion' and b.descripcion is null) or (p_filtro = 'tanda' and b.tanda_n is not null) or (p_filtro = 'sin_codigo' and b.codigo is null));
  select coalesce(jsonb_agg(to_jsonb(t) order by t.ord), '[]'::jsonb) into v_filas from (
    select b.id, b.codigo, b.nombre, b.categoria, b.unidad, b.presentacion, b.descripcion, b.foto, b.fotos, b.foto_version, b.tanda_n, (b.eliminado_en is not null) as eliminado,
           row_number() over (order by case when p_filtro = 'tanda' then b.tanda_n end, b.nombre, b.id) as ord
      from catalogo_base b
     where (v_texto is null or b.nombre ilike '%' || v_texto || '%' or b.codigo = v_texto or b.tanda_n = v_num)
       and (b.categoria = any(coalesce(p_categorias, '{}')) or (coalesce(p_sin_categoria, false) and nullif(btrim(coalesce(b.categoria, '')), '') is null))
       and ((p_filtro = 'eliminados') = (b.eliminado_en is not null))
       and (p_filtro in ('todos', 'eliminados') or (p_filtro = 'sin_foto' and b.foto is null) or (p_filtro = 'con_foto' and b.foto is not null)
            or (p_filtro = 'sin_descripcion' and b.descripcion is null) or (p_filtro = 'tanda' and b.tanda_n is not null) or (p_filtro = 'sin_codigo' and b.codigo is null))
     order by case when p_filtro = 'tanda' then b.tanda_n end, b.nombre, b.id
     offset greatest(coalesce(p_desde, 0), 0) limit least(greatest(coalesce(p_limite, 60), 1), 200)
  ) t;
  return jsonb_build_object('total', v_total, 'filas', v_filas);
end;
$$;

revoke all on function catalogo_admin_listar_secciones(text[], boolean, text, text, int, int) from public, anon;
grant execute on function catalogo_admin_listar_secciones(text[], boolean, text, text, int, int) to authenticated;

notify pgrst, 'reload schema';

-- ---------- VERIFICACIÓN: las 3 filas deben decir ok = true ----------
select chequeo, ok from (
  select 1 as n, 'verificar_aislamiento: todo en orden' as chequeo, (select bool_and(ok) from verificar_aislamiento()) as ok
  union all select 2, 'la función de secciones existe y es solo para quien inició sesión', has_function_privilege('authenticated', 'catalogo_admin_listar_secciones(text[], boolean, text, text, int, int)', 'execute') and not has_function_privilege('anon', 'catalogo_admin_listar_secciones(text[], boolean, text, text, int, int)', 'execute')
  union all select 3, 'tu usuario es administrador de la plataforma (si dice false, ver la nota)', exists (select 1 from plataforma_admins where nivel = 'administrador')
) t order by n;
