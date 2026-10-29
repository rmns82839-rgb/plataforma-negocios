-- ============================================================
-- Plataforma multi-negocio — 30: tiendas externas en el directorio (ej. Cibus, la tienda de Nelson)
-- Se corre DESPUÉS del 29. Es aditivo e idempotente: se puede volver a correr.
--
-- Qué resuelve
--   · Hay tiendas que NO viven dentro de la plataforma pero deben salir en «Tiendas cerca de ti»
--     (hoy: Cibus, que tiene su propia base). Aparecen con su logo, ciudad, horario y distancia, y el botón
--     «Ver la tienda» abre SU dirección web.
--   · Solo las agrega el sistema (SQL Editor): nadie desde la app puede crear ni cambiar estas tarjetas.
-- Qué NO toca: ninguna tienda ni dato existente. Agrega una tabla y redefine las 2 funciones del directorio.
-- ============================================================

-- ---------- 1. Tarjetas externas (cerradas con RLS: solo se leen por las funciones del directorio) ----------
create table if not exists directorio_externo (
  id             uuid primary key default gen_random_uuid(),
  slug           text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$'),
  tipo           text not null default 'tienda' check (tipo in ('tienda', 'ropa', 'repuestos', 'mixto')),
  nombre         text not null check (char_length(btrim(nombre)) between 2 and 80),
  eslogan        text check (eslogan is null or char_length(eslogan) <= 120),
  logo_url       text check (logo_url is null or logo_url ~ '^/[A-Za-z0-9._/-]{1,120}$'),     -- imagen que vive en la carpeta pública de la plataforma
  color          text check (color is null or color ~ '^#[0-9a-fA-F]{6}$'),
  ciudad         text check (ciudad is null or char_length(ciudad) <= 60),
  direccion      text check (direccion is null or char_length(direccion) <= 120),
  lat            numeric(9,6),
  lng            numeric(9,6),
  domicilio      boolean not null default false,
  horario_semana jsonb check (horario_semana is null or horario_valido(horario_semana)),
  url            text not null check (url ~ '^https://[A-Za-z0-9.-]+(/[A-Za-z0-9._~:/?#@!$&()*+,;=%-]*)?$' and char_length(url) <= 300),
  activo         boolean not null default true,
  creado_en      timestamptz not null default now(),
  constraint directorio_externo_punto_ck check ((lat is null) = (lng is null) and (lat is null or (lat between -90 and 90 and lng between -180 and 180)))
);
alter table directorio_externo enable row level security;
revoke all on table directorio_externo from public, anon, authenticated;
grant all on table directorio_externo to service_role;

-- ---------- 2. Directorio de tiendas: las de la plataforma + las externas ----------
create or replace function directorio_tiendas(
  p_lat numeric default null, p_lng numeric default null,
  p_busqueda text default null, p_ciudad text default null, p_tipo text default null,
  p_solo_abiertas boolean default false, p_limite int default 40)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare v_res jsonb; v_lim int := least(greatest(coalesce(p_limite, 40), 1), 100); v_q text := nullif(btrim(coalesce(p_busqueda, '')), '');
begin
  if (p_lat is not null and p_lat not between -90 and 90) or (p_lng is not null and p_lng not between -180 and 180) then
    p_lat := null; p_lng := null;
  end if;
  select coalesce(jsonb_agg(u.x order by u.dist nulls last, u.abre desc, u.nombre), '[]'::jsonb) into v_res from (
    select t.* from (
      -- tiendas de la plataforma
      select
        jsonb_build_object(
          'slug', n.slug, 'tipo', n.tipo, 'nombre', c.nombre_comercial, 'eslogan', c.eslogan,
          'logo', c.logo_path, 'icono', c.icono_path,
          'logo_auto', jsonb_build_object('inicial', upper(left(btrim(c.nombre_comercial), 1)), 'color', c.color_principal),
          'ciudad', c.ciudad, 'direccion', c.direccion,
          'domicilio', exists (select 1 from negocio_modulos m where m.negocio_id = n.id and m.modulo = 'domicilios' and m.activo),
          'estado_horario', e.x,
          'distancia_km', d.km) as x,
        d.km as dist, coalesce((e.x ->> 'abierto') = 'true', false) as abre, c.nombre_comercial as nombre
      from negocios n
      join negocio_config c on c.negocio_id = n.id
      cross join lateral (select estado_horario(c.horario_semana, c.cerrado_hasta) as x) e
      cross join lateral (select case when p_lat is not null and p_lng is not null and c.lat is not null and c.lng is not null
          then round((6371 * 2 * asin(least(1, sqrt(
                 power(sin(radians((c.lat - p_lat) / 2)), 2)
               + cos(radians(p_lat)) * cos(radians(c.lat)) * power(sin(radians((c.lng - p_lng) / 2)), 2)))))::numeric, 1) end as km) d
      where n.estado = 'activo' and n.publicada and c.en_directorio
        and exists (select 1 from negocio_modulos m where m.negocio_id = n.id and m.modulo = 'catalogo_publico' and m.activo)
        and exists (select 1 from negocio_modulos m where m.negocio_id = n.id and m.modulo = 'directorio_red' and m.activo)
        and (v_q is null or c.nombre_comercial ilike '%' || v_q || '%' or coalesce(c.eslogan, '') ilike '%' || v_q || '%')
        and (nullif(btrim(coalesce(p_ciudad, '')), '') is null or lower(btrim(c.ciudad)) = lower(btrim(p_ciudad)))
        and (nullif(p_tipo, '') is null or n.tipo = p_tipo)
        and (not coalesce(p_solo_abiertas, false) or (e.x ->> 'abierto') = 'true')
      union all
      -- tiendas externas (su botón abre su propia dirección web)
      select
        jsonb_build_object(
          'slug', x.slug, 'tipo', x.tipo, 'nombre', x.nombre, 'eslogan', x.eslogan,
          'logo', null, 'icono', null, 'logo_url', x.logo_url,
          'logo_auto', jsonb_build_object('inicial', upper(left(btrim(x.nombre), 1)), 'color', x.color),
          'ciudad', x.ciudad, 'direccion', x.direccion, 'domicilio', x.domicilio,
          'estado_horario', e.x, 'distancia_km', d.km,
          'externa', true, 'url', x.url) as x,
        d.km as dist, coalesce((e.x ->> 'abierto') = 'true', false) as abre, x.nombre as nombre
      from directorio_externo x
      cross join lateral (select estado_horario(x.horario_semana, null) as x) e
      cross join lateral (select case when p_lat is not null and p_lng is not null and x.lat is not null and x.lng is not null
          then round((6371 * 2 * asin(least(1, sqrt(
                 power(sin(radians((x.lat - p_lat) / 2)), 2)
               + cos(radians(p_lat)) * cos(radians(x.lat)) * power(sin(radians((x.lng - p_lng) / 2)), 2)))))::numeric, 1) end as km) d
      where x.activo
        and (v_q is null or x.nombre ilike '%' || v_q || '%' or coalesce(x.eslogan, '') ilike '%' || v_q || '%')
        and (nullif(btrim(coalesce(p_ciudad, '')), '') is null or lower(btrim(x.ciudad)) = lower(btrim(p_ciudad)))
        and (nullif(p_tipo, '') is null or x.tipo = p_tipo)
        and (not coalesce(p_solo_abiertas, false) or (e.x ->> 'abierto') = 'true')
    ) t
    order by t.dist nulls last, t.abre desc, t.nombre
    limit v_lim
  ) u;
  return v_res;
end;
$$;

create or replace function directorio_ciudades()
returns jsonb
language sql stable security definer set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object('ciudad', x.ciudad, 'tiendas', x.n) order by x.n desc, x.ciudad), '[]'::jsonb)
    from (select initcap(btrim(q.ciudad)) as ciudad, count(*) as n
            from (
              select c.ciudad
                from negocios n join negocio_config c on c.negocio_id = n.id
               where n.estado = 'activo' and n.publicada and c.en_directorio
                 and exists (select 1 from negocio_modulos m where m.negocio_id = n.id and m.modulo = 'catalogo_publico' and m.activo)
                 and exists (select 1 from negocio_modulos m where m.negocio_id = n.id and m.modulo = 'directorio_red' and m.activo)
              union all
              select e.ciudad from directorio_externo e where e.activo
            ) q
           where nullif(btrim(coalesce(q.ciudad, '')), '') is not null
           group by 1) x
$$;

revoke all on function directorio_tiendas(numeric, numeric, text, text, text, boolean, int), directorio_ciudades() from public;
grant execute on function directorio_tiendas(numeric, numeric, text, text, text, boolean, int), directorio_ciudades() to anon, authenticated;

-- ---------- 3. Cibus (la tienda de Nelson) ----------
-- Se agrega con lo que ya se sabe. La ciudad, la dirección y el horario se completan con el UPDATE de abajo cuando Nelson los confirme.
insert into directorio_externo (slug, tipo, nombre, eslogan, logo_url, color, url, domicilio)
values ('cibus', 'tienda', 'Cibus', 'Tu tienda de barrio, ahora en tu celular', '/cibus-logo.webp', '#5B1A9E', 'https://matriz-cibus.vercel.app/tienda', true)
on conflict (slug) do nothing;

-- Ejemplo para completar los datos de Cibus (cambia los textos y córrelo cuando tengas los datos reales):
-- update directorio_externo set ciudad = 'Puerto Colombia', direccion = 'Calle 10 # 5-20',
--   lat = 10.9878, lng = -74.9548,
--   horario_semana = '{"1":[["07:00","20:00"]],"2":[["07:00","20:00"]],"3":[["07:00","20:00"]],"4":[["07:00","20:00"]],"5":[["07:00","20:00"]],"6":[["07:00","20:00"]]}'
--  where slug = 'cibus';

-- ---------- 4. Tabla global en la lista de verificar_aislamiento (se parchea la vigente) ----------
do $$
declare v text := pg_get_functiondef('verificar_aislamiento()'::regprocedure);
begin
  if position('directorio_externo' in v) = 0 then
    v := replace(v, '''solicitudes_negocio'']);', '''solicitudes_negocio'', ''directorio_externo'']);');
    if position('directorio_externo' in v) = 0 then raise exception 'No se pudo actualizar verificar_aislamiento'; end if;
    execute v;
  end if;
end $$;

notify pgrst, 'reload schema';

-- ---------- VERIFICACIÓN: las 5 filas deben decir ok = true ----------
select chequeo, ok from (
  select 1 as n, 'verificar_aislamiento: todo en orden' as chequeo, (select bool_and(ok) from verificar_aislamiento()) as ok
  union all select 2, 'La tabla de externas tiene RLS y nadie la toca directo',
         (select relrowsecurity from pg_class where relname = 'directorio_externo')
         and not exists (select 1 from information_schema.role_table_grants where table_name = 'directorio_externo' and grantee in ('anon', 'authenticated', 'PUBLIC'))
  union all select 3, 'Cibus está en la lista', exists (select 1 from directorio_externo where slug = 'cibus' and activo)
  union all select 4, 'El directorio público sigue abierto al anónimo y sin coordenadas',
         has_function_privilege('anon', 'directorio_tiendas(numeric,numeric,text,text,text,boolean,int)', 'execute')
         and position('''lat''' in pg_get_functiondef('directorio_tiendas(numeric,numeric,text,text,text,boolean,int)'::regprocedure)) = 0
  union all select 5, 'El directorio devuelve a Cibus', exists (select 1 from jsonb_array_elements(directorio_tiendas()) e where e ->> 'slug' = 'cibus' and (e ->> 'externa') = 'true')
) t order by n;
