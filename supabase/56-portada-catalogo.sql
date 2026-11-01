-- ============================================================
-- Plataforma multi-negocio — 56: la presentación (portada) muestra productos del catálogo base
--   · catalogo_base.en_portada: el administrador marca (⭐) qué productos salen en la presentación.
--   · catalogo_destacados(): función pública que entrega esos productos (nombre, categoría y foto; sin precios).
--   · catalogo_admin_portada(): leer / cambiar la marca de un producto (solo el administrador).
-- Los 12 productos que hoy muestra la portada quedan marcados desde el principio. Se corre DESPUÉS del 55. Idempotente.
-- ============================================================
alter table catalogo_base add column if not exists en_portada boolean not null default false;
create index if not exists catalogo_base_portada_idx on catalogo_base (categoria) where en_portada;

create or replace function catalogo_destacados(p_limite int default 12) returns jsonb
language sql stable security definer set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object('nombre', t.nombre, 'categoria', t.categoria, 'foto', t.foto) order by t.categoria, t.nombre), '[]'::jsonb)
    from (select nombre, categoria, foto from catalogo_base
           where en_portada and foto is not null and eliminado_en is null
           order by md5(id::text || current_date::text)      -- si hay más marcados que cupos, rota cada día
           limit least(greatest(coalesce(p_limite, 12), 1), 24)) t
$$;

-- p_valor null = solo leer; true/false = cambiar. Devuelve la marca actual.
create or replace function catalogo_admin_portada(p_id bigint, p_valor boolean default null) returns boolean
language plpgsql security definer set search_path = public
as $$
declare v boolean;
begin
  if not soy_administrador_plataforma() then raise exception 'Solo el administrador de la plataforma'; end if;
  if p_valor is not null then
    if p_valor and not exists (select 1 from catalogo_base where id = p_id and foto is not null and eliminado_en is null) then
      raise exception 'Solo se muestran productos con foto';
    end if;
    update catalogo_base set en_portada = p_valor where id = p_id;
  end if;
  select en_portada into v from catalogo_base where id = p_id;
  if v is null then raise exception 'Producto no encontrado'; end if;
  return v;
end;
$$;

revoke all on function catalogo_destacados(int), catalogo_admin_portada(bigint, boolean) from public, anon, authenticated;
grant execute on function catalogo_destacados(int) to anon, authenticated;
grant execute on function catalogo_admin_portada(bigint, boolean) to authenticated;

-- La función pública nueva entra en la lista de verificar_aislamiento (se parchea la vigente)
do $$
declare v text := pg_get_functiondef('verificar_aislamiento()'::regprocedure); n int;
begin
  if position('catalogo_destacados' in v) = 0 then
    n := (regexp_match(v, 'ejecuta las (\d+) funciones'))[1]::int;
    v := replace(v, '''directorio_tiendas''', '''directorio_tiendas'',''catalogo_destacados''');
    v := replace(v, 'ejecuta las ' || n || ' funciones', 'ejecuta las ' || (n + 1) || ' funciones');
    if position('catalogo_destacados' in v) = 0 then raise exception 'No se pudo actualizar verificar_aislamiento'; end if;
    execute v;
  end if;
end $$;

-- Marca de entrada los productos que la portada mostraba (por su foto)
update catalogo_base set en_portada = true
 where eliminado_en is null and foto = any (array[
  'https://fnwahipriagkzcjppltz.supabase.co/storage/v1/object/public/prendas/productos/3cbd2ca1-ef06-4d9a-afe2-e85233f6db65_real.jpg',
  'https://fnwahipriagkzcjppltz.supabase.co/storage/v1/object/public/prendas/productos/f96c9b6b-58f7-4057-a674-1408e9c6c663_real.jpg',
  'https://fnwahipriagkzcjppltz.supabase.co/storage/v1/object/public/prendas/productos/3c75dc86-493e-4f32-9b90-dd2570259f1b_real.jpg',
  'https://fnwahipriagkzcjppltz.supabase.co/storage/v1/object/public/prendas/productos/91216015-e5bf-436d-8ffc-166b3108ed53_real.jpg',
  'https://fnwahipriagkzcjppltz.supabase.co/storage/v1/object/public/prendas/productos/90af6c90-9958-411d-9a53-0935dd417872_real.jpg',
  'https://fnwahipriagkzcjppltz.supabase.co/storage/v1/object/public/prendas/productos/a297f44d-fa48-4b83-a54e-f5635c696731_real.jpg',
  'https://fnwahipriagkzcjppltz.supabase.co/storage/v1/object/public/prendas/productos/e81a5f8b-c3d9-4740-bcc8-12d611ce7ef7_real.jpg',
  'https://fnwahipriagkzcjppltz.supabase.co/storage/v1/object/public/prendas/productos/5f0a9ae4-a382-478c-8486-1df8920da057_real.jpg',
  'https://fnwahipriagkzcjppltz.supabase.co/storage/v1/object/public/prendas/productos/78021da3-f275-4cf2-ba28-fff104d9400e_real.jpg',
  'https://fnwahipriagkzcjppltz.supabase.co/storage/v1/object/public/prendas/productos/23402f08-39b8-4f88-ae95-03e31e7aa0b9_real.jpg',
  'https://fnwahipriagkzcjppltz.supabase.co/storage/v1/object/public/prendas/productos/db2fd58a-bfe1-4d43-8ac2-d11f569f1e82_real.jpg',
  'https://fnwahipriagkzcjppltz.supabase.co/storage/v1/object/public/prendas/productos/8b664e0b-8d96-4b4a-af40-2c53ca455b0a_real.jpg'
 ]) and not en_portada;

notify pgrst, 'reload schema';

-- ---------- VERIFICACIÓN: las 5 filas deben decir ok = true ----------
select chequeo, ok from (
  select 1 as n, 'verificar_aislamiento: todo en orden' as chequeo, (select bool_and(ok) from verificar_aislamiento()) as ok
  union all select 2, 'la portada ya tiene productos marcados con foto', (select count(*) > 0 from catalogo_base where en_portada and foto is not null)
  union all select 3, 'catalogo_destacados() entrega la lista', (select jsonb_array_length(catalogo_destacados(12)) > 0)
  union all select 4, 'anónimo puede ver la presentación pero no cambiarla',
         has_function_privilege('anon', 'catalogo_destacados(int)', 'execute') and not has_function_privilege('anon', 'catalogo_admin_portada(bigint, boolean)', 'execute')
  union all select 5, 'la lista no trae precios ni códigos', not exists (select 1 from jsonb_array_elements(catalogo_destacados(12)) e where e ? 'precio' or e ? 'codigo')
) t order by n;
