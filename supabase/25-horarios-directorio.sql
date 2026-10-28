-- 25: Horario de atención por día, indicador «abierto / cerrado» y directorio de tiendas (con «las más cercanas»).
--
--   • negocio_config.horario_semana: {"0":[["08:00","14:00"]], "1":[["07:00","12:00"],["14:00","20:00"]], …}
--       llave = día (0 domingo … 6 sábado); cada día admite hasta 2 franjas; día sin llave o con [] = cerrado.
--       NULL = el tendero todavía no lo ha llenado (no se muestra «abierto» ni «cerrado», solo el texto libre).
--   • negocio_config.cerrado_hasta: cierre temporal («hoy no abro»): mientras no pase esa fecha figura cerrado.
--   • negocio_config.en_directorio: el dueño decide si su tienda sale en el directorio (por defecto sí).
--   • negocio_publico() ahora trae horario_semana y estado_horario.
--   • directorio_tiendas(): lista pública de tiendas publicadas; con la ubicación del cliente ordena por cercanía.
--     Nunca devuelve las coordenadas de la tienda, solo la distancia.
-- NO borra ni cambia datos existentes.

-- ---------- Columnas ----------
create or replace function horario_valido(p jsonb) returns boolean
language plpgsql immutable
as $$
declare k text; fr jsonb; i int;
begin
  if p is null then return true; end if;
  if jsonb_typeof(p) <> 'object' then return false; end if;
  for k, fr in select * from jsonb_each(p) loop
    if k !~ '^[0-6]$' or jsonb_typeof(fr) <> 'array' or jsonb_array_length(fr) > 2 then return false; end if;
    for i in 0 .. jsonb_array_length(fr) - 1 loop
      if jsonb_typeof(fr -> i) <> 'array' or jsonb_array_length(fr -> i) <> 2
         or (fr -> i ->> 0) !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
         or (fr -> i ->> 1) !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
         or (fr -> i ->> 0) >= (fr -> i ->> 1) then return false; end if;
    end loop;
    if jsonb_array_length(fr) = 2 and (fr -> 0 ->> 1) > (fr -> 1 ->> 0) then return false; end if;   -- las franjas no se montan
  end loop;
  return true;
end;
$$;

alter table negocio_config add column if not exists horario_semana jsonb;
alter table negocio_config add column if not exists cerrado_hasta   timestamptz;
alter table negocio_config add column if not exists en_directorio   boolean not null default true;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'negocio_config_horario_semana_check') then
    alter table negocio_config add constraint negocio_config_horario_semana_check check (horario_valido(horario_semana));
  end if;
end $$;

-- ---------- ¿Está abierta ahora? (hora de Colombia) ----------
-- Devuelve {abierto: true|false|null, cierra: 'HH:MM', abre_dia: 0-6, abre_hora: 'HH:MM', abre_hoy: bool, temporal: bool}
create or replace function estado_horario(p_semana jsonb, p_cerrado_hasta timestamptz)
returns jsonb
language plpgsql stable set search_path = public
as $$
declare
  v_ahora timestamp := now() at time zone 'America/Bogota';
  v_dow   int := extract(dow from v_ahora)::int;
  v_hora  text := to_char(v_ahora, 'HH24:MI');
  v_fr    jsonb;
  v_d     int;
  i       int;
  v_ini   text;
begin
  if p_semana is null then return jsonb_build_object('abierto', null); end if;
  if p_cerrado_hasta is not null and p_cerrado_hasta > now() then
    return jsonb_build_object('abierto', false, 'temporal', true);
  end if;
  -- ¿abierta en este momento?
  v_fr := coalesce(p_semana -> v_dow::text, '[]'::jsonb);
  for i in 0 .. jsonb_array_length(v_fr) - 1 loop
    if v_hora >= (v_fr -> i ->> 0) and v_hora < (v_fr -> i ->> 1) then
      return jsonb_build_object('abierto', true, 'cierra', v_fr -> i ->> 1);
    end if;
  end loop;
  -- próxima apertura: hoy más tarde o en los próximos 7 días
  for v_d in 0 .. 7 loop
    v_fr := coalesce(p_semana -> ((v_dow + v_d) % 7)::text, '[]'::jsonb);
    for i in 0 .. jsonb_array_length(v_fr) - 1 loop
      v_ini := v_fr -> i ->> 0;
      if v_d > 0 or v_ini > v_hora then
        return jsonb_build_object('abierto', false, 'abre_dia', (v_dow + v_d) % 7, 'abre_hora', v_ini, 'abre_hoy', v_d = 0);
      end if;
    end loop;
  end loop;
  return jsonb_build_object('abierto', false);
end;
$$;

-- ---------- negocio_publico: ahora con el horario por día y el estado (se parchea la versión vigente, sin reescribirla) ----------
do $$
declare d text;
begin
  select pg_get_functiondef('negocio_publico(text)'::regprocedure) into d;
  if position('estado_horario' in d) = 0 then
    d := replace(d, '''horario'', c.horario,',
                    '''horario'', c.horario, ''horario_semana'', c.horario_semana, ''estado_horario'', estado_horario(c.horario_semana, c.cerrado_hasta),');
    if position('estado_horario' in d) = 0 then raise exception 'No se pudo ajustar negocio_publico'; end if;
    execute d;
  end if;
end $$;

-- ---------- Directorio público de tiendas ----------
-- Solo tiendas activas, publicadas, con catálogo público y el módulo «directorio_red», y que el dueño no haya ocultado.
-- p_lat/p_lng: ubicación del cliente (opcional). Con ella, se ordena por cercanía (km en línea recta, redondeado a 0,1).
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
  select coalesce(jsonb_agg(t.x order by t.dist nulls last, t.abre desc, t.nombre), '[]'::jsonb) into v_res from (
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
    order by d.km nulls last, 3 desc, 4
    limit v_lim
  ) t;
  return v_res;
end;
$$;

create or replace function directorio_ciudades()
returns jsonb
language sql stable security definer set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object('ciudad', x.ciudad, 'tiendas', x.n) order by x.n desc, x.ciudad), '[]'::jsonb)
    from (select initcap(btrim(c.ciudad)) as ciudad, count(*) as n
            from negocios n join negocio_config c on c.negocio_id = n.id
           where n.estado = 'activo' and n.publicada and c.en_directorio and nullif(btrim(coalesce(c.ciudad, '')), '') is not null
             and exists (select 1 from negocio_modulos m where m.negocio_id = n.id and m.modulo = 'catalogo_publico' and m.activo)
             and exists (select 1 from negocio_modulos m where m.negocio_id = n.id and m.modulo = 'directorio_red' and m.activo)
           group by 1) x
$$;

revoke all on function estado_horario(jsonb, timestamptz), horario_valido(jsonb) from public, anon, authenticated;
grant execute on function horario_valido(jsonb) to authenticated;     -- la usa un CHECK
revoke all on function directorio_tiendas(numeric, numeric, text, text, text, boolean, int), directorio_ciudades() from public;
grant execute on function directorio_tiendas(numeric, numeric, text, text, text, boolean, int), directorio_ciudades() to anon, authenticated;

-- ---------- verificar_aislamiento(): el anónimo ahora ejecuta 12 funciones públicas (se parchea la vigente) ----------
do $$
declare v text := pg_get_functiondef('verificar_aislamiento()'::regprocedure);
begin
  if position('directorio_tiendas' in v) = 0 then
    v := replace(v, '''estado_pedido'',''extras_tienda'');', '''estado_pedido'',''extras_tienda'',''directorio_tiendas'',''directorio_ciudades'');');
    v := replace(v, 'Anónimo solo ejecuta las 10 funciones públicas', 'Anónimo solo ejecuta las 12 funciones públicas');
    if position('directorio_tiendas' in v) = 0 then raise exception 'No se pudo actualizar verificar_aislamiento'; end if;
    execute v;
  end if;
end $$;

notify pgrst, 'reload schema';

-- ---------- VERIFICACIÓN: las 16 filas deben decir ok = true ----------
select chequeo, ok from (
  select 1 as n, chequeo, ok from verificar_aislamiento()
  union all select 2, 'Columnas nuevas del horario existen',
         (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'negocio_config'
           and column_name in ('horario_semana', 'cerrado_hasta', 'en_directorio')) = 3
  union all select 3, 'El directorio es público y no entrega coordenadas',
         has_function_privilege('anon', 'directorio_tiendas(numeric,numeric,text,text,text,boolean,int)', 'execute')
         and position('''lat''' in pg_get_functiondef('directorio_tiendas(numeric,numeric,text,text,text,boolean,int)'::regprocedure)) = 0
  union all select 4, 'El horario inválido se rechaza',
         not horario_valido('{"9":[["08:00","12:00"]]}'::jsonb) and not horario_valido('{"1":[["12:00","08:00"]]}'::jsonb)
         and horario_valido('{"1":[["07:00","12:00"],["14:00","20:00"]]}'::jsonb)
  union all select 5, 'La tabla rechaza horarios inválidos (candado puesto)',
         exists (select 1 from pg_constraint where conname = 'negocio_config_horario_semana_check' and conrelid = 'negocio_config'::regclass)
  union all select 6, 'estado_horario responde sin horario guardado',
         estado_horario(null, null) = '{"abierto": null}'::jsonb
) t order by n, chequeo;
