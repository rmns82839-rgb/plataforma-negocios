-- ============================================================
-- 46 · Tandas de números para cotejar fotos (1, 2, 3… las que tú decidas)
-- Se corre DESPUÉS del 45. Es aditivo e idempotente: se puede volver a correr.
--  · «Numerar» toma los primeros N productos SIN FOTO (según el filtro que estés viendo) y les pone
--    el número 1, 2, 3… N. Guardas cada foto con su número (1.jpg, 2.jpg…) y al subirlas se asignan solas.
--  · Al ponerle foto a un producto, su número se libera. Una tanda nueva borra los números anteriores y
--    vuelve a empezar desde 1.
--  · El buscador del catálogo encuentra un producto por su número de tanda.
-- ============================================================

alter table catalogo_base add column if not exists tanda_n integer check (tanda_n is null or tanda_n between 1 and 500);
create unique index if not exists catalogo_base_tanda_uq on catalogo_base (tanda_n) where tanda_n is not null;

-- ---------- Numerar una tanda ----------
create or replace function catalogo_admin_tanda(p_cantidad int, p_categoria text default null, p_texto text default null)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare v_texto text := nullif(btrim(coalesce(p_texto, '')), ''); v_n int;
begin
  if not soy_administrador_plataforma() then raise exception 'Solo el administrador de la plataforma'; end if;
  if p_cantidad is null or p_cantidad < 1 or p_cantidad > 500 then raise exception 'La cantidad debe estar entre 1 y 500'; end if;
  update catalogo_base set tanda_n = null where tanda_n is not null;
  with elegidos as (
    select id, row_number() over (order by nombre, id) as k
      from catalogo_base b
     where b.eliminado_en is null and b.foto is null
       and (p_categoria is null or b.categoria = p_categoria)
       and (v_texto is null or b.nombre ilike '%' || v_texto || '%' or b.codigo = v_texto)
     order by nombre, id
     limit p_cantidad
  ), puestos as (
    update catalogo_base b set tanda_n = e.k from elegidos e where b.id = e.id returning 1
  )
  select count(*) into v_n from puestos;
  return jsonb_build_object('numerados', v_n, 'pedidos', p_cantidad);
end;
$$;

-- ---------- Quitar todos los números ----------
create or replace function catalogo_admin_tanda_quitar()
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not soy_administrador_plataforma() then raise exception 'Solo el administrador de la plataforma'; end if;
  update catalogo_base set tanda_n = null where tanda_n is not null;
end;
$$;

-- ---------- Al poner una foto, el producto sale de la tanda ----------
create or replace function catalogo_admin_foto(p_id bigint, p_url text)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not soy_administrador_plataforma() then raise exception 'Solo el administrador de la plataforma'; end if;
  if p_url is not null and p_url !~ ('^https://[^/]+/storage/v1/object/public/catalogo/' || p_id || '\.webp(\?v=[0-9]+)?$') then
    raise exception 'La dirección de la foto no es válida';
  end if;
  update catalogo_base set foto = p_url, foto_version = foto_version + 1, actualizado_en = now(),
         tanda_n = case when p_url is not null then null else tanda_n end
   where id = p_id;
  if not found then raise exception 'Producto no encontrado'; end if;
end;
$$;

-- ---------- Listado: muestra el número de tanda, filtro «tanda», busca por número de tanda ----------
create or replace function catalogo_admin_listar(p_texto text default null, p_categoria text default null, p_filtro text default 'todos', p_desde int default 0, p_limite int default 60)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare v_texto text := nullif(btrim(coalesce(p_texto, '')), ''); v_total int; v_filas jsonb; v_num int;
begin
  if not soy_administrador_plataforma() then raise exception 'Solo el administrador de la plataforma'; end if;
  if p_filtro not in ('todos', 'sin_foto', 'con_foto', 'sin_descripcion', 'eliminados', 'tanda') then raise exception 'Filtro no válido'; end if;
  v_num := case when v_texto ~ '^[0-9]{1,3}$' then v_texto::int end;
  select count(*) into v_total from catalogo_base b
   where (v_texto is null or b.nombre ilike '%' || v_texto || '%' or b.codigo = v_texto or b.tanda_n = v_num)
     and (p_categoria is null or b.categoria = p_categoria)
     and ((p_filtro = 'eliminados') = (b.eliminado_en is not null))
     and (p_filtro in ('todos', 'eliminados') or (p_filtro = 'sin_foto' and b.foto is null) or (p_filtro = 'con_foto' and b.foto is not null)
          or (p_filtro = 'sin_descripcion' and b.descripcion is null) or (p_filtro = 'tanda' and b.tanda_n is not null));
  select coalesce(jsonb_agg(to_jsonb(t) order by t.ord), '[]'::jsonb) into v_filas from (
    select b.id, b.codigo, b.nombre, b.categoria, b.unidad, b.presentacion, b.descripcion, b.foto, b.foto_version, b.tanda_n, (b.eliminado_en is not null) as eliminado,
           row_number() over (order by case when p_filtro = 'tanda' then b.tanda_n end, b.nombre, b.id) as ord
      from catalogo_base b
     where (v_texto is null or b.nombre ilike '%' || v_texto || '%' or b.codigo = v_texto or b.tanda_n = v_num)
       and (p_categoria is null or b.categoria = p_categoria)
       and ((p_filtro = 'eliminados') = (b.eliminado_en is not null))
       and (p_filtro in ('todos', 'eliminados') or (p_filtro = 'sin_foto' and b.foto is null) or (p_filtro = 'con_foto' and b.foto is not null)
            or (p_filtro = 'sin_descripcion' and b.descripcion is null) or (p_filtro = 'tanda' and b.tanda_n is not null))
     order by case when p_filtro = 'tanda' then b.tanda_n end, b.nombre, b.id
     offset greatest(coalesce(p_desde, 0), 0) limit least(greatest(coalesce(p_limite, 60), 1), 200)
  ) t;
  return jsonb_build_object('total', v_total, 'filas', v_filas);
end;
$$;

revoke all on function catalogo_admin_tanda(int, text, text), catalogo_admin_tanda_quitar(), catalogo_admin_foto(bigint, text), catalogo_admin_listar(text, text, text, int, int) from public, anon;
grant execute on function catalogo_admin_tanda(int, text, text), catalogo_admin_tanda_quitar(), catalogo_admin_foto(bigint, text), catalogo_admin_listar(text, text, text, int, int) to authenticated;

notify pgrst, 'reload schema';

-- ---------- VERIFICACIÓN: las 5 filas deben decir ok = true ----------
select chequeo, ok from (
  select 1 as n, 'verificar_aislamiento: todo en orden' as chequeo, (select bool_and(ok) from verificar_aislamiento()) as ok
  union all select 2, 'existe la columna de número de tanda', exists (select 1 from information_schema.columns where table_name = 'catalogo_base' and column_name = 'tanda_n')
  union all select 3, 'numerar y quitar son solo para quien inició sesión', not has_function_privilege('anon', 'catalogo_admin_tanda(int, text, text)', 'execute') and has_function_privilege('authenticated', 'catalogo_admin_tanda_quitar()', 'execute')
  union all select 4, 'el listado entiende el filtro «tanda»', position('tanda_n is not null' in pg_get_functiondef('catalogo_admin_listar(text, text, text, int, int)'::regprocedure)) > 0
  union all select 5, 'poner una foto libera el número', position('tanda_n = case' in pg_get_functiondef('catalogo_admin_foto(bigint, text)'::regprocedure)) > 0
) t order by n;
