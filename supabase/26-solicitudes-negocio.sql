-- ============================================================
-- Plataforma multi-negocio — 26: registro de negocios nuevos (solicitud + aprobación del equipo)
-- Se corre DESPUÉS del 25. Es aditivo e idempotente: se puede volver a correr.
--
-- Qué agrega
--   · solicitudes_negocio: lo que escribe quien quiere vender en la plataforma (nadie la lee directo: solo funciones)
--   · planes_publicos(): los planes con precio y lo que incluyen, para la página /registro (anónimo)
--   · enviar_solicitud_negocio(): la envía cualquiera; con tope por correo y tope general (contra abuso)
--   · plataforma_admins gana el nivel «administrador» (puede aprobar); «soporte» sigue siendo solo lectura, igual que hoy
--   · soy_administrador_plataforma(), listar/aprobar/rechazar_solicitud_negocio(): solo administradores de la plataforma
--   · _alta_negocio(): el cuerpo de crear_negocio, para que la aprobación y la consola creen la tienda igual
-- Qué NO toca: ningún dato de negocios existentes. crear_negocio sigue siendo solo de consola.
-- ============================================================

-- ---------- 1. Tabla (global de la plataforma, sin negocio_id; cerrada con RLS y sin permisos) ----------
create table if not exists solicitudes_negocio (
  id              uuid primary key default gen_random_uuid(),
  creado_en       timestamptz not null default now(),
  nombre_negocio  text not null check (char_length(nombre_negocio) between 2 and 120),
  tipo            text not null check (tipo in ('tienda', 'ropa', 'repuestos', 'mixto')),
  ciudad          text not null check (char_length(ciudad) between 2 and 60),
  nombre_contacto text not null check (char_length(nombre_contacto) between 3 and 80),
  email           text not null check (email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' and char_length(email) <= 120),
  telefono        text not null check (telefono ~ '^[0-9]{10}$'),
  plan            text not null references planes(clave),
  mensaje         text check (mensaje is null or char_length(mensaje) <= 300),
  acepta_datos_en timestamptz not null,
  estado          text not null default 'pendiente' check (estado in ('pendiente', 'aprobada', 'rechazada')),
  tienda_id       uuid references negocios(id),      -- la tienda que se creó al aprobar (no se llama negocio_id: esta tabla es de la plataforma)
  nota_equipo     text check (nota_equipo is null or char_length(nota_equipo) <= 300),
  resuelto_por    uuid,
  resuelto_en     timestamptz
);
create index if not exists solicitudes_negocio_estado_idx on solicitudes_negocio (estado, creado_en desc);
create index if not exists solicitudes_negocio_email_idx on solicitudes_negocio (lower(email), creado_en desc);
alter table solicitudes_negocio enable row level security;
revoke all on table solicitudes_negocio from public, anon, authenticated;
grant all on table solicitudes_negocio to service_role;

-- ---------- 2. El alta de la tienda vive en _alta_negocio; crear_negocio (consola) y la aprobación la usan ----------
create or replace function _alta_negocio(p_slug text, p_nombre text, p_tipo text, p_email_dueno text, p_plan text)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_id uuid; v_dueno uuid; v_email text := lower(trim(coalesce(p_email_dueno, ''))); v_pendiente boolean := false;
begin
  if p_tipo is null or _plantilla_modulos(p_tipo) is null then
    raise exception 'Tipo de negocio no válido: %', p_tipo;
  end if;
  if not exists (select 1 from planes where clave = p_plan and activo) then
    raise exception 'Plan no válido: %', p_plan;
  end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'Correo no válido: %', p_email_dueno; end if;

  select id into v_dueno from auth.users where lower(email) = v_email;
  if v_dueno is not null and exists (select 1 from plataforma_admins where user_id = v_dueno) then
    raise exception 'Ese usuario es de soporte de la plataforma y no puede ser dueño de un negocio';
  end if;

  insert into negocios (slug, tipo, plan) values (lower(trim(p_slug)), p_tipo, p_plan) returning id into v_id;   -- publicada = false
  insert into negocio_config (negocio_id, nombre_comercial) values (v_id, trim(p_nombre));
  insert into negocio_reglas (negocio_id) values (v_id);
  insert into formas_pago (negocio_id, id, nombre, tipo, orden) values
    (v_id, 'efectivo',      'Efectivo',      'efectivo', 10),
    (v_id, 'transferencia', 'Transferencia', 'digital',  20),
    (v_id, 'nequi',         'Nequi',         'digital',  30),
    (v_id, 'daviplata',     'Daviplata',     'digital',  40),
    (v_id, 'datafono',      'Datáfono',      'datafono', 50),
    (v_id, 'fiado',         'Fiado',         'fiado',    60);
  perform _sincronizar_plan(v_id);

  if v_dueno is not null then
    insert into negocio_miembros (negocio_id, user_id, rol) values (v_id, v_dueno, 'dueno');
  else   -- todavía no entró con Google: queda invitado y lo reclama al entrar (reclamar_invitaciones)
    insert into invitaciones (negocio_id, email, rol) values (v_id, v_email, 'dueno');
    v_pendiente := true;
  end if;

  return jsonb_build_object('id', v_id, 'slug', lower(trim(p_slug)), 'url', '/t/' || lower(trim(p_slug)),
                            'plan', p_plan, 'publicada', false, 'invitacion_pendiente', v_pendiente);
end;
$$;

create or replace function crear_negocio(p_slug text, p_nombre text, p_tipo text, p_email_dueno text, p_plan text default 'vitrina')
returns jsonb
language plpgsql security definer set search_path = public
as $$
begin
  if auth.uid() is not null then
    raise exception 'Los negocios se crean solo desde la consola de la plataforma';
  end if;
  return _alta_negocio(p_slug, p_nombre, p_tipo, p_email_dueno, p_plan);
end;
$$;

-- ---------- 3. Administradores de la plataforma ----------
-- «soporte» (solo lectura) no cambia. «administrador» puede aprobar solicitudes y crear tiendas; sigue sin ser miembro de ningún negocio.
do $$
declare c text;
begin
  for c in select con.conname from pg_constraint con
            where con.conrelid = 'plataforma_admins'::regclass and con.contype = 'c' and pg_get_constraintdef(con.oid) like '%nivel%' loop
    execute format('alter table plataforma_admins drop constraint %I', c);
  end loop;
  alter table plataforma_admins add constraint plataforma_admins_nivel_check check (nivel in ('soporte', 'administrador'));
end $$;

-- El candado de solo lectura vale para el nivel «soporte»; el administrador necesita escribir al aprobar
create or replace function bloquear_soporte() returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if auth.uid() is not null and exists (select 1 from plataforma_admins where user_id = auth.uid() and nivel = 'soporte') then
    raise exception 'Tu cuenta es de soporte de la plataforma: solo puede consultar, no modificar.';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;
create or replace function soy_administrador_plataforma() returns boolean
language sql stable security definer set search_path = public
as $$ select exists (select 1 from plataforma_admins where user_id = auth.uid() and nivel = 'administrador') $$;

-- ---------- 4. Públicas: planes y envío de la solicitud ----------
create or replace function planes_publicos() returns jsonb
language sql stable security definer set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'clave', p.clave, 'nombre', p.nombre, 'descripcion', p.descripcion,
           'precio_mensual', p.precio_mensual, 'precio_fundador', p.precio_fundador, 'meses_fundador', p.meses_fundador,
           'max_productos', p.max_productos,
           'modulos', coalesce((select jsonb_agg(m.nombre order by m.nombre)
                                  from plan_modulos pm join modulos m on m.clave = pm.modulo
                                 where pm.plan = p.clave), '[]'::jsonb)) order by p.orden), '[]'::jsonb)
    from planes p where p.activo
$$;

create or replace function enviar_solicitud_negocio(p_datos jsonb) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_nombre text := regexp_replace(trim(coalesce(p_datos->>'nombre_negocio', '')), '\s+', ' ', 'g');
  v_tipo   text := coalesce(p_datos->>'tipo', '');
  v_ciudad text := regexp_replace(trim(coalesce(p_datos->>'ciudad', '')), '\s+', ' ', 'g');
  v_contacto text := regexp_replace(trim(coalesce(p_datos->>'nombre_contacto', '')), '\s+', ' ', 'g');
  v_email  text := lower(trim(coalesce(p_datos->>'email', '')));
  v_tel    text := regexp_replace(coalesce(p_datos->>'telefono', ''), '\D', '', 'g');
  v_plan   text := coalesce(nullif(trim(p_datos->>'plan'), ''), 'vitrina');
  v_msg    text := nullif(trim(coalesce(p_datos->>'mensaje', '')), '');
  v_acepta boolean := coalesce((p_datos->>'acepta_datos')::boolean, false);
  v_id uuid;
begin
  if length(v_nombre) < 2 or length(v_nombre) > 120 then raise exception 'Escribe el nombre de tu negocio'; end if;
  if v_tipo not in ('tienda', 'ropa', 'repuestos', 'mixto') then raise exception 'Elige qué vendes'; end if;
  if length(v_ciudad) < 2 or length(v_ciudad) > 60 then raise exception 'Escribe la ciudad'; end if;
  if length(v_contacto) < 3 or length(v_contacto) > 80 then raise exception 'Escribe tu nombre completo'; end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or length(v_email) > 120 then raise exception 'Escribe un correo válido'; end if;
  if length(v_tel) = 12 and left(v_tel, 2) = '57' then v_tel := substr(v_tel, 3); end if;
  if length(v_tel) <> 10 then raise exception 'Escribe tu celular (10 dígitos)'; end if;
  if not exists (select 1 from planes where clave = v_plan and activo) then raise exception 'Elige un plan'; end if;
  if v_msg is not null and length(v_msg) > 300 then raise exception 'El mensaje es muy largo (máximo 300 letras)'; end if;
  if not v_acepta then raise exception 'Debes aceptar el tratamiento de tus datos para enviar la solicitud'; end if;

  -- contra abuso: tope por correo y por celular en 24 horas, y tope general de solicitudes sin revisar
  if (select count(*) from solicitudes_negocio where creado_en > now() - interval '24 hours'
         and (lower(email) = v_email or telefono = v_tel)) >= 3 then
    raise exception 'Ya recibimos tus solicitudes. Te escribiremos pronto; no hace falta enviar más.';
  end if;
  if (select count(*) from solicitudes_negocio where estado = 'pendiente') >= 300 then
    raise exception 'Hay muchas solicitudes en espera. Intenta de nuevo en unos días.';
  end if;
  if exists (select 1 from solicitudes_negocio where estado = 'pendiente' and lower(email) = v_email
                and lower(nombre_negocio) = lower(v_nombre)) then
    return jsonb_build_object('ok', true, 'repetida', true);      -- ya está en la fila: no se duplica
  end if;

  insert into solicitudes_negocio (nombre_negocio, tipo, ciudad, nombre_contacto, email, telefono, plan, mensaje, acepta_datos_en)
  values (v_nombre, v_tipo, v_ciudad, v_contacto, v_email, v_tel, v_plan, v_msg, now())
  returning id into v_id;
  return jsonb_build_object('ok', true, 'repetida', false);
end;
$$;

-- ---------- 5. Del equipo: ver, aprobar y rechazar ----------
create or replace function listar_solicitudes_negocio(p_estado text default 'pendiente') returns jsonb
language plpgsql stable security definer set search_path = public
as $$
begin
  if not soy_administrador_plataforma() then raise exception 'Solo un administrador de la plataforma'; end if;
  return coalesce((select jsonb_agg(to_jsonb(x) order by x.creado_en desc) from (
    select s.id, s.creado_en, s.nombre_negocio, s.tipo, s.ciudad, s.nombre_contacto, s.email, s.telefono, s.plan,
           pl.nombre as plan_nombre, s.mensaje, s.estado, s.nota_equipo, s.resuelto_en,
           n.slug as slug_creado,
           trim(both '-' from left(regexp_replace(lower(translate(s.nombre_negocio, 'áéíóúüñÁÉÍÓÚÜÑ', 'aeiouunAEIOUUN')), '[^a-z0-9]+', '-', 'g'), 38)) as slug_sugerido
      from solicitudes_negocio s
      join planes pl on pl.clave = s.plan
      left join negocios n on n.id = s.tienda_id
     where p_estado is null or p_estado = 'todas' or s.estado = p_estado
     order by s.creado_en desc limit 200) x), '[]'::jsonb);
end;
$$;

create or replace function aprobar_solicitud_negocio(p_id uuid, p_slug text, p_plan text default null) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare s solicitudes_negocio%rowtype; r jsonb; v_slug text := lower(trim(coalesce(p_slug, '')));
begin
  if not soy_administrador_plataforma() then raise exception 'Solo un administrador de la plataforma'; end if;
  select * into s from solicitudes_negocio where id = p_id for update;
  if not found then raise exception 'Solicitud no encontrada'; end if;
  if s.estado <> 'pendiente' then raise exception 'Esta solicitud ya fue %', s.estado; end if;
  if v_slug !~ '^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$' then raise exception 'La dirección debe tener letras minúsculas, números o guiones (3 a 40 caracteres)'; end if;
  if exists (select 1 from negocios where slug = v_slug) then raise exception 'La dirección "%" ya está en uso: elige otra', v_slug; end if;

  r := _alta_negocio(v_slug, s.nombre_negocio, s.tipo, s.email, coalesce(nullif(trim(p_plan), ''), s.plan));
  update negocio_config set ciudad = s.ciudad, telefono = s.telefono, whatsapp = '57' || s.telefono, email = s.email
   where negocio_id = (r->>'id')::uuid;
  update solicitudes_negocio set estado = 'aprobada', tienda_id = (r->>'id')::uuid, resuelto_por = auth.uid(), resuelto_en = now()
   where id = p_id;
  return r || jsonb_build_object('telefono', s.telefono, 'nombre_contacto', s.nombre_contacto);
end;
$$;

create or replace function rechazar_solicitud_negocio(p_id uuid, p_nota text default null) returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not soy_administrador_plataforma() then raise exception 'Solo un administrador de la plataforma'; end if;
  update solicitudes_negocio set estado = 'rechazada', nota_equipo = nullif(trim(coalesce(p_nota, '')), ''),
         resuelto_por = auth.uid(), resuelto_en = now()
   where id = p_id and estado = 'pendiente';
  if not found then raise exception 'La solicitud no existe o ya fue resuelta'; end if;
end;
$$;

-- ---------- 6. Permisos (las funciones nuevas nacen abiertas a PUBLIC: se cierran a mano) ----------
revoke all on function _alta_negocio(text, text, text, text, text) from public, anon, authenticated;
revoke all on function soy_administrador_plataforma(), listar_solicitudes_negocio(text), aprobar_solicitud_negocio(uuid, text, text),
                       rechazar_solicitud_negocio(uuid, text) from public, anon;
grant execute on function soy_administrador_plataforma(), listar_solicitudes_negocio(text), aprobar_solicitud_negocio(uuid, text, text),
                          rechazar_solicitud_negocio(uuid, text) to authenticated;
revoke all on function planes_publicos(), enviar_solicitud_negocio(jsonb) from public;
grant execute on function planes_publicos(), enviar_solicitud_negocio(jsonb) to anon, authenticated;
revoke all on function crear_negocio(text, text, text, text, text) from public, anon, authenticated;
grant execute on function crear_negocio(text, text, text, text, text) to service_role;

-- ---------- 7. Tabla global en la lista de verificar_aislamiento y 14 funciones públicas (se parchea la vigente) ----------
do $$
declare v text := pg_get_functiondef('verificar_aislamiento()'::regprocedure);
begin
  if position('enviar_solicitud_negocio' in v) = 0 then
    v := replace(v, '''perfil_cliente'', ''direcciones_cliente'']);', '''perfil_cliente'', ''direcciones_cliente'', ''solicitudes_negocio'']);');
    v := replace(v, '''directorio_tiendas'',''directorio_ciudades'');', '''directorio_tiendas'',''directorio_ciudades'',''planes_publicos'',''enviar_solicitud_negocio'');');
    v := replace(v, 'Anónimo solo ejecuta las 12 funciones públicas', 'Anónimo solo ejecuta las 14 funciones públicas');
    if position('enviar_solicitud_negocio' in v) = 0 or position('solicitudes_negocio'']' in v) = 0 then raise exception 'No se pudo actualizar verificar_aislamiento'; end if;
    execute v;
  end if;
end $$;

notify pgrst, 'reload schema';

-- ---------- VERIFICACIÓN: todas las filas deben decir ok = true ----------
select chequeo, ok from (
  select 1 as n, chequeo, ok from verificar_aislamiento()
  union all select 2, 'Existen la tabla y las 7 funciones nuevas',
         (select count(*) = 1 from information_schema.tables where table_schema = 'public' and table_name = 'solicitudes_negocio')
         and (select count(*) = 7 from pg_proc where pronamespace = 'public'::regnamespace
                and proname in ('planes_publicos', 'enviar_solicitud_negocio', 'soy_administrador_plataforma', 'listar_solicitudes_negocio',
                                'aprobar_solicitud_negocio', 'rechazar_solicitud_negocio', '_alta_negocio'))
  union all select 3, 'La tabla de solicitudes está cerrada (sin permisos para anónimos ni usuarios)',
         not exists (select 1 from information_schema.role_table_grants where table_name = 'solicitudes_negocio' and grantee in ('anon', 'authenticated', 'PUBLIC'))
) t order by n, chequeo;
