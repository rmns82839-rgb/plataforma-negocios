-- ============================================================
-- Plataforma multi-negocio — 29: cuenta del cliente (registro una sola vez)
-- Se corre DESPUÉS del 28. Es aditivo e idempotente: se puede volver a correr.
--
-- Qué resuelve
--   · El cliente se registra UNA vez y queda guardado: nombre, celular, dirección Y el punto exacto del mapa.
--     Con el punto guardado, el domicilio se calcula solo en cada compra (ya no vuelve a escribir ni a marcar nada).
--   · Guarda también una referencia de entrega ("timbre, torre…"), su correo y si prefiere domicilio o recoger.
--   · «Mi cuenta»: resumen de sus compras en ESA tienda (últimas 5, lo que más pide, cuánto ha comprado).
-- Qué NO toca: ningún dato existente. Agrega columnas opcionales a perfil_cliente y una función de lectura.
-- ============================================================

-- ---------- 1. Columnas nuevas del perfil (todas opcionales) ----------
alter table perfil_cliente add column if not exists lat numeric(9,6);
alter table perfil_cliente add column if not exists lng numeric(9,6);
alter table perfil_cliente add column if not exists referencia text;
alter table perfil_cliente add column if not exists email text;
alter table perfil_cliente add column if not exists entrega_preferida text not null default 'domicilio';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'perfil_cliente_punto_ck') then
    alter table perfil_cliente add constraint perfil_cliente_punto_ck
      check ((lat is null) = (lng is null) and (lat is null or (lat between -90 and 90 and lng between -180 and 180)));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'perfil_cliente_referencia_ck') then
    alter table perfil_cliente add constraint perfil_cliente_referencia_ck check (referencia is null or char_length(referencia) <= 120);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'perfil_cliente_email_ck') then
    alter table perfil_cliente add constraint perfil_cliente_email_ck check (email is null or char_length(email) <= 120);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'perfil_cliente_entrega_ck') then
    alter table perfil_cliente add constraint perfil_cliente_entrega_ck check (entrega_preferida in ('domicilio', 'recoger'));
  end if;
end $$;

-- ---------- 2. Leer mi perfil (ahora con punto, referencia, correo y entrega preferida) ----------
create or replace function mi_perfil_cliente() returns jsonb
language sql stable security definer set search_path = public
as $$
  select jsonb_build_object('nombre', nombre, 'telefono', telefono, 'direccion', direccion,
                            'lat', lat, 'lng', lng, 'referencia', referencia, 'email', email, 'entrega_preferida', entrega_preferida,
                            'acepta_promos', acepta_promos, 'acepta_datos_en', acepta_datos_en, 'politica_version', politica_version,
                            'creado_en', creado_en)
    from perfil_cliente where user_id = auth.uid()
$$;

-- ---------- 3. Guardar mi perfil ----------
-- Los datos nuevos son opcionales: quien llama con el formato anterior sigue funcionando.
--   · Si manda lat/lng, se guarda ese punto (lat/lng vacíos lo borran).
--   · Si no manda punto y la dirección es la misma, se conserva el punto.
--   · Si la dirección cambió y no viene punto nuevo, el punto viejo se borra (ya no corresponde a la dirección).
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
  v_act    perfil_cliente%rowtype;
  v_lat    numeric; v_lng numeric;
  v_ref    text; v_mail text; v_ent text;
begin
  if v_uid is null then raise exception 'Entra con tu cuenta para guardar tu perfil'; end if;
  if length(v_nombre) < 3 or length(v_nombre) > 80 then raise exception 'Escribe tu nombre completo'; end if;
  if length(v_tel) = 12 and left(v_tel, 2) = '57' then v_tel := substr(v_tel, 3); end if;
  if length(v_tel) <> 10 then raise exception 'Escribe tu número de celular (10 dígitos)'; end if;
  if v_dir is not null and length(v_dir) > 160 then raise exception 'La dirección es muy larga'; end if;
  select * into v_act from perfil_cliente where user_id = v_uid;
  if not v_datos and v_act.user_id is null then
    raise exception 'Debes aceptar la política de tratamiento de datos para guardar tu perfil';
  end if;

  -- punto exacto del mapa
  if p_datos ? 'lat' or p_datos ? 'lng' then
    if nullif(p_datos->>'lat', '') is null and nullif(p_datos->>'lng', '') is null then
      v_lat := null; v_lng := null;
    else
      begin v_lat := (p_datos->>'lat')::numeric; v_lng := (p_datos->>'lng')::numeric;
      exception when others then raise exception 'La ubicación no es válida'; end;
      if v_lat is null or v_lng is null or v_lat not between -90 and 90 or v_lng not between -180 and 180 then
        raise exception 'La ubicación no es válida';
      end if;
      v_lat := round(v_lat, 6); v_lng := round(v_lng, 6);
    end if;
  elsif v_act.user_id is not null and v_act.direccion is not distinct from v_dir then
    v_lat := v_act.lat; v_lng := v_act.lng;
  else
    v_lat := null; v_lng := null;
  end if;
  if v_dir is null then v_lat := null; v_lng := null; end if;   -- sin dirección no hay punto

  -- referencia de entrega, correo y entrega preferida: opcionales; si no vienen se conserva lo guardado
  if p_datos ? 'referencia' then
    v_ref := nullif(left(trim(coalesce(p_datos->>'referencia', '')), 120), '');
  else
    v_ref := v_act.referencia;
  end if;
  if p_datos ? 'email' then
    v_mail := nullif(left(lower(trim(coalesce(p_datos->>'email', ''))), 120), '');
    if v_mail is not null and v_mail !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'El correo no es válido'; end if;
  else
    v_mail := v_act.email;
  end if;
  v_ent := case when p_datos->>'entrega_preferida' in ('domicilio', 'recoger') then p_datos->>'entrega_preferida'
                else coalesce(v_act.entrega_preferida, 'domicilio') end;

  insert into perfil_cliente (user_id, nombre, telefono, direccion, lat, lng, referencia, email, entrega_preferida, acepta_datos_en, acepta_promos, acepta_promos_en)
  values (v_uid, v_nombre, v_tel, v_dir, v_lat, v_lng, v_ref, v_mail, v_ent, now(), v_promos, case when v_promos then now() end)
  on conflict (user_id) do update set
    nombre = excluded.nombre, telefono = excluded.telefono, direccion = excluded.direccion,
    lat = excluded.lat, lng = excluded.lng, referencia = excluded.referencia, email = excluded.email,
    entrega_preferida = excluded.entrega_preferida,
    acepta_promos = excluded.acepta_promos,
    acepta_promos_en = case when not excluded.acepta_promos then null
                            when perfil_cliente.acepta_promos then perfil_cliente.acepta_promos_en else now() end,
    actualizado_en = now();
  return mi_perfil_cliente();
end;
$$;

-- ---------- 4. Mi resumen de compras en UNA tienda ----------
-- Solo mis compras reales (no las de práctica ni las canceladas) de esa tienda. Devuelve siempre algo, aunque no haya compras.
create or replace function mi_resumen_cliente(p_slug text) returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare v_uid uuid := auth.uid(); v_neg uuid;
begin
  if v_uid is null then return null; end if;
  select n.id into v_neg from negocios n
   where n.slug = lower(coalesce(p_slug, '')) and n.estado = 'activo' and modulo_activo(n.id, 'mis_pedidos');
  if v_neg is null then
    return jsonb_build_object('pedidos', 0, 'gastado', 0, 'primera', null, 'ultima', null, 'ultimos', '[]'::jsonb, 'favoritos', '[]'::jsonb);
  end if;
  return jsonb_build_object(
    'pedidos',  (select count(*) from pedidos_tienda p where p.negocio_id = v_neg and p.cliente_user_id = v_uid and not p.es_practica and p.estado <> 'cancelado'),
    'gastado',  (select coalesce(sum(p.total + p.domicilio), 0) from pedidos_tienda p where p.negocio_id = v_neg and p.cliente_user_id = v_uid and not p.es_practica and p.estado <> 'cancelado'),
    'primera',  (select min(p.creado_en) from pedidos_tienda p where p.negocio_id = v_neg and p.cliente_user_id = v_uid and not p.es_practica and p.estado <> 'cancelado'),
    'ultima',   (select max(p.creado_en) from pedidos_tienda p where p.negocio_id = v_neg and p.cliente_user_id = v_uid and not p.es_practica and p.estado <> 'cancelado'),
    'ultimos',  coalesce((select jsonb_agg(x order by x.creado_en desc) from (
                   select p.numero, p.creado_en, p.total, p.domicilio, p.estado, p.seguimiento, p.entrega,
                          coalesce((select jsonb_agg(jsonb_build_object('producto_id', i.producto_id, 'nombre', i.nombre, 'unidad', i.unidad, 'cantidad', i.cantidad) order by i.nombre)
                                      from pedido_tienda_items i where i.negocio_id = p.negocio_id and i.pedido_id = p.id), '[]'::jsonb) as items
                     from pedidos_tienda p
                    where p.negocio_id = v_neg and p.cliente_user_id = v_uid and not p.es_practica and p.estado <> 'cancelado'
                    order by p.creado_en desc limit 5) x), '[]'::jsonb),
    'favoritos', coalesce((select jsonb_agg(f order by f.veces desc, f.cantidad desc, f.nombre) from (
                   select i.producto_id, max(i.nombre) as nombre, max(i.unidad) as unidad,
                          count(distinct i.pedido_id)::int as veces, sum(i.cantidad) as cantidad
                     from pedido_tienda_items i
                     join pedidos_tienda p on p.negocio_id = i.negocio_id and p.id = i.pedido_id
                    where p.negocio_id = v_neg and p.cliente_user_id = v_uid and not p.es_practica and p.estado <> 'cancelado'
                    group by i.producto_id, lower(i.nombre)
                    order by count(distinct i.pedido_id) desc, sum(i.cantidad) desc, lower(i.nombre) limit 5) f), '[]'::jsonb)
  );
end;
$$;

-- ---------- 5. Permisos ----------
revoke all on function mi_resumen_cliente(text) from public, anon;
grant execute on function mi_resumen_cliente(text) to authenticated;
revoke all on function mi_perfil_cliente(), guardar_perfil_cliente(jsonb) from public, anon;
grant execute on function mi_perfil_cliente(), guardar_perfil_cliente(jsonb) to authenticated;

notify pgrst, 'reload schema';

-- ---------- VERIFICACIÓN: las 6 filas deben decir ok = true ----------
select chequeo, ok from (
  select 1 as n, 'verificar_aislamiento: todo en orden' as chequeo, (select bool_and(ok) from verificar_aislamiento()) as ok
  union all select 2, 'El perfil guarda el punto del mapa, referencia, correo y entrega preferida',
         (select count(*) = 5 from information_schema.columns where table_schema = 'public' and table_name = 'perfil_cliente'
            and column_name in ('lat', 'lng', 'referencia', 'email', 'entrega_preferida'))
  union all select 3, 'El perfil sigue cerrado: nadie lo lee directo salvo su dueño',
         not exists (select 1 from information_schema.role_table_grants where table_name = 'perfil_cliente' and grantee in ('anon', 'PUBLIC'))
  union all select 4, 'Un cliente con cuenta ejecuta las 3 funciones y anónimo ninguna',
         has_function_privilege('authenticated', 'mi_resumen_cliente(text)', 'execute')
         and has_function_privilege('authenticated', 'guardar_perfil_cliente(jsonb)', 'execute')
         and has_function_privilege('authenticated', 'mi_perfil_cliente()', 'execute')
         and not has_function_privilege('anon', 'mi_resumen_cliente(text)', 'execute')
         and not has_function_privilege('anon', 'guardar_perfil_cliente(jsonb)', 'execute')
         and not has_function_privilege('anon', 'mi_perfil_cliente()', 'execute')
  union all select 5, 'guardar_perfil_cliente ya entiende el punto del mapa',
         position('v_lat' in pg_get_functiondef('guardar_perfil_cliente(jsonb)'::regprocedure)) > 0
  union all select 6, 'La función de resumen existe',
         exists (select 1 from pg_proc where pronamespace = 'public'::regnamespace and proname = 'mi_resumen_cliente')
) t order by n;
