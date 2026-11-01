-- ============================================================
-- Plataforma multi-negocio — 57: el administrador publica las tiendas desde su panel (/solicitudes)
--   · tiendas_por_publicar(): lista las tiendas con lo que les falta y si pidieron publicación.
--   · publicar_tienda_admin(id, publicada): publica / despublica (mismas reglas que publicar_negocio).
-- Solo el administrador de la plataforma. Se corre DESPUÉS del 56. Idempotente.
-- ============================================================
create or replace function tiendas_por_publicar() returns jsonb
language plpgsql stable security definer set search_path = public
as $$
begin
  if not soy_administrador_plataforma() then raise exception 'Solo un administrador de la plataforma'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', n.id, 'slug', n.slug, 'nombre', c.nombre_comercial, 'ciudad', c.ciudad,
      'publicada', n.publicada, 'pidio_en', n.publicacion_solicitada_en, 'creado_en', n.creado_en,
      'en_directorio', coalesce(c.en_directorio, false),
      'faltantes', f.faltan
    ) order by n.publicada, (n.publicacion_solicitada_en is null), n.creado_en desc)
    from negocios n
    join negocio_config c on c.negocio_id = n.id
    cross join lateral (
      select coalesce(jsonb_agg(x), '[]'::jsonb) as faltan from (
        select 'Su plan no incluye el catálogo público' as x where not modulo_activo(n.id, 'catalogo_publico')
        union all select 'Falta el WhatsApp' where length(regexp_replace(coalesce(c.whatsapp, ''), '\D', '', 'g')) < 10
        union all select 'No tiene un producto publicado con precio' where not exists (select 1 from productos p where p.negocio_id = n.id and p.activo and p.publicado and p.precio_venta > 0)
      ) q
    ) f
    where n.estado = 'activo'
  ), '[]'::jsonb);
end;
$$;

create or replace function publicar_tienda_admin(p_negocio_id uuid, p_publicada boolean) returns boolean
language plpgsql security definer set search_path = public
as $$
begin
  if not soy_administrador_plataforma() then raise exception 'Solo un administrador de la plataforma'; end if;
  if p_publicada then
    if not modulo_activo(p_negocio_id, 'catalogo_publico') then raise exception 'El plan de esta tienda no incluye el catálogo público'; end if;
    if length(regexp_replace(coalesce((select whatsapp from negocio_config where negocio_id = p_negocio_id), ''), '\D', '', 'g')) < 10 then
      raise exception 'La tienda debe tener WhatsApp antes de publicarse';
    end if;
  end if;
  update negocios set publicada = p_publicada where id = p_negocio_id;
  if not found then raise exception 'Tienda no encontrada'; end if;
  return p_publicada;
end;
$$;

revoke all on function tiendas_por_publicar(), publicar_tienda_admin(uuid, boolean) from public, anon;
grant execute on function tiendas_por_publicar(), publicar_tienda_admin(uuid, boolean) to authenticated;
notify pgrst, 'reload schema';

-- ---------- VERIFICACIÓN: las 3 filas deben decir ok = true ----------
select chequeo, ok from (
  select 1 as n, 'verificar_aislamiento: todo en orden' as chequeo, (select bool_and(ok) from verificar_aislamiento()) as ok
  union all select 2, 'anónimo no puede publicar ni listar',
         not has_function_privilege('anon', 'publicar_tienda_admin(uuid, boolean)', 'execute') and not has_function_privilege('anon', 'tiendas_por_publicar()', 'execute')
  union all select 3, 'usuarios con sesión pueden llamarlas (la función exige ser administrador)',
         has_function_privilege('authenticated', 'publicar_tienda_admin(uuid, boolean)', 'execute') and has_function_privilege('authenticated', 'tiendas_por_publicar()', 'execute')
) t order by n;
