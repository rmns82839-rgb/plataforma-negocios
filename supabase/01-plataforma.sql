-- ============================================================
-- Plataforma multi-negocio — 01: tablas de plataforma y funciones base
-- Base NUEVA (proyecto Supabase propio). No tiene relación con la base de Matriz.
-- Correr en el SQL Editor, en orden: 01 a 08 y (opcional) 09.
-- Es seguro correr 01 a 08 sobre una base vacía; no están pensados para re-ejecutarse con datos.
-- ============================================================

-- ---------- Utilidades ----------
create or replace function hoy_colombia() returns date
language sql stable as $$ select (now() at time zone 'America/Bogota')::date $$;

create or replace function lin_srgb(c numeric) returns numeric
language sql immutable as $$
  select case when c <= 0.03928 then c / 12.92 else power((c + 0.055) / 1.055, 2.4) end
$$;

-- Luminancia relativa de un color #RRGGBB (null si el formato no es válido)
create or replace function luminancia_hex(h text) returns numeric
language sql immutable as $$
  select case when h ~ '^#[0-9A-Fa-f]{6}$' then
      0.2126 * lin_srgb(get_byte(decode(substr(h, 2, 2), 'hex'), 0) / 255.0)
    + 0.7152 * lin_srgb(get_byte(decode(substr(h, 4, 2), 'hex'), 0) / 255.0)
    + 0.0722 * lin_srgb(get_byte(decode(substr(h, 6, 2), 'hex'), 0) / 255.0)
  end
$$;

-- Un color sirve para botones con texto blanco si el contraste contra blanco es de 4.5 o más
create or replace function contraste_ok_con_blanco(h text) returns boolean
language sql immutable as $$
  select luminancia_hex(h) is not null and 1.05 / (luminancia_hex(h) + 0.05) >= 4.5
$$;

-- ---------- Tablas de plataforma ----------
create table negocios (
  id              uuid primary key default gen_random_uuid(),
  slug            text not null unique
                  check (slug ~ '^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$'
                         and slug <> all (array['admin','api','app','login','ingreso','pistola','tienda','ropa',
                                                'soporte','plataforma','assets','www','panel','n'])),
  tipo            text not null check (tipo in ('tienda', 'ropa', 'repuestos', 'mixto')),
  estado          text not null default 'activo' check (estado in ('activo', 'suspendido')),
  zona_horaria    text not null default 'America/Bogota',   -- informativa en esta fase
  moneda          text not null default 'COP',               -- informativa en esta fase
  soporte_lectura boolean not null default true,             -- el dueño puede apagar la lectura del soporte
  creado_en       timestamptz not null default now()
);

-- Marca y contacto (lo edita el dueño)
create table negocio_config (
  negocio_id      uuid primary key references negocios(id),
  nombre_comercial text not null check (char_length(nombre_comercial) between 2 and 120),
  eslogan         text check (coalesce(char_length(eslogan), 0) <= 120),
  logo_path       text,
  icono_path      text,
  color_principal  text not null default '#1E3A5F' check (contraste_ok_con_blanco(color_principal)),
  color_secundario text not null default '#B08D57' check (color_secundario ~ '^#[0-9A-Fa-f]{6}$'),
  color_acento     text not null default '#0B6B4A' check (contraste_ok_con_blanco(color_acento)),
  nit             text check (coalesce(length(nit), 0) <= 40),
  razon_social    text check (coalesce(length(razon_social), 0) <= 120),
  direccion       text check (coalesce(length(direccion), 0) <= 200),
  ciudad          text check (coalesce(length(ciudad), 0) <= 80),
  telefono        text check (coalesce(length(telefono), 0) <= 60),
  email           text check (coalesce(length(email), 0) <= 120),
  web             text check (coalesce(length(web), 0) <= 120),
  titulo_factura  text not null default 'Comprobante de venta' check (length(titulo_factura) <= 40),
  nota_pie        text check (coalesce(length(nota_pie), 0) <= 250),
  ver_logo        boolean not null default false,
  whatsapp        text check (coalesce(length(whatsapp), 0) <= 30),
  instagram       text check (coalesce(length(instagram), 0) <= 120),
  facebook        text check (coalesce(length(facebook), 0) <= 120),
  tiktok          text check (coalesce(length(tiktok), 0) <= 120),
  horario         text check (coalesce(length(horario), 0) <= 200),
  maps_url        text check (coalesce(length(maps_url), 0) <= 300),
  correo_datos    text check (coalesce(length(correo_datos), 0) <= 120),
  actualizado_en  timestamptz not null default now(),
  -- las imágenes de marca solo pueden estar en la carpeta del propio negocio
  constraint negocio_config_logo_check  check (logo_path  is null or logo_path  like negocio_id::text || '/marca/%'),
  constraint negocio_config_icono_check check (icono_path is null or icono_path like negocio_id::text || '/marca/%')
);

-- Reglas de cobro, domicilio, mora y márgenes (lo edita el dueño)
create table negocio_reglas (
  negocio_id            uuid primary key references negocios(id),
  prefijo_factura       text not null default '' check (prefijo_factura ~ '^[A-Za-z0-9-]{0,10}$'),
  comision_datafono     numeric not null default 0 check (comision_datafono between 0 and 20),
  margen_minimo         numeric not null default 0 check (margen_minimo between 0 and 100),
  mora_mensual          numeric not null default 0 check (mora_mensual between 0 and 20),
  descuento_mayorista   numeric not null default 0 check (descuento_mayorista between 0 and 90),
  bloquear_credito_mora boolean not null default true,
  domicilio_costo       numeric check (domicilio_costo is null or domicilio_costo >= 0),
  envio_gratis_desde    numeric check (envio_gratis_desde is null or envio_gratis_desde >= 0),
  zona_domicilio        text check (coalesce(length(zona_domicilio), 0) <= 160),
  formas_pago_tienda    text check (coalesce(length(formas_pago_tienda), 0) <= 160),
  domicilio_costo_ropa  numeric check (domicilio_costo_ropa is null or domicilio_costo_ropa >= 0),
  envio_gratis_desde_ropa numeric check (envio_gratis_desde_ropa is null or envio_gratis_desde_ropa >= 0),
  actualizado_en        timestamptz not null default now()
);

create table modulos (
  clave      text primary key check (clave ~ '^[a-z_]{2,30}$'),
  nombre     text not null,
  depende_de text[] not null default '{}'
);
insert into modulos (clave, nombre, depende_de) values
  ('caja',             'Caja y ventas',                          '{}'),
  ('productos',        'Productos e inventario',                 '{}'),
  ('ropa',             'Ropa: prendas y tallas',                 '{}'),
  ('fiados',           'Fiados y mora',                          '{caja}'),
  ('compras',          'Compras y gastos',                       '{productos}'),
  ('reportes',         'Reportes y tablero',                     '{caja}'),
  ('domicilios',       'Domicilios',                             '{caja}'),
  ('catalogo_publico', 'Catálogo público',                       '{}'),
  ('pedidos_en_linea', 'Pedidos en línea',                       '{catalogo_publico}'),
  ('publicidad',       'Anuncios, ofertas y promociones',        '{}'),
  ('escaner',          'Escáner por celular',                    '{productos}'),
  ('prestamos',        'Préstamos con interés',                  '{}'),
  ('repuestos',        'Repuestos: referencias, compatibilidad', '{productos}');

create table negocio_modulos (
  negocio_id uuid not null references negocios(id),
  modulo     text not null references modulos(clave),
  activo     boolean not null default true,
  primary key (negocio_id, modulo)
);

create table negocio_miembros (
  negocio_id uuid not null references negocios(id),
  user_id    uuid not null,
  rol        text not null check (rol in ('dueno', 'cajero')),
  nombre     text,
  activo     boolean not null default true,
  creado_en  timestamptz not null default now(),
  primary key (negocio_id, user_id)
);
create index negocio_miembros_user_idx on negocio_miembros (user_id);

-- Tu rol de plataforma (soporte de solo lectura). Se llena solo desde la consola SQL.
create table plataforma_admins (
  user_id   uuid primary key,
  nivel     text not null default 'soporte' check (nivel in ('soporte')),
  creado_en timestamptz not null default now()
);

-- Consecutivos por negocio y por tipo
create table negocio_contadores (
  negocio_id uuid not null references negocios(id),
  tipo       text not null check (tipo in ('venta', 'pedido_ropa', 'pedido_tienda')),
  ultimo     bigint not null default 0,
  primary key (negocio_id, tipo)
);

-- ---------- Quién es quién ----------
-- Verificación en dos pasos: igual que en Matriz, es por usuario
create or replace function mfa_ok() returns boolean
language plpgsql stable security definer set search_path = public
as $$
begin
  if coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2' then return true; end if;
  return not exists (select 1 from auth.mfa_factors where user_id = auth.uid() and status = 'verified');
end;
$$;

-- Negocios donde el usuario es dueño o cajero (activo, negocio activo y sesión válida)
create or replace function mis_negocios_personal() returns setof uuid
language sql stable security definer set search_path = public
as $$
  select m.negocio_id
    from negocio_miembros m join negocios n on n.id = m.negocio_id
   where m.user_id = auth.uid() and m.activo and n.estado = 'activo' and mfa_ok()
$$;

create or replace function mis_negocios_dueno() returns setof uuid
language sql stable security definer set search_path = public
as $$
  select m.negocio_id
    from negocio_miembros m join negocios n on n.id = m.negocio_id
   where m.user_id = auth.uid() and m.activo and m.rol = 'dueno' and n.estado = 'activo' and mfa_ok()
$$;

-- Negocios que el soporte de plataforma puede LEER (solo si el dueño no apagó soporte_lectura)
create or replace function negocios_soporte() returns setof uuid
language sql stable security definer set search_path = public
as $$
  select n.id from negocios n
   where n.estado = 'activo' and n.soporte_lectura and mfa_ok()
     and exists (select 1 from plataforma_admins a where a.user_id = auth.uid())
$$;

create or replace function es_personal(p_negocio_id uuid) returns boolean
language sql stable security definer set search_path = public
as $$ select p_negocio_id in (select mis_negocios_personal()) $$;

create or replace function es_dueno(p_negocio_id uuid) returns boolean
language sql stable security definer set search_path = public
as $$ select p_negocio_id in (select mis_negocios_dueno()) $$;

create or replace function es_soporte(p_negocio_id uuid) returns boolean
language sql stable security definer set search_path = public
as $$ select p_negocio_id in (select negocios_soporte()) and not (p_negocio_id in (select mis_negocios_personal())) $$;

-- Una sola función para la interfaz: 'dueno' | 'cajero' | 'soporte' | null
create or replace function mi_rol(p_negocio_id uuid) returns text
language sql stable security definer set search_path = public
as $$
  select coalesce(
    (select m.rol from negocio_miembros m join negocios n on n.id = m.negocio_id
      where m.negocio_id = p_negocio_id and m.user_id = auth.uid() and m.activo
        and n.estado = 'activo' and mfa_ok()),
    case when p_negocio_id in (select negocios_soporte()) then 'soporte' end)
$$;

-- ¿El módulo está encendido en este negocio?
create or replace function modulo_activo(p_negocio_id uuid, p_modulo text) returns boolean
language sql stable security definer set search_path = public
as $$ select exists (select 1 from negocio_modulos where negocio_id = p_negocio_id and modulo = p_modulo and activo) $$;

create or replace function exigir_modulo(p_negocio_id uuid, p_modulo text) returns void
language plpgsql stable security definer set search_path = public
as $$
begin
  if not modulo_activo(p_negocio_id, p_modulo) then
    raise exception 'El módulo "%" no está activo en este negocio', p_modulo;
  end if;
end;
$$;

-- ---------- Funciones de trigger ----------
-- Candado de solo lectura para cuentas de soporte de plataforma
create or replace function bloquear_soporte() returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if auth.uid() is not null and exists (select 1 from plataforma_admins where user_id = auth.uid()) then
    raise exception 'Tu cuenta es de soporte de la plataforma: solo puede consultar, no modificar.';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

-- negocio_id no se puede cambiar nunca (no se "mueve" una fila a otro negocio)
create or replace function negocio_id_inmutable() returns trigger
language plpgsql as $$
begin
  if new.negocio_id is distinct from old.negocio_id then
    raise exception 'No se puede cambiar el negocio de un registro';
  end if;
  return new;
end;
$$;

-- Una cuenta de soporte de plataforma no puede ser miembro de un negocio
create or replace function miembro_no_es_soporte() returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if exists (select 1 from plataforma_admins where user_id = new.user_id) then
    raise exception 'Ese usuario es de soporte de la plataforma y no puede ser miembro de un negocio';
  end if;
  return new;
end;
$$;

-- Siempre queda al menos un dueño activo
create or replace function ultimo_dueno() returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if old.rol = 'dueno' and old.activo
     and (tg_op = 'DELETE' or new.rol <> 'dueno' or not new.activo)
     and not exists (select 1 from negocio_miembros
                      where negocio_id = old.negocio_id and rol = 'dueno' and activo and user_id <> old.user_id) then
    raise exception 'Debe quedar al menos un dueño';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

-- Consecutivos por negocio: se asignan dentro de la misma transacción con bloqueo de fila
create or replace function siguiente_numero(p_negocio_id uuid, p_tipo text) returns bigint
language plpgsql security definer set search_path = public
as $$
declare v bigint;
begin
  insert into negocio_contadores as c (negocio_id, tipo, ultimo) values (p_negocio_id, p_tipo, 1)
  on conflict (negocio_id, tipo) do update set ultimo = c.ultimo + 1
  returning c.ultimo into v;
  return v;
end;
$$;

create or replace function asignar_numero() returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if new.numero is null then new.numero := siguiente_numero(new.negocio_id, tg_argv[0]); end if;
  return new;
end;
$$;

-- Auditoría: ahora cada evento queda ligado a su negocio
create or replace function auditar() returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_claims jsonb := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
  j_old jsonb; j_new jsonb; d_old jsonb := '{}'; d_new jsonb := '{}'; k text; v_id text; v_neg uuid;
begin
  if tg_op = 'INSERT' then
    j_new := to_jsonb(new);
    v_id  := coalesce(j_new->>'id', j_new->>'user_id');
    v_neg := coalesce(j_new->>'negocio_id', case when tg_table_name = 'negocios' then j_new->>'id' end)::uuid;
  elsif tg_op = 'DELETE' then
    j_old := to_jsonb(old);
    v_id  := coalesce(j_old->>'id', j_old->>'user_id');
    v_neg := coalesce(j_old->>'negocio_id', case when tg_table_name = 'negocios' then j_old->>'id' end)::uuid;
  else
    j_old := to_jsonb(old); j_new := to_jsonb(new);
    v_id  := coalesce(j_new->>'id', j_new->>'user_id');
    v_neg := coalesce(j_new->>'negocio_id', case when tg_table_name = 'negocios' then j_new->>'id' end)::uuid;
    for k in select key from jsonb_each(j_new) loop           -- solo lo que cambió
      if j_new->k is distinct from j_old->k then
        d_old := d_old || jsonb_build_object(k, j_old->k);
        d_new := d_new || jsonb_build_object(k, j_new->k);
      end if;
    end loop;
    j_old := d_old; j_new := d_new;
  end if;
  if v_neg is null then return null; end if;
  insert into auditoria (negocio_id, usuario, correo, tabla, accion, registro, antes, despues)
  values (v_neg, auth.uid(), v_claims->>'email', tg_table_name, tg_op, v_id, j_old, j_new);
  return null;
end;
$$;

-- Cupo y plazo de crédito: solo el dueño del negocio los puede cambiar
create or replace function proteger_credito() returns trigger
language plpgsql security invoker
as $$
begin
  if auth.uid() is null then return new; end if;   -- consola SQL / servicio
  if tg_op = 'INSERT' then
    if (new.cupo_credito <> 0 or new.dias_credito <> 0) and not es_dueno(new.negocio_id) then
      raise exception 'Solo el dueño puede definir el cupo y el plazo de crédito';
    end if;
  elsif (new.cupo_credito is distinct from old.cupo_credito
         or new.dias_credito is distinct from old.dias_credito) and not es_dueno(new.negocio_id) then
    raise exception 'Solo el dueño puede cambiar el cupo y el plazo de crédito';
  end if;
  return new;
end;
$$;

-- Quitar un producto del inventario (activo = false) es solo del dueño
create or replace function solo_dueno_quita_producto() returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if old.activo is true and new.activo is not true and not es_dueno(new.negocio_id) then
    raise exception 'Solo el dueño puede quitar productos del inventario';
  end if;
  return new;
end;
$$;
