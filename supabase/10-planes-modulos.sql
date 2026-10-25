-- ============================================================
-- Plataforma multi-negocio — 10: planes, módulos, publicación e invitaciones   (etapa C1, parte 1)
-- Se corre DESPUÉS de 01 a 08 (y de 09 si ya lo corriste). Es aditivo e idempotente: se puede volver a correr.
--
-- Qué agrega
--   · 14 módulos nuevos (domicilio por km, mis pedidos, opiniones, menú del día, avisos, música, video,
--     resumen semanal, carga masiva, catálogo maestro, directorio, domiciliarios, creador de logo, logo personalizado)
--   · planes (paquete de módulos + límites) con precios como DATOS editables; precio "fundador" para el piloto
--   · negocios.plan, negocios.publicada (nace en false), módulos con origen (base / plan / extra)
--   · límite de productos por plan y cupo mensual de cálculos de domicilio por km (el mapa gratis es compartido)
--   · invitaciones: crear_negocio ya no falla si el dueño aún no entró; queda invitado y reclama al entrar con Google
-- Qué NO toca: ninguna tabla ni función de negocio existente (ventas, fiados, préstamos...).
-- ============================================================

-- ---------- Módulos nuevos ----------
insert into modulos (clave, nombre, depende_de) values
  ('domicilio_km',       'Domicilio por kilómetros',                  '{pedidos_en_linea}'),
  ('mis_pedidos',        'Mis pedidos y seguimiento',                 '{pedidos_en_linea}'),
  ('opiniones',          'Opiniones de clientes',                     '{catalogo_publico}'),
  ('menu_del_dia',       'Menú del día',                              '{catalogo_publico,productos}'),
  ('avisos_push',        'Avisos al celular (push)',                  '{catalogo_publico}'),
  ('musica_fondo',       'Música de fondo',                           '{catalogo_publico}'),
  ('anuncios_video',     'Anuncios con video',                        '{publicidad}'),
  ('resumen_semanal',    'Resumen semanal',                           '{}'),
  ('carga_masiva',       'Carga masiva de productos',                 '{productos}'),
  ('catalogo_maestro',   'Catálogo maestro por código de barras',     '{productos}'),
  ('directorio_red',     'Directorio de la red de tiendas',           '{catalogo_publico}'),
  ('domiciliarios',      'Domiciliarios de la red',                   '{pedidos_en_linea}'),
  ('creador_logo',       'Creador de logo',                           '{}'),
  ('logo_personalizado', 'Servicio de logo personalizado',            '{}')
on conflict (clave) do nothing;

-- ---------- Planes (los precios y límites son DATOS: se cambian con un update, no con código) ----------
create table if not exists planes (
  clave               text primary key check (clave ~ '^[a-z_]{2,30}$'),
  nombre              text not null,
  descripcion         text,
  precio_mensual      numeric not null default 0 check (precio_mensual >= 0),
  precio_fundador     numeric check (precio_fundador is null or precio_fundador >= 0),   -- precio del piloto
  meses_fundador      integer not null default 6 check (meses_fundador between 0 and 36),
  max_productos       integer check (max_productos is null or max_productos > 0),         -- null = sin tope
  max_calculos_km_mes integer check (max_calculos_km_mes is null or max_calculos_km_mes >= 0), -- null = sin tope
  orden               integer not null default 0,
  activo              boolean not null default true
);

create table if not exists plan_modulos (
  plan   text not null references planes(clave) on delete cascade,
  modulo text not null references modulos(clave),
  primary key (plan, modulo)
);

-- Los módulos de catálogo (productos, ropa, repuestos) salen del TIPO de tienda, no del plan.
-- Valores de ARRANQUE (borrador): si ya existen, no se pisan.
insert into planes (clave, nombre, descripcion, precio_mensual, precio_fundador, meses_fundador, max_productos, max_calculos_km_mes, orden) values
  ('vitrina',  'Vitrina',  'Tu catálogo en línea con pedidos por WhatsApp',                0,     null,  6, 200,  150,   10),
  ('tienda',   'Tienda',   'Vitrina más Mis pedidos, avisos, directorio y catálogo maestro', 29900, 19900, 6, 1000, 1500,  20),
  ('gestion',  'Gestión',  'Tienda más caja, inventario, fiados y reportes',               59900, 39900, 6, 3000, 4000,  30),
  ('completo', 'Completo', 'Todo: Gestión más préstamos, opiniones, menú del día, video, música y resumen semanal', 89900, 59900, 6, null, 10000, 40)
on conflict (clave) do nothing;

insert into plan_modulos (plan, modulo)
select p, m from (values
  ('vitrina','catalogo_publico'), ('vitrina','pedidos_en_linea'), ('vitrina','domicilio_km'),
  ('vitrina','carga_masiva'), ('vitrina','creador_logo'),

  ('tienda','catalogo_publico'), ('tienda','pedidos_en_linea'), ('tienda','domicilio_km'),
  ('tienda','carga_masiva'), ('tienda','creador_logo'),
  ('tienda','mis_pedidos'), ('tienda','avisos_push'), ('tienda','directorio_red'),
  ('tienda','catalogo_maestro'), ('tienda','publicidad'),

  ('gestion','catalogo_publico'), ('gestion','pedidos_en_linea'), ('gestion','domicilio_km'),
  ('gestion','carga_masiva'), ('gestion','creador_logo'),
  ('gestion','mis_pedidos'), ('gestion','avisos_push'), ('gestion','directorio_red'),
  ('gestion','catalogo_maestro'), ('gestion','publicidad'),
  ('gestion','caja'), ('gestion','fiados'), ('gestion','compras'), ('gestion','reportes'),
  ('gestion','domicilios'), ('gestion','escaner'),

  ('completo','catalogo_publico'), ('completo','pedidos_en_linea'), ('completo','domicilio_km'),
  ('completo','carga_masiva'), ('completo','creador_logo'),
  ('completo','mis_pedidos'), ('completo','avisos_push'), ('completo','directorio_red'),
  ('completo','catalogo_maestro'), ('completo','publicidad'),
  ('completo','caja'), ('completo','fiados'), ('completo','compras'), ('completo','reportes'),
  ('completo','domicilios'), ('completo','escaner'),
  ('completo','prestamos'), ('completo','opiniones'), ('completo','menu_del_dia'),
  ('completo','anuncios_video'), ('completo','musica_fondo'), ('completo','resumen_semanal')
) as x(p, m)
on conflict do nothing;

alter table planes       enable row level security;
alter table plan_modulos enable row level security;
drop policy if exists planes_sel       on planes;
drop policy if exists plan_modulos_sel on plan_modulos;
create policy planes_sel       on planes       for select to authenticated using (activo);
create policy plan_modulos_sel on plan_modulos for select to authenticated using (true);

-- ---------- Columnas nuevas en negocios (solo la plataforma las cambia: negocios no tiene política de update) ----------
do $$
begin
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'negocios' and column_name = 'plan') then
    alter table negocios add column plan text references planes(clave);
    update negocios set plan = 'completo';                    -- los negocios que ya existen conservan todo
    alter table negocios alter column plan set default 'vitrina';
    alter table negocios alter column plan set not null;
  end if;
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'negocios' and column_name = 'publicada') then
    alter table negocios add column publicada boolean not null default true;   -- los que ya existen siguen visibles
    alter table negocios alter column publicada set default false;             -- los nuevos nacen sin publicar
  end if;
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'negocios' and column_name = 'fundador') then
    alter table negocios add column fundador boolean not null default false;
    alter table negocios add column fundador_desde date;
    alter table negocios add column max_productos_override integer check (max_productos_override is null or max_productos_override > 0);
  end if;
end $$;

-- ---------- negocio_modulos.origen: base (del tipo) · plan (del paquete) · extra (sumado suelto) ----------
do $$
begin
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'negocio_modulos' and column_name = 'origen') then
    alter table negocio_modulos add column origen text not null default 'plan' check (origen in ('base', 'plan', 'extra'));
    update negocio_modulos nm set origen = case
        when nm.modulo = any (case n.tipo when 'tienda' then array['productos'] when 'ropa' then array['ropa']
                                          when 'repuestos' then array['productos','repuestos'] when 'mixto' then array['productos','ropa'] end) then 'base'
        when exists (select 1 from plan_modulos pm where pm.plan = n.plan and pm.modulo = nm.modulo) then 'plan'
        else 'extra' end
      from negocios n where n.id = nm.negocio_id;
  end if;
end $$;

-- ---------- Uso y cupos ----------
create table if not exists uso_mensual (            -- por negocio y mes (cálculos de domicilio por km, etc.)
  negocio_id uuid not null references negocios(id),
  mes        date not null,
  concepto   text not null check (concepto ~ '^[a-z_]{2,40}$'),
  cantidad   integer not null default 0 check (cantidad >= 0),
  primary key (negocio_id, mes, concepto)
);
create table if not exists plataforma_limites (     -- cupos globales (el mapa gratis es compartido entre todas las tiendas)
  concepto text primary key check (concepto ~ '^[a-z_]{2,40}$'),
  max_dia  integer not null check (max_dia >= 0)
);
create table if not exists uso_plataforma (
  dia      date not null,
  concepto text not null,
  cantidad integer not null default 0,
  primary key (dia, concepto)
);
-- VERIFICA la cuota vigente de OpenRouteService en su página antes de salir; este número es de arranque.
insert into plataforma_limites (concepto, max_dia) values ('ors_calculos_km', 1500) on conflict (concepto) do nothing;

-- ---------- Invitaciones (registro solo por invitación) ----------
create table if not exists invitaciones (
  negocio_id uuid not null references negocios(id),
  email      text not null check (email = lower(email) and char_length(email) <= 120),
  rol        text not null check (rol in ('dueno', 'cajero')),
  creada_en  timestamptz not null default now(),
  vence_en   timestamptz not null default now() + interval '30 days',
  usada_en   timestamptz,
  usada_por  uuid,
  primary key (negocio_id, email)
);

-- ---------- Ayuda interna: candados estándar para una tabla nueva con negocio_id ----------
create or replace function _triggers_tabla(t text, con_candado boolean default true) returns void
language plpgsql as $$
begin
  if con_candado then
    execute format('drop trigger if exists aaa_solo_lectura on %I', t);
    execute format('create trigger aaa_solo_lectura before insert or update or delete on %I
                    for each row execute function bloquear_soporte()', t);
  end if;
  execute format('drop trigger if exists bbb_negocio_inmutable on %I', t);
  execute format('create trigger bbb_negocio_inmutable before update on %I
                  for each row execute function negocio_id_inmutable()', t);
end;
$$;

select _aplicar_politicas('uso_mensual',  'd', null, null, null);
select _aplicar_politicas('invitaciones', 'd', null, null, null);   -- se manejan con funciones
select _triggers_tabla('uso_mensual',  false);
select _triggers_tabla('invitaciones', true);
alter table plataforma_limites enable row level security;
alter table uso_plataforma     enable row level security;

-- ---------- Módulos base por tipo de tienda (el resto viene del plan) ----------
create or replace function _plantilla_modulos(p_tipo text) returns text[]
language sql immutable as $$
  select case p_tipo
    when 'tienda'    then array['productos']
    when 'ropa'      then array['ropa']
    when 'repuestos' then array['productos','repuestos']
    when 'mixto'     then array['productos','ropa']
  end
$$;

-- Deja los módulos del negocio = base del tipo + módulos del plan (cuyas dependencias se cumplan) + extras ya activos.
create or replace function _sincronizar_plan(p_negocio_id uuid) returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_tipo text; v_plan text; v_base text[]; v_set text[]; v_cambio boolean; r record; m text;
begin
  select tipo, plan into v_tipo, v_plan from negocios where id = p_negocio_id;
  if v_tipo is null then raise exception 'Negocio no encontrado'; end if;
  v_base := _plantilla_modulos(v_tipo);
  v_set  := v_base || coalesce((select array_agg(modulo) from negocio_modulos
                                 where negocio_id = p_negocio_id and activo and origen = 'extra' and not (modulo = any (v_base))), '{}');
  loop
    v_cambio := false;
    for r in select pm.modulo, mo.depende_de from plan_modulos pm join modulos mo on mo.clave = pm.modulo
              where pm.plan = v_plan and not (pm.modulo = any (v_set)) loop
      if r.depende_de <@ v_set then v_set := v_set || r.modulo; v_cambio := true; end if;
    end loop;
    exit when not v_cambio;
  end loop;

  -- un módulo extra no puede quedarse sin lo que necesita
  for r in select mo.clave as modulo, dd.dep from modulos mo, unnest(mo.depende_de) as dd(dep)
            where mo.clave = any (v_set) and not (dd.dep = any (v_set)) loop
    raise exception 'No se puede dejar el módulo "%" sin "%"', r.modulo, r.dep;
  end loop;

  foreach m in array v_set loop
    insert into negocio_modulos (negocio_id, modulo, activo, origen)
    values (p_negocio_id, m, true,
            case when m = any (v_base) then 'base'
                 when exists (select 1 from plan_modulos where plan = v_plan and modulo = m) then 'plan'
                 else 'extra' end)
    on conflict (negocio_id, modulo) do update
      set activo = true,
          origen = case when negocio_modulos.origen = 'extra' and excluded.origen <> 'base' then 'extra' else excluded.origen end;
  end loop;
  update negocio_modulos set activo = false
   where negocio_id = p_negocio_id and activo and not (modulo = any (v_set));
end;
$$;

-- ---------- Alta de negocios (solo consola). Cambia la firma: ahora lleva el plan (por defecto, Vitrina) ----------
drop function if exists crear_negocio(text, text, text, text);
create or replace function crear_negocio(p_slug text, p_nombre text, p_tipo text, p_email_dueno text, p_plan text default 'vitrina')
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_id uuid; v_dueno uuid; v_email text := lower(trim(coalesce(p_email_dueno, ''))); v_pendiente boolean := false;
begin
  if auth.uid() is not null then
    raise exception 'Los negocios se crean solo desde la consola de la plataforma';
  end if;
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

-- ---------- Módulos y planes: solo la consola de la plataforma ----------
create or replace function activar_modulo(p_negocio_id uuid, p_modulo text, p_activo boolean)
returns void
language plpgsql security definer set search_path = public
as $$
declare v_dep text; v_dependiente text; v_tipo text; v_plan text;
begin
  if auth.uid() is not null then
    raise exception 'Los módulos se cambian solo desde la consola de la plataforma';
  end if;
  select tipo, plan into v_tipo, v_plan from negocios where id = p_negocio_id;
  if v_tipo is null then raise exception 'Negocio no encontrado'; end if;
  if not exists (select 1 from modulos where clave = p_modulo) then raise exception 'Módulo no válido: %', p_modulo; end if;

  if p_activo then
    for v_dep in select unnest(depende_de) from modulos where clave = p_modulo loop
      if not modulo_activo(p_negocio_id, v_dep) then
        raise exception 'Para activar "%" hay que activar antes "%"', p_modulo, v_dep;
      end if;
    end loop;
    insert into negocio_modulos (negocio_id, modulo, activo, origen)
    values (p_negocio_id, p_modulo, true,
            case when p_modulo = any (_plantilla_modulos(v_tipo)) then 'base'
                 when exists (select 1 from plan_modulos where plan = v_plan and modulo = p_modulo) then 'plan'
                 else 'extra' end)
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

create or replace function activar_plan(p_negocio_id uuid, p_plan text) returns void
language plpgsql security definer set search_path = public
as $$
begin
  if auth.uid() is not null then
    raise exception 'Los planes se cambian solo desde la consola de la plataforma';
  end if;
  if not exists (select 1 from negocios where id = p_negocio_id) then raise exception 'Negocio no encontrado'; end if;
  if not exists (select 1 from planes where clave = p_plan and activo) then raise exception 'Plan no válido: %', p_plan; end if;
  update negocios set plan = p_plan where id = p_negocio_id;
  perform _sincronizar_plan(p_negocio_id);   -- si algo no cuadra, se revierte todo (incluido el cambio de plan)
end;
$$;

-- Publicar = que el público (y los pedidos) puedan ver la tienda. Antes, solo el personal y el soporte la ven (vista previa).
create or replace function publicar_negocio(p_negocio_id uuid, p_publicada boolean) returns void
language plpgsql security definer set search_path = public
as $$
begin
  if auth.uid() is not null then
    raise exception 'La publicación se cambia solo desde la consola de la plataforma';
  end if;
  if not exists (select 1 from negocios where id = p_negocio_id) then raise exception 'Negocio no encontrado'; end if;
  if p_publicada then
    if not modulo_activo(p_negocio_id, 'catalogo_publico') then
      raise exception 'No se puede publicar: el módulo de catálogo público no está activo';
    end if;
    if length(regexp_replace(coalesce((select whatsapp from negocio_config where negocio_id = p_negocio_id), ''), '\D', '', 'g')) < 10 then
      raise exception 'No se puede publicar: falta el WhatsApp de la tienda (los pedidos salen por ahí)';
    end if;
  end if;
  update negocios set publicada = p_publicada where id = p_negocio_id;
end;
$$;

create or replace function asignar_fundador(p_negocio_id uuid, p_fundador boolean default true, p_desde date default null) returns void
language plpgsql security definer set search_path = public
as $$
begin
  if auth.uid() is not null then
    raise exception 'El precio fundador se cambia solo desde la consola de la plataforma';
  end if;
  update negocios set fundador = p_fundador, fundador_desde = case when p_fundador then coalesce(p_desde, hoy_colombia()) end
   where id = p_negocio_id;
  if not found then raise exception 'Negocio no encontrado'; end if;
end;
$$;

-- ---------- Límite de productos por plan (lo verifica el servidor, también en la carga masiva) ----------
create or replace function limite_productos(p_negocio_id uuid) returns integer
language sql stable security definer set search_path = public
as $$
  select coalesce(n.max_productos_override, p.max_productos)
    from negocios n join planes p on p.clave = n.plan where n.id = p_negocio_id
$$;

create or replace function validar_limite_productos() returns trigger
language plpgsql security definer set search_path = public
as $$
declare v_lim integer; v_n integer;
begin
  if not new.activo then return new; end if;
  if tg_op = 'UPDATE' then
    if old.activo then return new; end if;                          -- solo cuenta al crear o al reactivar
  end if;
  v_lim := limite_productos(new.negocio_id);
  if v_lim is null then return new; end if;
  select count(*) into v_n from productos where negocio_id = new.negocio_id and activo;
  if v_n >= v_lim then
    raise exception 'Tu plan permite hasta % productos activos. Pásate a un plan mayor o desactiva alguno.', v_lim;
  end if;
  return new;
end;
$$;
drop trigger if exists ddd_limite_productos on productos;
create trigger ddd_limite_productos before insert or update of activo on productos
  for each row execute function validar_limite_productos();

-- ---------- Cupo mensual de cálculos de domicilio por km ----------
-- La usará calcular_domicilio (etapa C3). false = sin cupo: se usa la tarifa fija y el pedido NO se bloquea.
create or replace function _consumir_cuota_km(p_negocio_id uuid) returns boolean
language plpgsql security definer set search_path = public
as $$
declare
  v_mes date := date_trunc('month', hoy_colombia())::date; v_dia date := hoy_colombia();
  v_tope integer; v_glob integer; v_uso_neg integer; v_uso_glob integer;
begin
  select p.max_calculos_km_mes into v_tope from negocios n join planes p on p.clave = n.plan where n.id = p_negocio_id;
  select max_dia into v_glob from plataforma_limites where concepto = 'ors_calculos_km';
  v_uso_neg  := coalesce((select cantidad from uso_mensual where negocio_id = p_negocio_id and mes = v_mes and concepto = 'calculo_km'), 0);
  v_uso_glob := coalesce((select cantidad from uso_plataforma where dia = v_dia and concepto = 'ors_calculos_km'), 0);
  if v_tope is not null and v_uso_neg >= v_tope then return false; end if;
  if v_glob is not null and v_uso_glob >= v_glob then return false; end if;
  insert into uso_mensual as u (negocio_id, mes, concepto, cantidad) values (p_negocio_id, v_mes, 'calculo_km', 1)
  on conflict (negocio_id, mes, concepto) do update set cantidad = u.cantidad + 1;
  insert into uso_plataforma as u (dia, concepto, cantidad) values (v_dia, 'ors_calculos_km', 1)
  on conflict (dia, concepto) do update set cantidad = u.cantidad + 1;
  return true;
end;
$$;

-- ---------- Mi plan (para el panel del dueño; el soporte también lo lee) ----------
create or replace function mi_plan(p_negocio_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare n negocios%rowtype; p planes%rowtype; v_fin date;
begin
  if not (es_dueno(p_negocio_id) or es_soporte(p_negocio_id)) then raise exception 'No autorizado'; end if;
  select * into n from negocios where id = p_negocio_id;
  select * into p from planes where clave = n.plan;
  if n.fundador and n.fundador_desde is not null and p.precio_fundador is not null then
    v_fin := (n.fundador_desde + make_interval(months => p.meses_fundador))::date;
  end if;
  return jsonb_build_object(
    'plan', p.clave, 'nombre', p.nombre, 'publicada', n.publicada,
    'precio_mensual', p.precio_mensual,
    'precio_vigente', case when v_fin is not null and hoy_colombia() < v_fin then p.precio_fundador else p.precio_mensual end,
    'fundador_hasta', v_fin,
    'max_productos', coalesce(n.max_productos_override, p.max_productos),
    'productos_activos', (select count(*) from productos where negocio_id = p_negocio_id and activo),
    'max_calculos_km_mes', p.max_calculos_km_mes,
    'calculos_km_mes', coalesce((select cantidad from uso_mensual where negocio_id = p_negocio_id
                                   and mes = date_trunc('month', hoy_colombia())::date and concepto = 'calculo_km'), 0),
    'modulos', coalesce((select jsonb_agg(jsonb_build_object('modulo', nm.modulo, 'nombre', mo.nombre, 'origen', nm.origen) order by nm.modulo)
                           from negocio_modulos nm join modulos mo on mo.clave = nm.modulo
                          where nm.negocio_id = p_negocio_id and nm.activo), '[]'::jsonb));
end;
$$;

-- ---------- Invitaciones ----------
-- El dueño suma a alguien a su equipo: si ya tiene cuenta lo agrega; si no, queda invitado.
create or replace function invitar_miembro(p_negocio_id uuid, p_email text, p_rol text, p_nombre text default null)
returns text
language plpgsql security definer set search_path = public
as $$
declare v_email text := lower(trim(coalesce(p_email, '')));
begin
  if not es_dueno(p_negocio_id) then raise exception 'No autorizado'; end if;
  if p_rol not in ('dueno', 'cajero') then raise exception 'Rol no válido'; end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or length(v_email) > 120 then raise exception 'El correo no es válido'; end if;
  if exists (select 1 from auth.users where lower(email) = v_email) then
    perform agregar_miembro(p_negocio_id, v_email, p_rol, p_nombre);
    return 'agregado';
  end if;
  if (select count(*) from invitaciones where negocio_id = p_negocio_id and usada_en is null and vence_en > now()) >= 20 then
    raise exception 'Hay demasiadas invitaciones pendientes';
  end if;
  insert into invitaciones (negocio_id, email, rol) values (p_negocio_id, v_email, p_rol)
  on conflict (negocio_id, email) do update
    set rol = excluded.rol, creada_en = now(), vence_en = now() + interval '30 days', usada_en = null, usada_por = null;
  return 'invitado';
end;
$$;

-- Se llama al entrar con Google: convierte las invitaciones del correo (verificado) en membresías.
create or replace function reclamar_invitaciones() returns integer
language plpgsql security definer set search_path = public
as $$
declare v_uid uuid := auth.uid(); v_email text; v_n integer := 0; r record;
begin
  if v_uid is null then return 0; end if;
  if exists (select 1 from plataforma_admins where user_id = v_uid) then return 0; end if;
  select lower(email) into v_email from auth.users where id = v_uid and email_confirmed_at is not null;
  if v_email is null then return 0; end if;
  for r in select i.negocio_id, i.rol from invitaciones i join negocios n on n.id = i.negocio_id
            where i.email = v_email and i.usada_en is null and i.vence_en > now() and n.estado = 'activo' loop
    insert into negocio_miembros (negocio_id, user_id, rol) values (r.negocio_id, v_uid, r.rol)
    on conflict (negocio_id, user_id) do update set activo = true;
    update invitaciones set usada_en = now(), usada_por = v_uid where negocio_id = r.negocio_id and email = v_email;
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$$;

-- ---------- Permisos (las funciones nuevas nacen abiertas a PUBLIC: se cierran a mano) ----------
revoke all on table planes, plan_modulos, uso_mensual, plataforma_limites, uso_plataforma, invitaciones from public, anon, authenticated;
grant select on planes, plan_modulos, uso_mensual, invitaciones to authenticated;
grant all on all tables in schema public to service_role;

revoke all on function _triggers_tabla(text, boolean), _plantilla_modulos(text), _sincronizar_plan(uuid),
                       limite_productos(uuid), validar_limite_productos(), _consumir_cuota_km(uuid) from public, anon, authenticated;
revoke all on function crear_negocio(text, text, text, text, text), activar_modulo(uuid, text, boolean), activar_plan(uuid, text),
                       publicar_negocio(uuid, boolean), asignar_fundador(uuid, boolean, date) from public, anon, authenticated;
grant execute on function crear_negocio(text, text, text, text, text), activar_modulo(uuid, text, boolean), activar_plan(uuid, text),
                          publicar_negocio(uuid, boolean), asignar_fundador(uuid, boolean, date) to service_role;
revoke all on function mi_plan(uuid), invitar_miembro(uuid, text, text, text), reclamar_invitaciones() from public, anon;
grant execute on function mi_plan(uuid), invitar_miembro(uuid, text, text, text), reclamar_invitaciones() to authenticated;

-- ---------- VERIFICACIÓN: las 7 filas deben decir ok = true ----------
select chequeo, ok from (
  select 1 as n, 'Hay 4 planes y 14 módulos nuevos (27 módulos en total)' as chequeo,
         ((select count(*) from planes) >= 4 and (select count(*) from modulos) >= 27) as ok
  union all select 2, 'Cada módulo de un plan trae sus dependencias (salvo los de catálogo, que vienen del tipo de tienda)',
         not exists (select 1 from plan_modulos pm join modulos m on m.clave = pm.modulo
                       cross join lateral unnest(m.depende_de) as dd(dep)
                      where dd.dep <> all (array['productos','ropa','repuestos'])
                        and not exists (select 1 from plan_modulos x where x.plan = pm.plan and x.modulo = dd.dep))
  union all select 3, 'Todos los negocios existentes tienen plan y siguen con sus módulos activos',
         not exists (select 1 from negocios where plan is null) and (select count(*) from negocio_modulos where activo) >= (select count(*) from negocios)
  union all select 4, 'crear_negocio quedó con una sola firma (5 parámetros)',
         (select count(*) from pg_proc where proname = 'crear_negocio' and pronamespace = 'public'::regnamespace) = 1
  union all select 5, 'Anónimo sigue sin permisos sobre ninguna tabla',
         not exists (select 1 from information_schema.role_table_grants where table_schema = 'public' and grantee = 'anon')
  union all select 6, 'Ninguna función de public es ejecutable por PUBLIC',
         not exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.prokind = 'f'
                       and has_function_privilege('public', p.oid, 'execute') is true
                       and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e'))
  union all select 7, 'Las tablas nuevas tienen RLS activado',
         not exists (select 1 from pg_class where relnamespace = 'public'::regnamespace and relkind = 'r' and not relrowsecurity)
) v order by n;
