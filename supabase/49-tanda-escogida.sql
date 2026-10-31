-- ============================================================
-- 49 · Tanda de números con los productos que TÚ escoges
-- Se corre DESPUÉS del 48. Es aditivo e idempotente: se puede volver a correr.
--  · Marcas en el catálogo los productos que quieres y se numeran 1, 2, 3… en el orden en que los marcaste.
--  · Igual que la tanda de siempre: una tanda nueva borra los números anteriores.
-- ============================================================

create or replace function catalogo_admin_tanda_ids(p_ids bigint[])
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare v_n int;
begin
  if not soy_administrador_plataforma() then raise exception 'Solo el administrador de la plataforma'; end if;
  if p_ids is null or cardinality(p_ids) < 1 or cardinality(p_ids) > 500 then raise exception 'Escoge entre 1 y 500 productos'; end if;
  if (select count(distinct x) from unnest(p_ids) x) <> cardinality(p_ids) then raise exception 'Hay productos repetidos en la selección'; end if;
  update catalogo_base set tanda_n = null where tanda_n is not null;
  with puestos as (
    update catalogo_base b set tanda_n = o.n::int
      from unnest(p_ids) with ordinality as o(id, n)
     where b.id = o.id and b.eliminado_en is null
    returning 1
  )
  select count(*) into v_n from puestos;
  return jsonb_build_object('numerados', v_n, 'pedidos', cardinality(p_ids));
end;
$$;

revoke all on function catalogo_admin_tanda_ids(bigint[]) from public, anon;
grant execute on function catalogo_admin_tanda_ids(bigint[]) to authenticated;

notify pgrst, 'reload schema';

-- ---------- VERIFICACIÓN: las 3 filas deben decir ok = true ----------
select chequeo, ok from (
  select 1 as n, 'verificar_aislamiento: todo en orden' as chequeo, (select bool_and(ok) from verificar_aislamiento()) as ok
  union all select 2, 'la función de tanda escogida existe y es solo para quien inició sesión', has_function_privilege('authenticated', 'catalogo_admin_tanda_ids(bigint[])', 'execute') and not has_function_privilege('anon', 'catalogo_admin_tanda_ids(bigint[])', 'execute')
  union all select 3, 'tu usuario es administrador de la plataforma (si dice false, ver la nota)', exists (select 1 from plataforma_admins where nivel = 'administrador')
) t order by n;
