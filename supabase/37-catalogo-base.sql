-- ============================================================
-- 37 · Catálogo base compartido
-- La plataforma guarda una lista de productos conocidos (nombre, código de barras,
-- categoría, foto real cuando existe) SIN precios ni stock. Cada tienda puede copiarla
-- a su propio inventario con un botón; allí los productos entran ocultos y en $0 hasta
-- que el tendero les pone precio. Es una tabla de la plataforma: ninguna tienda la lee
-- ni la modifica directamente, solo a través de las funciones de abajo.
-- Los datos se cargan después con los archivos 38-catalogo-base-datos-*.sql
-- ============================================================

create table if not exists catalogo_base (
  id        bigint generated always as identity primary key,
  codigo    text check (codigo is null or char_length(codigo) between 3 and 40),
  nombre    text not null check (char_length(nombre) between 2 and 160),
  categoria text not null default 'Otros',
  unidad    text not null default 'und' check (unidad in ('und', 'kg')),
  foto      text check (foto is null or foto ~ '^https://')
);
create unique index if not exists catalogo_base_codigo_uq on catalogo_base (codigo) where codigo is not null;
create unique index if not exists catalogo_base_nombre_uq on catalogo_base (lower(nombre)) where codigo is null;
create index if not exists catalogo_base_categoria_idx on catalogo_base (categoria);

-- Qué categorías sirven para qué tipo de negocio (editable sin tocar las funciones)
create table if not exists catalogo_base_categoria (
  categoria text primary key,
  tipos     text[] not null
);

alter table catalogo_base enable row level security;
alter table catalogo_base_categoria enable row level security;
revoke all on catalogo_base, catalogo_base_categoria from anon, authenticated, public;

-- 1. Categorías disponibles para esta tienda, con cuántos productos nuevos aportaría cada una
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
         group by b.categoria
      ) t
  ), '[]'::jsonb);
end;
$$;

-- 2. Copia a la tienda los productos de las categorías elegidas (sin precio, ocultos, sin repetir)
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
    insert into productos (negocio_id, codigo, nombre, categoria, unidad, imagenes, precio_venta, precio_compra, publicado, activo)
    select p_negocio_id, e.codigo, e.nombre, e.categoria, e.unidad,
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

-- 3. Busca un código de barras en el catálogo base (para autocompletar al crear un producto)
create or replace function catalogo_base_buscar(p_negocio_id uuid, p_codigo text)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare r record;
begin
  if not es_personal(p_negocio_id) then raise exception 'Sin acceso'; end if;
  if p_codigo is null or char_length(btrim(p_codigo)) < 3 then return null; end if;
  select nombre, categoria, unidad, foto into r from catalogo_base where codigo = btrim(p_codigo);
  if not found then return null; end if;
  return jsonb_build_object('nombre', r.nombre, 'categoria', r.categoria, 'unidad', r.unidad, 'foto', r.foto);
end;
$$;

revoke all on function catalogo_base_categorias(uuid), cargar_catalogo_base(uuid, text[]), catalogo_base_buscar(uuid, text) from public, anon;
grant execute on function catalogo_base_categorias(uuid), cargar_catalogo_base(uuid, text[]), catalogo_base_buscar(uuid, text) to authenticated;

-- Qué categorías sirven para cada tipo de negocio (tienda, mixto y miscelánea reciben casi todo)
insert into catalogo_base_categoria (categoria, tipos) values
  ('Aseo',                              '{tienda,mixto,miscelanea}'),
  ('Cuidado personal',                  '{tienda,mixto,miscelanea}'),
  ('Víveres',                           '{tienda,mixto}'),
  ('Abarrotes',                         '{tienda,mixto}'),
  ('Droguería',                         '{tienda,mixto}'),
  ('Miscelánea',                        '{tienda,mixto,miscelanea}'),
  ('Dulceria y galleteria',             '{tienda,mixto,miscelanea}'),
  ('Dulces',                            '{tienda,mixto,miscelanea}'),
  ('Mecatos',                           '{tienda,mixto,miscelanea}'),
  ('Snacks',                            '{tienda,mixto,miscelanea}'),
  ('Galletas',                          '{tienda,mixto,miscelanea}'),
  ('Salsas y condimentos',              '{tienda,mixto}'),
  ('especies',                          '{tienda,mixto}'),
  ('Sopas',                             '{tienda,mixto}'),
  ('Mezclas saborizadas',               '{tienda,mixto}'),
  ('Bebidas',                           '{tienda,mixto,miscelanea}'),
  ('Gaseosas',                          '{tienda,mixto,miscelanea}'),
  ('Agua',                              '{tienda,mixto,miscelanea}'),
  ('Jugos',                             '{tienda,mixto,miscelanea}'),
  ('Bebidas hidratantes y aguas',       '{tienda,mixto,miscelanea}'),
  ('Energizantes',                      '{tienda,mixto}'),
  ('Energizantes y bebidas alcohólicas','{tienda,mixto}'),
  ('Cervezas',                          '{tienda,mixto}'),
  ('Licores',                           '{tienda,mixto}'),
  ('Cigarros y tabacos',                '{tienda,mixto}'),
  ('Cigarrillos Vapeer',                '{tienda,mixto}'),
  ('Pasteleria y Cereales',             '{tienda,mixto}'),
  ('Panadería',                         '{tienda,mixto}'),
  ('Pasteles',                          '{tienda,mixto}'),
  ('Ponqué',                            '{tienda,mixto}'),
  ('Café y chocolates',                 '{tienda,mixto}'),
  ('Carnes y embutidos',                '{tienda,mixto}'),
  ('Carnes',                            '{tienda,mixto}'),
  ('Carnes frias',                      '{tienda,mixto}'),
  ('Lácteos',                           '{tienda,mixto}'),
  ('Helados',                           '{tienda,mixto}'),
  ('Frutas',                            '{tienda,mixto}'),
  ('Verduras',                          '{tienda,mixto}'),
  ('vegetales',                         '{tienda,mixto}'),
  ('Alimentos infantiles',              '{tienda,mixto}'),
  ('Desechables y Bolsas',              '{tienda,mixto,miscelanea}'),
  ('Insecticidas',                      '{tienda,mixto,ferreteria}'),
  ('Mascotas',                          '{tienda,mixto,veterinaria}'),
  ('Papeleria',                         '{tienda,mixto,miscelanea,papeleria}'),
  ('Ferretería',                        '{mixto,ferreteria}'),
  ('Electrico',                         '{mixto,ferreteria}'),
  ('Elementos de energia',              '{mixto,ferreteria}'),
  ('Otros',                             '{tienda,mixto,miscelanea}')
on conflict (categoria) do update set tipos = excluded.tipos;

-- Las dos tablas nuevas son globales (no pertenecen a ninguna tienda): entran en la lista de
-- verificar_aislamiento (se parchea la vigente). Las funciones nuevas son solo de authenticated,
-- así que no cambian la cuenta de las funciones públicas.
do $$
declare v text := pg_get_functiondef('verificar_aislamiento()'::regprocedure);
begin
  if position('catalogo_base' in v) = 0 then
    v := replace(v, '''directorio_externo'']);', '''directorio_externo'', ''catalogo_base'', ''catalogo_base_categoria'']);');
    if position('catalogo_base' in v) = 0 then raise exception 'No se pudo actualizar verificar_aislamiento'; end if;
    execute v;
  end if;
end $$;

notify pgrst, 'reload schema';

-- ---------- VERIFICACIÓN: las 5 filas deben decir ok = true ----------
select chequeo, ok from (
  select 1 as n, 'verificar_aislamiento: todo en orden' as chequeo, (select bool_and(ok) from verificar_aislamiento()) as ok
  union all select 2, 'catalogo_base protegida (RLS, sin acceso directo)', (select relrowsecurity from pg_class where oid = 'catalogo_base'::regclass) and not has_table_privilege('authenticated', 'catalogo_base', 'select') and not has_table_privilege('anon', 'catalogo_base', 'select')
  union all select 3, 'las 3 funciones son solo para quien inició sesión', has_function_privilege('authenticated', 'cargar_catalogo_base(uuid, text[])', 'execute') and not has_function_privilege('anon', 'cargar_catalogo_base(uuid, text[])', 'execute') and not has_function_privilege('anon', 'catalogo_base_categorias(uuid)', 'execute')
  union all select 4, 'tipos con catálogo: tienda, mixto, miscelanea, ferreteria, papeleria, veterinaria', (select count(distinct t) = 6 from catalogo_base_categoria, unnest(tipos) t)
  union all select 5, 'verificar_aislamiento conoce las 2 tablas globales nuevas', position('catalogo_base_categoria' in pg_get_functiondef('verificar_aislamiento()'::regprocedure)) > 0
) t order by n;
