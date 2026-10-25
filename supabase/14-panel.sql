-- ============================================================
-- 14 · Panel del dueño (C3): resumen, lista de requisitos para publicar y solicitud de publicación
-- Aditivo e idempotente. No toca los archivos anteriores.
--   · El dueño NO publica su tienda: ve qué le falta y la PIDE; la plataforma la publica (publicar_negocio, desde la consola).
--   · resumen_panel: los números de la pantalla de inicio del panel.
-- ============================================================
alter table negocios add column if not exists publicacion_solicitada_en timestamptz;

-- Qué le falta a la tienda para poder publicarse (lo ven el personal y el soporte)
create or replace function estado_publicacion(p_negocio_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare v_falta jsonb := '[]'::jsonb; n negocios%rowtype;
begin
  if not (es_personal(p_negocio_id) or es_soporte(p_negocio_id)) then raise exception 'No autorizado'; end if;
  select * into n from negocios where id = p_negocio_id;
  if not modulo_activo(p_negocio_id, 'catalogo_publico') then
    v_falta := v_falta || to_jsonb('Tu plan no incluye el catálogo público'::text);
  end if;
  if length(regexp_replace(coalesce((select whatsapp from negocio_config where negocio_id = p_negocio_id), ''), '\D', '', 'g')) < 10 then
    v_falta := v_falta || to_jsonb('Escribe el WhatsApp de tu tienda (ahí te llegan los pedidos)'::text);
  end if;
  if not exists (select 1 from productos where negocio_id = p_negocio_id and activo and publicado and precio_venta > 0) then
    v_falta := v_falta || to_jsonb('Publica al menos un producto con precio'::text);
  end if;
  return jsonb_build_object('publicada', n.publicada, 'solicitada_en', case when n.publicada then null else n.publicacion_solicitada_en end,
                            'faltantes', v_falta, 'lista', jsonb_array_length(v_falta) = 0);
end;
$$;

-- El dueño pide que publiquen su tienda (la plataforma la revisa y la publica)
create or replace function pedir_publicacion(p_negocio_id uuid) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare e jsonb;
begin
  if not es_dueno(p_negocio_id) then raise exception 'No autorizado'; end if;
  e := estado_publicacion(p_negocio_id);
  if (e->>'publicada')::boolean then raise exception 'Tu tienda ya está publicada'; end if;
  if not (e->>'lista')::boolean then raise exception 'Todavía falta: %', e->'faltantes'->>0; end if;
  update negocios set publicacion_solicitada_en = now() where id = p_negocio_id;
  return estado_publicacion(p_negocio_id);
end;
$$;

-- Números de la pantalla de inicio del panel
create or replace function resumen_panel(p_negocio_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare v_hoy date := hoy_colombia();
begin
  if not (es_personal(p_negocio_id) or es_soporte(p_negocio_id)) then raise exception 'No autorizado'; end if;
  return jsonb_build_object(
    'pedidos_pendientes', (select count(*) from pedidos_tienda where negocio_id = p_negocio_id and estado = 'pendiente' and not es_practica),
    'pedidos_hoy', (select count(*) from pedidos_tienda where negocio_id = p_negocio_id and not es_practica
                       and (creado_en at time zone 'America/Bogota')::date = v_hoy),
    'ventas_hoy', coalesce((select sum(total) from pedidos_tienda where negocio_id = p_negocio_id and not es_practica and estado <> 'cancelado'
                       and (creado_en at time zone 'America/Bogota')::date = v_hoy), 0),
    'productos_activos', (select count(*) from productos where negocio_id = p_negocio_id and activo),
    'productos_publicados', (select count(*) from productos where negocio_id = p_negocio_id and activo and publicado),
    'productos_agotados', (select count(*) from productos where negocio_id = p_negocio_id and activo and publicado
                              and not (case when controla_stock then stock > 0 else disponible end)));
end;
$$;

revoke all on function estado_publicacion(uuid), pedir_publicacion(uuid), resumen_panel(uuid) from public, anon;
grant execute on function estado_publicacion(uuid), pedir_publicacion(uuid), resumen_panel(uuid) to authenticated;

-- ---------- VERIFICACIÓN: las 4 filas deben decir ok = true ----------
select 'negocios tiene publicacion_solicitada_en' as chequeo,
       exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'negocios' and column_name = 'publicacion_solicitada_en') as ok
union all select 'Existen estado_publicacion, pedir_publicacion y resumen_panel',
       (select count(*) = 3 from pg_proc where pronamespace = 'public'::regnamespace and proname in ('estado_publicacion','pedir_publicacion','resumen_panel'))
union all select 'Anónimo no ejecuta ninguna de las 3',
       not has_function_privilege('anon', 'estado_publicacion(uuid)', 'execute') and not has_function_privilege('anon', 'pedir_publicacion(uuid)', 'execute')
       and not has_function_privilege('anon', 'resumen_panel(uuid)', 'execute')
union all select 'verificar_aislamiento sigue en orden (todas las filas en true)',
       (select bool_and(ok) from verificar_aislamiento());
