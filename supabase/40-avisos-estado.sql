-- ============================================================
-- Plataforma multi-negocio — 40: aviso al cliente cuando cambia el estado de su pedido (notificaciones push)
-- Se corre DESPUÉS del 39. Es aditivo e idempotente: se puede volver a correr.
--
-- Cómo funciona
--   · El cliente (con su cuenta de Google) activa los avisos en SU celular desde «Mis pedidos»: su suscripción se guarda con su usuario.
--   · Cuando la tienda cambia el estado (recibido → preparando → en camino/listo → entregado), el panel pide «avisar_cambio_seguimiento»:
--     la función comprueba que quien pide es del equipo de ESA tienda, que el pedido es de un cliente con cuenta y con avisos
--     activos, que no es de práctica y que ese estado no se avisó ya; deja un aviso pendiente y entrega su número.
--   · El servidor (api/avisar-estado) recibe ese número, «reclama» el aviso (una sola vez, dentro de 10 minutos) y envía el push.
--     Solo el servidor puede reclamarlo; el número no se puede adivinar y no sirve para ver datos de nadie.
-- Qué NO toca: ningún dato existente. Agrega dos tablas y funciones.
-- ============================================================

-- ---------- 1. Suscripciones push de los clientes (por usuario, no por tienda) ----------
create table if not exists suscripciones_cliente (
  user_id   uuid not null references auth.users(id) on delete cascade,
  endpoint  text not null check (endpoint like 'https://%' and char_length(endpoint) <= 1000),
  p256dh    text not null,
  auth      text not null,
  creado_en timestamptz not null default now(),
  primary key (user_id, endpoint)
);
alter table suscripciones_cliente enable row level security;
revoke all on table suscripciones_cliente from public, anon, authenticated;
grant all on table suscripciones_cliente to service_role;

-- ---------- 2. Avisos pendientes de estado (uno por cambio de estado) ----------
create table if not exists avisos_estado (
  id          uuid primary key default gen_random_uuid(),
  negocio_id  uuid not null references negocios(id),
  pedido_id   uuid not null,
  user_id     uuid not null references auth.users(id) on delete cascade,
  seguimiento text not null check (seguimiento in ('recibido', 'preparando', 'en_camino', 'entregado')),
  creado_en   timestamptz not null default now(),
  enviado_en  timestamptz,
  foreign key (negocio_id, pedido_id) references pedidos_tienda (negocio_id, id) on delete cascade
);
create index if not exists avisos_estado_pedido_idx on avisos_estado (negocio_id, pedido_id, creado_en desc);
alter table avisos_estado enable row level security;
revoke all on table avisos_estado from public, anon, authenticated;
grant all on table avisos_estado to service_role;
drop trigger if exists bbb_negocio_inmutable on avisos_estado;
create trigger bbb_negocio_inmutable before update on avisos_estado for each row execute function negocio_id_inmutable();

-- ---------- 3. El cliente activa y quita sus avisos ----------
create or replace function guardar_suscripcion_cliente(p_endpoint text, p_p256dh text, p_auth text)
returns void
language plpgsql security definer set search_path = public
as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'Entra con tu cuenta para activar los avisos'; end if;
  if coalesce(p_endpoint, '') not like 'https://%' or length(p_endpoint) > 1000 or coalesce(p_p256dh, '') = '' or coalesce(p_auth, '') = ''
     or length(p_p256dh) > 200 or length(p_auth) > 100 then
    raise exception 'Suscripción no válida';
  end if;
  insert into suscripciones_cliente (user_id, endpoint, p256dh, auth) values (v_uid, p_endpoint, p_p256dh, p_auth)
  on conflict (user_id, endpoint) do update set p256dh = excluded.p256dh, auth = excluded.auth;
  -- máximo 5 aparatos por persona (se conservan los más recientes)
  delete from suscripciones_cliente where user_id = v_uid and endpoint not in
    (select endpoint from suscripciones_cliente where user_id = v_uid order by creado_en desc limit 5);
end;
$$;

create or replace function borrar_suscripcion_cliente(p_endpoint text)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'No autorizado'; end if;
  delete from suscripciones_cliente where user_id = auth.uid() and endpoint = p_endpoint;
end;
$$;

-- ---------- 4. La tienda avisa que cambió el estado de un pedido ----------
-- Devuelve el número del aviso, o null si no hay a quién avisar (invitado, práctica, sin avisos activos, mismo estado ya avisado).
create or replace function avisar_cambio_seguimiento(p_negocio_id uuid, p_pedido_id uuid)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare v_ped record; v_ultimo text; v_id uuid;
begin
  if auth.uid() is null or not es_personal(p_negocio_id) then raise exception 'No autorizado'; end if;
  if es_soporte(p_negocio_id) then raise exception 'La cuenta de soporte es de solo lectura'; end if;
  perform exigir_modulo(p_negocio_id, 'mis_pedidos');
  select cliente_user_id, seguimiento, es_practica into v_ped from pedidos_tienda where negocio_id = p_negocio_id and id = p_pedido_id;
  if not found then raise exception 'Pedido no encontrado'; end if;
  if v_ped.cliente_user_id is null or v_ped.es_practica then return null; end if;
  if not exists (select 1 from suscripciones_cliente where user_id = v_ped.cliente_user_id) then return null; end if;
  select seguimiento into v_ultimo from avisos_estado where negocio_id = p_negocio_id and pedido_id = p_pedido_id order by creado_en desc limit 1;
  if v_ultimo is not distinct from v_ped.seguimiento then return null; end if;          -- ese estado ya se avisó
  insert into avisos_estado (negocio_id, pedido_id, user_id, seguimiento) values (p_negocio_id, p_pedido_id, v_ped.cliente_user_id, v_ped.seguimiento)
  returning id into v_id;
  return v_id;
end;
$$;

-- ---------- 5. Solo el servidor: reclamar un aviso y entregar las suscripciones del cliente ----------
create or replace function reclamar_aviso_estado(p_id uuid)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare v_a record; v_tienda text; v_slug text; v_num bigint; v_ent text; v_subs jsonb;
begin
  update avisos_estado set enviado_en = now()
   where id = p_id and enviado_en is null and creado_en > now() - interval '10 minutes'
  returning negocio_id, pedido_id, user_id, seguimiento into v_a;
  if v_a.user_id is null then return null; end if;           -- no existe, ya se envió o venció
  select n.slug, c.nombre_comercial, p.numero, p.entrega into v_slug, v_tienda, v_num, v_ent
    from pedidos_tienda p join negocios n on n.id = p.negocio_id join negocio_config c on c.negocio_id = n.id
   where p.negocio_id = v_a.negocio_id and p.id = v_a.pedido_id and n.estado = 'activo';
  if v_slug is null then return null; end if;
  select coalesce(jsonb_agg(jsonb_build_object('endpoint', s.endpoint, 'p256dh', s.p256dh, 'auth', s.auth)), '[]'::jsonb)
    into v_subs from suscripciones_cliente s where s.user_id = v_a.user_id;
  return jsonb_build_object('user_id', v_a.user_id, 'slug', v_slug, 'tienda', v_tienda, 'numero', v_num, 'entrega', v_ent,
                            'seguimiento', v_a.seguimiento, 'suscripciones', v_subs);
end;
$$;

create or replace function retirar_suscripciones_cliente(p_user_id uuid, p_endpoints text[]) returns integer
language plpgsql security definer set search_path = public
as $$
declare n integer;
begin
  delete from suscripciones_cliente where user_id = p_user_id and endpoint = any (p_endpoints);
  get diagnostics n = row_count;
  return n;
end;
$$;

-- ---------- 6. Permisos ----------
revoke all on function guardar_suscripcion_cliente(text, text, text), borrar_suscripcion_cliente(text), avisar_cambio_seguimiento(uuid, uuid) from public, anon;
grant execute on function guardar_suscripcion_cliente(text, text, text), borrar_suscripcion_cliente(text), avisar_cambio_seguimiento(uuid, uuid) to authenticated;
revoke all on function reclamar_aviso_estado(uuid), retirar_suscripciones_cliente(uuid, text[]) from public, anon, authenticated;
grant execute on function reclamar_aviso_estado(uuid), retirar_suscripciones_cliente(uuid, text[]) to service_role;

-- ---------- 7. suscripciones_cliente es una tabla global (de la persona, no de una tienda): entra en la lista de verificar_aislamiento ----------
do $$
declare v text := pg_get_functiondef('verificar_aislamiento()'::regprocedure);
begin
  if position('suscripciones_cliente' in v) = 0 then
    v := replace(v, '''catalogo_base_categoria'']);', '''catalogo_base_categoria'', ''suscripciones_cliente'']);');
    if position('suscripciones_cliente' in v) = 0 then raise exception 'No se pudo actualizar verificar_aislamiento'; end if;
    execute v;
  end if;
end $$;

notify pgrst, 'reload schema';

-- ---------- VERIFICACIÓN: las 5 filas deben decir ok = true ----------
select chequeo, ok from (
  select 1 as n, 'verificar_aislamiento: todo en orden' as chequeo, (select bool_and(ok) from verificar_aislamiento()) as ok
  union all select 2, 'Las 2 tablas nuevas tienen RLS y nadie las toca directo',
         (select count(*) = 2 and bool_and(relrowsecurity) from pg_class where relname in ('suscripciones_cliente', 'avisos_estado'))
         and not exists (select 1 from information_schema.role_table_grants where table_name in ('suscripciones_cliente', 'avisos_estado') and grantee in ('anon', 'authenticated', 'PUBLIC'))
  union all select 3, 'El cliente y la tienda ejecutan las funciones; anónimo no',
         has_function_privilege('authenticated', 'guardar_suscripcion_cliente(text, text, text)', 'execute')
         and has_function_privilege('authenticated', 'avisar_cambio_seguimiento(uuid, uuid)', 'execute')
         and not has_function_privilege('anon', 'avisar_cambio_seguimiento(uuid, uuid)', 'execute')
  union all select 4, 'Solo el servidor reclama avisos',
         has_function_privilege('service_role', 'reclamar_aviso_estado(uuid)', 'execute')
         and not has_function_privilege('authenticated', 'reclamar_aviso_estado(uuid)', 'execute')
         and not has_function_privilege('anon', 'reclamar_aviso_estado(uuid)', 'execute')
  union all select 5, 'verificar_aislamiento conoce la tabla global nueva', position('suscripciones_cliente' in pg_get_functiondef('verificar_aislamiento()'::regprocedure)) > 0
) t order by n;
