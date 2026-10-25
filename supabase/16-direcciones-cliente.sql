-- =====================================================================
-- 16. C5b: direcciones guardadas del cliente (pedido en un toque)
--     Cada dirección guarda: nombre (Casa, Trabajo…), texto exacto, seña opcional y el PUNTO exacto (lat/lng).
--     Son datos personales (Ley 1581): solo las ve su dueño, se guardan con su aceptación y se borran con "Borrar mis datos".
--     Es aditivo e idempotente: se puede correr dos veces.
-- =====================================================================

create table if not exists direcciones_cliente (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  etiqueta       text not null default 'Casa' check (char_length(etiqueta) between 1 and 30),
  direccion      text not null check (char_length(direccion) between 6 and 160),
  sena           text check (sena is null or char_length(sena) <= 120),
  lat            numeric(9,6) not null check (lat between -90 and 90),
  lng            numeric(9,6) not null check (lng between -180 and 180),
  acepta_datos_en timestamptz not null,
  ultimo_uso     timestamptz not null default now(),
  creado_en      timestamptz not null default now()
);
create index if not exists direcciones_cliente_user_idx on direcciones_cliente (user_id, ultimo_uso desc);

alter table direcciones_cliente enable row level security;
drop policy if exists direcciones_cliente_sel on direcciones_cliente;
create policy direcciones_cliente_sel on direcciones_cliente for select to authenticated using (user_id = auth.uid());   -- solo su dueño
-- Nadie escribe directo: solo las funciones de abajo
revoke all on direcciones_cliente from anon, authenticated, public;
grant select on direcciones_cliente to authenticated;

-- Lista de mis direcciones (la última usada primero)
create or replace function mis_direcciones() returns jsonb
language sql stable security definer set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'etiqueta', etiqueta, 'direccion', direccion, 'sena', sena,
                                               'lat', lat, 'lng', lng, 'ultimo_uso', ultimo_uso) order by ultimo_uso desc), '[]'::jsonb)
    from direcciones_cliente where user_id = auth.uid()
$$;

-- Guarda una dirección nueva, o corrige una existente (si viene id). Máximo 5 por persona.
create or replace function guardar_direccion(p_datos jsonb) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_uid  uuid := auth.uid();
  v_id   uuid := nullif(p_datos->>'id', '')::uuid;
  v_eti  text := coalesce(nullif(trim(p_datos->>'etiqueta'), ''), 'Casa');
  v_dir  text := trim(coalesce(p_datos->>'direccion', ''));
  v_sena text := nullif(trim(coalesce(p_datos->>'sena', '')), '');
  v_lat  numeric;
  v_lng  numeric;
  v_ok   boolean := coalesce((p_datos->>'acepta_datos')::boolean, false);
  v_fila direcciones_cliente%rowtype;
begin
  if v_uid is null then raise exception 'Entra con tu cuenta para guardar tu dirección'; end if;
  if length(v_dir) < 6 or length(v_dir) > 160 then raise exception 'Escribe tu dirección completa (calle, número y barrio)'; end if;
  if length(v_eti) > 30 then raise exception 'El nombre de la dirección es muy largo'; end if;
  if v_sena is not null and length(v_sena) > 120 then raise exception 'La seña es muy larga'; end if;
  begin
    v_lat := (p_datos->>'lat')::numeric; v_lng := (p_datos->>'lng')::numeric;
  exception when others then raise exception 'La ubicación no es válida';
  end;
  if v_lat is null or v_lng is null or v_lat not between -90 and 90 or v_lng not between -180 and 180 then
    raise exception 'La ubicación no es válida';
  end if;

  if v_id is not null then
    -- Corregir una dirección propia (el consentimiento ya existe)
    update direcciones_cliente set etiqueta = v_eti, direccion = v_dir, sena = v_sena, lat = round(v_lat, 6), lng = round(v_lng, 6), ultimo_uso = now()
     where id = v_id and user_id = v_uid returning * into v_fila;
    if not found then raise exception 'No encontramos esa dirección'; end if;
  else
    if not v_ok then raise exception 'Debes aceptar la política de tratamiento de datos para guardar tu dirección'; end if;
    if (select count(*) from direcciones_cliente where user_id = v_uid) >= 5 then
      raise exception 'Ya tienes 5 direcciones guardadas. Borra una para guardar otra';
    end if;
    insert into direcciones_cliente (user_id, etiqueta, direccion, sena, lat, lng, acepta_datos_en)
    values (v_uid, v_eti, v_dir, v_sena, round(v_lat, 6), round(v_lng, 6), now()) returning * into v_fila;
  end if;
  return jsonb_build_object('id', v_fila.id, 'etiqueta', v_fila.etiqueta, 'direccion', v_fila.direccion, 'sena', v_fila.sena,
                            'lat', v_fila.lat, 'lng', v_fila.lng, 'ultimo_uso', v_fila.ultimo_uso);
end;
$$;

-- Marca una dirección como la última usada
create or replace function usar_direccion(p_id uuid) returns void
language sql security definer set search_path = public
as $$ update direcciones_cliente set ultimo_uso = now() where id = p_id and user_id = auth.uid() $$;

create or replace function borrar_direccion(p_id uuid) returns void
language sql security definer set search_path = public
as $$ delete from direcciones_cliente where id = p_id and user_id = auth.uid() $$;

-- "Borrar mis datos" ahora también borra las direcciones
create or replace function borrar_mi_perfil() returns void
language plpgsql security definer set search_path = public
as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'Entra con tu cuenta'; end if;
  delete from perfil_cliente where user_id = v_uid;
  delete from direcciones_cliente where user_id = v_uid;
  update pedidos_tienda set cliente_user_id = null where cliente_user_id = v_uid;
end;
$$;

-- Permisos: las funciones nacen abiertas a todos; se cierran a mano
revoke all on function mis_direcciones(), guardar_direccion(jsonb), usar_direccion(uuid), borrar_direccion(uuid), borrar_mi_perfil() from public, anon;
grant execute on function mis_direcciones(), guardar_direccion(jsonb), usar_direccion(uuid), borrar_direccion(uuid), borrar_mi_perfil() to authenticated;

-- La verificación automática debe conocer la tabla nueva como "global" (pertenece a una persona, no a un negocio)
do $$
declare v text := pg_get_functiondef('verificar_aislamiento()'::regprocedure);
begin
  if position('direcciones_cliente' in v) = 0 then
    v := replace(v, '''perfil_cliente'']', '''perfil_cliente'', ''direcciones_cliente'']');
    if position('direcciones_cliente' in v) = 0 then raise exception 'No se pudo actualizar verificar_aislamiento'; end if;
    execute v;
  end if;
end $$;

notify pgrst, 'reload schema';

-- Verificación: debe dar 5 filas en true
select 'La tabla direcciones_cliente existe, con RLS y sin escritura directa' as chequeo,
       coalesce((select relrowsecurity from pg_class where oid = to_regclass('public.direcciones_cliente')), false)
       and not has_table_privilege('anon', 'direcciones_cliente', 'select')
       and not has_table_privilege('authenticated', 'direcciones_cliente', 'insert')
       and not has_table_privilege('authenticated', 'direcciones_cliente', 'update')
       and not has_table_privilege('authenticated', 'direcciones_cliente', 'delete') as ok
union all
select 'Las 4 funciones de direcciones existen',
       (select count(*) from pg_proc where pronamespace = 'public'::regnamespace
          and proname in ('mis_direcciones', 'guardar_direccion', 'usar_direccion', 'borrar_direccion')) = 4
union all
select 'Solo usuarios con sesión usan las direcciones (anon no)',
       has_function_privilege('authenticated', 'guardar_direccion(jsonb)', 'execute')
       and has_function_privilege('authenticated', 'mis_direcciones()', 'execute')
       and not has_function_privilege('anon', 'guardar_direccion(jsonb)', 'execute')
       and not has_function_privilege('anon', 'mis_direcciones()', 'execute')
union all
select '"Borrar mis datos" también borra las direcciones',
       position('direcciones_cliente' in pg_get_functiondef('borrar_mi_perfil()'::regprocedure)) > 0
union all
select 'Cada persona solo ve sus direcciones (política activa)',
       exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'direcciones_cliente' and policyname = 'direcciones_cliente_sel');
