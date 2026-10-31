-- 52 · Arreglo: «Fotos en tiendas» fallaba con «DELETE requires a WHERE clause» (Supabase no deja borrar sin WHERE).
-- Es la misma función de siempre con un solo cambio. No toca datos.

create or replace function catalogo_admin_sincronizar_fotos(p_simular boolean default true)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare v_nuevas int; v_refrescadas int; v_tiendas int;
begin
  if not soy_administrador_plataforma() then raise exception 'Solo el administrador de la plataforma'; end if;
  create temporary table if not exists _sync_fotos (negocio_id uuid, id uuid, fotos text[], era_vacia boolean) on commit drop;
  delete from _sync_fotos where true;   -- Supabase exige WHERE en todo delete
  insert into _sync_fotos
  select distinct on (p.negocio_id, p.id) p.negocio_id, p.id, b.fotos, cardinality(p.imagenes) = 0
    from productos p
    join catalogo_base b on b.eliminado_en is null and cardinality(b.fotos) > 0
                        and ((b.codigo is not null and p.codigo = b.codigo) or lower(p.nombre) = lower(b.nombre))
   where cardinality(p.imagenes) = 0
      or (p.imagenes is distinct from b.fotos
          and not exists (select 1 from unnest(p.imagenes) x where x not like '%/storage/v1/object/public/catalogo/%'))
   order by p.negocio_id, p.id, b.id;
  select count(*) filter (where era_vacia), count(*) filter (where not era_vacia), count(distinct negocio_id) into v_nuevas, v_refrescadas, v_tiendas from _sync_fotos;
  if not coalesce(p_simular, true) then
    update productos p set imagenes = s.fotos from _sync_fotos s where p.negocio_id = s.negocio_id and p.id = s.id;
  end if;
  return jsonb_build_object('nuevas', v_nuevas, 'refrescadas', v_refrescadas, 'tiendas', v_tiendas, 'aplicado', not coalesce(p_simular, true));
end;
$$;

revoke all on function catalogo_admin_sincronizar_fotos(boolean) from public, anon;
grant execute on function catalogo_admin_sincronizar_fotos(boolean) to authenticated;

notify pgrst, 'reload schema';

-- ---------- VERIFICACIÓN: las 3 filas deben decir ok = true ----------
select chequeo, ok from (
  select 1 as n, 'verificar_aislamiento: todo en orden' as chequeo, (select bool_and(ok) from verificar_aislamiento()) as ok
  union all select 2, 'la sincronización ya borra con WHERE', position('where true' in pg_get_functiondef('catalogo_admin_sincronizar_fotos(boolean)'::regprocedure)) > 0
  union all select 3, 'la sincronización es solo para quien inició sesión', has_function_privilege('authenticated', 'catalogo_admin_sincronizar_fotos(boolean)', 'execute') and not has_function_privilege('anon', 'catalogo_admin_sincronizar_fotos(boolean)', 'execute')
) t order by n;
