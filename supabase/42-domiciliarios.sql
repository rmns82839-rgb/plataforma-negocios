-- ============================================================
-- Plataforma multi-negocio — 42: domiciliarios de la red (etapa 1)
--   · El domiciliario se registra (con su cuenta de Google) y queda PENDIENTE.
--   · Un administrador de la plataforma lo aprueba, rechaza o suspende.
--   · Las tiendas con el módulo «domiciliarios» ven a los aprobados de SU ciudad y asignan uno al pedido.
--   · El celular del domiciliario solo lo ve la tienda a la que se le asignó un pedido.
-- Se corre DESPUÉS del 41. Aditivo e idempotente. No cambia datos de ninguna tienda.
-- ============================================================

-- ---------- 1. Tabla global (sin negocio_id; cerrada con RLS y sin permisos: solo funciones) ----------
create table if not exists domiciliarios (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null unique references auth.users(id) on delete cascade,
  nombre         text not null check (char_length(btrim(nombre)) between 3 and 80),
  telefono       text not null check (telefono ~ '^[0-9]{10}$'),
  ciudad         text not null check (char_length(btrim(ciudad)) between 2 and 60),
  vehiculo       text not null check (vehiculo in ('moto','bicicleta','carro','a_pie')),
  placa          text check (placa is null or char_length(placa) <= 10),
  presentacion   text check (presentacion is null or char_length(presentacion) <= 300),
  estado         text not null default 'pendiente' check (estado in ('pendiente','aprobado','rechazado','suspendido')),
  disponible     boolean not null default false,
  nota_equipo    text check (nota_equipo is null or char_length(nota_equipo) <= 300),
  acepta_datos_en timestamptz not null default now(),
  creado_en      timestamptz not null default now(),
  resuelto_por   uuid,
  resuelto_en    timestamptz
);
create index if not exists domiciliarios_estado_idx on domiciliarios (estado, creado_en desc);
create index if not exists domiciliarios_ciudad_idx on domiciliarios (lower(btrim(ciudad))) where estado = 'aprobado';
alter table domiciliarios enable row level security;
revoke all on table domiciliarios from public, anon, authenticated;
grant all on table domiciliarios to service_role;

-- (pedidos_tienda.domiciliario_id no lleva llave foránea: la plataforma exige que toda llave entre tablas incluya negocio_id,
--  y domiciliarios es global. Lo valida asignar_domiciliario y domiciliario_del_pedido solo muestra a un aprobado.)

-- Solo la función asignar_domiciliario puede cambiar quién lleva el pedido
create or replace function proteger_domiciliario_pedido() returns trigger
language plpgsql as $$
begin
  if new.domiciliario_id is distinct from old.domiciliario_id and coalesce(current_setting('app.asigna', true), '') <> 'si' then
    raise exception 'El domiciliario se asigna desde la lista de domiciliarios';
  end if;
  return new;
end;
$$;
drop trigger if exists ccc_proteger_domiciliario on pedidos_tienda;
create trigger ccc_proteger_domiciliario before update on pedidos_tienda for each row execute function proteger_domiciliario_pedido();

-- ---------- 2. El domiciliario ----------
create or replace function registrar_domiciliario(p jsonb) returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid(); v_id uuid; v_est text;
  v_nombre text := btrim(coalesce(p->>'nombre', '')); v_tel text := regexp_replace(coalesce(p->>'telefono', ''), '\D', '', 'g');
  v_ciudad text := btrim(coalesce(p->>'ciudad', '')); v_veh text := coalesce(p->>'vehiculo', '');
  v_placa text := nullif(upper(btrim(coalesce(p->>'placa', ''))), ''); v_pres text := nullif(btrim(coalesce(p->>'presentacion', '')), '');
begin
  if v_uid is null then raise exception 'Entra con tu cuenta para registrarte'; end if;
  if p->>'acepta' is distinct from 'true' then raise exception 'Debes aceptar el tratamiento de datos'; end if;
  if char_length(v_nombre) not between 3 and 80 then raise exception 'Escribe tu nombre completo'; end if;
  if v_tel !~ '^[0-9]{10}$' then raise exception 'El celular debe tener 10 números'; end if;
  if char_length(v_ciudad) not between 2 and 60 then raise exception 'Escribe tu ciudad'; end if;
  if v_veh not in ('moto','bicicleta','carro','a_pie') then raise exception 'Elige cómo haces los domicilios'; end if;
  if v_veh in ('moto','carro') and v_placa is null then raise exception 'Escribe la placa del vehículo'; end if;
  if v_placa is not null and char_length(v_placa) > 10 then raise exception 'La placa es muy larga'; end if;
  if v_pres is not null and char_length(v_pres) > 300 then raise exception 'La presentación es muy larga'; end if;
  if soy_administrador_plataforma() then raise exception 'Una cuenta de administrador no puede ser domiciliario'; end if;

  select id, estado into v_id, v_est from domiciliarios where user_id = v_uid;
  if v_id is null then
    insert into domiciliarios (user_id, nombre, telefono, ciudad, vehiculo, placa, presentacion)
    values (v_uid, v_nombre, v_tel, v_ciudad, v_veh, v_placa, v_pres) returning id into v_id;
  elsif v_est = 'rechazado' then
    update domiciliarios set nombre = v_nombre, telefono = v_tel, ciudad = v_ciudad, vehiculo = v_veh, placa = v_placa, presentacion = v_pres,
           estado = 'pendiente', nota_equipo = null, resuelto_por = null, resuelto_en = null, acepta_datos_en = now() where id = v_id;
  else
    raise exception 'Ya tienes un registro (%).', v_est;
  end if;
  return v_id;
end;
$$;

create or replace function mi_domiciliario() returns jsonb
language sql stable security definer set search_path = public
as $$
  select to_jsonb(d) - 'user_id' - 'resuelto_por' from domiciliarios d where d.user_id = auth.uid()
$$;

create or replace function actualizar_mi_domiciliario(p jsonb) returns void
language plpgsql security definer set search_path = public
as $$
declare d domiciliarios; v_tel text; v_veh text; v_placa text; v_pres text; v_ciudad text;
begin
  select * into d from domiciliarios where user_id = auth.uid();
  if d.id is null then raise exception 'No tienes registro de domiciliario'; end if;
  if d.estado in ('rechazado','suspendido') then raise exception 'Tu registro no está activo'; end if;
  v_tel := regexp_replace(coalesce(p->>'telefono', d.telefono), '\D', '', 'g');
  v_veh := coalesce(p->>'vehiculo', d.vehiculo);
  v_placa := case when p ? 'placa' then nullif(upper(btrim(p->>'placa')), '') else d.placa end;
  v_pres := case when p ? 'presentacion' then nullif(btrim(p->>'presentacion'), '') else d.presentacion end;
  v_ciudad := btrim(coalesce(p->>'ciudad', d.ciudad));
  if v_tel !~ '^[0-9]{10}$' then raise exception 'El celular debe tener 10 números'; end if;
  if v_veh not in ('moto','bicicleta','carro','a_pie') then raise exception 'Vehículo no válido'; end if;
  if v_veh in ('moto','carro') and v_placa is null then raise exception 'Escribe la placa del vehículo'; end if;
  update domiciliarios set telefono = v_tel, vehiculo = v_veh, placa = v_placa, presentacion = v_pres, ciudad = v_ciudad where id = d.id;
end;
$$;

create or replace function poner_disponible(p_disponible boolean) returns void
language plpgsql security definer set search_path = public
as $$
begin
  update domiciliarios set disponible = coalesce(p_disponible, false) where user_id = auth.uid() and estado = 'aprobado';
  if not found then raise exception 'Solo un domiciliario aprobado puede cambiar su disponibilidad'; end if;
end;
$$;

-- ---------- 3. Administrador de la plataforma ----------
create or replace function listar_domiciliarios(p_estado text default 'pendiente') returns jsonb
language plpgsql stable security definer set search_path = public
as $$
begin
  if not soy_administrador_plataforma() then raise exception 'Solo un administrador de la plataforma'; end if;
  return coalesce((select jsonb_agg(to_jsonb(d) - 'user_id' || jsonb_build_object('email', u.email) order by d.creado_en desc)
                     from domiciliarios d join auth.users u on u.id = d.user_id
                    where p_estado is null or d.estado = p_estado), '[]'::jsonb);
end;
$$;

create or replace function resolver_domiciliario(p_id uuid, p_accion text, p_nota text default null) returns void
language plpgsql security definer set search_path = public
as $$
declare v_nuevo text; v_actual text;
begin
  if not soy_administrador_plataforma() then raise exception 'Solo un administrador de la plataforma'; end if;
  select estado into v_actual from domiciliarios where id = p_id;
  if v_actual is null then raise exception 'Domiciliario no encontrado'; end if;
  v_nuevo := case p_accion when 'aprobar' then 'aprobado' when 'rechazar' then 'rechazado' when 'suspender' then 'suspendido' when 'reactivar' then 'aprobado' end;
  if v_nuevo is null then raise exception 'Acción no válida'; end if;
  if p_accion = 'aprobar' and v_actual <> 'pendiente' then raise exception 'Solo se aprueba un registro pendiente'; end if;
  if p_accion = 'rechazar' and v_actual <> 'pendiente' then raise exception 'Solo se rechaza un registro pendiente'; end if;
  if p_accion = 'suspender' and v_actual <> 'aprobado' then raise exception 'Solo se suspende a un domiciliario aprobado'; end if;
  if p_accion = 'reactivar' and v_actual <> 'suspendido' then raise exception 'Solo se reactiva a uno suspendido'; end if;
  update domiciliarios set estado = v_nuevo, nota_equipo = left(nullif(btrim(coalesce(p_nota, '')), ''), 300),
         disponible = case when v_nuevo = 'aprobado' then disponible else false end,
         resuelto_por = auth.uid(), resuelto_en = now() where id = p_id;
end;
$$;

-- ---------- 4. La tienda ----------
create or replace function _ciudad_negocio(p_negocio_id uuid) returns text
language sql stable security definer set search_path = public
as $$ select lower(btrim(ciudad)) from negocio_config where negocio_id = p_negocio_id $$;

create or replace function domiciliarios_de_mi_ciudad(p_negocio_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare v_ciudad text;
begin
  if not es_personal(p_negocio_id) then raise exception 'No autorizado'; end if;
  perform exigir_modulo(p_negocio_id, 'domiciliarios');
  v_ciudad := _ciudad_negocio(p_negocio_id);
  if v_ciudad is null or v_ciudad = '' then raise exception 'Primero escribe la ciudad de tu negocio en «Datos del negocio»'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', d.id, 'nombre', d.nombre, 'vehiculo', d.vehiculo, 'ciudad', d.ciudad,
                                                      'disponible', d.disponible, 'presentacion', d.presentacion)
                                    order by d.disponible desc, d.nombre)
                     from domiciliarios d where d.estado = 'aprobado' and lower(btrim(d.ciudad)) = v_ciudad), '[]'::jsonb);
end;
$$;

create or replace function asignar_domiciliario(p_negocio_id uuid, p_pedido_id uuid, p_domiciliario_id uuid) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare v_ped pedidos_tienda; d domiciliarios;
begin
  if not es_personal(p_negocio_id) or es_soporte(p_negocio_id) then raise exception 'No autorizado'; end if;
  perform exigir_modulo(p_negocio_id, 'domiciliarios');
  select * into v_ped from pedidos_tienda where id = p_pedido_id and negocio_id = p_negocio_id;
  if v_ped.id is null then raise exception 'Pedido no encontrado'; end if;
  if v_ped.estado = 'cancelado' or v_ped.seguimiento = 'entregado' then raise exception 'Este pedido ya terminó'; end if;
  if v_ped.entrega = 'recoger' then raise exception 'Este pedido es para recoger en la tienda'; end if;
  perform set_config('app.asigna', 'si', true);
  if p_domiciliario_id is null then
    update pedidos_tienda set domiciliario_id = null where id = p_pedido_id;
    return null;
  end if;
  select * into d from domiciliarios where id = p_domiciliario_id;
  if d.id is null or d.estado <> 'aprobado' then raise exception 'Ese domiciliario no está disponible en la red'; end if;
  if lower(btrim(d.ciudad)) is distinct from _ciudad_negocio(p_negocio_id) then raise exception 'Ese domiciliario es de otra ciudad'; end if;
  update pedidos_tienda set domiciliario_id = d.id where id = p_pedido_id;
  return jsonb_build_object('id', d.id, 'nombre', d.nombre, 'telefono', d.telefono, 'vehiculo', d.vehiculo);
end;
$$;

create or replace function domiciliario_del_pedido(p_negocio_id uuid, p_pedido_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare r jsonb;
begin
  if not es_personal(p_negocio_id) then raise exception 'No autorizado'; end if;
  perform exigir_modulo(p_negocio_id, 'domiciliarios');
  select jsonb_build_object('id', d.id, 'nombre', d.nombre, 'telefono', d.telefono, 'vehiculo', d.vehiculo) into r
    from pedidos_tienda p join domiciliarios d on d.id = p.domiciliario_id
   where p.id = p_pedido_id and p.negocio_id = p_negocio_id and d.estado = 'aprobado';
  return r;
end;
$$;

-- ---------- 5. Permisos ----------
revoke all on function registrar_domiciliario(jsonb), mi_domiciliario(), actualizar_mi_domiciliario(jsonb), poner_disponible(boolean),
  listar_domiciliarios(text), resolver_domiciliario(uuid, text, text), _ciudad_negocio(uuid), domiciliarios_de_mi_ciudad(uuid),
  asignar_domiciliario(uuid, uuid, uuid), domiciliario_del_pedido(uuid, uuid), proteger_domiciliario_pedido() from public, anon, authenticated;
grant execute on function registrar_domiciliario(jsonb), mi_domiciliario(), actualizar_mi_domiciliario(jsonb), poner_disponible(boolean),
  listar_domiciliarios(text), resolver_domiciliario(uuid, text, text), domiciliarios_de_mi_ciudad(uuid),
  asignar_domiciliario(uuid, uuid, uuid), domiciliario_del_pedido(uuid, uuid) to authenticated;

-- domiciliarios es una tabla global (de la persona, no de una tienda): entra en la lista de verificar_aislamiento
do $$
declare v text := pg_get_functiondef('verificar_aislamiento()'::regprocedure);
begin
  if position('domiciliarios' in v) = 0 then
    v := replace(v, '''suscripciones_cliente'']);', '''suscripciones_cliente'', ''domiciliarios'']);');
    if position('domiciliarios' in v) = 0 then raise exception 'No se pudo actualizar verificar_aislamiento'; end if;
    execute v;
  end if;
end $$;

-- El módulo viaja con los planes Gestión y Completo (hasta hoy no estaba en ningún plan)
insert into plan_modulos (plan, modulo) values ('gestion', 'domiciliarios'), ('completo', 'domiciliarios') on conflict do nothing;
do $$
declare r record;
begin
  for r in select id from negocios where plan in ('gestion', 'completo') loop
    perform _sincronizar_plan(r.id);
  end loop;
end $$;

notify pgrst, 'reload schema';

-- ---------- VERIFICACIÓN: las 5 filas deben decir ok = true ----------
select chequeo, ok from (
  select 1 as n, 'verificar_aislamiento: todo en orden' as chequeo, (select bool_and(ok) from verificar_aislamiento()) as ok
  union all select 2, 'la tabla domiciliarios tiene RLS y nadie la toca directo',
         (select relrowsecurity from pg_class where relname = 'domiciliarios')
         and not exists (select 1 from information_schema.role_table_grants where table_name = 'domiciliarios' and grantee in ('anon','authenticated','PUBLIC'))
  union all select 3, 'anónimo no ejecuta ninguna función de domiciliarios',
         not has_function_privilege('anon', 'registrar_domiciliario(jsonb)', 'execute') and not has_function_privilege('anon', 'asignar_domiciliario(uuid, uuid, uuid)', 'execute')
  union all select 4, 'solo la función asigna el domiciliario del pedido', exists (select 1 from pg_trigger where tgname = 'ccc_proteger_domiciliario')
  union all select 5, 'el módulo «domiciliarios» existe', exists (select 1 from modulos where clave = 'domiciliarios')
) t order by n;
