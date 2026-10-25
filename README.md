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
