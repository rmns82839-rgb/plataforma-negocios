# Plataforma multi-negocio — Etapa 2 + paso 2b

Base nueva e independiente de Matriz: base de datos vacía con aislamiento por negocio, un negocio de prueba y un front mínimo.
**No contiene nada de Matriz ni de Nelson** (ni datos, ni marca, ni imágenes).

## Qué incluye
| Archivo | Para qué |
|---|---|
| `supabase/01-plataforma.sql` | Negocios, marca, reglas, módulos, miembros, contadores y funciones de rol |
| `supabase/02-datos.sql` | Tablas de datos con `negocio_id`, llaves compuestas y `promo_descuento` |
| `supabase/03-seguridad.sql` | RLS, políticas, candado de solo lectura del soporte, consecutivos, auditoría y `validar_componente` |
| `supabase/04-funciones-plataforma.sql` | `crear_negocio`, módulos, equipo, accesos, catálogos públicos por slug, `ajustar_stock` |
| `supabase/05-storage-realtime.sql` | Bucket `negocios` y canales en vivo, por negocio |
| `supabase/06-funciones-negocio.sql` | **2b** · `registrar_venta`, `registrar_venta_ropa`, `anular_venta`, `cambiar_estado_domicilio`, `registrar_compra`, abonos, mora, saldo anterior, préstamos |
| `supabase/07-tablero-y-pedidos.sql` | **2b** · `tablero`, `tablero_en_linea`, `crear_pedido_tienda(slug…)`, `crear_pedido_ropa(slug…)` |
| `supabase/08-permisos.sql` | Permisos explícitos + `verificar_aislamiento()` (va al final, después de crear todas las funciones) |
| `supabase/09-negocio-prueba.sql` | (Opcional) negocio "demo" con 3 productos |
| `pruebas/aislamiento.mjs` | 224 pruebas (PGlite, sin tocar Supabase): dos negocios falsos, un dueño de dos negocios, soporte, anon |
| `src/` | Front mínimo (sin cambios en 2b) |
| `docs/negocio-y-costos.md` | Costos, precios, punto de equilibrio, límites de Supabase, lista antes de cobrar y decisiones pendientes |

## Puesta en marcha (PowerShell)
```powershell
# 1) Carpeta nueva (NO es la de Matriz)
Expand-Archive "$HOME\Downloads\plataforma-negocios-etapa2.zip" -DestinationPath C:\plataforma-negocios
cd C:\plataforma-negocios

# 2) Repositorio propio (crea antes un repo vacío en GitHub y pega su URL)
git init -b master
git add -A
git commit -m "Etapa 2: base multi-negocio"
git remote add origin https://github.com/TU-USUARIO/plataforma-negocios.git
git push -u origin master

# 3) Probar el aislamiento localmente (no necesita Supabase)
cd pruebas ; npm install --no-audit --no-fund ; node aislamiento.mjs ; cd ..
```

## Supabase (proyecto NUEVO, PostgreSQL 15 o superior)
1. Crea un proyecto nuevo (no uses el de Matriz).
2. SQL Editor → corre en orden `01` a `08`.
3. Authentication → Users → *Add user* (dueño de prueba).
4. En `09-negocio-prueba.sql` cambia `CORREO_DUENO@gmail.com` por ese correo y córrelo.
5. Verifica: `select * from verificar_aislamiento();` → todas las filas con `ok = true`.
6. Tu cuenta de soporte (solo lectura): crea otro usuario y corre
   `insert into plataforma_admins (user_id) select id from auth.users where email = 'TU_CORREO_SOPORTE';`

Crear un negocio nuevo, desde el SQL Editor:
`select crear_negocio('mi-slug', 'Nombre comercial', 'tienda', 'correo.del.dueno@gmail.com');`  (tipos: tienda, ropa, repuestos, mixto)

## Front
```powershell
copy .env.example .env      # pega la URL y la anon key del proyecto NUEVO
npm install
npm run dev                 # http://localhost:5173/n/demo
```
Vercel: proyecto nuevo con este repo y las dos variables `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`.

## Cambios de firma respecto a Matriz (para el front, paso siguiente)
Toda RPC de negocio recibe `p_negocio_id` como **primer** parámetro (`registrar_venta(p_negocio_id, p_items, p_pagos, …)`).
Las públicas reciben el **slug**: `crear_pedido_tienda(p_slug, p_datos, p_items)`, `crear_pedido_ropa(p_slug, …)`, `registrar_visita(p_slug, …)`.
`tablero` y `tablero_en_linea` también las puede leer el soporte (solo lectura).

## Lo que queda (a propósito, no está aquí)
- Carpeta `api/` (crear usuario, manifest dinámico por negocio, páginas con vista previa, sitemap, feed), modo práctica, respaldo y editor de marca.
- Front: rutas `/n/{slug}/…` completas (`tienda`, `catalogo`, `pistola`, `ingreso`), `/plataforma` y service worker con caché por negocio.
- Pendiente de revisar: el límite de clientes nuevos por día desde pedidos públicos (Matriz no lo tiene; ver nota del paso 2b).

## Etapa C1 (planes, publicación, clientes con Google, servicios)
- `supabase/10-planes-modulos.sql` → planes, módulos nuevos, invitaciones, `crear_negocio(slug,nombre,tipo,email,plan)` (nace sin publicar, URL `/t/<slug>`), `publicar_negocio`, cupos de km.
- `supabase/11-catalogo-clientes.sql` → categorías, proveedores, pedidos con seguimiento/práctica/km, perfil de cliente, servicios (logo), `verificar_aislamiento()` de 11 filas (reemplaza al de 08).
- Orden: 01…09, luego 10, luego 11. Pruebas: `cd pruebas; node aislamiento.mjs` (453).

## Etapa C2 (tienda pública)
- `supabase/12-redondeo-domicilio.sql` → el domicilio por km se redondea al múltiplo MÁS CERCANO del paso de cada tienda (0, 500 o 1000; por defecto 500), como en Matriz. Correr después del 11.
- Front: `/t/<slug>` = catálogo, carrito, datos, revisión y pedido por WhatsApp (`src/tienda/`, cálculos en `src/lib/pedido.js`). `/t/<slug>/panel` = acceso del personal (`/n/<slug>` sigue funcionando).
- El pedido se guarda primero en la base (precio, ofertas y domicilio los decide el servidor) y luego el cliente toca el botón verde para enviarlo por WhatsApp.
- Soporte (solo lectura) recorre todo y el pedido es simulado; dueño/cajero hacen pedidos de práctica; tienda sin publicar = vista previa.
- Pruebas: `cd pruebas; node aislamiento.mjs` (461) y `node front.mjs` (32).
- `supabase/13-demo-tienda.sql` → tienda demo publicada en `/t/demo` (cambiar correo y WhatsApp al inicio antes de correrla).

## Etapa C3 (panel del dueño)
- `supabase/14-panel.sql` → `estado_publicacion`, `pedir_publicacion` (el dueño pide; la plataforma publica con `publicar_negocio`), `resumen_panel`.
- Panel en `/t/<slug>/panel` (`src/panel/`): Pedidos (con seguimiento), Productos (fotos, agotado, ocultar, stock), carga masiva (pegar desde Excel o CSV), Categorías, Mi tienda (datos, logo, colores, domicilio, publicación), Mi equipo, Mi plan.
- Roles: cajero = pedidos, productos, categorías; dueño = todo; soporte = todo en solo lectura.
- Para publicar una tienda que la pidió: `select slug, publicacion_solicitada_en from negocios where publicacion_solicitada_en is not null and not publicada;` y luego `select publicar_negocio('<id>', true);`.

## Etapa C4 (domicilio por kilómetros)
- **SQL:** `supabase/15-domicilio-km.sql` (7 filas true). Aditivo e idempotente.
- **Servidor:** `api/domicilio.js` (+ `_domicilio.js`, `_ors.js`). Acciones: `buscar`, `calcular`, `respaldo`.
- **Variables en Vercel (solo servidor, sin `VITE_`):** `ORS_API_KEY` y `SUPABASE_SERVICE_ROLE_KEY`. La URL usa `VITE_SUPABASE_URL`, que ya existe.
- El navegador ya no manda los km: el pedido trae un `calculo_id` de un solo uso (vence en 3 h). Sin cupo, mapa caído o dirección no encontrada → tarifa fija de respaldo; la venta nunca se bloquea.
- Cupos diarios editables en `plataforma_limites`: `ors_calculos_km` y `ors_busquedas` (1.500). Cupo mensual por plan: `planes.max_calculos_km_mes`.
- Panel: Mi tienda → «Domicilio por kilómetros» (ubicación, reglas, simulador que no gasta cupo, prueba con dirección real).
- Pruebas: `cd pruebas; node aislamiento.mjs` (521), `node front.mjs` (66), `node api.mjs` (30).

## Etapa C4b (mapa con pin)
- Sin SQL nuevo. Leaflet + OpenStreetMap (`src/lib/mapa.js` es el único lugar de la configuración visual del mapa).
- Tienda: el cliente busca su dirección, mueve el pin hasta su puerta y confirma; el servidor mide desde ese punto. Panel: ubicar la tienda con pin.
- Para pasar a Google Maps más adelante: proveedor del servidor en `api/_proveedor.js` (`MAPA_PROVEEDOR`) y mosaicos/mapa visual en `src/lib/mapa.js` + `src/tienda/MapaPin.jsx`.
- CSP: `vercel.json` permite imágenes de `https://tile.openstreetmap.org`.

## Etapa C4c (direcciones de Colombia)
- Direcciones nuevas del servicio: rutas `https://api.heigit.org/openrouteservice`, direcciones `https://api.heigit.org/pelias/v1` (la clave sigue en `ORS_API_KEY`, solo servidor).
- La búsqueda de texto es de apoyo: se agrega la ciudad de la tienda, se busca solo cerca de ella (2,5 × radio máximo, entre 15 y 60 km), se aceptan solo dirección, calle, sitio y barrio, y se descartan resultados a menos de 0,1 km de la tienda.
- Lo principal: «Usar mi ubicación actual» (GPS) y el pin del mapa. Tope de 36 llamadas por minuto al servicio (la cuenta permite 40).

## Etapa C5 (Mis pedidos y Google)
- Sin SQL nuevo (las funciones ya existen desde el archivo 11). Requiere activar el proveedor Google en Supabase (Authentication → Providers) y crear el cliente OAuth en Google Cloud.
- Ruta `/t/<slug>/mis-pedidos`: perfil con consentimiento (Ley 1581), estado de cada pedido (se actualiza cada 20 s), borrar mis datos y salir.
- Botón «Entrar con Google» en la tienda (módulo `mis_pedidos`), aviso opcional en el paso de datos, y los datos guardados llenan el pedido. Pedir como invitado sigue igual.
- Cajeros invitados: entran con Google en «Acceso del personal»; al iniciar sesión se reclaman sus invitaciones (`reclamar_invitaciones`).

## C5b — Pedido en un toque (direcciones guardadas y código al correo)

**Qué hace**
- La primera vez, la persona toca «Usar mi ubicación», confirma «¿Es aquí tu puerta?», escribe su dirección exacta (obligatoria), una seña opcional y un nombre (Casa, Trabajo, Otra).
- Se guarda el trío **dirección + seña + punto exacto (lat/lng)**. Las veces siguientes solo toca **«Sí, enviar a Casa»**: el servidor mide los km desde el punto guardado (sigue siendo el servidor quien calcula).
- Si está en otro lugar: **«Estoy en otro lugar (usar mi ubicación)»**. Si quiere otra casa: **«Agregar otra dirección»** (hasta 5). **«Corregir»** mueve el pin de una dirección sin crear otra.
- Sin cuenta: se guarda solo en ese celular (localStorage). Con cuenta (Google o código al correo): se guarda en la base, con aceptación expresa (casilla sin marcar), y la acompaña a cualquier celular.
- «Mis pedidos» → «Mis direcciones» permite borrarlas una a una; «Borrar mis datos» las borra todas.
- Si el celular no da la ubicación: «Prefiero escribir la dirección y buscarla» (el flujo de C4).

**Archivos**: `supabase/16-direcciones-cliente.sql` (verificación: 5 filas true), `src/lib/direcciones.js`, `src/tienda/DireccionRapida.jsx`, `src/tienda/EntrarCodigo.jsx`, `src/lib/google.js` (código por correo), `src/tienda/MisPedidos.jsx`.

**Código al correo (hay que configurar Supabase una vez)**
1. Supabase → Authentication → Emails → plantillas **«Magic Link»** y **«Confirm signup»**: el mensaje debe incluir `{{ .Token }}`. Ejemplo: `Tu código para entrar es: {{ .Token }}`.
2. El correo que trae Supabase por defecto solo envía ~2 correos por hora. Para uso real: Authentication → SMTP Settings → SMTP propio (por ejemplo Resend).
3. Authentication → Sign In / Providers → Email debe estar activado.

**Queda para después**: código por SMS/WhatsApp (cuesta dinero por mensaje), usar el celular como llave principal.

## C6 — Caja, fiados, reportes y pedido atendido → venta

**Archivo SQL nuevo**: `supabase/17-caja-pedidos.sql` (verificación: 5 filas true). Aditivo e idempotente: no cambia ninguna tabla ni función existente.
- `previsualizar_venta`: el total EXACTO que cobrará el servidor (promociones, precio por mayor…) sin guardar nada. La pantalla nunca calcula distinto del servidor.
- `atender_pedido_tienda`: marca el pedido atendido y registra la venta con su forma de pago (descuenta inventario, crea el fiado si aplica, incluye el domicilio). Los pedidos de práctica solo se marcan.
- `deshacer_atencion_pedido` (solo dueño): anula la venta y devuelve el pedido a pendiente.
- `caja_dia`: resumen de caja de un día (por forma de pago, abonos, gastos, efectivo esperado). El cajero la ve sin costos ni ganancias.

**Pantallas del panel** (se muestran según los módulos del plan: `caja`, `fiados`, `reportes`)
- **Caja → Vender**: buscar o escanear, agregar productos, total del servidor, cobrar (una forma de pago, o dividida en dos), cambio, descuento, cliente (obligatorio para fiar).
- **Caja → Resumen del día**: ventas, formas de pago, abonos, gastos (se pueden registrar), efectivo que debe haber, conteo de caja (sobra/falta), lista de ventas con detalle y «Anular» (solo dueño).
- **Fiados**: quién debe y cuánto, vencidos, abonos, recordatorio por WhatsApp, recargo por mora, cupo y días de crédito (dueño), deuda de antes (dueño), movimientos.
- **Reportes** (solo dueño): hoy / 7 días / 30 días / este mes; vendido, ganancia, gastos, comparación con el periodo anterior, ventas por día, horas pico, formas de pago, productos y categorías, mejores clientes, fiados, inventario.
- **Pedidos**: «Marcar como atendido» pide la forma de pago y registra la venta. «Volver a pendiente» con venta registrada solo lo hace el dueño (anula la venta).
- Cuenta de soporte: recorre la caja completa, pero la venta es simulada y no se guarda nada.

**Archivos**: `src/lib/caja.js` (fechas de Bogotá, pagos, variación, WhatsApp), `src/panel/{Caja,CajaVender,CajaDia,ClienteSelector,Fiados,Reportes,Pedidos}.jsx`.

**Límites conocidos**: no hay domicilio en la venta de mostrador (los domicilios llegan por la tienda en línea); el conteo de caja no se guarda, solo se compara en pantalla; el «gasto» se asume pagado en efectivo.
