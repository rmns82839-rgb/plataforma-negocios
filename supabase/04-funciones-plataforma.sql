-- ============================================================
-- Plataforma multi-negocio — 04: funciones de plataforma
-- Regla de oro: toda función recibe el negocio (p_negocio_id o slug), valida primero
-- quién es el que llama, filtra TODA consulta por ese negocio y responde igual
-- cuando algo "no existe" que cuando "no es tuyo".
-- Los permisos (grant/revoke) están en 08-permisos.sql.
-- ============================================================

-- ---------- Alta de negocios (solo desde el SQL Editor / servicio) ----------
create or replace function _plantilla_modulos(p_tipo text) returns text[]
language sql immutable as $$
  select case p_tipo
    when 'tienda'    then array['caja','productos','fiados','compras','reportes','domicilios','catalogo_publico','pedidos_en_linea','publicidad','escaner']
    when 'ropa'      then array['caja','ropa','fiados','reportes','domicilios','catalogo_publico','pedidos_en_linea','publicidad']
    when 'repuestos' then array['caja','productos','fiados','compras','reportes','domicilios','catalogo_publico','pedidos_en_linea','publicidad','escaner','repuestos']
    when 'mixto'     then array['caja','productos','ropa','fiados','compras','reportes','domicilios','catalogo_publico','pedidos_en_linea','publicidad','escaner']
  end
$$;

create or replace function crear_negocio(p_slug text, p_nombre text, p_tipo text, p_email_dueno text)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_id uuid; v_dueno uuid; v_mod text;
begin
  if auth.uid() is not null then
    raise exception 'Los negocios se crean solo desde la consola de la plataforma';
  end if;
  if p_tipo is null or _plantilla_modulos(p_tipo) is null then
    raise exception 'Tipo de negocio no válido: %', p_tipo;
  end if;
  select id into v_dueno from auth.users where lower(email) = lower(trim(p_email_dueno));
  if v_dueno is null then
    raise exception 'No existe un usuario con el correo %. Créalo primero en Authentication → Users.', p_email_dueno;
  end if;
  if exists (select 1 from plataforma_admins where user_id = v_dueno) then
    raise exception 'Ese usuario es de soporte de la plataforma y no puede ser dueño de un negocio';
  end if;

  insert into negocios (slug, tipo) values (lower(trim(p_slug)), p_tipo) returning id into v_id;
  insert into negocio_config (negocio_id, nombre_comercial) values (v_id, trim(p_nombre));
  insert into negocio_reglas (negocio_id) values (v_id);
  foreach v_mod in array _plantilla_modulos(p_tipo) loop
    insert into negocio_modulos (negocio_id, modulo) values (v_id, v_mod);
  end loop;
  insert into negocio_miembros (negocio_id, user_id, rol) values (v_id, v_dueno, 'dueno');
  insert into formas_pago (negocio_id, id, nombre, tipo, orden) values
    (v_id, 'efectivo',      'Efectivo',      'efectivo', 10),
    (v_id, 'transferencia', 'Transferencia', 'digital',  20),
    (v_id, 'nequi',         'Nequi',         'digital',  30),
    (v_id, 'daviplata',     'Daviplata',     'digital',  40),
    (v_id, 'datafono',      'Datáfono',      'datafono', 50),
    (v_id, 'fiado',         'Fiado',         'fiado',    60);

  return jsonb_build_object('id', v_id, 'slug', lower(trim(p_slug)), 'url', '/n/' || lower(trim(p_slug)));
end;
$$;

-- Enciende o apaga un módulo respetando dependencias. Solo plataforma.
create or replace function activar_modulo(p_negocio_id uuid, p_modulo text, p_activo boolean)
returns void
language plpgsql security definer set search_path = public
as $$
declare v_dep text; v_dependiente text;
begin
  if auth.uid() is not null then
    raise exception 'Los módulos se cambian solo desde la consola de la plataforma';
  end if;
  if not exists (select 1 from negocios where id = p_negocio_id) then raise exception 'Negocio no encontrado'; end if;
  if not exists (select 1 from modulos where clave = p_modulo) then raise exception 'Módulo no válido: %', p_modulo; end if;

  if p_activo then
    for v_dep in select unnest(depende_de) from modulos where clave = p_modulo loop
      if not modulo_activo(p_negocio_id, v_dep) then
        raise exception 'Para activar "%" hay que activar antes "%"', p_modulo, v_dep;
      end if;
    end loop;
    insert into negocio_modulos (negocio_id, modulo, activo) values (p_negocio_id, p_modulo, true)
    on conflict (negocio_id, modulo) do update set activo = true;
  else
    select m.clave into v_dependiente
      from modulos m join negocio_modulos nm on nm.modulo = m.clave and nm.negocio_id = p_negocio_id and nm.activo
     where p_modulo = any (m.depende_de) limit 1;
    if v_dependiente is not null then
      raise exception 'No se puede apagar "%": lo usa "%"', p_modulo, v_dependiente;
    end if;
    update negocio_modulos set activo = false where negocio_id = p_negocio_id and modulo = p_modulo;
  end if;
end;
$$;

-- ---------- Interfaz: quién soy y en qué negocios ----------
create or replace function mis_negocios()
returns table (negocio_id uuid, slug text, nombre_comercial text, tipo text, rol text)
language sql stable security definer set search_path = public
as $$
  select n.id, n.slug, c.nombre_comercial, n.tipo, mi_rol(n.id)
    from negocios n join negocio_config c on c.negocio_id = n.id
   where n.id in (select mis_negocios_personal()) or n.id in (select negocios_soporte())
   order by c.nombre_comercial
$$;

-- ---------- Equipo ----------
create or replace function listar_miembros(p_negocio_id uuid)
returns table (user_id uuid, email text, rol text, nombre text, activo boolean, ultimo_ingreso timestamptz)
language plpgsql stable security definer set search_path = public
as $$
begin
  if not (es_dueno(p_negocio_id) or es_soporte(p_negocio_id)) then raise exception 'No autorizado'; end if;
  return query
    select m.user_id, u.email::text, m.rol, m.nombre, m.activo, u.last_sign_in_at
      from negocio_miembros m left join auth.users u on u.id = m.user_id
     where m.negocio_id = p_negocio_id
     order by m.rol, u.email;
end;
$$;

-- El usuario ya debe existir en Authentication (la ruta api/crear-usuario lo crea; llega en el paso 2b)
create or replace function agregar_miembro(p_negocio_id uuid, p_email text, p_rol text, p_nombre text default null)
returns void
language plpgsql security definer set search_path = public
as $$
declare v_user uuid;
begin
  if not es_dueno(p_negocio_id) then raise exception 'No autorizado'; end if;
  if p_rol not in ('dueno', 'cajero') then raise exception 'Rol no válido'; end if;
  select id into v_user from auth.users where lower(email) = lower(trim(p_email));
  if v_user is null then raise exception 'No existe un usuario con ese correo'; end if;
  insert into negocio_miembros (negocio_id, user_id, rol, nombre, activo)
  values (p_negocio_id, v_user, p_rol, nullif(trim(coalesce(p_nombre, '')), ''), true)
  on conflict (negocio_id, user_id)
  do update set rol = excluded.rol, nombre = coalesce(excluded.nombre, negocio_miembros.nombre), activo = true;
end;
$$;

create or replace function quitar_miembro(p_negocio_id uuid, p_user_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not es_dueno(p_negocio_id) then raise exception 'No autorizado'; end if;
  if p_user_id = auth.uid() then raise exception 'No puedes quitarte a ti mismo'; end if;
  delete from negocio_miembros where negocio_id = p_negocio_id and user_id = p_user_id;
  if not found then raise exception 'Miembro no encontrado'; end if;
end;
$$;

-- ---------- Accesos (entradas al panel, soporte incluido) ----------
create or replace function registrar_acceso(p_negocio_id uuid, p_detalle text default null)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_claims jsonb := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
  v_uid uuid := auth.uid();
  v_rol text := mi_rol(p_negocio_id);
begin
  if v_uid is null or v_rol is null then return; end if;
  if exists (select 1 from accesos where negocio_id = p_negocio_id and usuario = v_uid
                and evento = 'entrada' and fecha > now() - interval '30 minutes') then
    return;
  end if;
  insert into accesos (negocio_id, usuario, correo, rol, evento, detalle, visto)
  values (p_negocio_id, v_uid, v_claims->>'email', v_rol, 'entrada', left(p_detalle, 200), v_rol <> 'soporte');
end;
$$;

-- Avisos de entradas de soporte que el dueño todavía no vio
create or replace function accesos_pendientes(p_negocio_id uuid)
returns table (id bigint, fecha timestamptz, correo text, detalle text)
language plpgsql stable security definer set search_path = public
as $$
begin
  if not es_dueno(p_negocio_id) then raise exception 'No autorizado'; end if;
  return query select a.id, a.fecha, a.correo, a.detalle from accesos a
                where a.negocio_id = p_negocio_id and a.rol = 'soporte' and not a.visto order by a.fecha desc;
end;
$$;

create or replace function marcar_accesos_vistos(p_negocio_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not es_dueno(p_negocio_id) then raise exception 'No autorizado'; end if;
  update accesos set visto = true where negocio_id = p_negocio_id and rol = 'soporte' and not visto;
end;
$$;

-- ---------- Funciones públicas (anon), siempre por slug ----------
-- Devuelve el id del negocio solo si existe, está activo y tiene el módulo; si no, el mismo error.
create or replace function _negocio_publico_id(p_slug text, p_modulo text) returns uuid
language plpgsql stable security definer set search_path = public
as $$
declare v_id uuid;
begin
  select n.id into v_id from negocios n
   where n.slug = lower(coalesce(p_slug, '')) and n.estado = 'activo'
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
    'slug', n.slug, 'tipo', n.tipo,
    'nombre', c.nombre_comercial, 'eslogan', c.eslogan, 'logo', c.logo_path, 'icono', c.icono_path,
    'color_principal', c.color_principal, 'color_secundario', c.color_secundario, 'color_acento', c.color_acento,
    'nit', c.nit, 'razon_social', c.razon_social, 'direccion', c.direccion, 'ciudad', c.ciudad,
    'telefono', c.telefono, 'email', c.email, 'web', c.web, 'whatsapp', c.whatsapp,
    'instagram', c.instagram, 'facebook', c.facebook, 'tiktok', c.tiktok, 'horario', c.horario,
    'maps_url', c.maps_url, 'correo_datos', c.correo_datos,
    'domicilio_costo', r.domicilio_costo, 'envio_gratis_desde', r.envio_gratis_desde,
    'zona_domicilio', r.zona_domicilio, 'formas_pago_tienda', r.formas_pago_tienda,
    'domicilio_costo_ropa', r.domicilio_costo_ropa, 'envio_gratis_desde_ropa', r.envio_gratis_desde_ropa,
    'modulos', coalesce((select jsonb_agg(m.modulo order by m.modulo) from negocio_modulos m
                          where m.negocio_id = n.id and m.activo), '[]'::jsonb))
    from negocios n
    join negocio_config c on c.negocio_id = n.id
    join negocio_reglas r on r.negocio_id = n.id
   where n.slug = lower(coalesce(p_slug, '')) and n.estado = 'activo'
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
   where n.slug = lower(coalesce(p_slug, '')) and n.estado = 'activo'
     and exists (select 1 from negocio_modulos m where m.negocio_id = n.id and m.modulo = 'catalogo_publico' and m.activo);
  if v_id is null then return; end if;
  -- tope diario por negocio y catálogo contra datos inventados
  if (select count(*) from visitas where negocio_id = v_id and dia = v_dia and catalogo = p_catalogo) >= 20000 then return; end if;
  insert into visitas (negocio_id, dia, catalogo, visitante) values (v_id, v_dia, p_catalogo, p_visitante)
  on conflict do nothing;
end;
$$;

-- Parte común: anuncios, ofertas y promociones vigentes de un negocio
create or replace function _publicidad_vigente(p_negocio_id uuid, p_ropa boolean)
returns jsonb
language sql stable security definer set search_path = public
as $$
  select jsonb_build_object(
    'anuncios', coalesce((select jsonb_agg(to_jsonb(a) order by a.creado_en desc) from (
        select id, catalogo, titulo, texto, imagen, boton_texto, boton_enlace, frecuencia, hasta, creado_en, segundos
          from anuncios
         where negocio_id = p_negocio_id and activa and catalogo in (case when p_ropa then 'ropa' else 'tienda' end, 'ambos')
           and (desde is null or desde <= hoy_colombia()) and (hasta is null or hasta >= hoy_colombia())) a), '[]'::jsonb),
    'ofertas', coalesce((select jsonb_agg(to_jsonb(o) order by o.hasta nulls last) from (
        select id, catalogo, titulo, detalle, etiqueta, imagen, hasta
          from ofertas
         where negocio_id = p_negocio_id and activa and catalogo in (case when p_ropa then 'ropa' else 'tienda' end, 'ambos')
           and (desde is null or desde <= hoy_colombia()) and (hasta is null or hasta >= hoy_colombia())) o), '[]'::jsonb),
    'promociones', coalesce((select jsonb_agg(to_jsonb(p)) from (
        select id, nombre, tipo, valor, lleva, paga, producto_id, categoria, prenda_id, categoria_ropa, genero
          from promociones
         where negocio_id = p_negocio_id and activa and desde <= hoy_colombia() and (hasta is null or hasta >= hoy_colombia())
           and (case when p_ropa then (prenda_id is not null or categoria_ropa is not null or genero is not null)
                     else (producto_id is not null or categoria is not null) end)) p), '[]'::jsonb))
$$;

create or replace function catalogo_tienda(p_slug text)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare v_id uuid := _negocio_publico_id(p_slug, 'catalogo_publico');
begin
  perform exigir_modulo(v_id, 'productos');
  return jsonb_build_object(
    'productos', coalesce((select jsonb_agg(to_jsonb(x) order by x.nombre) from (
        select id, nombre, descripcion, categoria, precio_venta, unidad, imagenes, stock > 0 as disponible, creado_en
          from productos where negocio_id = v_id and activo and publicado and precio_venta > 0) x), '[]'::jsonb),
    'mas_vendidos', coalesce((select jsonb_agg(t.producto_id order by t.total desc) from (
        select vi.producto_id, sum(vi.cantidad) as total
          from venta_items vi
          join ventas v on v.negocio_id = vi.negocio_id and v.id = vi.venta_id
          join productos p on p.negocio_id = vi.negocio_id and p.id = vi.producto_id
         where vi.negocio_id = v_id and not v.anulada and v.fecha >= now() - interval '30 days'
           and p.activo and p.publicado and p.precio_venta > 0 and p.stock > 0
         group by vi.producto_id order by total desc limit 8) t), '[]'::jsonb)
  ) || _publicidad_vigente(v_id, false);
end;
$$;

create or replace function catalogo_ropa(p_slug text)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare v_id uuid := _negocio_publico_id(p_slug, 'catalogo_publico');
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

-- ---------- Inventario ----------
-- Corre con los permisos de quien llama (security invoker): el RLS decide si puede.
create or replace function ajustar_stock(p_negocio_id uuid, p_producto_id uuid, p_stock_real numeric, p_motivo text default null)
returns void
language plpgsql
as $$
declare prod productos%rowtype;
begin
  if not es_personal(p_negocio_id) then raise exception 'No autorizado'; end if;
  perform exigir_modulo(p_negocio_id, 'productos');
  select * into prod from productos where negocio_id = p_negocio_id and id = p_producto_id for update;
  if not found then raise exception 'Producto no encontrado'; end if;

  insert into ajustes_inventario (negocio_id, producto_id, stock_anterior, stock_nuevo, motivo)
  values (p_negocio_id, prod.id, prod.stock, p_stock_real, nullif(trim(coalesce(p_motivo, '')), ''));

  update productos set stock = p_stock_real where negocio_id = p_negocio_id and id = prod.id;
end;
$$;
