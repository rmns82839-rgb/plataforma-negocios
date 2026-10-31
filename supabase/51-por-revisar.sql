-- 51 · Por revisar: marcar productos con un motivo (foto mala, nombre dudoso, duplicado…) y filtrarlos.
-- Agrega una columna, una función para marcar y actualiza las 2 funciones de lista. No borra ni cambia fotos ni productos.

alter table catalogo_base add column if not exists revisar text;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'catalogo_base_revisar_largo') then
    alter table catalogo_base add constraint catalogo_base_revisar_largo check (revisar is null or char_length(revisar) between 1 and 40);
  end if;
end $$;

-- Marca (con motivo) o desmarca (motivo vacío) hasta 500 productos a la vez
create or replace function catalogo_admin_revisar(p_ids bigint[], p_motivo text default null)
returns int
language plpgsql security definer set search_path = public
as $$
declare v_motivo text := nullif(btrim(coalesce(p_motivo, '')), ''); v_n int;
begin
  if not soy_administrador_plataforma() then raise exception 'Solo el administrador de la plataforma'; end if;
  if p_ids is null or cardinality(p_ids) < 1 or cardinality(p_ids) > 500 then raise exception 'Escoge entre 1 y 500 productos'; end if;
  if v_motivo is not null and char_length(v_motivo) > 40 then raise exception 'El motivo es muy largo (máximo 40 letras)'; end if;
  update catalogo_base set revisar = v_motivo where id = any (p_ids);
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

create or replace function catalogo_admin_listar(p_texto text default null, p_categoria text default null, p_filtro text default 'todos', p_desde int default 0, p_limite int default 60)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare v_texto text := nullif(btrim(coalesce(p_texto, '')), ''); v_total int; v_filas jsonb; v_num int;
begin
  if not soy_administrador_plataforma() then raise exception 'Solo el administrador de la plataforma'; end if;
  if p_filtro not in ('todos', 'sin_foto', 'con_foto', 'sin_descripcion', 'eliminados', 'tanda', 'sin_codigo', 'revisar') and p_filtro !~ '^revisar:.{1,40}$' then raise exception 'Filtro no válido'; end if;
  v_num := case when v_texto ~ '^[0-9]{1,3}$' then v_texto::int end;
  select count(*) into v_total from catalogo_base b
   where (v_texto is null or b.nombre ilike '%' || v_texto || '%' or b.codigo = v_texto or b.tanda_n = v_num)
     and (p_categoria is null or b.categoria = p_categoria)
     and ((p_filtro = 'eliminados') = (b.eliminado_en is not null))
     and (p_filtro in ('todos', 'eliminados') or (p_filtro = 'sin_foto' and b.foto is null) or (p_filtro = 'con_foto' and b.foto is not null)
          or (p_filtro = 'sin_descripcion' and b.descripcion is null) or (p_filtro = 'tanda' and b.tanda_n is not null) or (p_filtro = 'sin_codigo' and b.codigo is null)
          or (p_filtro = 'revisar' and b.revisar is not null) or (p_filtro like 'revisar:%' and b.revisar = substr(p_filtro, 9)));
  select coalesce(jsonb_agg(to_jsonb(t) order by t.ord), '[]'::jsonb) into v_filas from (
    select b.id, b.codigo, b.nombre, b.categoria, b.unidad, b.presentacion, b.descripcion, b.foto, b.fotos, b.foto_version, b.tanda_n, b.revisar, (b.eliminado_en is not null) as eliminado,
           row_number() over (order by case when p_filtro = 'tanda' then b.tanda_n end, b.nombre, b.id) as ord
      from catalogo_base b
     where (v_texto is null or b.nombre ilike '%' || v_texto || '%' or b.codigo = v_texto or b.tanda_n = v_num)
       and (p_categoria is null or b.categoria = p_categoria)
       and ((p_filtro = 'eliminados') = (b.eliminado_en is not null))
       and (p_filtro in ('todos', 'eliminados') or (p_filtro = 'sin_foto' and b.foto is null) or (p_filtro = 'con_foto' and b.foto is not null)
            or (p_filtro = 'sin_descripcion' and b.descripcion is null) or (p_filtro = 'tanda' and b.tanda_n is not null) or (p_filtro = 'sin_codigo' and b.codigo is null)
          or (p_filtro = 'revisar' and b.revisar is not null) or (p_filtro like 'revisar:%' and b.revisar = substr(p_filtro, 9)))
     order by case when p_filtro = 'tanda' then b.tanda_n end, b.nombre, b.id
     offset greatest(coalesce(p_desde, 0), 0) limit least(greatest(coalesce(p_limite, 60), 1), 200)
  ) t;
  return jsonb_build_object('total', v_total, 'filas', v_filas);
end;
$$;

create or replace function catalogo_admin_listar_secciones(p_categorias text[], p_sin_categoria boolean default false, p_texto text default null, p_filtro text default 'todos', p_desde int default 0, p_limite int default 60)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare v_texto text := nullif(btrim(coalesce(p_texto, '')), ''); v_total int; v_filas jsonb; v_num int;
begin
  if not soy_administrador_plataforma() then raise exception 'Solo el administrador de la plataforma'; end if;
  if p_filtro not in ('todos', 'sin_foto', 'con_foto', 'sin_descripcion', 'eliminados', 'tanda', 'sin_codigo', 'revisar') and p_filtro !~ '^revisar:.{1,40}$' then raise exception 'Filtro no válido'; end if;
  v_num := case when v_texto ~ '^[0-9]{1,3}$' then v_texto::int end;
  select count(*) into v_total from catalogo_base b
   where (v_texto is null or b.nombre ilike '%' || v_texto || '%' or b.codigo = v_texto or b.tanda_n = v_num)
     and (b.categoria = any(coalesce(p_categorias, '{}')) or (coalesce(p_sin_categoria, false) and nullif(btrim(coalesce(b.categoria, '')), '') is null))
     and ((p_filtro = 'eliminados') = (b.eliminado_en is not null))
     and (p_filtro in ('todos', 'eliminados') or (p_filtro = 'sin_foto' and b.foto is null) or (p_filtro = 'con_foto' and b.foto is not null)
          or (p_filtro = 'sin_descripcion' and b.descripcion is null) or (p_filtro = 'tanda' and b.tanda_n is not null) or (p_filtro = 'sin_codigo' and b.codigo is null)
          or (p_filtro = 'revisar' and b.revisar is not null) or (p_filtro like 'revisar:%' and b.revisar = substr(p_filtro, 9)));
  select coalesce(jsonb_agg(to_jsonb(t) order by t.ord), '[]'::jsonb) into v_filas from (
    select b.id, b.codigo, b.nombre, b.categoria, b.unidad, b.presentacion, b.descripcion, b.foto, b.fotos, b.foto_version, b.tanda_n, b.revisar, (b.eliminado_en is not null) as eliminado,
           row_number() over (order by case when p_filtro = 'tanda' then b.tanda_n end, b.nombre, b.id) as ord
      from catalogo_base b
     where (v_texto is null or b.nombre ilike '%' || v_texto || '%' or b.codigo = v_texto or b.tanda_n = v_num)
       and (b.categoria = any(coalesce(p_categorias, '{}')) or (coalesce(p_sin_categoria, false) and nullif(btrim(coalesce(b.categoria, '')), '') is null))
       and ((p_filtro = 'eliminados') = (b.eliminado_en is not null))
       and (p_filtro in ('todos', 'eliminados') or (p_filtro = 'sin_foto' and b.foto is null) or (p_filtro = 'con_foto' and b.foto is not null)
            or (p_filtro = 'sin_descripcion' and b.descripcion is null) or (p_filtro = 'tanda' and b.tanda_n is not null) or (p_filtro = 'sin_codigo' and b.codigo is null)
          or (p_filtro = 'revisar' and b.revisar is not null) or (p_filtro like 'revisar:%' and b.revisar = substr(p_filtro, 9)))
     order by case when p_filtro = 'tanda' then b.tanda_n end, b.nombre, b.id
     offset greatest(coalesce(p_desde, 0), 0) limit least(greatest(coalesce(p_limite, 60), 1), 200)
  ) t;
  return jsonb_build_object('total', v_total, 'filas', v_filas);
end;
$$;

revoke all on function catalogo_admin_revisar(bigint[], text) from public, anon;
grant execute on function catalogo_admin_revisar(bigint[], text) to authenticated;

notify pgrst, 'reload schema';

-- ---------- VERIFICACIÓN: las 4 filas deben decir ok = true ----------
select chequeo, ok from (
  select 1 as n, 'verificar_aislamiento: todo en orden' as chequeo, (select bool_and(ok) from verificar_aislamiento()) as ok
  union all select 2, 'existe la columna «revisar»', exists (select 1 from information_schema.columns where table_name = 'catalogo_base' and column_name = 'revisar')
  union all select 3, 'la función de marcar es solo para quien inició sesión', has_function_privilege('authenticated', 'catalogo_admin_revisar(bigint[], text)', 'execute') and not has_function_privilege('anon', 'catalogo_admin_revisar(bigint[], text)', 'execute')
  union all select 4, 'las listas entienden el filtro «revisar»', position('revisar' in pg_get_functiondef('catalogo_admin_listar(text, text, text, int, int)'::regprocedure)) > 0 and position('revisar' in pg_get_functiondef('catalogo_admin_listar_secciones(text[], boolean, text, text, int, int)'::regprocedure)) > 0
) t order by n;
