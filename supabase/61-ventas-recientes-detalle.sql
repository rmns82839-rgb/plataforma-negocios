-- ============================================================
-- Plataforma multi-negocio — 61: «Reversar una venta» muestra cada producto en su línea, con foto y la cantidad exacta
--   · ventas_recientes(): el resumen mostraba «0 × Queso» porque el formato redondeaba a entero (kilos y libras salían en 0 o 1).
--     Ahora el resumen es exacto y la función entrega también «items»: nombre, cantidad, unidad, precio, total de la línea y fotos.
--   Se corre DESPUÉS del 60. Idempotente.
-- ============================================================
create or replace function ventas_recientes(p_negocio_id uuid, p_limite int default 5)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare v_dueno boolean := es_dueno(p_negocio_id);
begin
  if not es_personal(p_negocio_id) then raise exception 'No autorizado'; end if;
  return coalesce((select jsonb_agg(to_jsonb(t) order by t.fecha desc, t.numero desc) from (
    select v.id, v.numero, v.fecha, v.total, v.metodo, v.domicilio,
           coalesce((select string_agg(left(trim(trailing '.' from to_char(vi.cantidad, 'FM999999990.999')) || ' × ' || vi.nombre, 60), ', ' order by vi.id)
                       from venta_items vi where vi.negocio_id = v.negocio_id and vi.venta_id = v.id), '') as resumen,
           coalesce((select jsonb_agg(jsonb_build_object(
                        'nombre', vi.nombre, 'cantidad', vi.cantidad, 'unidad', coalesce(p.unidad, 'und'),
                        'precio', vi.precio_unitario,
                        'total', round(vi.precio_unitario * vi.cantidad) - coalesce(vi.descuento_linea, 0),
                        'imagenes', coalesce(to_jsonb(p.imagenes), '[]'::jsonb)) order by vi.id)
                       from venta_items vi
                       left join productos p on p.negocio_id = vi.negocio_id and p.id = vi.producto_id
                      where vi.negocio_id = v.negocio_id and vi.venta_id = v.id), '[]'::jsonb) as items
      from ventas v
     where v.negocio_id = p_negocio_id and not v.anulada and (v_dueno or v.creada_por = auth.uid())
     order by v.fecha desc, v.numero desc
     limit least(greatest(coalesce(p_limite, 5), 1), 20)) t), '[]'::jsonb);
end;
$$;
revoke all on function ventas_recientes(uuid, int) from public, anon;
grant execute on function ventas_recientes(uuid, int) to authenticated;
notify pgrst, 'reload schema';

-- ---------- VERIFICACIÓN: las 3 filas deben decir ok = true ----------
select chequeo, ok from (
  select 1 as n, 'verificar_aislamiento: todo en orden' as chequeo, (select bool_and(ok) from verificar_aislamiento()) as ok
  union all select 2, 'ventas_recientes entrega las líneas (items) con unidad y fotos', position('imagenes' in pg_get_functiondef('ventas_recientes(uuid, int)'::regprocedure)) > 0
  union all select 3, 'anónimo no puede usarla', not has_function_privilege('anon', 'ventas_recientes(uuid, int)', 'execute')
) t order by n;
