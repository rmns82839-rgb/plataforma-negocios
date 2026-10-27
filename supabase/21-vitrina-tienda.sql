-- ============================================================
-- Plataforma multi-negocio — 21: vitrina de la tienda (grupo A de Cibus)
--   · Opiniones de clientes con estrellas (el dueño aprueba antes de publicar)   módulo: opiniones
--   · Menú del día                                                                módulo: menu_del_dia
--   · Música de fondo (bucket aparte, solo audio)                                  módulo: musica_fondo
--   · Estado del pedido para quien no tiene cuenta (número + celular)             módulo: pedidos_en_linea
--   · Producto favorito de cada cliente (solo dueño)
--   · extras_tienda(slug): una sola llamada pública con menú, música y opiniones
--   · verificar_aislamiento() actualizada (anónimo ahora ejecuta 10 funciones públicas)
-- Solo AGREGA. No cambia ni borra datos. Se puede ejecutar más de una vez.
-- ============================================================

-- =====================================================================
-- 1. Opiniones
-- =====================================================================
create table if not exists opiniones (
  id          uuid not null default gen_random_uuid(),
  negocio_id  uuid not null references negocios(id),
  user_id     uuid not null references auth.users(id) on delete cascade,
  nombre      text not null check (char_length(nombre) between 1 and 40),
  estrellas   smallint not null check (estrellas between 1 and 5),
  texto       text check (texto is null or char_length(texto) <= 300),
  estado      text not null default 'pendiente' check (estado in ('pendiente', 'publicado', 'oculto')),
  respuesta   text check (respuesta is null or char_length(respuesta) <= 300),
  creado_en   timestamptz not null default now(),
  moderado_en timestamptz,
  primary key (negocio_id, id)
);
create index if not exists opiniones_estado_idx on opiniones (negocio_id, estado, creado_en desc);
create index if not exists opiniones_user_idx   on opiniones (user_id, creado_en desc);

select _aplicar_politicas('opiniones', 'p', null, null, null);   -- el personal las lee; todo lo demás es con funciones
select _triggers_tabla('opiniones');

-- El cliente (con Google) deja su opinión. Queda pendiente hasta que el dueño la apruebe.
create or replace function publicar_opinion(p_slug text, p_estrellas int, p_texto text, p_acepta boolean)
returns jsonb
language plpgsql security definer set search_path = public, auth
as $$
declare
  v_uid uuid := auth.uid();
  v_neg uuid;
  v_meta jsonb; v_n text; v_partes text[]; v_nombre text; v_texto text;
begin
  if v_uid is null then raise exception 'Entra con Google para dejar tu opinión'; end if;
  v_neg := _negocio_publico_id(p_slug, 'catalogo_publico');
  perform exigir_modulo(v_neg, 'opiniones');
  if p_acepta is not true then raise exception 'Debes aceptar que se publique tu nombre y tu opinión'; end if;
  if p_estrellas is null or p_estrellas not between 1 and 5 then raise exception 'Elige de 1 a 5 estrellas'; end if;
  v_texto := nullif(left(trim(regexp_replace(coalesce(p_texto, ''), '[\x00-\x08\x0b\x0c\x0e-\x1f]', '', 'g')), 300), '');
  if (select count(*) from opiniones where negocio_id = v_neg and user_id = v_uid and creado_en > now() - interval '1 day') >= 2 then
    raise exception 'Ya enviaste opiniones hoy. Puedes volver a escribir mañana';
  end if;
  if (select count(*) from opiniones where negocio_id = v_neg and user_id = v_uid and estado = 'pendiente') >= 3 then
    raise exception 'Tus opiniones anteriores todavía están en revisión';
  end if;
  select raw_user_meta_data into v_meta from auth.users where id = v_uid;
  v_n := nullif(trim(coalesce(v_meta->>'full_name', v_meta->>'name', '')), '');
  if v_n is null then
    v_nombre := 'Cliente';
  else
    v_partes := regexp_split_to_array(v_n, '\s+');
    v_nombre := initcap(left(v_partes[1], 20));
    if array_length(v_partes, 1) > 1 then
      v_nombre := v_nombre || ' ' || upper(left(v_partes[array_length(v_partes, 1)], 1)) || '.';
    end if;
  end if;
  insert into opiniones (negocio_id, user_id, nombre, estrellas, texto) values (v_neg, v_uid, v_nombre, p_estrellas, v_texto);
  return jsonb_build_object('ok', true, 'estado', 'pendiente');
end;
$$;

-- El cliente borra sus propias opiniones (de una tienda, o de todas si no dice cuál)
create or replace function borrar_mis_opiniones(p_slug text default null)
returns int
language plpgsql security definer set search_path = public
as $$
declare n int;
begin
  if auth.uid() is null then raise exception 'Entra con Google'; end if;
  delete from opiniones o
   where o.user_id = auth.uid()
     and (p_slug is null or o.negocio_id = (select id from negocios where slug = lower(p_slug)));
  get diagnostics n = row_count;
  return n;
end;
$$;

-- El personal (y el soporte, solo lectura) ve todas las opiniones de su tienda; las pendientes primero
create or replace function listar_opiniones_admin(p_negocio_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
begin
  if not (es_personal(p_negocio_id) or es_soporte(p_negocio_id)) then raise exception 'Sin acceso'; end if;
  return coalesce((select jsonb_agg(to_jsonb(c) - 'user_id' - 'negocio_id')
    from (select * from opiniones where negocio_id = p_negocio_id
           order by (estado = 'pendiente') desc, creado_en desc limit 300) c), '[]'::jsonb);
end;
$$;

-- Solo el dueño aprueba, oculta y responde
create or replace function moderar_opinion(p_negocio_id uuid, p_id uuid, p_estado text, p_respuesta text default null)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not es_dueno(p_negocio_id) then raise exception 'Solo el dueño puede revisar opiniones'; end if;
  perform exigir_modulo(p_negocio_id, 'opiniones');
  if p_estado not in ('pendiente', 'publicado', 'oculto') then raise exception 'Estado no válido'; end if;
  update opiniones
     set estado = p_estado, respuesta = nullif(left(trim(coalesce(p_respuesta, '')), 300), ''), moderado_en = now()
   where negocio_id = p_negocio_id and id = p_id;
  if not found then raise exception 'No existe esa opinión'; end if;
end;
$$;

-- =====================================================================
-- 2. Menú del día (una fila por negocio)
-- =====================================================================
create table if not exists menu_hoy (
  negocio_id   uuid primary key references negocios(id),
  menu_id      text,
  nombre       text not null check (char_length(nombre) between 1 and 120),
  descripcion  text check (descripcion is null or char_length(descripcion) <= 400),
  foto         text check (foto is null or foto like negocio_id::text || '/anuncios/%'),
  emoji        text check (emoji is null or char_length(emoji) <= 8),
  tipo         text check (tipo is null or char_length(tipo) <= 30),
  ingredientes jsonb not null default '[]'::jsonb
               check (jsonb_typeof(ingredientes) = 'array' and jsonb_array_length(ingredientes) <= 20),
  fecha        date not null,
  actualizado_en timestamptz not null default now()
);
select _aplicar_politicas('menu_hoy', 'p', null, null, null);
select _triggers_tabla('menu_hoy');

create or replace function fijar_menu_hoy(p_negocio_id uuid, p_menu_id text, p_nombre text, p_descripcion text, p_foto text,
                                          p_emoji text, p_tipo text, p_ingredientes jsonb, p_manana boolean default false)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not es_dueno(p_negocio_id) then raise exception 'Solo el dueño puede elegir el menú del día'; end if;
  perform exigir_modulo(p_negocio_id, 'menu_del_dia');
  if coalesce(trim(p_nombre), '') = '' then raise exception 'El menú necesita un nombre'; end if;
  insert into menu_hoy as m (negocio_id, menu_id, nombre, descripcion, foto, emoji, tipo, ingredientes, fecha, actualizado_en)
  values (p_negocio_id, p_menu_id, left(trim(p_nombre), 120), nullif(left(trim(coalesce(p_descripcion, '')), 400), ''),
          nullif(p_foto, ''), p_emoji, p_tipo, coalesce(p_ingredientes, '[]'::jsonb),
          hoy_colombia() + case when p_manana then 1 else 0 end, now())
  on conflict (negocio_id) do update set menu_id = excluded.menu_id, nombre = excluded.nombre, descripcion = excluded.descripcion,
    foto = excluded.foto, emoji = excluded.emoji, tipo = excluded.tipo, ingredientes = excluded.ingredientes,
    fecha = excluded.fecha, actualizado_en = now();
end;
$$;

create or replace function quitar_menu_hoy(p_negocio_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not es_dueno(p_negocio_id) then raise exception 'Solo el dueño puede quitar el menú del día'; end if;
  delete from menu_hoy where negocio_id = p_negocio_id;
end;
$$;

-- =====================================================================
-- 3. Música de fondo (bucket aparte: solo audio, máximo 4 MB; ruta = {negocio_id}/archivo)
-- =====================================================================
create table if not exists musica_fondo (
  negocio_id uuid primary key references negocios(id),
  ruta       text not null check (char_length(ruta) <= 300 and negocio_de_ruta(ruta) = negocio_id),
  nombre     text not null check (char_length(nombre) between 1 and 80),
  actualizado_en timestamptz not null default now()
);
select _aplicar_politicas('musica_fondo', 'p', null, null, null);
select _triggers_tabla('musica_fondo');

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('musica-negocios', 'musica-negocios', true, 4194304, array['audio/mpeg', 'audio/mp4', 'audio/aac', 'audio/ogg', 'audio/webm'])
on conflict (id) do update set public = true, file_size_limit = 4194304,
  allowed_mime_types = array['audio/mpeg', 'audio/mp4', 'audio/aac', 'audio/ogg', 'audio/webm'];

drop policy if exists musica_leer    on storage.objects;
drop policy if exists musica_subir   on storage.objects;
drop policy if exists musica_cambiar on storage.objects;
drop policy if exists musica_borrar  on storage.objects;
create policy musica_leer on storage.objects for select to authenticated
  using (bucket_id = 'musica-negocios'
         and (negocio_de_ruta(name) in (select mis_negocios_personal()) or negocio_de_ruta(name) in (select negocios_soporte())));
create policy musica_subir on storage.objects for insert to authenticated
  with check (bucket_id = 'musica-negocios' and negocio_de_ruta(name) in (select mis_negocios_dueno()));
create policy musica_cambiar on storage.objects for update to authenticated
  using (bucket_id = 'musica-negocios' and negocio_de_ruta(name) in (select mis_negocios_dueno()))
  with check (bucket_id = 'musica-negocios' and negocio_de_ruta(name) in (select mis_negocios_dueno()));
create policy musica_borrar on storage.objects for delete to authenticated
  using (bucket_id = 'musica-negocios' and negocio_de_ruta(name) in (select mis_negocios_dueno()));

create or replace function fijar_musica_fondo(p_negocio_id uuid, p_ruta text, p_nombre text)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not es_dueno(p_negocio_id) then raise exception 'Solo el dueño puede cambiar la música'; end if;
  perform exigir_modulo(p_negocio_id, 'musica_fondo');
  insert into musica_fondo (negocio_id, ruta, nombre, actualizado_en) values (p_negocio_id, p_ruta, left(trim(p_nombre), 80), now())
  on conflict (negocio_id) do update set ruta = excluded.ruta, nombre = excluded.nombre, actualizado_en = now();
end;
$$;

create or replace function quitar_musica_fondo(p_negocio_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not es_dueno(p_negocio_id) then raise exception 'Solo el dueño puede quitar la música'; end if;
  delete from musica_fondo where negocio_id = p_negocio_id;
end;
$$;

-- =====================================================================
-- 4. Estado del pedido para quien no tiene cuenta: tienda + número + celular
--    Solo devuelve el estado; nunca nombre, dirección ni teléfono.
-- =====================================================================
create or replace function estado_pedido(p_slug text, p_numero bigint, p_telefono text)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare v_neg uuid; v_tel text := regexp_replace(coalesce(p_telefono, ''), '\D', '', 'g'); r jsonb;
begin
  if length(v_tel) < 10 then return null; end if;
  select n.id into v_neg from negocios n
   where n.slug = lower(coalesce(p_slug, '')) and n.estado = 'activo' and n.publicada
     and modulo_activo(n.id, 'pedidos_en_linea');
  if v_neg is null then return null; end if;
  select jsonb_build_object('numero', p.numero, 'creado_en', p.creado_en, 'estado', p.estado, 'seguimiento', p.seguimiento,
                            'entrega', p.entrega, 'total', p.total, 'tarifa_respaldo', p.domicilio_tarifa_fija)
    into r
    from pedidos_tienda p
   where p.negocio_id = v_neg and p.numero = p_numero and not p.es_practica
     and right(regexp_replace(coalesce(p.telefono, ''), '\D', '', 'g'), 10) = right(v_tel, 10)
   limit 1;
  return r;
end;
$$;

-- =====================================================================
-- 5. Producto que más compra cada cliente (solo dueño)
-- =====================================================================
create or replace function listar_producto_favorito(p_negocio_id uuid)
returns table (cliente_id uuid, producto text, veces numeric)
language plpgsql stable security definer set search_path = public
as $$
begin
  if not es_dueno(p_negocio_id) then raise exception 'Solo el dueño'; end if;
  return query
  select distinct on (x.cliente_id) x.cliente_id, x.nombre, x.veces
    from (select v.cliente_id, i.nombre, count(*)::numeric as veces
            from ventas v join venta_items i on i.negocio_id = v.negocio_id and i.venta_id = v.id
           where v.negocio_id = p_negocio_id and v.cliente_id is not null and not v.anulada
           group by v.cliente_id, i.nombre) x
   order by x.cliente_id, x.veces desc, x.nombre;
end;
$$;

-- =====================================================================
-- 6. Todo lo "extra" de la vitrina en una sola llamada pública
-- =====================================================================
create or replace function extras_tienda(p_slug text)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare v_id uuid := _negocio_publico_id(p_slug, 'catalogo_publico');
begin
  return jsonb_build_object(
    'menu_hoy', case when modulo_activo(v_id, 'menu_del_dia') then
        (select jsonb_build_object('menu_id', m.menu_id, 'nombre', m.nombre, 'descripcion', m.descripcion, 'foto', m.foto,
                                   'emoji', m.emoji, 'tipo', m.tipo, 'ingredientes', m.ingredientes)
           from menu_hoy m where m.negocio_id = v_id and m.fecha = hoy_colombia()) end,
    'musica', case when modulo_activo(v_id, 'musica_fondo') then
        (select jsonb_build_object('ruta', f.ruta, 'nombre', f.nombre) from musica_fondo f where f.negocio_id = v_id) end,
    'opiniones', case when modulo_activo(v_id, 'opiniones') then
        jsonb_build_object(
          'promedio', coalesce((select round(avg(estrellas)::numeric, 1) from opiniones where negocio_id = v_id and estado = 'publicado'), 0),
          'total', (select count(*)::int from opiniones where negocio_id = v_id and estado = 'publicado'),
          'lista', coalesce((select jsonb_agg(to_jsonb(o) order by o.creado_en desc) from (
                     select id, nombre, estrellas, texto, respuesta, creado_en from opiniones
                      where negocio_id = v_id and estado = 'publicado' order by creado_en desc limit 30) o), '[]'::jsonb)) end
  );
end;
$$;

-- =====================================================================
-- 7. Permisos (las funciones nuevas nacen abiertas a PUBLIC: se cierran a mano)
-- =====================================================================
revoke all on table opiniones, menu_hoy, musica_fondo from public, anon, authenticated;
grant select on opiniones, menu_hoy, musica_fondo to authenticated;      -- el RLS decide quién y en qué tienda
grant all on all tables in schema public to service_role;

revoke all on function publicar_opinion(text, int, text, boolean), borrar_mis_opiniones(text),
                       listar_opiniones_admin(uuid), moderar_opinion(uuid, uuid, text, text),
                       fijar_menu_hoy(uuid, text, text, text, text, text, text, jsonb, boolean), quitar_menu_hoy(uuid),
                       fijar_musica_fondo(uuid, text, text), quitar_musica_fondo(uuid),
                       estado_pedido(text, bigint, text), listar_producto_favorito(uuid), extras_tienda(text)
  from public, anon, authenticated;
grant execute on function publicar_opinion(text, int, text, boolean), borrar_mis_opiniones(text),
                          listar_opiniones_admin(uuid), moderar_opinion(uuid, uuid, text, text),
                          fijar_menu_hoy(uuid, text, text, text, text, text, text, jsonb, boolean), quitar_menu_hoy(uuid),
                          fijar_musica_fondo(uuid, text, text), quitar_musica_fondo(uuid), listar_producto_favorito(uuid)
  to authenticated;
grant execute on function estado_pedido(text, bigint, text), extras_tienda(text) to anon, authenticated;

-- =====================================================================
-- 8. Auditoría de lo que el dueño cambia
-- =====================================================================
do $$
declare r record;
begin
  for r in select * from (values ('menu_hoy','update'), ('menu_hoy','delete'), ('musica_fondo','update'), ('musica_fondo','delete'),
                                 ('opiniones','update'), ('opiniones','delete')) as x(tabla, op) loop
    execute format('drop trigger if exists %I on %I', 'aud_' || r.tabla || '_' || r.op, r.tabla);
    execute format('create trigger %I after %s on %I for each row execute function auditar()', 'aud_' || r.tabla || '_' || r.op, r.op, r.tabla);
  end loop;
end $$;

-- =====================================================================
-- 9. verificar_aislamiento(): anónimo ahora ejecuta 10 funciones públicas (se parchea la vigente, sin reescribirla)
-- =====================================================================
do $$
declare v text := pg_get_functiondef('verificar_aislamiento()'::regprocedure);
begin
  if position('extras_tienda' in v) = 0 then
    v := replace(v, '''hoy_colombia'');', '''hoy_colombia'',''estado_pedido'',''extras_tienda'');');
    v := replace(v, 'Anónimo solo ejecuta las 8 funciones públicas', 'Anónimo solo ejecuta las 10 funciones públicas');
    v := replace(v, '''perfil_cliente'']', '''perfil_cliente'', ''direcciones_cliente'']');
    if position('extras_tienda' in v) = 0 then raise exception 'No se pudo actualizar verificar_aislamiento'; end if;
    execute v;
  end if;
end $$;

notify pgrst, 'reload schema';

-- ---------- VERIFICACIÓN: las 15 filas deben decir ok = true ----------
select chequeo, ok from (
  select 1 as n, chequeo, ok from verificar_aislamiento()
  union all select 2, 'Existen las tablas opiniones, menu_hoy y musica_fondo con RLS',
         (select count(*) from pg_class where relnamespace = 'public'::regnamespace and relname in ('opiniones', 'menu_hoy', 'musica_fondo') and relrowsecurity) = 3
  union all select 3, 'Existe el bucket musica-negocios', exists (select 1 from storage.buckets where id = 'musica-negocios')
  union all select 4, 'Anónimo ejecuta extras_tienda y estado_pedido',
         has_function_privilege('anon', 'extras_tienda(text)', 'execute') and has_function_privilege('anon', 'estado_pedido(text,bigint,text)', 'execute')
  union all select 5, 'Anónimo NO publica opiniones ni fija el menú',
         not has_function_privilege('anon', 'publicar_opinion(text,int,text,boolean)', 'execute')
         and not has_function_privilege('anon', 'fijar_menu_hoy(uuid,text,text,text,text,text,text,jsonb,boolean)', 'execute')
) t order by n, chequeo;
