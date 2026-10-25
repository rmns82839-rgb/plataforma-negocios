-- ============================================================
-- Plataforma multi-negocio — 11: catálogo, clientes, seguimiento, marca y servicios   (etapa C1, parte 2)
-- Se corre DESPUÉS de 10-planes-modulos.sql. Aditivo e idempotente: se puede volver a correr.
--
-- Qué agrega
--   · Productos: stock opcional (controla_stock / disponible) y categorías con imagen
--   · Pedidos: seguimiento aparte del estado, km_informado, domiciliario_id (sin llave todavía), es_practica,
--              cliente_user_id (pedido de invitado = null · pedido con Google = el usuario)
--   · Cliente con Google: perfil_cliente (una sola cuenta para todas las tiendas, con consentimiento) y mis_pedidos()
--   · Domicilio por km: columnas en negocio_reglas y _costo_domicilio_km (el cálculo con mapa llega en C3)
--   · Publicación: las tiendas nuevas nacen sin publicar; el personal y el soporte las ven en vista previa
--   · Marca: logo automático (inicial sobre el color), creador de logo, solicitudes de servicio (logo, carga de catálogo, fotos)
--   · Proveedores, contadores diarios de eventos, vigilancia ampliada en verificar_aislamiento()
-- Qué NO toca: ventas, fiados, préstamos, compras (solo se les suma proveedor_id).
-- ============================================================

-- =====================================================================
-- 1. Productos: stock opcional
-- =====================================================================
do $$
begin
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'productos' and column_name = 'controla_stock') then
    alter table productos add column controla_stock boolean;
    update productos set controla_stock = true;               -- lo que ya existe sigue controlando stock
    alter table productos alter column controla_stock set not null;
  end if;
end $$;
alter table productos add column if not exists disponible boolean not null default true;   -- se usa cuando NO se controla el stock

-- Un producto nuevo controla stock solo si la tienda tiene caja; una vitrina (sin caja) usa disponible / agotado
create or replace function productos_stock_por_defecto() returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if new.controla_stock is null then new.controla_stock := modulo_activo(new.negocio_id, 'caja'); end if;
  return new;
end;
$$;
drop trigger if exists aac_stock_por_defecto on productos;
create trigger aac_stock_por_defecto before insert on productos
  for each row execute function productos_stock_por_defecto();

-- =====================================================================
-- 2. Categorías con imagen y proveedores
-- =====================================================================
create table if not exists categorias (
  id         uuid not null default gen_random_uuid(),
  negocio_id uuid not null references negocios(id),
  nombre     text not null check (char_length(nombre) between 1 and 60),
  imagen     text,
  orden      integer not null default 0,
  activa     boolean not null default true,
  creado_en  timestamptz not null default now(),
  primary key (negocio_id, id),
  unique (negocio_id, nombre),
  constraint categorias_imagen_check check (imagen is null or imagen like negocio_id::text || '/categorias/%')
);

create table if not exists proveedores (
  id         uuid not null default gen_random_uuid(),
  negocio_id uuid not null references negocios(id),
  nombre     text not null check (char_length(nombre) between 2 and 120),
  telefono   text check (coalesce(char_length(telefono), 0) <= 40),
  nit        text check (coalesce(char_length(nit), 0) <= 40),
  direccion  text check (coalesce(char_length(direccion), 0) <= 160),
  nota       text check (coalesce(char_length(nota), 0) <= 300),
  activo     boolean not null default true,
  creado_en  timestamptz not null default now(),
  primary key (negocio_id, id)
);
create unique index if not exists proveedores_nombre_uni on proveedores (negocio_id, lower(nombre));

alter table compras add column if not exists proveedor_id uuid;     -- compras.proveedor (texto) sigue funcionando
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'compras_proveedor_fk') then
    alter table compras add constraint compras_proveedor_fk
      foreign key (negocio_id, proveedor_id) references proveedores (negocio_id, id) on delete set null (proveedor_id);
  end if;
end $$;

create or replace function exigir_modulo_compras() returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  perform exigir_modulo(new.negocio_id, 'compras');
  return new;
end;
$$;
drop trigger if exists ddd_modulo_compras on proveedores;
create trigger ddd_modulo_compras before insert on proveedores
  for each row execute function exigir_modulo_compras();

select _aplicar_politicas('categorias',  'p', 'p', 'p', 'd');
select _aplicar_politicas('proveedores', 'p', 'p', 'p', 'd');
select _triggers_tabla('categorias');
select _triggers_tabla('proveedores');

-- =====================================================================
-- 3. Pedidos: seguimiento, km, domiciliario, práctica y cliente con Google
-- =====================================================================
do $$
begin
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'pedidos_tienda' and column_name = 'seguimiento') then
    alter table pedidos_tienda
      add column seguimiento    text not null default 'recibido' check (seguimiento in ('recibido', 'preparando', 'en_camino', 'entregado')),
      add column seguimiento_en timestamptz,
      add column km_informado   numeric check (km_informado is null or (km_informado >= 0 and km_informado <= 200)),
      add column domiciliario_id uuid,                               -- sin llave foránea: la tabla de domiciliarios llega después
      add column es_practica    boolean not null default false,
      add column cliente_user_id uuid references auth.users(id) on delete set null;
    update pedidos_tienda set seguimiento = 'entregado' where estado = 'atendido';
  end if;
end $$;
create index if not exists pedidos_tienda_user_idx on pedidos_tienda (cliente_user_id, creado_en desc) where cliente_user_id is not null;

-- =====================================================================
-- 4. Domicilio por kilómetros (reglas) y ubicación de la tienda
-- =====================================================================
alter table negocio_reglas
  add column if not exists domicilio_modo          text    not null default 'fijo' check (domicilio_modo in ('fijo', 'km')),
  add column if not exists domicilio_km_incluidos  numeric not null default 0 check (domicilio_km_incluidos >= 0),
  add column if not exists domicilio_valor_km      numeric not null default 0 check (domicilio_valor_km >= 0),
  add column if not exists domicilio_redondeo      integer not null default 0 check (domicilio_redondeo in (0, 500, 1000)),
  add column if not exists domicilio_radio_max_km  numeric check (domicilio_radio_max_km is null or domicilio_radio_max_km > 0);
-- tarifa base = negocio_reglas.domicilio_costo (la que ya existía)

alter table negocio_config
  add column if not exists lat numeric check (lat is null or lat between -90 and 90),
  add column if not exists lng numeric check (lng is null or lng between -180 and 180),
  add column if not exists logo_diseno jsonb check (logo_diseno is null or pg_column_size(logo_diseno) <= 6000);

-- Lo verifica el SERVIDOR: pasar a km exige el módulo y la ubicación; guardar un diseño de logo exige el creador de logo
create or replace function validar_reglas_domicilio() returns trigger
language plpgsql set search_path = public
as $$
begin
  if new.domicilio_modo = 'km' and old.domicilio_modo is distinct from 'km' then
    if not modulo_activo(new.negocio_id, 'domicilio_km') then
      raise exception 'Tu plan no incluye el domicilio por kilómetros';
    end if;
    if not exists (select 1 from negocio_config where negocio_id = new.negocio_id and lat is not null and lng is not null) then
      raise exception 'Primero ubica tu tienda en el mapa (hace falta para calcular los kilómetros)';
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists ddd_domicilio_km on negocio_reglas;
create trigger ddd_domicilio_km before update on negocio_reglas
  for each row execute function validar_reglas_domicilio();

create or replace function validar_config_logo() returns trigger
language plpgsql set search_path = public
as $$
begin
  if new.logo_diseno is not null and new.logo_diseno is distinct from old.logo_diseno
     and not modulo_activo(new.negocio_id, 'creador_logo') then
    raise exception 'Tu plan no incluye el creador de logo';
  end if;
  return new;
end;
$$;
drop trigger if exists ddd_logo_diseno on negocio_config;
create trigger ddd_logo_diseno before update on negocio_config
  for each row execute function validar_config_logo();

-- Costo del domicilio por km con las reglas de la tienda (km incluidos en la base, valor por km, redondeo, envío gratis, radio máximo).
-- OJO: el redondeo es hacia ARRIBA; confírmalo contra calcular_domicilio de Matriz antes de C3.
create or replace function _costo_domicilio_km(p_negocio_id uuid, p_km numeric, p_subtotal numeric) returns numeric
language plpgsql stable security definer set search_path = public
as $$
declare r negocio_reglas%rowtype; v numeric;
begin
  select * into r from negocio_reglas where negocio_id = p_negocio_id;
  if p_km is null or p_km < 0 or p_km > 200 then raise exception 'La distancia no es válida'; end if;
  if r.domicilio_radio_max_km is not null and p_km > r.domicilio_radio_max_km then
    raise exception 'Tu dirección queda fuera de la zona de entrega (máximo % km)', r.domicilio_radio_max_km;
  end if;
  if coalesce(r.envio_gratis_desde, 0) > 0 and p_subtotal >= r.envio_gratis_desde then return 0; end if;
  v := coalesce(r.domicilio_costo, 0) + greatest(p_km - r.domicilio_km_incluidos, 0) * r.domicilio_valor_km;
  if r.domicilio_redondeo > 0 then v := ceil(v / r.domicilio_redondeo) * r.domicilio_redondeo; end if;
  return round(v);
end;
$$;

-- =====================================================================
-- 5. Cliente con Google: perfil único para todas las tiendas (Ley 1581: consentimiento, sin cédula)
-- =====================================================================
create table if not exists perfil_cliente (
  user_id          uuid primary key references auth.users(id) on delete cascade,
  nombre           text not null check (char_length(nombre) between 3 and 80),
  telefono         text not null check (telefono ~ '^[0-9]{10}$'),
  direccion        text check (direccion is null or char_length(direccion) <= 160),
  acepta_datos_en  timestamptz not null,
  politica_version text not null default 'v1',
  acepta_promos    boolean not null default false,
  acepta_promos_en timestamptz,
  creado_en        timestamptz not null default now(),
  actualizado_en   timestamptz not null default now()
);
alter table perfil_cliente enable row level security;
drop policy if exists perfil_cliente_sel on perfil_cliente;
create policy perfil_cliente_sel on perfil_cliente for select to authenticated using (user_id = auth.uid());   -- solo el dueño del perfil

create or replace function mi_perfil_cliente() returns jsonb
language sql stable security definer set search_path = public
as $$
  select jsonb_build_object('nombre', nombre, 'telefono', telefono, 'direccion', direccion,
                            'acepta_promos', acepta_promos, 'acepta_datos_en', acepta_datos_en, 'politica_version', politica_version)
    from perfil_cliente where user_id = auth.uid()
$$;

create or replace function guardar_perfil_cliente(p_datos jsonb) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_uid    uuid := auth.uid();
  v_nombre text := trim(coalesce(p_datos->>'nombre', ''));
  v_tel    text := regexp_replace(coalesce(p_datos->>'telefono', ''), '\D', '', 'g');
  v_dir    text := nullif(trim(coalesce(p_datos->>'direccion', '')), '');
  v_promos boolean := coalesce((p_datos->>'acepta_promos')::boolean, false);
  v_datos  boolean := coalesce((p_datos->>'acepta_datos')::boolean, false);
begin
  if v_uid is null then raise exception 'Entra con tu cuenta para guardar tu perfil'; end if;
  if length(v_nombre) < 3 or length(v_nombre) > 80 then raise exception 'Escribe tu nombre completo'; end if;
  if length(v_tel) = 12 and left(v_tel, 2) = '57' then v_tel := substr(v_tel, 3); end if;
  if length(v_tel) <> 10 then raise exception 'Escribe tu número de celular (10 dígitos)'; end if;
  if v_dir is not null and length(v_dir) > 160 then raise exception 'La dirección es muy larga'; end if;
  if not v_datos and not exists (select 1 from perfil_cliente where user_id = v_uid) then
    raise exception 'Debes aceptar la política de tratamiento de datos para guardar tu perfil';
  end if;

  insert into perfil_cliente (user_id, nombre, telefono, direccion, acepta_datos_en, acepta_promos, acepta_promos_en)
  values (v_uid, v_nombre, v_tel, v_dir, now(), v_promos, case when v_promos then now() end)
  on conflict (user_id) do update set
    nombre = excluded.nombre, telefono = excluded.telefono, direccion = excluded.direccion,
    acepta_promos = excluded.acepta_promos,
    acepta_promos_en = case when not excluded.acepta_promos then null
                            when perfil_cliente.acepta_promos then perfil_cliente.acepta_promos_en else now() end,
    actualizado_en = now();
  return mi_perfil_cliente();
end;
$$;

-- Derecho de supresión: borra el perfil y desliga las cuentas de sus pedidos (la tienda conserva su registro de venta)
create or replace function borrar_mi_perfil() returns void
language plpgsql security definer set search_path = public
as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'Entra con tu cuenta'; end if;
  delete from perfil_cliente where user_id = v_uid;
  update pedidos_tienda set cliente_user_id = null where cliente_user_id = v_uid;
end;
$$;

-- =====================================================================
-- 6. Contadores diarios (sin guardar cada clic)
-- =====================================================================
create table if not exists eventos_dia (
  negocio_id uuid not null references negocios(id),
  dia        date not null,
  evento     text not null check (evento in ('abrio_carrito', 'envio_whatsapp', 'instalo_app', 'pedido_creado')),
  cantidad   integer not null default 0,
  primary key (negocio_id, dia, evento)
);
select _aplicar_politicas('eventos_dia', 'd', null, null, null);
select _triggers_tabla('eventos_dia', false);   -- los escribe el sistema

create or replace function registrar_evento(p_slug text, p_evento text) returns void
language plpgsql security definer set search_path = public
as $$
declare v_id uuid; v_dia date := hoy_colombia();
begin
  if p_evento not in ('abrio_carrito', 'envio_whatsapp', 'instalo_app') then return; end if;
  select n.id into v_id from negocios n
   where n.slug = lower(coalesce(p_slug, '')) and n.estado = 'activo' and n.publicada
     and exists (select 1 from negocio_modulos m where m.negocio_id = n.id and m.modulo = 'catalogo_publico' and m.activo);
  if v_id is null then return; end if;
  if coalesce((select cantidad from eventos_dia where negocio_id = v_id and dia = v_dia and evento = p_evento), 0) >= 50000 then return; end if;
  insert into eventos_dia as e (negocio_id, dia, evento, cantidad) values (v_id, v_dia, p_evento, 1)
  on conflict (negocio_id, dia, evento) do update set cantidad = e.cantidad + 1;
end;
$$;

-- =====================================================================
-- 7. Servicios que pide la tienda (logo personalizado, carga de catálogo, fotos...)
-- =====================================================================
create table if not exists servicios_catalogo (
  clave            text primary key check (clave ~ '^[a-z_]{2,30}$'),
  nombre           text not null,
  descripcion      text,
  precio           numeric not null default 0 check (precio >= 0),
  rondas_incluidas integer not null default 2 check (rondas_incluidas between 0 and 10),
  modulo           text references modulos(clave),          -- si tiene módulo, hay que tenerlo activo para pedirlo
  activo           boolean not null default true
);
-- Precios de ARRANQUE (borrador): ajústalos con un update, no en el código.
insert into servicios_catalogo (clave, nombre, descripcion, precio, rondas_incluidas, modulo) values
  ('logo',           'Logo personalizado',   'Diseño a tu medida, entregado en PNG con fondo transparente y en SVG, con hasta 2 rondas de cambios. El logo es de tu tienda.', 150000, 2, 'logo_personalizado'),
  ('carga_catalogo', 'Carga de catálogo',    'Subimos tus productos al catálogo a partir de tu lista o de tus fotos.', 150000, 1, null),
  ('fotos',          'Fotos de productos',   'Tomamos o preparamos las fotos de tus productos para el catálogo.',       100000, 1, null)
on conflict (clave) do nothing;

create or replace function rutas_del_negocio(p_negocio_id uuid, p_rutas text[]) returns boolean
language sql immutable as $$
  select not exists (select 1 from unnest(p_rutas) r
                      where negocio_de_ruta(r) is distinct from p_negocio_id or split_part(r, '/', 2) not in ('marca', 'servicios'))
$$;

create table if not exists solicitudes_servicio (
  id             uuid not null default gen_random_uuid(),
  negocio_id     uuid not null references negocios(id),
  tipo           text not null references servicios_catalogo(clave),
  estado         text not null default 'pedida' check (estado in ('pedida', 'en_proceso', 'entregada', 'cancelada')),
  datos          jsonb not null default '{}'::jsonb check (jsonb_typeof(datos) = 'object' and pg_column_size(datos) <= 8000),
  precio         numeric not null default 0 check (precio >= 0),
  pagado         boolean not null default false,
  pagado_en      timestamptz,
  rondas_max     integer not null default 2,
  rondas_usadas  integer not null default 0 check (rondas_usadas >= 0),
  archivos       text[] not null default '{}',             -- rutas de entrega (carpeta marca/ o servicios/ de la propia tienda)
  historial      jsonb not null default '[]'::jsonb,
  creada_en      timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  entregada_en   timestamptz,
  primary key (negocio_id, id),
  constraint solicitudes_archivos_check check (rutas_del_negocio(negocio_id, archivos))
);
create index if not exists solicitudes_servicio_estado_idx on solicitudes_servicio (estado, creada_en);
select _aplicar_politicas('solicitudes_servicio', 'd', null, null, null);   -- el dueño las lee; se crean con funciones
select _triggers_tabla('solicitudes_servicio');
drop trigger if exists ccc_actualizado on solicitudes_servicio;
create trigger ccc_actualizado before update on solicitudes_servicio for each row execute function tocar_actualizado();

alter table servicios_catalogo enable row level security;
drop policy if exists servicios_catalogo_sel on servicios_catalogo;
create policy servicios_catalogo_sel on servicios_catalogo for select to authenticated using (activo);

create or replace function pedir_servicio(p_negocio_id uuid, p_tipo text, p_datos jsonb default '{}'::jsonb) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare s servicios_catalogo%rowtype; v_id uuid;
begin
  if not es_dueno(p_negocio_id) then raise exception 'No autorizado'; end if;
  select * into s from servicios_catalogo where clave = p_tipo and activo;
  if not found then raise exception 'Ese servicio no está disponible'; end if;
  if s.modulo is not null then perform exigir_modulo(p_negocio_id, s.modulo); end if;
  if jsonb_typeof(coalesce(p_datos, '{}'::jsonb)) <> 'object' or octet_length(coalesce(p_datos, '{}'::jsonb)::text) > 6000 then
    raise exception 'Los datos de la solicitud no son válidos';
  end if;
  if exists (select 1 from solicitudes_servicio where negocio_id = p_negocio_id and tipo = p_tipo and estado in ('pedida', 'en_proceso')) then
    raise exception 'Ya tienes una solicitud de este servicio en curso';
  end if;
  insert into solicitudes_servicio (negocio_id, tipo, datos, precio, rondas_max, historial)
  values (p_negocio_id, p_tipo, coalesce(p_datos, '{}'::jsonb), s.precio, s.rondas_incluidas,
          jsonb_build_array(jsonb_build_object('fecha', now(), 'autor', 'tienda', 'texto', 'Solicitud creada')))
  returning id into v_id;
  return jsonb_build_object('id', v_id, 'estado', 'pedida', 'precio', s.precio);
end;
$$;

create or replace function pedir_cambio_servicio(p_negocio_id uuid, p_id uuid, p_nota text) returns void
language plpgsql security definer set search_path = public
as $$
declare s solicitudes_servicio%rowtype; v_nota text := trim(coalesce(p_nota, ''));
begin
  if not es_dueno(p_negocio_id) then raise exception 'No autorizado'; end if;
  if length(v_nota) < 5 or length(v_nota) > 500 then raise exception 'Cuéntanos qué quieres cambiar (entre 5 y 500 letras)'; end if;
  select * into s from solicitudes_servicio where negocio_id = p_negocio_id and id = p_id for update;
  if not found then raise exception 'Solicitud no encontrada'; end if;
  if s.estado <> 'entregada' then raise exception 'Solo se piden cambios cuando el trabajo ya fue entregado'; end if;
  if s.rondas_usadas >= s.rondas_max then raise exception 'Ya usaste las rondas de cambios incluidas'; end if;
  update solicitudes_servicio
     set estado = 'en_proceso', rondas_usadas = rondas_usadas + 1,
         historial = historial || jsonb_build_object('fecha', now(), 'autor', 'tienda', 'texto', v_nota)
   where negocio_id = p_negocio_id and id = p_id;
end;
$$;

create or replace function cancelar_servicio(p_negocio_id uuid, p_id uuid) returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not es_dueno(p_negocio_id) then raise exception 'No autorizado'; end if;
  update solicitudes_servicio
     set estado = 'cancelada', historial = historial || jsonb_build_object('fecha', now(), 'autor', 'tienda', 'texto', 'Solicitud cancelada')
   where negocio_id = p_negocio_id and id = p_id and estado = 'pedida';
  if not found then raise exception 'Solo se cancelan las solicitudes que aún no empezaron'; end if;
end;
$$;

-- Solo la plataforma (consola): avanza el estado, sube los archivos de entrega y marca el pago
create or replace function atender_servicio(p_id uuid, p_estado text, p_nota text default null, p_archivos text[] default null,
                                            p_precio numeric default null, p_pagado boolean default null) returns void
language plpgsql security definer set search_path = public
as $$
begin
  if auth.uid() is not null then raise exception 'Los servicios se atienden solo desde la consola de la plataforma'; end if;
  if p_estado not in ('pedida', 'en_proceso', 'entregada', 'cancelada') then raise exception 'Estado no válido'; end if;
  update solicitudes_servicio set
    estado = p_estado,
    archivos = coalesce(p_archivos, archivos),
    precio = coalesce(p_precio, precio),
    pagado = coalesce(p_pagado, pagado),
    pagado_en = case when p_pagado is true and not pagado then now() else pagado_en end,
    entregada_en = case when p_estado = 'entregada' then now() else entregada_en end,
    historial = case when p_nota is null then historial
                     else historial || jsonb_build_object('fecha', now(), 'autor', 'plataforma', 'texto', left(p_nota, 500)) end
   where id = p_id;
  if not found then raise exception 'Solicitud no encontrada'; end if;
end;
$$;

-- =====================================================================
-- 8. Imágenes: carpeta nueva "categorias" (la sube el personal)
-- =====================================================================
drop policy if exists negocios_subir   on storage.objects;
drop policy if exists negocios_cambiar on storage.objects;
drop policy if exists negocios_borrar  on storage.objects;

create policy negocios_subir on storage.objects for insert to authenticated
  with check (bucket_id = 'negocios' and (
       (split_part(name, '/', 2) in ('productos', 'prendas', 'categorias') and negocio_de_ruta(name) in (select mis_negocios_personal()))
    or (split_part(name, '/', 2) in ('marca', 'anuncios')                   and negocio_de_ruta(name) in (select mis_negocios_dueno()))));

create policy negocios_cambiar on storage.objects for update to authenticated
  using (bucket_id = 'negocios' and (
       (split_part(name, '/', 2) in ('productos', 'prendas', 'categorias') and negocio_de_ruta(name) in (select mis_negocios_personal()))
    or (split_part(name, '/', 2) in ('marca', 'anuncios')                   and negocio_de_ruta(name) in (select mis_negocios_dueno()))))
  with check (bucket_id = 'negocios' and (
       (split_part(name, '/', 2) in ('productos', 'prendas', 'categorias') and negocio_de_ruta(name) in (select mis_negocios_personal()))
    or (split_part(name, '/', 2) in ('marca', 'anuncios')                   and negocio_de_ruta(name) in (select mis_negocios_dueno()))));

create policy negocios_borrar on storage.objects for delete to authenticated
  using (bucket_id = 'negocios' and (
       (split_part(name, '/', 2) in ('productos', 'prendas', 'categorias') and negocio_de_ruta(name) in (select mis_negocios_personal()))
    or (split_part(name, '/', 2) in ('marca', 'anuncios')                   and negocio_de_ruta(name) in (select mis_negocios_dueno()))));

-- =====================================================================
-- 9. Publicación: lo público solo ve tiendas publicadas; el personal y el soporte ven la vista previa
-- =====================================================================
create or replace function _negocio_publico_id(p_slug text, p_modulo text) returns uuid
language plpgsql stable security definer set search_path = public
as $$
declare v_id uuid;
begin
  select n.id into v_id from negocios n
   where n.slug = lower(coalesce(p_slug, '')) and n.estado = 'activo' and n.publicada
     and exists (select 1 from negocio_modulos m where m.negocio_id = n.id and m.modulo = p_modulo and m.activo);
  if v_id is null then raise exception 'Catálogo no disponible'; end if;
  return v_id;
end;
$$;

-- Igual, pero deja entrar al personal y al soporte aunque la tienda no esté publicada (vista previa)
create or replace function _negocio_vista_id(p_slug text, p_modulo text) returns uuid
language plpgsql stable security definer set search_path = public
as $$
declare v_id uuid;
begin
  select n.id into v_id from negocios n
   where n.slug = lower(coalesce(p_slug, '')) and n.estado = 'activo'
     and (n.publicada or es_personal(n.id) or es_soporte(n.id))
     and exists (select 1 from negocio_modulos m where m.negocio_id = n.id and m.modulo = p_modulo and m.activo);
  if v_id is null then raise exception 'Catálogo no disponible'; end if;
  return v_id;
end;
$$;

create or replace function negocio_publico(p_slug text)
returns jsonb
language sql stable security definer set search_path = public
as $$
  select jsonb_build_object(
    'slug', n.slug, 'tipo', n.tipo, 'vista_previa', not n.publicada,
    'nombre', c.nombre_comercial, 'eslogan', c.eslogan, 'logo', c.logo_path, 'icono', c.icono_path,
    'logo_auto', jsonb_build_object('inicial', upper(left(btrim(c.nombre_comercial), 1)), 'color', c.color_principal),
    'color_principal', c.color_principal, 'color_secundario', c.color_secundario, 'color_acento', c.color_acento,
    'nit', c.nit, 'razon_social', c.razon_social, 'direccion', c.direccion, 'ciudad', c.ciudad,
    'telefono', c.telefono, 'email', c.email, 'web', c.web, 'whatsapp', c.whatsapp,
    'instagram', c.instagram, 'facebook', c.facebook, 'tiktok', c.tiktok, 'horario', c.horario,
    'maps_url', c.maps_url, 'correo_datos', c.correo_datos,
    'domicilio_costo', r.domicilio_costo, 'envio_gratis_desde', r.envio_gratis_desde,
    'zona_domicilio', r.zona_domicilio, 'formas_pago_tienda', r.formas_pago_tienda,
    'domicilio_costo_ropa', r.domicilio_costo_ropa, 'envio_gratis_desde_ropa', r.envio_gratis_desde_ropa,
    'domicilio_modo', r.domicilio_modo, 'domicilio_km_incluidos', r.domicilio_km_incluidos,
    'domicilio_valor_km', r.domicilio_valor_km, 'domicilio_redondeo', r.domicilio_redondeo,
    'domicilio_radio_max_km', r.domicilio_radio_max_km,
    'modulos', coalesce((select jsonb_agg(m.modulo order by m.modulo) from negocio_modulos m
                          where m.negocio_id = n.id and m.activo), '[]'::jsonb))
    from negocios n
    join negocio_config c on c.negocio_id = n.id
    join negocio_reglas r on r.negocio_id = n.id
   where n.slug = lower(coalesce(p_slug, '')) and n.estado = 'activo'
     and (n.publicada or es_personal(n.id) or es_soporte(n.id))
$$;

create or replace function registrar_visita(p_slug text, p_catalogo text, p_visitante text)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_dia date := hoy_colombia(); v_id uuid;
begin
  if p_catalogo not in ('tienda', 'ropa') then return; end if;
  if p_visitante is null or char_length(p_visitante) < 8 or char_length(p_visitante) > 64 then return; end if;
  select n.id into v_id from negocios n
   where n.slug = lower(coalesce(p_slug, '')) and n.estado = 'activo' and n.publicada
     and exists (select 1 from negocio_modulos m where m.negocio_id = n.id and m.modulo = 'catalogo_publico' and m.activo);
  if v_id is null then return; end if;
  if (select count(*) from visitas where negocio_id = v_id and dia = v_dia and catalogo = p_catalogo) >= 20000 then return; end if;
  insert into visitas (negocio_id, dia, catalogo, visitante) values (v_id, v_dia, p_catalogo, p_visitante)
  on conflict do nothing;
end;
$$;

create or replace function catalogo_tienda(p_slug text)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare v_id uuid := _negocio_vista_id(p_slug, 'catalogo_publico');
begin
  perform exigir_modulo(v_id, 'productos');
  return jsonb_build_object(
    'productos', coalesce((select jsonb_agg(to_jsonb(x) order by x.nombre) from (
        select id, nombre, descripcion, categoria, precio_venta, unidad, imagenes,
               (case when controla_stock then stock > 0 else disponible end) as disponible, creado_en
          from productos where negocio_id = v_id and activo and publicado and precio_venta > 0) x), '[]'::jsonb),
    'categorias', coalesce((select jsonb_agg(jsonb_build_object('nombre', nombre, 'imagen', imagen) order by orden, nombre)
                              from categorias where negocio_id = v_id and activa), '[]'::jsonb),
    'mas_vendidos', coalesce((select jsonb_agg(t.producto_id order by t.total desc) from (
        select vi.producto_id, sum(vi.cantidad) as total
          from venta_items vi
          join ventas v on v.negocio_id = vi.negocio_id and v.id = vi.venta_id
          join productos p on p.negocio_id = vi.negocio_id and p.id = vi.producto_id
         where vi.negocio_id = v_id and not v.anulada and v.fecha >= now() - interval '30 days'
           and p.activo and p.publicado and p.precio_venta > 0
           and (case when p.controla_stock then p.stock > 0 else p.disponible end)
         group by vi.producto_id order by total desc limit 8) t), '[]'::jsonb)
  ) || _publicidad_vigente(v_id, false);
end;
$$;

create or replace function catalogo_ropa(p_slug text)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare v_id uuid := _negocio_vista_id(p_slug, 'catalogo_publico');
begin
  perform exigir_modulo(v_id, 'ropa');
  return jsonb_build_object(
    'prendas', coalesce((select jsonb_agg(to_jsonb(x) order by x.nombre) from (
        select id, nombre, descripcion, categoria, precio, imagen_url, imagenes, genero, creado_en
          from prendas where negocio_id = v_id and activo) x), '[]'::jsonb),
    'variantes', coalesce((select jsonb_agg(to_jsonb(y)) from (
        select vr.id, vr.prenda_id, vr.talla, vr.color, vr.stock
          from prenda_variantes vr join prendas p on p.negocio_id = vr.negocio_id and p.id = vr.prenda_id
         where vr.negocio_id = v_id and p.activo) y), '[]'::jsonb)
  ) || _publicidad_vigente(v_id, true);
end;
$$;

-- =====================================================================
-- 10. Pedido de la tienda (anon o con Google): invitado, práctica, stock opcional, domicilio por km
--     El precio, las promociones y el domicilio los calcula SIEMPRE el servidor.
--     OJO C1: el km lo informa el navegador (se guarda como km_informado y se valida contra el radio máximo);
--     en C3 lo reemplaza el cálculo del servidor con el mapa.
-- =====================================================================
create or replace function crear_pedido_tienda(p_slug text, p_datos jsonb, p_items jsonb)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_neg    uuid := _negocio_vista_id(p_slug, 'pedidos_en_linea');
  it       jsonb;
  prod     productos%rowtype;
  rg       negocio_reglas%rowtype;
  v_cant   numeric;
  v_bruto  numeric;
  v_desc   numeric;
  v_pnom   text;
  v_total  numeric := 0;
  v_dom    numeric := 0;
  v_recoge boolean := coalesce(p_datos->>'entrega', '') = 'recoger';
  v_id     uuid;
  v_num    bigint;
  v_cli    uuid;
  v_lineas jsonb := '[]'::jsonb;
  v_hoy    date := hoy_colombia();
  v_vistos uuid[] := '{}';
  v_publicada boolean;
  v_practica  boolean;
  v_user   uuid := auth.uid();
  v_nom text; v_tel text; v_mail text; v_dir text; v_km numeric; v_km_txt text;
begin
  perform exigir_modulo(v_neg, 'productos');
  select publicada into v_publicada from negocios where id = v_neg;
  -- pedido de práctica: solo el personal, y siempre si la tienda aún no está publicada
  v_practica := es_personal(v_neg) and (not v_publicada or coalesce(p_datos->>'practica', '') = 'true');
  if not v_publicada and not v_practica then raise exception 'Catálogo no disponible'; end if;

  if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) not between 1 and 40 then
    raise exception 'El pedido está vacío o es demasiado grande';
  end if;

  if v_practica then
    v_nom  := left(trim(coalesce(nullif(p_datos->>'nombre', ''), 'Pedido de práctica')), 80);
    v_tel  := left(regexp_replace(coalesce(p_datos->>'telefono', ''), '\D', '', 'g'), 12);
    v_mail := null;
  else
    if (select count(*) from pedidos_tienda where negocio_id = v_neg and estado = 'pendiente' and not es_practica) >= 300 then
      raise exception 'Hay muchos pedidos pendientes: escríbenos directamente por WhatsApp';
    end if;
    v_cli := _cliente_desde_pedido(v_neg, p_datos, 'tienda');
    -- freno contra pedidos repetidos del mismo cliente
    if (select count(*) from pedidos_tienda where negocio_id = v_neg and cliente_id = v_cli and creado_en > now() - interval '1 hour') >= 5 then
      raise exception 'Ya enviaste varios pedidos hace poco: espera un momento o escríbenos por WhatsApp';
    end if;
    select c.nombre, c.telefono, c.email into v_nom, v_tel, v_mail from clientes c where c.negocio_id = v_neg and c.id = v_cli;
  end if;
  v_dir := case when v_recoge then 'Recoge en tienda' else left(trim(coalesce(p_datos->>'direccion', '')), 160) end;

  v_km_txt := nullif(trim(coalesce(p_datos->>'km', '')), '');
  if v_km_txt is not null then
    if v_km_txt !~ '^[0-9]{1,3}([.,][0-9]{1,2})?$' then raise exception 'La distancia no es válida'; end if;
    v_km := replace(v_km_txt, ',', '.')::numeric;
  end if;

  insert into pedidos_tienda (negocio_id, cliente_id, cliente_user_id, nombre, telefono, direccion, email, nota, entrega, es_practica, km_informado)
  values (v_neg, v_cli, case when v_practica then null else v_user end, v_nom, v_tel, v_dir, v_mail,
          nullif(left(trim(coalesce(p_datos->>'nota', '')), 200), ''),
          case when v_recoge then 'recoger' else 'domicilio' end, v_practica, case when v_recoge then null else v_km end)
  returning id, numero into v_id, v_num;

  for it in select * from jsonb_array_elements(p_items) loop
    v_cant := (it->>'cantidad')::numeric;
    if v_cant is null or v_cant <= 0 or v_cant > 500 then raise exception 'Cantidad inválida'; end if;
    select * into prod from productos
     where negocio_id = v_neg and id = (it->>'producto_id')::uuid and activo and publicado and precio_venta > 0;
    if not found then raise exception 'Uno de los productos ya no está disponible'; end if;
    if prod.id = any(v_vistos) then raise exception 'Un producto está repetido en el pedido'; end if;
    v_vistos := v_vistos || prod.id;
    if not (case when prod.controla_stock then prod.stock > 0 else prod.disponible end) then
      raise exception '"%" está agotado por ahora', prod.nombre;
    end if;

    v_bruto := round(prod.precio_venta * v_cant);
    select x.d, x.nombre into v_desc, v_pnom from (
      select q.nombre, promo_descuento(q, prod.precio_venta, v_cant) as d
        from promociones q
       where q.negocio_id = v_neg
         and q.activa and q.desde <= v_hoy and (q.hasta is null or q.hasta >= v_hoy)
         and (q.producto_id = prod.id or (q.categoria is not null and q.categoria = prod.categoria))
       order by 2 desc limit 1) x;
    if coalesce(v_desc, 0) <= 0 then v_desc := 0; v_pnom := null; end if;

    insert into pedido_tienda_items (negocio_id, pedido_id, producto_id, nombre, unidad, cantidad, precio_unitario, descuento, promo)
    values (v_neg, v_id, prod.id, prod.nombre, prod.unidad, v_cant, prod.precio_venta, v_desc, v_pnom);
    v_total := v_total + v_bruto - v_desc;
    v_lineas := v_lineas || jsonb_build_object('nombre', prod.nombre, 'unidad', prod.unidad,
                  'cantidad', v_cant, 'subtotal', v_bruto - v_desc, 'promo', v_pnom);
  end loop;

  -- Domicilio: por km si la tienda lo activó (y su plan lo incluye); si no, tarifa fija. Siempre lo decide el servidor.
  if not v_recoge then
    select * into rg from negocio_reglas where negocio_id = v_neg;
    if rg.domicilio_modo = 'km' and modulo_activo(v_neg, 'domicilio_km') then
      if v_km is null then raise exception 'Calcula la distancia de tu dirección antes de hacer el pedido'; end if;
      v_dom := _costo_domicilio_km(v_neg, v_km, v_total);
    elsif rg.domicilio_costo is not null then
      v_dom := case when coalesce(rg.envio_gratis_desde, 0) > 0 and v_total >= rg.envio_gratis_desde then 0 else rg.domicilio_costo end;
    end if;
  end if;

  update pedidos_tienda set total = v_total + v_dom, domicilio = v_dom where negocio_id = v_neg and id = v_id;
  if not v_practica then
    insert into eventos_dia as e (negocio_id, dia, evento, cantidad) values (v_neg, v_hoy, 'pedido_creado', 1)
    on conflict (negocio_id, dia, evento) do update set cantidad = e.cantidad + 1;
  end if;
  return jsonb_build_object('id', v_id, 'numero', v_num, 'subtotal', v_total, 'domicilio', v_dom,
                            'total', v_total + v_dom, 'entrega', case when v_recoge then 'recoger' else 'domicilio' end,
                            'seguimiento', 'recibido', 'es_practica', v_practica, 'lineas', v_lineas);
end;
$$;

-- Las estadísticas en línea no cuentan los pedidos de práctica
do $$
declare d text;
begin
  select pg_get_functiondef('tablero_en_linea(uuid,timestamptz,timestamptz)'::regprocedure) into d;
  if position('not es_practica' in d) = 0 then
    d := replace(d, 'from pedidos_tienda where negocio_id = p_negocio_id and creado_en >= p_desde and creado_en < v_hasta',
                    'from pedidos_tienda where negocio_id = p_negocio_id and not es_practica and creado_en >= p_desde and creado_en < v_hasta');
    if position('not es_practica' in d) = 0 then raise exception 'No se pudo ajustar tablero_en_linea para ignorar los pedidos de práctica'; end if;
    execute d;
  end if;
end $$;

-- =====================================================================
-- 11. Mis pedidos (cliente con Google) y seguimiento (personal)
-- =====================================================================
create or replace function mis_pedidos() returns jsonb
language sql stable security definer set search_path = public
as $$
  select coalesce(jsonb_agg(to_jsonb(x) order by x.creado_en desc), '[]'::jsonb) from (
    select p.id, n.slug, c.nombre_comercial as tienda, p.numero, p.creado_en, p.estado, p.seguimiento,
           p.total, p.domicilio, p.entrega,
           (select jsonb_agg(jsonb_build_object('nombre', i.nombre, 'unidad', i.unidad, 'cantidad', i.cantidad,
                                                'precio_unitario', i.precio_unitario, 'descuento', i.descuento))
              from pedido_tienda_items i where i.negocio_id = p.negocio_id and i.pedido_id = p.id) as items
      from pedidos_tienda p
      join negocios n on n.id = p.negocio_id
      join negocio_config c on c.negocio_id = n.id
     where p.cliente_user_id = auth.uid() and not p.es_practica and n.estado = 'activo'
       and modulo_activo(n.id, 'mis_pedidos')
     order by p.creado_en desc limit 50) x
$$;

-- Corre con los permisos de quien llama (security invoker): el RLS y el candado de soporte deciden
create or replace function cambiar_seguimiento(p_negocio_id uuid, p_pedido_id uuid, p_seguimiento text) returns void
language plpgsql
as $$
begin
  if not es_personal(p_negocio_id) then raise exception 'No autorizado'; end if;
  perform exigir_modulo(p_negocio_id, 'mis_pedidos');
  if p_seguimiento not in ('recibido', 'preparando', 'en_camino', 'entregado') then raise exception 'Estado de seguimiento no válido'; end if;
  update pedidos_tienda set seguimiento = p_seguimiento, seguimiento_en = now()
   where negocio_id = p_negocio_id and id = p_pedido_id;
  if not found then raise exception 'Pedido no encontrado'; end if;
end;
$$;

-- =====================================================================
-- 12. Auditoría de lo nuevo
-- =====================================================================
do $$
declare r record;
begin
  for r in select * from (values
    ('categorias','update'), ('categorias','delete'), ('proveedores','update'), ('proveedores','delete'),
    ('solicitudes_servicio','update')) as x(tabla, op) loop
    execute format('drop trigger if exists %I on %I', 'aud_' || r.tabla || '_' || r.op, r.tabla);
    execute format('create trigger %I after %s on %I for each row execute function auditar()', 'aud_' || r.tabla || '_' || r.op, r.op, r.tabla);
  end loop;
end $$;

-- =====================================================================
-- 13. Permisos (las funciones nuevas nacen abiertas a PUBLIC: se cierran a mano)
-- =====================================================================
revoke all on table categorias, proveedores, perfil_cliente, eventos_dia, servicios_catalogo, solicitudes_servicio
  from public, anon, authenticated;
grant select, insert, update, delete on categorias, proveedores to authenticated;      -- el RLS decide quién y en qué tienda
grant select on perfil_cliente, eventos_dia, servicios_catalogo, solicitudes_servicio to authenticated;
grant all on all tables in schema public to service_role;

revoke all on function productos_stock_por_defecto(), exigir_modulo_compras(), validar_reglas_domicilio(), validar_config_logo(),
                       _costo_domicilio_km(uuid, numeric, numeric), rutas_del_negocio(uuid, text[]),
                       _negocio_publico_id(text, text), _negocio_vista_id(text, text) from public, anon, authenticated;
grant execute on function rutas_del_negocio(uuid, text[]) to authenticated;            -- la usa un CHECK
revoke all on function negocio_publico(text), registrar_visita(text, text, text), catalogo_tienda(text), catalogo_ropa(text),
                       crear_pedido_tienda(text, jsonb, jsonb), registrar_evento(text, text) from public;
grant execute on function negocio_publico(text), registrar_visita(text, text, text), catalogo_tienda(text), catalogo_ropa(text),
                          crear_pedido_tienda(text, jsonb, jsonb), registrar_evento(text, text) to anon, authenticated;
revoke all on function mis_pedidos(), cambiar_seguimiento(uuid, uuid, text), mi_perfil_cliente(), guardar_perfil_cliente(jsonb),
                       borrar_mi_perfil(), pedir_servicio(uuid, text, jsonb), pedir_cambio_servicio(uuid, uuid, text),
                       cancelar_servicio(uuid, uuid) from public, anon;
grant execute on function mis_pedidos(), cambiar_seguimiento(uuid, uuid, text), mi_perfil_cliente(), guardar_perfil_cliente(jsonb),
                          borrar_mi_perfil(), pedir_servicio(uuid, text, jsonb), pedir_cambio_servicio(uuid, uuid, text),
                          cancelar_servicio(uuid, uuid) to authenticated;
revoke all on function atender_servicio(uuid, text, text, text[], numeric, boolean) from public, anon, authenticated;
grant execute on function atender_servicio(uuid, text, text, text[], numeric, boolean) to service_role;

-- =====================================================================
-- 14. verificar_aislamiento() ampliada (reemplaza la de 08): ahora son 11 chequeos
-- =====================================================================
create or replace function verificar_aislamiento()
returns table (chequeo text, ok boolean, detalle text)
language plpgsql stable set search_path = public
as $$
declare v text;
begin
  chequeo := 'Todas las tablas tienen RLS activado';
  select string_agg(relname, ', ') into v from pg_class
   where relnamespace = 'public'::regnamespace and relkind = 'r' and not relrowsecurity;
  ok := v is null; detalle := coalesce(v, ''); return next;

  chequeo := 'Toda tabla con negocio_id tiene el candado de cambio de negocio';
  select string_agg(c.relname, ', ') into v from pg_class c
   where c.relnamespace = 'public'::regnamespace and c.relkind = 'r'
     and exists (select 1 from pg_attribute a where a.attrelid = c.oid and a.attname = 'negocio_id' and not a.attisdropped)
     and not exists (select 1 from pg_trigger t where t.tgrelid = c.oid and t.tgname = 'bbb_negocio_inmutable' and not t.tgisinternal);
  ok := v is null; detalle := coalesce(v, ''); return next;

  chequeo := 'Toda llave foránea entre tablas del negocio incluye negocio_id (compuesta)';
  select string_agg(c.conrelid::regclass::text || '.' || c.conname, ', ') into v from pg_constraint c
   where c.contype = 'f' and c.connamespace = 'public'::regnamespace
     and exists (select 1 from pg_attribute a where a.attrelid = c.conrelid and a.attname = 'negocio_id' and not a.attisdropped)
     and c.confrelid::regclass::text not in ('negocios', 'modulos', 'servicios_catalogo', 'auth.users')
     and array_length(c.conkey, 1) = 1;
  ok := v is null; detalle := coalesce(v, ''); return next;

  chequeo := 'Toda tabla de public tiene negocio_id o está en la lista de tablas globales';
  select string_agg(c.relname, ', ') into v from pg_class c
   where c.relnamespace = 'public'::regnamespace and c.relkind = 'r'
     and not exists (select 1 from pg_attribute a where a.attrelid = c.oid and a.attname = 'negocio_id' and not a.attisdropped)
     and c.relname <> all (array['negocios', 'modulos', 'planes', 'plan_modulos', 'servicios_catalogo', 'plataforma_admins',
                                  'plataforma_limites', 'uso_plataforma', 'perfil_cliente']);
  ok := v is null; detalle := coalesce(v, ''); return next;

  chequeo := 'Toda política sobre una tabla con negocio_id exige ser del equipo del negocio o soporte';
  select string_agg(p.tablename || '.' || p.policyname, ', ') into v from pg_policies p
   where p.schemaname = 'public'
     and exists (select 1 from pg_attribute a where a.attrelid = (quote_ident(p.schemaname) || '.' || quote_ident(p.tablename))::regclass
                   and a.attname = 'negocio_id' and not a.attisdropped)
     and coalesce(p.qual, p.with_check, '') not like '%mis_negocios_%';
  ok := v is null; detalle := coalesce(v, ''); return next;

  chequeo := 'Anónimo no tiene permisos sobre ninguna tabla';
  select string_agg(table_name, ', ') into v from information_schema.role_table_grants
   where table_schema = 'public' and grantee = 'anon';
  ok := v is null; detalle := coalesce(v, ''); return next;

  chequeo := 'Ninguna función de public es ejecutable por PUBLIC';
  select string_agg(p.proname, ', ') into v from pg_proc p
   where p.pronamespace = 'public'::regnamespace and p.prokind = 'f'
     and has_function_privilege('public', p.oid, 'execute') is true
     and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e');
  ok := v is null; detalle := coalesce(v, ''); return next;

  chequeo := 'Anónimo solo ejecuta las 8 funciones públicas';
  select string_agg(p.proname, ', ') into v from pg_proc p
   where p.pronamespace = 'public'::regnamespace and p.prokind = 'f'
     and has_function_privilege('anon', p.oid, 'execute')
     and p.proname not in ('negocio_publico','registrar_visita','catalogo_tienda','catalogo_ropa','crear_pedido_tienda','crear_pedido_ropa','registrar_evento','hoy_colombia');
  ok := v is null; detalle := coalesce(v, ''); return next;

  chequeo := 'Toda función security definer fija search_path';
  select string_agg(p.proname, ', ') into v from pg_proc p
   where p.pronamespace = 'public'::regnamespace and p.prosecdef
     and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) cfg where cfg like 'search_path=%');
  ok := v is null; detalle := coalesce(v, ''); return next;

  chequeo := 'Las vistas internas corren con los permisos de quien consulta';
  select string_agg(c.relname, ', ') into v from pg_class c
   where c.relnamespace = 'public'::regnamespace and c.relkind = 'v'
     and not coalesce('security_invoker=true' = any (c.reloptions), false);
  ok := v is null; detalle := coalesce(v, ''); return next;

  chequeo := 'Ninguna política de public se aplica a anónimo';
  select string_agg(tablename || '.' || policyname, ', ') into v from pg_policies
   where schemaname = 'public' and (roles::text like '%anon%' or roles::text like '%public%');
  ok := v is null; detalle := coalesce(v, ''); return next;
end;
$$;
revoke all on function verificar_aislamiento() from public, anon, authenticated;
grant execute on function verificar_aislamiento() to service_role;

-- ---------- VERIFICACIÓN: las 17 filas deben decir ok = true ----------
select chequeo, ok from (
  select 1 as n, chequeo, ok from verificar_aislamiento()
  union all select 2, 'pedidos_tienda tiene seguimiento, km_informado, domiciliario_id, es_practica y cliente_user_id',
         (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'pedidos_tienda'
             and column_name in ('seguimiento', 'km_informado', 'domiciliario_id', 'es_practica', 'cliente_user_id')) = 5
  union all select 3, 'productos tiene controla_stock y disponible',
         (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'productos'
             and column_name in ('controla_stock', 'disponible')) = 2
  union all select 4, 'Existen categorias, proveedores, perfil_cliente, eventos_dia, solicitudes_servicio y servicios_catalogo',
         (select count(*) from pg_tables where schemaname = 'public'
             and tablename in ('categorias', 'proveedores', 'perfil_cliente', 'eventos_dia', 'solicitudes_servicio', 'servicios_catalogo')) = 6
  union all select 5, 'Las tiendas que ya existían siguen publicadas y las nuevas nacen sin publicar',
         (select column_default from information_schema.columns where table_schema = 'public' and table_name = 'negocios' and column_name = 'publicada') = 'false'
  union all select 6, 'tablero_en_linea ignora los pedidos de práctica',
         position('not es_practica' in pg_get_functiondef('tablero_en_linea(uuid,timestamptz,timestamptz)'::regprocedure)) > 0
  union all select 7, 'Hay 3 servicios con precio de arranque (editable)',
         (select count(*) from servicios_catalogo) >= 3
) v order by n;
