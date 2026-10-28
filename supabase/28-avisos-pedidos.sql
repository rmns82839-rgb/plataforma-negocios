-- ============================================================
-- Plataforma multi-negocio — 28: aviso de pedido nuevo al celular del equipo de la tienda (notificaciones push)
-- Se corre DESPUÉS del 27. Es aditivo e idempotente: se puede volver a correr.
--
-- Cómo funciona
--   · Cada persona del equipo (dueño o cajero) activa los avisos en su celular: se guarda su suscripción en ESA tienda.
--   · Cuando entra un pedido, el servidor (api/avisar-pedido) le pide a esta base «reclamar» el aviso de ese pedido:
--     la función comprueba que el pedido existe (tienda + número + celular de quien pidió), lo marca como avisado
--     (un pedido avisa UNA sola vez) y entrega las suscripciones de esa tienda. Solo el servidor puede llamarla.
-- Qué NO toca: ningún dato existente. Agrega una tabla, una columna por tipo de pedido y funciones.
-- ============================================================

-- ---------- 1. Suscripciones del equipo (de una tienda; cerradas con RLS: todo pasa por las funciones) ----------
create table if not exists suscripciones_personal (
  negocio_id uuid not null references negocios(id),
  endpoint   text not null check (endpoint like 'https://%' and char_length(endpoint) <= 1000),
  user_id    uuid not null references auth.users(id) on delete cascade,
  p256dh     text not null,
  auth       text not null,
  creado_en  timestamptz not null default now(),
  primary key (negocio_id, endpoint)
);
create index if not exists suscripciones_personal_user_idx on suscripciones_personal (negocio_id, user_id);
alter table suscripciones_personal enable row level security;
revoke all on table suscripciones_personal from public, anon, authenticated;
grant all on table suscripciones_personal to service_role;
drop trigger if exists bbb_negocio_inmutable on suscripciones_personal;
create trigger bbb_negocio_inmutable before update on suscripciones_personal for each row execute function negocio_id_inmutable();

-- ---------- 2. Marca de «ya se avisó» en cada tipo de pedido ----------
alter table pedidos_tienda add column if not exists aviso_enviado_en timestamptz;
alter table pedidos_ropa   add column if not exists aviso_enviado_en timestamptz;

-- ---------- 3. El equipo activa y quita sus avisos ----------
create or replace function guardar_suscripcion_personal(p_negocio_id uuid, p_endpoint text, p_p256dh text, p_auth text)
returns void
language plpgsql security definer set search_path = public
as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null or not es_personal(p_negocio_id) then raise exception 'Solo el equipo de la tienda puede activar los avisos'; end if;
  if es_soporte(p_negocio_id) then raise exception 'La cuenta de soporte es de solo lectura'; end if;
  perform exigir_modulo(p_negocio_id, 'pedidos_en_linea');
  if coalesce(p_endpoint, '') not like 'https://%' or length(p_endpoint) > 1000 or coalesce(p_p256dh, '') = '' or coalesce(p_auth, '') = ''
     or length(p_p256dh) > 200 or length(p_auth) > 100 then
    raise exception 'Suscripción no válida';
  end if;
  insert into suscripciones_personal (negocio_id, endpoint, user_id, p256dh, auth)
  values (p_negocio_id, p_endpoint, v_uid, p_p256dh, p_auth)
  on conflict (negocio_id, endpoint) do update set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth;
  -- máximo 5 aparatos por persona en cada tienda (se conservan los más recientes)
  delete from suscripciones_personal where negocio_id = p_negocio_id and user_id = v_uid and endpoint not in
    (select endpoint from suscripciones_personal where negocio_id = p_negocio_id and user_id = v_uid order by creado_en desc limit 5);
end;
$$;

create or replace function borrar_suscripcion_personal(p_negocio_id uuid, p_endpoint text)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if auth.uid() is null or not es_personal(p_negocio_id) then raise exception 'No autorizado'; end if;
  delete from suscripciones_personal where negocio_id = p_negocio_id and endpoint = p_endpoint and user_id = auth.uid();
end;
$$;

-- ¿Cuántas personas del equipo tienen los avisos activos? (solo el dueño)
create or replace function cantidad_avisos_personal(p_negocio_id uuid) returns integer
language plpgsql stable security definer set search_path = public
as $$
begin
  if not es_dueno(p_negocio_id) then raise exception 'Solo el dueño'; end if;
  return (select count(distinct user_id) from suscripciones_personal where negocio_id = p_negocio_id)::int;
end;
$$;

-- ---------- 4. Solo el servidor: reclamar el aviso de un pedido ----------
-- p_tipo: 'tienda' | 'ropa'. Devuelve null si el pedido no existe, es de práctica, ya se avisó o la tienda no usa pedidos en línea.
create or replace function reclamar_aviso_pedido(p_slug text, p_tipo text, p_numero bigint, p_telefono text)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_neg uuid; v_tel text := right(regexp_replace(coalesce(p_telefono, ''), '\D', '', 'g'), 10);
  v_id uuid; v_total numeric; v_entrega text; v_nombre text; v_tienda text; v_subs jsonb;
begin
  if length(v_tel) < 10 or p_numero is null or p_tipo not in ('tienda', 'ropa') then return null; end if;
  select n.id, c.nombre_comercial into v_neg, v_tienda
    from negocios n join negocio_config c on c.negocio_id = n.id
   where n.slug = lower(coalesce(p_slug, '')) and n.estado = 'activo' and modulo_activo(n.id, 'pedidos_en_linea');
  if v_neg is null then return null; end if;

  if p_tipo = 'tienda' then
    update pedidos_tienda set aviso_enviado_en = now()
     where negocio_id = v_neg and numero = p_numero and aviso_enviado_en is null and not es_practica
       and right(regexp_replace(coalesce(telefono, ''), '\D', '', 'g'), 10) = v_tel
    returning id, total, entrega, nombre into v_id, v_total, v_entrega, v_nombre;
  else
    update pedidos_ropa set aviso_enviado_en = now()
     where negocio_id = v_neg and numero = p_numero and aviso_enviado_en is null
       and right(regexp_replace(coalesce(telefono, ''), '\D', '', 'g'), 10) = v_tel
    returning id, total, entrega, nombre into v_id, v_total, v_entrega, v_nombre;
  end if;
  if v_id is null then return null; end if;

  select coalesce(jsonb_agg(jsonb_build_object('endpoint', s.endpoint, 'p256dh', s.p256dh, 'auth', s.auth)), '[]'::jsonb)
    into v_subs from suscripciones_personal s where s.negocio_id = v_neg;
  return jsonb_build_object('negocio_id', v_neg, 'tienda', v_tienda, 'numero', p_numero, 'total', v_total, 'entrega', v_entrega,
                            'cliente', split_part(btrim(coalesce(v_nombre, '')), ' ', 1), 'suscripciones', v_subs);
end;
$$;

-- El servidor retira las suscripciones que el aparato ya no acepta (404/410)
create or replace function retirar_suscripciones_personal(p_negocio_id uuid, p_endpoints text[]) returns integer
language plpgsql security definer set search_path = public
as $$
declare n integer;
begin
  delete from suscripciones_personal where negocio_id = p_negocio_id and endpoint = any (p_endpoints);
  get diagnostics n = row_count;
  return n;
end;
$$;

-- ---------- 5. Permisos ----------
revoke all on function guardar_suscripcion_personal(uuid, text, text, text), borrar_suscripcion_personal(uuid, text), cantidad_avisos_personal(uuid)
  from public, anon;
grant execute on function guardar_suscripcion_personal(uuid, text, text, text), borrar_suscripcion_personal(uuid, text), cantidad_avisos_personal(uuid) to authenticated;
revoke all on function reclamar_aviso_pedido(text, text, bigint, text), retirar_suscripciones_personal(uuid, text[]) from public, anon, authenticated;
grant execute on function reclamar_aviso_pedido(text, text, bigint, text), retirar_suscripciones_personal(uuid, text[]) to service_role;

notify pgrst, 'reload schema';

-- ---------- VERIFICACIÓN: las 6 filas deben decir ok = true ----------
select chequeo, ok from (
  select 1 as n, 'verificar_aislamiento: todo en orden' as chequeo, (select bool_and(ok) from verificar_aislamiento()) as ok
  union all select 2, 'La tabla de suscripciones tiene RLS y nadie la toca directo',
         (select relrowsecurity from pg_class where relname = 'suscripciones_personal')
         and not exists (select 1 from information_schema.role_table_grants where table_name = 'suscripciones_personal' and grantee in ('anon', 'authenticated', 'PUBLIC'))
  union all select 3, 'Los dos tipos de pedido tienen la marca de aviso',
         (select count(*) = 2 from information_schema.columns where table_schema = 'public' and column_name = 'aviso_enviado_en' and table_name in ('pedidos_tienda', 'pedidos_ropa'))
  union all select 4, 'El equipo puede activar avisos y solo el servidor reclama pedidos',
         has_function_privilege('authenticated', 'guardar_suscripcion_personal(uuid,text,text,text)', 'execute')
         and not has_function_privilege('authenticated', 'reclamar_aviso_pedido(text,text,bigint,text)', 'execute')
         and not has_function_privilege('anon', 'reclamar_aviso_pedido(text,text,bigint,text)', 'execute')
         and has_function_privilege('service_role', 'reclamar_aviso_pedido(text,text,bigint,text)', 'execute')
  union all select 5, 'Anónimo sigue ejecutando solo las funciones públicas', not exists (
         select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname in
           ('guardar_suscripcion_personal', 'borrar_suscripcion_personal', 'cantidad_avisos_personal', 'reclamar_aviso_pedido', 'retirar_suscripciones_personal')
           and has_function_privilege('anon', p.oid, 'execute'))
  union all select 6, 'Las 5 funciones nuevas existen',
         (select count(*) = 5 from pg_proc where pronamespace = 'public'::regnamespace and proname in
           ('guardar_suscripcion_personal', 'borrar_suscripcion_personal', 'cantidad_avisos_personal', 'reclamar_aviso_pedido', 'retirar_suscripciones_personal'))
) t order by n;
