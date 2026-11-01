-- ============================================================
-- Plataforma multi-negocio — 58: plan "Catálogo" (solo catálogo en la red, para tiendas que ya tienen su propio sistema)
--   · $14.900/mes ($9.900 los primeros 6 meses), hasta 3.000 productos.
--   · Incluye: catálogo público, pedidos por WhatsApp, domicilio por km, carga masiva, catálogo maestro, creador de logo, directorio de la red.
--   · No incluye caja, inventario, fiados, compras ni reportes. Vitrina (gratis, 200 productos) queda igual.
-- Los precios son datos: se cambian con un update a la tabla planes. Se corre DESPUÉS del 57. Idempotente.
-- ============================================================
insert into planes (clave, nombre, descripcion, precio_mensual, precio_fundador, meses_fundador, max_productos, max_calculos_km_mes, orden, activo)
values ('catalogo', 'Catálogo', 'Solo tu catálogo en la red de tiendas, con pedidos por WhatsApp (sin caja ni inventario)', 14900, 9900, 6, 3000, 1500, 15, true)
on conflict (clave) do nothing;

insert into plan_modulos (plan, modulo)
select 'catalogo', m from unnest(array['catalogo_publico','pedidos_en_linea','domicilio_km','carga_masiva','creador_logo','directorio_red','catalogo_maestro']) m
on conflict do nothing;

notify pgrst, 'reload schema';

-- ---------- VERIFICACIÓN: las 4 filas deben decir ok = true ----------
select chequeo, ok from (
  select 1 as n, 'verificar_aislamiento: todo en orden' as chequeo, (select bool_and(ok) from verificar_aislamiento()) as ok
  union all select 2, 'el plan Catálogo existe, activo, $14.900 / $9.900 y 3.000 productos',
         exists (select 1 from planes where clave = 'catalogo' and activo and precio_mensual = 14900 and precio_fundador = 9900 and max_productos = 3000)
  union all select 3, 'el plan Catálogo tiene 7 módulos', (select count(*) = 7 from plan_modulos where plan = 'catalogo')
  union all select 4, 'el plan Catálogo no trae caja, fiados ni inventario',
         not exists (select 1 from plan_modulos where plan = 'catalogo' and modulo in ('caja','fiados','compras','reportes'))
) t order by n;
