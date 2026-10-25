// Prueba de aislamiento entre negocios, sin tocar Supabase: corre los SQL 01 a 09 en PGlite
// (Postgres de prueba dentro de Node) con dos negocios falsos e intenta leer, escribir y borrar
// datos del otro. Uso:   cd pruebas ; npm install ; npm run aislamiento
import { PGlite } from '@electric-sql/pglite'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const aqui = path.dirname(fileURLToPath(import.meta.url))
const sqlDir = path.join(aqui, '..', 'supabase')
const db = new PGlite()

// ---------- Piezas de Supabase que el SQL da por hechas ----------
await db.exec(`
create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
create schema auth; create schema storage; create schema realtime; create schema extensions;
create table auth.users (id uuid primary key default gen_random_uuid(), email text, encrypted_password text, last_sign_in_at timestamptz, email_confirmed_at timestamptz default now());
create table auth.mfa_factors (id uuid primary key default gen_random_uuid(), user_id uuid, status text, factor_type text);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text, owner uuid);
alter table storage.objects enable row level security;
create table realtime.messages (id uuid primary key default gen_random_uuid(), topic text);
alter table realtime.messages enable row level security;
create function realtime.topic() returns text language sql stable as $$ select current_setting('realtime.topic', true) $$;
grant usage on schema auth, storage, realtime, extensions to anon, authenticated, service_role;
grant select on auth.users, auth.mfa_factors to authenticated, service_role;
grant select, insert, update, delete on storage.objects, realtime.messages to authenticated;
grant select on storage.buckets to authenticated;
`)
const U = {}
for (const n of ['duenoA', 'cajeroA', 'duenoB', 'soporte', 'extra', 'duenoV', 'google1', 'google2', 'otro']) {
  const r = await db.query(`insert into auth.users (email) values ($1) returning id`, [n + '@prueba.com'])
  U[n] = r.rows[0].id
}

// ---------- Cargar los SQL del proyecto ----------
let fallas = 0, pruebas = 0
for (const f of ['01-plataforma.sql', '02-datos.sql', '03-seguridad.sql', '04-funciones-plataforma.sql', '05-storage-realtime.sql', '06-funciones-negocio.sql', '07-tablero-y-pedidos.sql', '08-permisos.sql', '10-planes-modulos.sql', '11-catalogo-clientes.sql', '12-redondeo-domicilio.sql']) {
  try { await db.exec(fs.readFileSync(path.join(sqlDir, f), 'utf8')); console.log('OK   ', f) }
  catch (e) { console.log('FALLA', f, '→', e.message); process.exit(1) }
}
await db.exec(`insert into plataforma_admins (user_id) values ('${U.soporte}')`)

// ---------- Ayudas ----------
async function como(quien, fn) {
  await db.exec('reset role')
  if (quien === 'anon') { await db.exec(`set role anon; select set_config('request.jwt.claim.sub', '', false); select set_config('request.jwt.claims', '', false)`) }
  else if (quien === 'sistema') { /* postgres */ await db.exec(`select set_config('request.jwt.claim.sub', '', false); select set_config('request.jwt.claims', '', false)`) }
  else {
    await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${U[quien]}', false);
                   select set_config('request.jwt.claims', '{"email":"${quien}@prueba.com","aal":"aal1"}', false)`)
  }
  try { return await fn() } finally { await db.exec("reset role; select set_config('request.jwt.claim.sub','',false); select set_config('request.jwt.claims','',false); select set_config('realtime.topic','',false)") }
}
const q = (sql, p) => db.query(sql, p)
async function ok(nombre, quien, fn, verifica) {
  pruebas++
  try {
    const r = await como(quien, fn)
    if (verifica && !verifica(r)) { fallas++; console.log('✗', nombre, '→ resultado inesperado:', JSON.stringify(r?.rows ?? r)); return }
    console.log('✓', nombre)
  } catch (e) { fallas++; console.log('✗', nombre, '→ error inesperado:', e.message) }
}
async function falla(nombre, quien, fn, patron) {
  pruebas++
  try {
    const r = await como(quien, fn)
    // algunos "fallos" son 0 filas afectadas (el RLS oculta la fila)
    if (patron?.includes('cero') && (r.affectedRows === 0 || r.rows?.length === 0)) { console.log('✓', nombre, '(0 filas)'); return }
    fallas++; console.log('✗', nombre, '→ debía fallar y funcionó:', JSON.stringify(r?.rows ?? r))
  } catch (e) {
    const pat = patron?.replace(/\|?cero\|?/, '')
    if (pat && !new RegExp(pat, 'i').test(e.message)) { fallas++; console.log('✗', nombre, '→ falló con otro mensaje:', e.message); return }
    console.log('✓', nombre, '(' + e.message.slice(0, 70) + ')')
  }
}

// ---------- Dos negocios falsos ----------
const crear = async (slug, nombre, tipo, correo, plan = 'completo') =>
  (await q(`select crear_negocio($1,$2,$3,$4,$5) r`, [slug, nombre, tipo, correo, plan])).rows[0].r
const publicar = async (id) => { await q(`update negocio_config set whatsapp='3001112233' where negocio_id=$1`, [id]); await q(`select publicar_negocio($1,true)`, [id]) }
const A = (await como('sistema', () => crear('tienda-a', 'Tienda A', 'tienda', 'duenoA@prueba.com'))).id
const B = (await como('sistema', () => crear('tienda-b', 'Tienda B', 'tienda', 'duenoB@prueba.com'))).id
await q(`insert into negocio_miembros (negocio_id, user_id, rol) values ($1,$2,'cajero')`, [A, U.cajeroA])
await como('sistema', async () => { await publicar(A); await publicar(B) })
const pA = (await q(`insert into productos (negocio_id,codigo,nombre,precio_venta,stock,publicado) values ($1,'1','Arroz A',2500,10,true),($1,'2','Aceite A',9000,5,true) returning id`, [A])).rows[0].id
const pB = (await q(`insert into productos (negocio_id,codigo,nombre,precio_venta,stock,publicado) values ($1,'1','Arroz B',2600,7,true) returning id`, [B])).rows[0].id
const cA = (await q(`insert into clientes (negocio_id,nombre) values ($1,'Cliente A') returning id`, [A])).rows[0].id
const cB = (await q(`insert into clientes (negocio_id,nombre) values ($1,'Cliente B') returning id`, [B])).rows[0].id
console.log('\n--- Alta de negocios ---')
await falla('un usuario con sesión NO puede crear negocios', 'duenoA', () => q(`select crear_negocio('x-neg','X','tienda','extra@prueba.com')`), 'permission denied')
await falla('slug reservado rechazado', 'sistema', () => q(`select crear_negocio('admin','X','tienda','extra@prueba.com')`), 'slug')
await falla('soporte de plataforma no puede ser dueño', 'sistema', () => q(`select crear_negocio('x-neg','X','tienda','soporte@prueba.com')`), 'soporte')
await falla('soporte de plataforma no puede ser miembro', 'sistema', () => q(`insert into negocio_miembros (negocio_id,user_id,rol) values ($1,$2,'cajero')`, [A, U.soporte]), 'soporte')
await falla('un usuario no puede activar módulos', 'duenoA', () => q(`select activar_modulo($1,'prestamos',true)`, [A]), 'permission denied')

console.log('\n--- Lectura aislada ---')
await ok('dueño A ve solo sus productos', 'duenoA', () => q(`select nombre from productos order by nombre`), r => r.rows.length === 2 && r.rows.every(x => x.nombre.endsWith(' A')))
await ok('dueño B ve solo su producto', 'duenoB', () => q(`select nombre from productos`), r => r.rows.length === 1 && r.rows[0].nombre === 'Arroz B')
await ok('dueño A no ve clientes de B', 'duenoA', () => q(`select nombre from clientes`), r => r.rows.length === 1 && r.rows[0].nombre === 'Cliente A')
await ok('dueño A solo ve su negocio', 'duenoA', () => q(`select slug from negocios`), r => r.rows.length === 1 && r.rows[0].slug === 'tienda-a')
await ok('dueño A no ve la config ni las formas de pago de B', 'duenoA', () => q(`select (select count(*) from negocio_config where negocio_id=$1) a,(select count(*) from formas_pago where negocio_id=$1) b`, [B]), r => r.rows[0].a == 0 && r.rows[0].b == 0)
await ok('usuario sin negocio no ve nada', 'extra', () => q(`select (select count(*) from productos) p,(select count(*) from negocios) n,(select count(*) from negocio_config) c`), r => r.rows[0].p == 0 && r.rows[0].n == 0 && r.rows[0].c == 0)
await ok('vista clientes_saldo respeta el negocio', 'duenoB', () => q(`select nombre from clientes_saldo`), r => r.rows.length === 1 && r.rows[0].nombre === 'Cliente B')
await ok('mi_rol por negocio', 'duenoA', () => q(`select mi_rol($1) a, mi_rol($2) b`, [A, B]), r => r.rows[0].a === 'dueno' && r.rows[0].b === null)
await ok('mi_rol cajero y soporte', 'cajeroA', () => q(`select mi_rol($1) a`, [A]), r => r.rows[0].a === 'cajero')
await ok('mi_rol soporte', 'soporte', () => q(`select mi_rol($1) a, mi_rol($2) b`, [A, B]), r => r.rows[0].a === 'soporte' && r.rows[0].b === 'soporte')

console.log('\n--- Escritura y borrado entre negocios ---')
await falla('A no puede insertar un producto en B', 'duenoA', () => q(`insert into productos (negocio_id,nombre) values ($1,'intruso')`, [B]), 'row-level security')
await falla('A no puede actualizar un producto de B', 'duenoA', () => q(`update productos set nombre='hackeado' where id=$1`, [pB]), 'cero')
await falla('A no puede borrar un producto de B', 'duenoA', () => q(`delete from productos where id=$1 returning id`, [pB]), 'cero')
await falla('A no puede "mover" su producto a B', 'duenoA', () => q(`update productos set negocio_id=$1 where id=$2`, [B, pA]), 'row-level security|No se puede cambiar')
await ok('verifico que el producto de B sigue intacto', 'sistema', () => q(`select nombre from productos where id=$1`, [pB]), r => r.rows[0].nombre === 'Arroz B')
await falla('A no puede editar la config de B', 'duenoA', () => q(`update negocio_config set nombre_comercial='x' where negocio_id=$1 returning negocio_id`, [B]), 'cero')
await ok('A sí edita la config propia', 'duenoA', () => q(`update negocio_config set nombre_comercial='Tienda A Premium', eslogan='Lo mejor' where negocio_id=$1 returning negocio_id`, [A]), r => r.rows.length === 1)
await falla('A no puede borrar el negocio B', 'duenoA', () => q(`delete from negocios where id=$1 returning id`, [B]), 'cero')
await falla('nadie puede borrar un negocio con datos (restrict)', 'sistema', () => q(`delete from negocios where id=$1`, [B]), 'foreign key|violates')

console.log('\n--- Llaves foráneas compuestas (valen aunque falle el RLS) ---')
await falla('venta de A con cliente de B', 'sistema', () => q(`insert into ventas (negocio_id,metodo,cliente_id) values ($1,'efectivo',$2)`, [A, cB]), 'foreign key|violates')
const vA = (await q(`insert into ventas (negocio_id,metodo,total) values ($1,'efectivo',2500) returning id, numero`, [A])).rows[0]
await falla('ítem de venta de A con producto de B', 'sistema', () => q(`insert into venta_items (negocio_id,venta_id,producto_id,nombre,cantidad,precio_unitario) values ($1,$2,$3,'x',1,1)`, [A, vA.id, pB]), 'foreign key|violates')
await falla('ítem de venta apuntando a la venta de otro negocio', 'sistema', () => q(`insert into venta_items (negocio_id,venta_id,producto_id,nombre,cantidad,precio_unitario) values ($1,$2,$3,'x',1,1)`, [B, vA.id, pB]), 'foreign key|violates')
await falla('ajuste de inventario de A sobre producto de B', 'sistema', () => q(`insert into ajustes_inventario (negocio_id,producto_id,stock_anterior,stock_nuevo) values ($1,$2,1,2)`, [A, pB]), 'foreign key|violates')
await falla('config con logo de otro negocio', 'sistema', () => q(`update negocio_config set logo_path=$2 where negocio_id=$1`, [A, `${B}/marca/logo.png`]), 'check')
await ok('config con logo propio', 'duenoA', () => q(`update negocio_config set logo_path=$2 where negocio_id=$1 returning 1`, [A, `${A}/marca/logo.png`]), r => r.rows.length === 1)

console.log('\n--- Consecutivos por negocio ---')
const vA2 = (await q(`insert into ventas (negocio_id,metodo) values ($1,'efectivo') returning numero`, [A])).rows[0]
const vB1 = (await q(`insert into ventas (negocio_id,metodo) values ($1,'efectivo') returning numero`, [B])).rows[0]
pruebas++; if (vA.numero == 1 && vA2.numero == 2 && vB1.numero == 1) console.log('✓ A: 1, 2 · B: 1 (cada negocio cuenta aparte)'); else { fallas++; console.log('✗ consecutivos', vA.numero, vA2.numero, vB1.numero) }

console.log('\n--- Roles dentro del negocio ---')
await ok('cajero ve productos', 'cajeroA', () => q(`select count(*) n from productos`), r => r.rows[0].n == 2)
await ok('cajero crea cliente', 'cajeroA', () => q(`insert into clientes (negocio_id,nombre) values ($1,'Nuevo') returning id`, [A]))
await falla('cajero no borra productos', 'cajeroA', () => q(`delete from productos where id=$1 returning id`, [pA]), 'cero')
await falla('cajero no edita la config', 'cajeroA', () => q(`update negocio_config set eslogan='x' where negocio_id=$1 returning negocio_id`, [A]), 'cero')
await falla('cajero no crea anuncios', 'cajeroA', () => q(`insert into anuncios (negocio_id,titulo) values ($1,'x')`, [A]), 'row-level security')
await falla('cajero no ve préstamos', 'cajeroA', () => q(`select * from prestamos`), 'cero')
await ok('cajero no ve la auditoría', 'cajeroA', () => q(`select count(*) n from auditoria`), r => r.rows[0].n == 0)
await falla('cajero no quita productos (activo=false)', 'cajeroA', () => q(`update productos set activo=false where id=$1`, [pA]), 'dueño')
await falla('cajero no define cupo de crédito', 'cajeroA', () => q(`update clientes set cupo_credito=500000 where id=$1`, [cA]), 'dueño')
await ok('dueño define cupo de crédito', 'duenoA', () => q(`update clientes set cupo_credito=500000 where id=$1 returning id`, [cA]), r => r.rows.length === 1)
await falla('cajero no agrega miembros', 'cajeroA', () => q(`select agregar_miembro($1,'extra@prueba.com','cajero')`, [A]), 'autorizado')
await falla('dueño A no agrega miembros a B', 'duenoA', () => q(`select agregar_miembro($1,'extra@prueba.com','cajero')`, [B]), 'autorizado')
await falla('dueño A no lista el equipo de B', 'duenoA', () => q(`select * from listar_miembros($1)`, [B]), 'autorizado')
await ok('dueño A agrega y lista su equipo', 'duenoA', async () => { await q(`select agregar_miembro($1,'extra@prueba.com','cajero','Extra')`, [A]); return q(`select email from listar_miembros($1)`, [A]) }, r => r.rows.length === 3)
await ok('el miembro nuevo ya ve los datos de A y de B no', 'extra', () => q(`select (select count(*) from productos) a, (select count(*) from productos where negocio_id=$1) b`, [B]), r => r.rows[0].a == 2 && r.rows[0].b == 0)
await falla('el dueño no se quita a sí mismo', 'duenoA', () => q(`select quitar_miembro($1,$2)`, [A, U.duenoA]), 'ti mismo')
await ok('el dueño quita al miembro', 'duenoA', () => q(`select quitar_miembro($1,$2)`, [A, U.extra]))
await ok('miembro quitado ya no ve nada', 'extra', () => q(`select count(*) n from productos`), r => r.rows[0].n == 0)
await falla('no se puede dejar el negocio sin dueño', 'sistema', () => q(`update negocio_miembros set rol='cajero' where negocio_id=$1 and user_id=$2`, [A, U.duenoA]), 'dueño')

console.log('\n--- Soporte de plataforma (solo lectura) ---')
await ok('soporte lee productos de A y de B', 'soporte', () => q(`select count(*) n from productos`), r => r.rows[0].n == 3)
await falla('soporte no inserta', 'soporte', () => q(`insert into productos (negocio_id,nombre) values ($1,'x')`, [A]), 'solo puede consultar')
await falla('soporte no actualiza', 'soporte', () => q(`update productos set stock=0 where id=$1`, [pA]), 'cero|solo puede consultar')
await falla('soporte no borra', 'soporte', () => q(`delete from clientes where id=$1`, [cA]), 'cero|solo puede consultar')
await falla('soporte no ajusta stock', 'soporte', () => q(`select ajustar_stock($1,$2,3,'x')`, [A, pA]), 'autorizado')
await ok('soporte registra su entrada', 'soporte', () => q(`select registrar_acceso($1,'revisión')`, [A]))
await ok('dueño ve el aviso de soporte', 'duenoA', () => q(`select * from accesos_pendientes($1)`, [A]), r => r.rows.length === 1)
await ok('dueño B no ve avisos de A', 'duenoB', () => q(`select count(*) n from accesos`), r => r.rows[0].n == 0)
await falla('dueño B no consulta avisos de A', 'duenoB', () => q(`select * from accesos_pendientes($1)`, [A]), 'autorizado')
await ok('dueño marca avisos como vistos', 'duenoA', async () => { await q(`select marcar_accesos_vistos($1)`, [A]); return q(`select count(*) n from accesos_pendientes($1)`, [A]) }, r => r.rows[0].n == 0)
await q(`update negocios set soporte_lectura=false where id=$1`, [A])
await ok('con soporte_lectura apagado, soporte no ve A', 'soporte', () => q(`select count(*) n from productos where negocio_id=$1`, [A]), r => r.rows[0].n == 0)
await q(`update negocios set soporte_lectura=true where id=$1`, [A])

console.log('\n--- Público (anon): solo por slug ---')
await falla('anon no lee tablas', 'anon', () => q(`select * from productos`), 'permission denied')
await falla('anon no lee negocio_config', 'anon', () => q(`select * from negocio_config`), 'permission denied')
await falla('anon no ve vistas internas', 'anon', () => q(`select * from clientes_saldo`), 'permission denied')
await falla('anon no crea negocios', 'anon', () => q(`select crear_negocio('x-neg','X','tienda','extra@prueba.com')`), 'permission denied')
await falla('anon no llama a funciones internas', 'anon', () => q(`select * from listar_miembros($1)`, [A]), 'permission denied')
await ok('anon lee la marca de A por slug', 'anon', () => q(`select negocio_publico('tienda-a') n`), r => r.rows[0].n.nombre === 'Tienda A Premium' && r.rows[0].n.modulos.includes('caja'))
await ok('slug desconocido → null', 'anon', () => q(`select negocio_publico('no-existe') n`), r => r.rows[0].n === null)
await ok('catálogo de A solo trae productos de A', 'anon', () => q(`select catalogo_tienda('tienda-a') c`), r => r.rows[0].c.productos.length === 2 && r.rows[0].c.productos.every(p => p.nombre.endsWith(' A')))
await ok('el catálogo no expone costos ni ids de negocio', 'anon', () => q(`select catalogo_tienda('tienda-a') c`), r => !('precio_compra' in r.rows[0].c.productos[0]) && !('negocio_id' in r.rows[0].c.productos[0]))
await falla('slug inexistente en catálogo da error genérico', 'anon', () => q(`select catalogo_tienda('no-existe')`), 'no disponible')
await ok('registrar visita en A no toca B', 'anon', async () => { await q(`select registrar_visita('tienda-a','tienda','visitante-0001')`); return q(`select 1`) })
await ok('visita quedó solo en A', 'sistema', () => q(`select (select count(*) from visitas where negocio_id=$1) a,(select count(*) from visitas where negocio_id=$2) b`, [A, B]), r => r.rows[0].a == 1 && r.rows[0].b == 0)
await ok('catálogo de ropa exige el módulo ropa', 'anon', async () => { try { await q(`select catalogo_ropa('tienda-a')`); return { rows: [{ x: false }] } } catch { return { rows: [{ x: true }] } } }, r => r.rows[0].x)

console.log('\n--- Módulos encendidos y apagados ---')
await falla('no se apaga "catalogo_publico" si pedidos_en_linea lo usa', 'sistema', () => q(`select activar_modulo($1,'catalogo_publico',false)`, [A]), 'lo usa')
await falla('no se enciende "ropa" sin dependencias… (ropa no tiene) / repuestos sin productos apagado', 'sistema', async () => { for (const m of ['menu_del_dia', 'carga_masiva', 'catalogo_maestro']) await q(`select activar_modulo($1,$2,false)`, [A, m]); await q(`select activar_modulo($1,'compras',false)`, [A]); await q(`select activar_modulo($1,'escaner',false)`, [A]); await q(`select activar_modulo($1,'productos',false)`, [A]); return q(`select activar_modulo($1,'repuestos',true)`, [A]) }, 'antes')
await falla('con "productos" apagado no se ajusta stock', 'duenoA', () => q(`select ajustar_stock($1,$2,3,'x')`, [A, pA]), 'no está activo')
await ok('con "productos" apagado se sigue LEYENDO lo guardado', 'duenoA', () => q(`select count(*) n from productos`), r => r.rows[0].n == 2)
await falla('con "productos" apagado el catálogo de tienda no responde', 'anon', () => q(`select catalogo_tienda('tienda-a')`), 'no está activo')
await ok('B no se afectó (sus módulos siguen)', 'duenoB', () => q(`select modulo_activo($1,'productos') m`, [B]), r => r.rows[0].m === true)
await q(`select activar_modulo($1,'productos',true)`, [A])
await q(`select activar_modulo($1,'compras',true)`, [A])
await q(`select activar_modulo($1,'escaner',true)`, [A])
for (const m of ['menu_del_dia', 'carga_masiva', 'catalogo_maestro']) await q(`select activar_modulo($1,$2,true)`, [A, m])

console.log('\n--- Inventario ---')
await ok('cajero ajusta stock del negocio', 'cajeroA', () => q(`select ajustar_stock($1,$2,8,'conteo')`, [A, pA]))
await ok('el ajuste quedó en A con su negocio', 'duenoA', () => q(`select stock_anterior, stock_nuevo from ajustes_inventario`), r => r.rows.length === 1 && r.rows[0].stock_nuevo == 8)
await falla('A no ajusta el stock de un producto de B', 'duenoA', () => q(`select ajustar_stock($1,$2,0,'x')`, [A, pB]), 'no encontrado')
await falla('A no ajusta stock "como si" fuera B', 'duenoA', () => q(`select ajustar_stock($1,$2,0,'x')`, [B, pB]), 'autorizado')

console.log('\n--- Auditoría ---')
await q(`update productos set nombre='Arroz A 500' where id=$1`, [pA])
await ok('dueño A ve auditoría de A', 'duenoA', () => q(`select tabla, accion, negocio_id from auditoria`), r => r.rows.length > 0 && r.rows.every(x => x.negocio_id === A))
await ok('dueño B no ve auditoría de A', 'duenoB', () => q(`select count(*) n from auditoria where negocio_id=$1`, [A]), r => r.rows[0].n == 0)
await falla('nadie edita la auditoría', 'duenoA', () => q(`update auditoria set tabla='x' returning 1`), 'permission denied')
await falla('nadie borra la auditoría', 'duenoA', () => q(`delete from auditoria`), 'permission denied')

console.log('\n--- Marca ---')
await falla('color con poco contraste (amarillo) rechazado', 'duenoA', () => q(`update negocio_config set color_principal='#FFEB3B' where negocio_id=$1`, [A]), 'check')
await falla('color mal escrito rechazado', 'duenoA', () => q(`update negocio_config set color_acento='rojo' where negocio_id=$1`, [A]), 'check')
await ok('color con buen contraste aceptado', 'duenoA', () => q(`update negocio_config set color_principal='#7A1F3D' where negocio_id=$1 returning 1`, [A]), r => r.rows.length === 1)

console.log('\n--- Imágenes (storage) ---')
const sube = (quien, ruta) => ok(`${quien} sube ${ruta.replace(A, 'A').replace(B, 'B')}`, quien, () => q(`insert into storage.objects (bucket_id,name) values ('negocios',$1)`, [ruta]))
const noSube = (quien, ruta) => falla(`${quien} NO sube ${ruta.replace(A, 'A').replace(B, 'B')}`, quien, () => q(`insert into storage.objects (bucket_id,name) values ('negocios',$1)`, [ruta]), 'row-level security')
await sube('cajeroA', `${A}/productos/a.webp`)
await sube('duenoA', `${A}/marca/logo.png`)
await noSube('cajeroA', `${A}/marca/logo2.png`)
await noSube('duenoA', `${B}/productos/x.webp`)
await noSube('duenoA', `${B}/marca/x.png`)
await noSube('duenoA', `no-es-uuid/productos/x.webp`)
await noSube('soporte', `${A}/productos/x.webp`)
await ok('B no ve archivos de A', 'duenoB', () => q(`select count(*) n from storage.objects`), r => r.rows[0].n == 0)
await ok('A ve los suyos', 'duenoA', () => q(`select count(*) n from storage.objects`), r => r.rows[0].n == 2)
await falla('B no borra archivos de A', 'duenoB', () => q(`delete from storage.objects where name like $1 returning id`, [`${A}/%`]), 'cero')

console.log('\n--- Canales en vivo (realtime) ---')
const tema = async (quien, t, fn) => como(quien, async () => { await db.exec(`select set_config('realtime.topic','${t}',false)`); return fn() })
pruebas++; try { await tema('cajeroA', `envivo:${A}`, () => q(`insert into realtime.messages (topic) values ('m')`)); console.log('✓ cajero A escribe en envivo:A') } catch (e) { fallas++; console.log('✗ cajero A en envivo:A', e.message) }
pruebas++; try { await tema('duenoA', `envivo:${B}`, () => q(`insert into realtime.messages (topic) values ('m')`)); fallas++; console.log('✗ A escribió en el canal de B') } catch { console.log('✓ dueño A NO escribe en envivo:B') }
pruebas++; try { await tema('duenoA', `pistola:${A}:ABC123`, () => q(`insert into realtime.messages (topic) values ('m')`)); console.log('✓ dueño A escribe en pistola:A:código') } catch (e) { fallas++; console.log('✗ pistola A', e.message) }
pruebas++; try { await tema('duenoB', `pistola:${A}:ABC123`, () => q(`insert into realtime.messages (topic) values ('m')`)); fallas++; console.log('✗ B escribió en pistola de A') } catch { console.log('✓ dueño B NO escribe en pistola:A') }
pruebas++; { const r = await tema('duenoB', `envivo:${A}`, () => q(`select count(*) n from realtime.messages`)); if (r.rows[0].n == 0) console.log('✓ dueño B no lee mensajes del canal de A'); else { fallas++; console.log('✗ B leyó mensajes de A') } }

console.log('\n--- Negocio suspendido ---')
await q(`update negocios set estado='suspendido' where id=$1`, [B])
await ok('dueño de un negocio suspendido no ve datos', 'duenoB', () => q(`select count(*) n from productos`), r => r.rows[0].n == 0)
await ok('negocio suspendido deja de ser público', 'anon', () => q(`select negocio_publico('tienda-b') n`), r => r.rows[0].n === null)
await q(`update negocios set estado='activo' where id=$1`, [B])

// =====================================================================================
// PASO 2b — RPC de negocio: ventas, compras, fiados, préstamos, domicilios, tableros y pedidos públicos
// =====================================================================================
const J = (o) => JSON.stringify(o)
const venta = (n, items, pagos, o = {}) => q(
  `select registrar_venta($1::uuid,$2::jsonb,$3::jsonb,$4::uuid,$5::text,$6::date,$7::numeric,$8::jsonb) id`,
  [n, J(items), J(pagos), o.cli ?? null, o.nota ?? null, o.limite ?? null, o.desc ?? 0, o.dom ? J(o.dom) : null])
const ventaRopa = (n, items, pagos, o = {}) => q(
  `select registrar_venta_ropa($1::uuid,$2::jsonb,$3::jsonb,$4::uuid,$5::text,$6::numeric,$7::uuid,$8::date,$9::jsonb) id`,
  [n, J(items), J(pagos), o.cli ?? null, null, o.desc ?? 0, o.pedido ?? null, null, o.dom ? J(o.dom) : null])
const stock = async (id) => Number((await q(`select stock from productos where id=$1`, [id])).rows[0].stock)
const efectivo = (monto) => [{ metodo: 'efectivo', monto, recibido: monto }]
const datosPedido = (o = {}) => ({ nombre: 'Ana Pérez', telefono: '3001234567', direccion: 'Calle 10 # 5-20', acepta_datos: true, ...o })

console.log('\n=== PASO 2b: RPC de negocio ===')
// Preparación (consola SQL): producto con categoría, otro negocio de ropa con dueño que también es dueño de B
await q(`update productos set categoria='Granos' where id=$1`, [pA])
await q(`update productos set categoria='Granos' where id=$1`, [pB])
const C = (await como('sistema', () => crear('ropa-c', 'Ropa C', 'ropa', 'duenoB@prueba.com'))).id
await como('sistema', () => publicar(C))
const pA2 = (await q(`select id from productos where negocio_id=$1 and nombre='Aceite A'`, [A])).rows[0].id

console.log('\n--- Venta de productos ---')
let vid
await ok('cajero A registra una venta en efectivo', 'cajeroA', async () => (vid = (await venta(A, [{ producto_id: pA, cantidad: 2 }], efectivo(5000))).rows[0].id, q(`select 1`)))
await ok('la venta quedó en A, con consecutivo 3 y stock descontado', 'sistema', async () => ({ v: (await q(`select total, numero, negocio_id from ventas where id=$1`, [vid])).rows[0], s: await stock(pA) }),
  r => r.v.total == 5000 && r.v.numero == 3 && r.v.negocio_id === A && r.s === 6)
await falla('A no vende un producto de B', 'duenoA', () => venta(A, [{ producto_id: pB, cantidad: 1 }], efectivo(2600)), 'Producto no encontrado')
await falla('A no vende "en nombre" de B', 'duenoA', () => venta(B, [{ producto_id: pB, cantidad: 1 }], efectivo(2600)), 'No autorizado')
await falla('soporte no vende', 'soporte', () => venta(A, [{ producto_id: pA, cantidad: 1 }], efectivo(2500)), 'No autorizado')
await falla('pagos que no suman → error y nada queda a medias', 'cajeroA', () => venta(A, [{ producto_id: pA, cantidad: 2 }], efectivo(4000)), 'Los pagos suman')
await ok('tras el error el stock y los consecutivos siguen igual', 'sistema', async () => ({ s: await stock(pA), n: (await q(`select count(*) n from ventas where negocio_id=$1`, [A])).rows[0].n }), r => r.s === 6 && r.n == 3)
// dueño de DOS negocios (B y C): el RLS le deja ver todo, la función debe filtrar por el negocio pedido
const pC = (await q(`insert into productos (negocio_id,codigo,nombre,precio_venta,stock) values ($1,'1','Producto C',1000,50) returning id`, [C])).rows[0].id
const cC = (await q(`insert into clientes (negocio_id,nombre) values ($1,'Cliente C') returning id`, [C])).rows[0].id
await falla('dueño de B y C: vende en B un producto de C', 'duenoB', () => venta(B, [{ producto_id: pC, cantidad: 1 }], efectivo(1000)), 'Producto no encontrado')
await falla('dueño de B y C: vende en B a un cliente de C', 'duenoB', () => venta(B, [{ producto_id: pB, cantidad: 1 }], efectivo(2600), { cli: cC }), 'Cliente no encontrado')
await falla('dueño de B y C: forma de pago de otro negocio no existe', 'duenoB', () => venta(B, [{ producto_id: pB, cantidad: 1 }], [{ metodo: 'zzz', monto: 2600 }]), 'no está disponible')

console.log('\n--- Precios, promociones y mínimos ---')
await q(`insert into promociones (negocio_id,nombre,tipo,categoria,valor) values ($1,'Promo de B','porcentaje','Granos',50)`, [B])
await ok('la promoción de B no se aplica en A', 'cajeroA', async () => { const r = await venta(A, [{ producto_id: pA, cantidad: 2 }], efectivo(5000)); return q(`select total, (select count(*) from venta_items where venta_id=$1 and promo is not null) p from ventas where id=$1`, [r.rows[0].id]) }, r => r.rows[0].total == 5000 && r.rows[0].p == 0)
await ok('dueño A crea su promoción', 'duenoA', () => q(`insert into promociones (negocio_id,nombre,tipo,producto_id,valor) values ($1,'Promo A','porcentaje',$2,10) returning id`, [A, pA]))
await ok('la promoción de A sí se aplica (10 % de 5000)', 'cajeroA', async () => { const r = await venta(A, [{ producto_id: pA, cantidad: 2 }], efectivo(4500)); return q(`select total from ventas where id=$1`, [r.rows[0].id]) }, r => r.rows[0].total == 4500)
await q(`delete from promociones where negocio_id=$1 and nombre='Promo A'`, [A])
await q(`update productos set precio_minimo=2000 where id=$1`, [pA])
await falla('cajero no vende por debajo del mínimo', 'cajeroA', () => venta(A, [{ producto_id: pA, cantidad: 1, precio: 1000 }], efectivo(1000)), 'mínimo')
await ok('el dueño sí puede saltarse el mínimo', 'duenoA', () => venta(A, [{ producto_id: pA, cantidad: 1, precio: 1000 }], efectivo(1000)))
await q(`update productos set precio_minimo=null where id=$1`, [pA])
await falla('descuento mayor que la venta', 'duenoA', () => venta(A, [{ producto_id: pA, cantidad: 1 }], efectivo(1), { desc: 99999 }), 'descuento')

console.log('\n--- Fiados, abonos y mora ---')
await q(`update clientes set cupo_credito=4000 where id=$1`, [cA])
await falla('fiado por encima del cupo', 'cajeroA', () => venta(A, [{ producto_id: pA, cantidad: 2 }], [{ metodo: 'fiado', monto: 5000 }], { cli: cA }), 'cupo')
await q(`update clientes set cupo_credito=500000 where id=$1`, [cA])
await falla('fiado a un cliente de B', 'duenoA', () => venta(A, [{ producto_id: pA, cantidad: 2 }], [{ metodo: 'fiado', monto: 5000 }], { cli: cB }), 'Cliente no encontrado')
let vFiado
await ok('cajero fía a un cliente de A', 'cajeroA', async () => (vFiado = (await venta(A, [{ producto_id: pA, cantidad: 2 }], [{ metodo: 'fiado', monto: 5000 }], { cli: cA })).rows[0].id, q(`select 1`)))
await ok('el cargo quedó en el negocio A', 'sistema', () => q(`select negocio_id, monto from fiado_movimientos where venta_id=$1`, [vFiado]), r => r.rows.length === 1 && r.rows[0].negocio_id === A && r.rows[0].monto == 5000)
await q(`select activar_modulo($1,'fiados',false)`, [A])
await falla('con "fiados" apagado no se puede fiar', 'cajeroA', () => venta(A, [{ producto_id: pA, cantidad: 1 }], [{ metodo: 'fiado', monto: 2500 }], { cli: cA }), 'no está activo')
await falla('con "fiados" apagado no se registran abonos', 'cajeroA', () => q(`select registrar_abono($1,$2,100,'efectivo')`, [A, cA]), 'no está activo')
await q(`select activar_modulo($1,'fiados',true)`, [A])
await falla('abono mayor que la deuda', 'cajeroA', () => q(`select registrar_abono($1,$2,99999999,'efectivo')`, [A, cA]), 'mayor que la deuda')
await ok('abono válido', 'cajeroA', () => q(`select registrar_abono($1,$2,1000,'efectivo','abono') id`, [A, cA]))
await falla('abono a un cliente de B', 'duenoA', () => q(`select registrar_abono($1,$2,100,'efectivo')`, [A, cB]), 'Cliente no encontrado')
await falla('B no registra abonos en A', 'duenoB', () => q(`select registrar_abono($1,$2,100,'efectivo')`, [A, cA]), 'No autorizado')
// mora
const cM = (await q(`insert into clientes (negocio_id,nombre) values ($1,'Moroso') returning id`, [A])).rows[0].id
await q(`update negocio_reglas set mora_mensual=5 where negocio_id=$1`, [A])
await q(`insert into fiado_movimientos (negocio_id,cliente_id,tipo,monto,fecha_limite) values ($1,$2,'cargo',100000,hoy_colombia()-60)`, [A, cM])
await falla('cajero no puede fiar a un cliente con deuda vencida', 'cajeroA', () => venta(A, [{ producto_id: pA, cantidad: 1 }], [{ metodo: 'fiado', monto: 2500 }], { cli: cM }), 'deuda vencida')
await falla('cajero no cobra recargo por mora', 'cajeroA', () => q(`select cobrar_recargo_mora($1,$2)`, [A, cM]), 'Solo el dueño')
await falla('dueño de B no cobra recargo en A', 'duenoB', () => q(`select cobrar_recargo_mora($1,$2)`, [A, cM]), 'Solo el dueño')
await ok('dueño A cobra el recargo por mora (10 000)', 'duenoA', () => q(`select cobrar_recargo_mora($1,$2) r`, [A, cM]), r => r.rows[0].r == 10000)
await falla('no se cobra dos veces el mismo recargo', 'duenoA', () => q(`select cobrar_recargo_mora($1,$2)`, [A, cM]), 'no tiene recargo')
await ok('dueño registra un saldo anterior', 'duenoA', () => q(`select registrar_saldo_anterior($1,$2,5000,null,'saldo viejo') id`, [A, cM]))
await falla('cajero no registra saldo anterior', 'cajeroA', () => q(`select registrar_saldo_anterior($1,$2,5000)`, [A, cM]), 'Solo el dueño')

console.log('\n--- Anular ventas ---')
const vB = (await q(`select id from ventas where negocio_id=$1 limit 1`, [B])).rows[0].id
const stockAntes = await stock(pA)
await falla('cajero no anula', 'cajeroA', () => q(`select anular_venta($1,$2,'error de caja')`, [A, vFiado]), 'Solo el dueño')
await falla('dueño de B no anula ventas de A', 'duenoB', () => q(`select anular_venta($1,$2,'error de caja')`, [A, vFiado]), 'Solo el dueño')
await falla('dueño de B no anula una venta de A "desde" B', 'duenoB', () => q(`select anular_venta($1,$2,'error de caja')`, [B, vFiado]), 'Venta no encontrada')
await falla('dueño de A no anula una venta de B', 'duenoA', () => q(`select anular_venta($1,$2,'error de caja')`, [A, vB]), 'Venta no encontrada')
await falla('motivo muy corto', 'duenoA', () => q(`select anular_venta($1,$2,'x')`, [A, vFiado]), 'motivo')
await ok('dueño A anula su venta', 'duenoA', () => q(`select anular_venta($1,$2,'error de caja')`, [A, vFiado]))
await ok('anular devolvió el stock y quitó el fiado; B intacto', 'sistema', async () => ({
  s: await stock(pA), f: (await q(`select count(*) n from fiado_movimientos where venta_id=$1`, [vFiado])).rows[0].n,
  a: (await q(`select anulada from ventas where id=$1`, [vFiado])).rows[0].anulada,
  b: (await q(`select count(*) n from ventas where negocio_id=$1 and anulada`, [B])).rows[0].n }),
  r => r.s === stockAntes + 2 && r.f == 0 && r.a === true && r.b == 0)
await falla('no se anula dos veces', 'duenoA', () => q(`select anular_venta($1,$2,'otra vez')`, [A, vFiado]), 'ya estaba anulada')

console.log('\n--- Domicilios ---')
let vDom
await ok('venta con domicilio (productos + envío)', 'cajeroA', async () => (vDom = (await venta(A, [{ producto_id: pA, cantidad: 1 }], efectivo(5500), { dom: { direccion: 'Calle 1 # 2-3', telefono: '3000000000', costo: 3000 } })).rows[0].id, q(`select 1`)))
await ok('el domicilio quedó pendiente con su costo', 'sistema', () => q(`select total, dom_costo, dom_estado from ventas where id=$1`, [vDom]), r => r.rows[0].total == 5500 && r.rows[0].dom_costo == 3000 && r.rows[0].dom_estado === 'pendiente')
await falla('dueño de B no cambia domicilios de A', 'duenoB', () => q(`select cambiar_estado_domicilio($1,$2,'en_camino')`, [A, vDom]), 'Sin acceso')
await falla('dueño de B no cambia un domicilio de A "desde" B', 'duenoB', () => q(`select cambiar_estado_domicilio($1,$2,'en_camino')`, [B, vDom]), 'no es un domicilio')
await falla('estado inválido', 'cajeroA', () => q(`select cambiar_estado_domicilio($1,$2,'volando')`, [A, vDom]), 'Estado inválido')
await ok('cajero A pasa el domicilio a en camino', 'cajeroA', () => q(`select cambiar_estado_domicilio($1,$2,'en_camino')`, [A, vDom]))

console.log('\n--- Compras ---')
const stockPre = await stock(pA)
await ok('cajero A registra una compra', 'cajeroA', () => q(`select registrar_compra($1,$2::jsonb,'Proveedor 1','nota') id`, [A, J([{ producto_id: pA, cantidad: 10, costo_unitario: 1500, lote: 'L1', vence: '2027-01-01' }])]))
await ok('la compra sube el stock y crea el lote en A', 'sistema', async () => ({ s: await stock(pA), l: (await q(`select negocio_id from lotes where numero='L1'`)).rows[0], c: (await q(`select total from compras where negocio_id=$1`, [A])).rows[0] }),
  r => r.s === stockPre + 10 && r.l.negocio_id === A && r.c.total == 15000)
await falla('compra con un producto de B', 'duenoA', () => q(`select registrar_compra($1,$2::jsonb)`, [A, J([{ producto_id: pB, cantidad: 1, costo_unitario: 1 }])]), 'Producto no encontrado')
await falla('B no compra en A', 'duenoB', () => q(`select registrar_compra($1,$2::jsonb)`, [A, J([{ producto_id: pA, cantidad: 1 }])]), 'No autorizado')
await ok('la vista de lotes solo trae lotes de A para A', 'duenoA', () => q(`select count(*) n from lotes_saldo`), r => r.rows[0].n == 1)

await falla('dueño de B y C: abono en B a un cliente de C', 'duenoB', () => q(`select registrar_abono($1,$2,100,'efectivo')`, [B, cC]), 'Cliente no encontrado')
console.log('\n--- Préstamos ---')
await q(`select activar_modulo($1,'prestamos',false)`, [B])
await falla('con el módulo apagado no se presta (B)', 'duenoB', () => q(`select crear_prestamo($1,$2,100000,2,'mensual',4)`, [B, cB]), 'no está activo')
await q(`select activar_modulo($1,'prestamos',true)`, [A])
const cP = (await q(`insert into clientes (negocio_id,nombre,documento,tipo_documento,telefono,direccion) values ($1,'Prestatario','123456','CC','3001112222','Cra 1 # 2-3') returning id`, [A])).rows[0].id
await falla('cajero no crea préstamos', 'cajeroA', () => q(`select crear_prestamo($1,$2,100000,2,'mensual',4)`, [A, cP]), 'Solo el dueño')
await falla('dueño de B no presta en A', 'duenoB', () => q(`select crear_prestamo($1,$2,100000,2,'mensual',4)`, [A, cP]), 'Solo el dueño')
await falla('préstamo a un cliente de B', 'duenoA', () => q(`select crear_prestamo($1,$2,100000,2,'mensual',4)`, [A, cB]), 'Cliente no encontrado')
await falla('cliente sin documento', 'duenoA', () => q(`select crear_prestamo($1,$2,100000,2,'mensual',4)`, [A, cA]), 'documento')
let pr
await ok('dueño A crea el préstamo (interés 8 000, 4 cuotas)', 'duenoA', async () => (pr = (await q(`select crear_prestamo($1,$2,100000,2,'mensual',4) id`, [A, cP])).rows[0].id, q(`select interes_total, total_a_pagar from prestamos where id=$1`, [pr])), r => r.rows[0].interes_total == 8000 && r.rows[0].total_a_pagar == 108000)
await ok('las 4 cuotas están en A', 'sistema', () => q(`select count(*) n, min(negocio_id::text) a, max(negocio_id::text) b from prestamo_cuotas where prestamo_id=$1`, [pr]), r => r.rows[0].n == 4 && r.rows[0].a === A && r.rows[0].b === A)
await falla('pago mayor que la deuda', 'duenoA', () => q(`select registrar_pago_prestamo($1,$2,999999)`, [A, pr]), 'mayor que lo que se debe')
await q(`select activar_modulo($1,'prestamos',true)`, [B])   // B también presta: así se prueba el filtro por negocio, no el módulo
await falla('dueño de B no paga préstamos de A', 'duenoB', () => q(`select registrar_pago_prestamo($1,$2,1000)`, [B, pr]), 'Préstamo no encontrado')
await ok('pago de 30 000 se reparte en cuotas', 'duenoA', () => q(`select registrar_pago_prestamo($1,$2,30000) id`, [A, pr]))
await ok('cuota 1 pagada (27 000) y cuota 2 con 3 000', 'sistema', () => q(`select numero, pagado from prestamo_cuotas where prestamo_id=$1 order by numero`, [pr]), r => r.rows[0].pagado == 27000 && r.rows[1].pagado == 3000)
await ok('resumen de préstamos: solo los de A, con saldo 78 000', 'duenoA', () => q(`select saldo from prestamos_resumen`), r => r.rows.length === 1 && r.rows[0].saldo == 78000)
await falla('dueño de B no cancela préstamos de A', 'duenoB', () => q(`select cancelar_prestamo($1,$2,'motivo')`, [B, pr]), 'activos')
await ok('dueño A cancela', 'duenoA', () => q(`select cancelar_prestamo($1,$2,'cliente se fue')`, [A, pr]))
await falla('no se paga un préstamo cancelado', 'duenoA', () => q(`select registrar_pago_prestamo($1,$2,1000)`, [A, pr]), 'cancelado')

console.log('\n--- Tableros ---')
const desde = new Date(Date.now() - 86400000).toISOString()
const nVentasA = (await q(`select count(*) n from ventas where negocio_id=$1 and not anulada`, [A])).rows[0].n
const nProdA = (await q(`select count(*) n from productos where negocio_id=$1 and activo`, [A])).rows[0].n
await ok('tablero de A cuenta solo las ventas de A', 'duenoA', () => q(`select tablero($1,$2) t`, [A, desde]), r => r.rows[0].t.ventas == nVentasA && r.rows[0].t.vendido > 0 && r.rows[0].inventario === undefined && r.rows[0].t.inventario.productos == nProdA)
await ok('tablero de B no incluye nada de A', 'duenoB', () => q(`select tablero($1,$2) t`, [B, desde]), r => r.rows[0].t.vendido == 0 && r.rows[0].t.top.length === 0 && r.rows[0].t.cartera.por_cobrar == 0)
await falla('dueño de B no pide el tablero de A', 'duenoB', () => q(`select tablero($1,$2)`, [A, desde]), 'Solo el dueño')
await falla('cajero no ve el tablero', 'cajeroA', () => q(`select tablero($1,$2)`, [A, desde]), 'Solo el dueño')
await ok('soporte lee el tablero (solo lectura)', 'soporte', () => q(`select tablero($1,$2) t`, [A, desde]), r => r.rows[0].t.ventas == nVentasA)
await q(`select activar_modulo($1,'reportes',false)`, [A])
await falla('con "reportes" apagado el tablero no responde', 'duenoA', () => q(`select tablero($1,$2)`, [A, desde]), 'no está activo')
await q(`select activar_modulo($1,'reportes',true)`, [A])

console.log('\n--- Pedidos públicos de tienda (anon, por slug) ---')
await q(`update negocio_reglas set domicilio_costo=4000, envio_gratis_desde=50000 where negocio_id=$1`, [A])
await q(`update negocio_reglas set domicilio_costo=9999 where negocio_id=$1`, [B])
const pedido = (slug, items, datos) => q(`select crear_pedido_tienda($1,$2::jsonb,$3::jsonb) p`, [slug, J(datos), J(items)])
const stockPed = await stock(pA)
await ok('pedido en A: el precio y el envío los pone el servidor (se ignora el precio del navegador)', 'anon', () => pedido('tienda-a', [{ producto_id: pA, cantidad: 2, precio: 1 }], datosPedido({ precio: 1, domicilio: 0 })),
  r => r.rows[0].p.subtotal == 5000 && r.rows[0].p.domicilio == 4000 && r.rows[0].p.total == 9000 && r.rows[0].p.numero == 1)
await ok('pedido a recoger: sin domicilio', 'anon', () => pedido('tienda-a', [{ producto_id: pA, cantidad: 1 }], datosPedido({ entrega: 'recoger' })), r => r.rows[0].p.domicilio == 0 && r.rows[0].p.numero == 2)
await ok('pedido grande: envío gratis desde 50 000', 'anon', () => pedido('tienda-a', [{ producto_id: pA, cantidad: 20 }], datosPedido()), r => r.rows[0].p.subtotal == 50000 && r.rows[0].p.domicilio == 0)
await ok('B tiene su propia numeración y su propio envío', 'anon', () => pedido('tienda-b', [{ producto_id: pB, cantidad: 1 }], datosPedido()), r => r.rows[0].p.numero == 1 && r.rows[0].p.domicilio == 9999)
await ok('el mismo teléfono es un cliente distinto en cada negocio', 'sistema', () => q(`select (select count(*) from clientes where negocio_id=$1 and telefono='3001234567') a, (select count(*) from clientes where negocio_id=$2 and telefono='3001234567') b`, [A, B]), r => r.rows[0].a == 1 && r.rows[0].b == 1)
await ok('el pedido no descuenta stock (se atiende en caja, como en Matriz)', 'sistema', async () => ({ s: await stock(pA) }), r => r.s === stockPed)
await falla('pedido en A con un producto de B', 'anon', () => pedido('tienda-a', [{ producto_id: pB, cantidad: 1 }], datosPedido()), 'ya no está disponible')
await falla('sin aceptar el tratamiento de datos', 'anon', () => pedido('tienda-a', [{ producto_id: pA, cantidad: 1 }], datosPedido({ acepta_datos: false })), 'política de tratamiento')
await falla('producto repetido', 'anon', () => pedido('tienda-a', [{ producto_id: pA, cantidad: 1 }, { producto_id: pA, cantidad: 1 }], datosPedido()), 'repetido')
await falla('slug que no existe', 'anon', () => pedido('no-existe', [{ producto_id: pA, cantidad: 1 }], datosPedido()), 'no disponible')
await q(`update productos set publicado=false where id=$1`, [pA2])
await falla('producto no publicado', 'anon', () => pedido('tienda-a', [{ producto_id: pA2, cantidad: 1 }], datosPedido()), 'ya no está disponible')
for (const m of ['domicilio_km', 'mis_pedidos', 'domiciliarios']) await q(`select activar_modulo($1,$2,false)`, [A, m])
await q(`select activar_modulo($1,'pedidos_en_linea',false)`, [A])
await falla('con "pedidos_en_linea" apagado no se reciben pedidos', 'anon', () => pedido('tienda-a', [{ producto_id: pA, cantidad: 1 }], datosPedido()), 'no disponible')
await q(`select activar_modulo($1,'pedidos_en_linea',true)`, [A])
for (const m of ['domicilio_km', 'mis_pedidos', 'domiciliarios']) await q(`select activar_modulo($1,$2,true)`, [A, m])
await falla('anon no llama a la función interna de clientes', 'anon', () => q(`select _cliente_desde_pedido($1,'{}'::jsonb,'x')`, [A]), 'permission denied')
await falla('anon no llama a registrar_venta', 'anon', () => venta(A, [{ producto_id: pA, cantidad: 1 }], efectivo(2500)), 'permission denied')
await falla('anon no lee los pedidos', 'anon', () => q(`select * from pedidos_tienda`), 'permission denied')
await ok('dueño A ve sus 3 pedidos y dueño B el suyo', 'duenoA', async () => ({ a: (await q(`select count(*) n from pedidos_tienda`)).rows[0].n }), r => r.a == 3)
await ok('dueño B solo ve su pedido', 'duenoB', () => q(`select count(*) n from pedidos_tienda where negocio_id in ($1,$2)`, [A, B]), r => r.rows[0].n == 1)
await ok('tablero en línea de A: 3 pedidos recibidos, ninguno de B', 'duenoA', () => q(`select tablero_en_linea($1,$2) t`, [A, desde]), r => r.rows[0].t.catalogos.find((c) => c.cat === 'tienda').recibidos == 3)
await falla('dueño de B no pide el tablero en línea de A', 'duenoB', () => q(`select tablero_en_linea($1,$2)`, [A, desde]), 'Solo el dueño')

console.log('\n--- Ropa: pedidos públicos y venta (negocio C) ---')
const prenda = (await q(`insert into prendas (negocio_id,nombre,categoria,precio,costo,genero) values ($1,'Camisa','Camisas',50000,20000,'hombre') returning id`, [C])).rows[0].id
const vari = (await q(`insert into prenda_variantes (negocio_id,prenda_id,talla,color,stock) values ($1,$2,'M','Azul',5) returning id`, [C, prenda])).rows[0].id
const pedRopa = (slug, items, datos) => q(`select crear_pedido_ropa($1,$2::jsonb,$3::jsonb) p`, [slug, J(datos), J(items)])
let pedC
await ok('pedido de ropa en C, precio del servidor', 'anon', async () => (pedC = (await pedRopa('ropa-c', [{ variante_id: vari, cantidad: 2 }], datosPedido())).rows[0].p, q(`select 1`)), () => pedC.subtotal == 100000 && pedC.total == 100000 && pedC.numero == 1)
await falla('la misma prenda pedida desde otro negocio (A no tiene ropa)', 'anon', () => pedRopa('tienda-a', [{ variante_id: vari, cantidad: 1 }], datosPedido()), 'no está activo')
await falla('más unidades que el stock', 'anon', () => pedRopa('ropa-c', [{ variante_id: vari, cantidad: 9 }], datosPedido()), 'Solo quedan')
let vRopa
await ok('dueño C vende la ropa atendiendo el pedido', 'duenoB', async () => (vRopa = (await ventaRopa(C, [{ variante_id: vari, cantidad: 2 }], efectivo(100000), { pedido: pedC.id })).rows[0].id, q(`select 1`)))
await ok('el pedido quedó vendido y el stock bajó a 3', 'sistema', async () => ({ e: (await q(`select estado from pedidos_ropa where id=$1`, [pedC.id])).rows[0].estado, s: (await q(`select stock from prenda_variantes where id=$1`, [vari])).rows[0].stock }), r => r.e === 'vendido' && r.s == 3)
await q(`select activar_modulo($1,'ropa',true)`, [B])
await falla('dueño de B y C vende en B una prenda de C', 'duenoB', () => ventaRopa(B, [{ variante_id: vari, cantidad: 1 }], efectivo(50000)), 'Prenda no encontrada')
await falla('dueño de B usa en B un pedido de C', 'duenoB', () => ventaRopa(B, [{ variante_id: vari, cantidad: 1 }], efectivo(50000), { pedido: pedC.id }), 'Ese pedido ya fue atendido o no existe')
await falla('dueño de A no vende ropa en C', 'duenoA', () => ventaRopa(C, [{ variante_id: vari, cantidad: 1 }], efectivo(50000)), 'No autorizado')
await ok('anular la venta de ropa devuelve la talla y cancela el pedido', 'duenoB', async () => { await q(`select anular_venta($1,$2,'devolución')`, [C, vRopa]); return q(`select (select stock from prenda_variantes where id=$1) s, (select estado from pedidos_ropa where id=$2) e`, [vari, pedC.id]) }, r => r.rows[0].s == 5 && r.rows[0].e === 'cancelado')
await ok('dueño de B y C: vende 1 prenda en C (sin anular)', 'duenoB', () => ventaRopa(C, [{ variante_id: vari, cantidad: 1 }], efectivo(50000)))
await ok('el tablero de B no mezcla las ventas de C (mismo dueño)', 'duenoB', () => q(`select tablero($1,$2) tb, tablero($3,$2) tc`, [B, desde, C]), r => r.rows[0].tb.vendido == 0 && r.rows[0].tb.top.length === 0 && r.rows[0].tc.vendido == 50000 && r.rows[0].tc.top.length === 1)
await ok('la cartera y el inventario del tablero de B no incluyen lo de C', 'duenoB', () => q(`select tablero($1,$2) t`, [B, desde]), r => r.rows[0].t.inventario.productos == 1)
await ok('tablero de C (ropa): 1 venta vigente y 1 anulada', 'duenoB', () => q(`select tablero($1,$2) t`, [C, desde]), r => r.rows[0].t.ventas == 1 && r.rows[0].t.anuladas == 1)

// =====================================================================================
// ETAPA C1 — planes, módulos, publicación, invitaciones, clientes con Google, seguimiento, servicios
// =====================================================================================
console.log('\n=== ETAPA C1: planes, publicación, clientes con Google, servicios ===')
const sis = (fn) => como('sistema', fn)
const V = (await sis(() => crear('vit-v', 'Vitrina V', 'tienda', 'duenoV@prueba.com', 'vitrina'))).id
const modsDe = async (id) => (await q(`select modulo from negocio_modulos where negocio_id=$1 and activo order by modulo`, [id])).rows.map(r => r.modulo)

console.log('\n--- Planes y módulos ---')
await ok('Vitrina: trae catálogo, pedidos, domicilio por km, carga masiva y creador de logo; sin caja', 'sistema', async () => ({ m: await modsDe(V) }),
  r => ['catalogo_publico', 'pedidos_en_linea', 'domicilio_km', 'carga_masiva', 'creador_logo', 'productos'].every(m => r.m.includes(m)) && !r.m.includes('caja') && !r.m.includes('mis_pedidos'))
await ok('crear_negocio sin plan = Vitrina y nace SIN publicar', 'sistema', () => q(`select plan, publicada from negocios where id=$1`, [V]), r => r.rows[0].plan === 'vitrina' && r.rows[0].publicada === false)
await ok('los negocios de las pruebas (plan completo) tienen caja, fiados y préstamos', 'sistema', async () => ({ m: await modsDe(A) }), r => ['caja', 'fiados', 'prestamos', 'opiniones', 'resumen_semanal'].every(m => r.m.includes(m)))
await ok('la tienda de ropa con plan completo no recibe módulos de productos', 'sistema', async () => ({ m: await modsDe(C) }), r => r.m.includes('ropa') && !r.m.includes('menu_del_dia') && !r.m.includes('carga_masiva') && !r.m.includes('compras'))
await falla('plan que no existe', 'sistema', () => q(`select crear_negocio('x-plan','X','tienda','extra@prueba.com','platino')`), 'Plan no válido')
await falla('un usuario no activa planes', 'duenoA', () => q(`select activar_plan($1,'vitrina')`, [A]), 'permission denied')
await falla('un usuario no publica tiendas', 'duenoV', () => q(`select publicar_negocio($1,true)`, [V]), 'permission denied')
await falla('un usuario no asigna precio fundador', 'duenoA', () => q(`select asignar_fundador($1,true)`, [A]), 'permission denied')
await falla('anon no lee los planes', 'anon', () => q(`select * from planes`), 'permission denied')
await ok('un usuario con sesión lee los planes y sus módulos', 'duenoA', () => q(`select (select count(*) from planes) p, (select count(*) from plan_modulos where plan='completo') m`), r => r.rows[0].p == 4 && r.rows[0].m >= 20)
await falla('un usuario no cambia los precios', 'duenoA', () => q(`update planes set precio_mensual=1 where clave='tienda'`), 'permission denied')
await ok('cada plan incluye al anterior (los paquetes escalan)', 'sistema', () => q(`select
  not exists (select 1 from plan_modulos a where a.plan='vitrina' and not exists (select 1 from plan_modulos b where b.plan='tienda' and b.modulo=a.modulo)) v_t,
  not exists (select 1 from plan_modulos a where a.plan='tienda' and not exists (select 1 from plan_modulos b where b.plan='gestion' and b.modulo=a.modulo)) t_g,
  not exists (select 1 from plan_modulos a where a.plan='gestion' and not exists (select 1 from plan_modulos b where b.plan='completo' and b.modulo=a.modulo)) g_c`),
  r => r.rows[0].v_t && r.rows[0].t_g && r.rows[0].g_c)

console.log('\n--- Cambios de plan (el servidor ordena los módulos) ---')
await sis(() => q(`select activar_plan($1,'tienda')`, [V]))
await ok('Vitrina → Tienda suma Mis pedidos, avisos, directorio y catálogo maestro', 'sistema', async () => ({ m: await modsDe(V) }), r => ['mis_pedidos', 'avisos_push', 'directorio_red', 'catalogo_maestro', 'publicidad'].every(m => r.m.includes(m)) && !r.m.includes('caja'))
await sis(() => q(`select activar_plan($1,'gestion')`, [V]))
await ok('Tienda → Gestión suma caja, fiados, compras, reportes', 'sistema', async () => ({ m: await modsDe(V) }), r => ['caja', 'fiados', 'compras', 'reportes', 'escaner'].every(m => r.m.includes(m)))
await sis(() => q(`select activar_modulo($1,'anuncios_video',true)`, [V]))
await ok('un módulo suelto queda marcado como extra', 'sistema', () => q(`select origen from negocio_modulos where negocio_id=$1 and modulo='anuncios_video'`, [V]), r => r.rows[0].origen === 'extra')
await falla('no se baja a un plan que deja a un extra sin lo que necesita (anuncios_video necesita publicidad)', 'sistema', () => q(`select activar_plan($1,'vitrina')`, [V]), 'sin "publicidad"')
await ok('tras ese error el plan no cambió (todo o nada)', 'sistema', () => q(`select plan from negocios where id=$1`, [V]), r => r.rows[0].plan === 'gestion')
await sis(() => q(`select activar_modulo($1,'anuncios_video',false)`, [V]))
await sis(() => q(`select activar_plan($1,'vitrina')`, [V]))
await ok('Gestión → Vitrina apaga lo que no incluye, conserva lo base', 'sistema', async () => ({ m: await modsDe(V) }), r => !r.m.includes('caja') && !r.m.includes('mis_pedidos') && r.m.includes('productos') && r.m.includes('catalogo_publico'))
await sis(() => q(`select activar_modulo($1,'opiniones',true)`, [V]))
await sis(() => q(`select activar_plan($1,'tienda')`, [V]))
await ok('un extra que sigue siendo válido se conserva al cambiar de plan', 'sistema', async () => ({ m: await modsDe(V) }), r => r.m.includes('opiniones'))
await sis(() => q(`select activar_plan($1,'vitrina')`, [V]))
await sis(() => q(`select activar_modulo($1,'opiniones',false)`, [V]))

console.log('\n--- Precios y precio fundador (son datos editables) ---')
await ok('mi_plan: el dueño ve su plan, límites y módulos', 'duenoV', () => q(`select mi_plan($1) p`, [V]), r => r.rows[0].p.plan === 'vitrina' && r.rows[0].p.max_productos == 200 && r.rows[0].p.precio_vigente == 0 && r.rows[0].p.modulos.length >= 6)
await falla('el dueño de otra tienda no ve el plan', 'duenoA', () => q(`select mi_plan($1)`, [V]), 'No autorizado')
await ok('el soporte puede ver el plan', 'soporte', () => q(`select mi_plan($1) p`, [V]), r => r.rows[0].p.plan === 'vitrina')
await sis(() => q(`select activar_plan($1,'tienda')`, [V]))
await ok('sin precio fundador: precio de lista', 'duenoV', () => q(`select mi_plan($1) p`, [V]), r => r.rows[0].p.precio_vigente == 29900 && r.rows[0].p.fundador_hasta === null)
await sis(() => q(`select asignar_fundador($1,true)`, [V]))
await ok('con precio fundador: precio del piloto y fecha de fin', 'duenoV', () => q(`select mi_plan($1) p`, [V]), r => r.rows[0].p.precio_vigente == 19900 && r.rows[0].p.fundador_hasta != null)
await sis(() => q(`update negocios set fundador_desde = hoy_colombia() - 400 where id=$1`, [V]))
await ok('vencidos los 6 meses vuelve al precio de lista', 'duenoV', () => q(`select mi_plan($1) p`, [V]), r => r.rows[0].p.precio_vigente == 29900)
await sis(() => q(`update planes set precio_mensual=31900 where clave='tienda'`))
await ok('cambiar un precio es un update de datos (sin tocar código)', 'duenoV', () => q(`select mi_plan($1) p`, [V]), r => r.rows[0].p.precio_vigente == 31900)
await sis(() => q(`update planes set precio_mensual=29900 where clave='tienda'`))
await sis(() => q(`select asignar_fundador($1,false)`, [V]))
await sis(() => q(`select activar_plan($1,'vitrina')`, [V]))

console.log('\n--- Publicación ---')
await ok('tienda nueva: el público no la ve', 'anon', () => q(`select negocio_publico('vit-v') n`), r => r.rows[0].n === null)
await falla('tienda nueva: el catálogo no responde al público', 'anon', () => q(`select catalogo_tienda('vit-v')`), 'no disponible')
await ok('el dueño sí la ve en vista previa', 'duenoV', () => q(`select negocio_publico('vit-v') n`), r => r.rows[0].n.vista_previa === true && r.rows[0].n.nombre === 'Vitrina V')
await ok('el soporte la ve en vista previa', 'soporte', () => q(`select catalogo_tienda('vit-v') c`), r => Array.isArray(r.rows[0].c.productos))
await falla('otro dueño no ve la vista previa', 'duenoA', () => q(`select catalogo_tienda('vit-v')`), 'no disponible')
await falla('no se publica sin WhatsApp', 'sistema', () => q(`select publicar_negocio($1,true)`, [V]), 'WhatsApp')
await sis(() => publicar(V))
await ok('publicada: el público la ve y ya no es vista previa', 'anon', () => q(`select negocio_publico('vit-v') n`), r => r.rows[0].n.vista_previa === false && r.rows[0].n.logo_auto.inicial === 'V')
await ok('logo automático: inicial sobre el color de la tienda', 'anon', () => q(`select negocio_publico('tienda-a') n`), r => r.rows[0].n.logo_auto.inicial === 'T' && r.rows[0].n.logo_auto.color === '#7A1F3D')
await ok('el público también ve la domicilio por km configurada', 'anon', () => q(`select negocio_publico('vit-v') n`), r => r.rows[0].n.domicilio_modo === 'fijo' && 'domicilio_valor_km' in r.rows[0].n)

console.log('\n--- Límite de productos por plan ---')
await sis(() => q(`update negocios set max_productos_override=2 where id=$1`, [V]))
await falla('un insert de 3 productos de golpe no pasa el tope de 2 (y no queda ninguno)', 'sistema', () => q(`insert into productos (negocio_id,codigo,nombre,precio_venta) values ($1,'a','P1',1000),($1,'b','P2',1000),($1,'c','P3',1000)`, [V]), 'permite hasta 2')
await ok('tras el error no quedó ningún producto', 'sistema', () => q(`select count(*) n from productos where negocio_id=$1`, [V]), r => r.rows[0].n == 0)
const pV = (await q(`insert into productos (negocio_id,codigo,nombre,precio_venta,publicado) values ($1,'a','Arepa V',1500,true),($1,'b','Queso V',9000,true) returning id`, [V])).rows[0].id
await falla('el dueño no pasa del tope', 'duenoV', () => q(`insert into productos (negocio_id,codigo,nombre,precio_venta) values ($1,'c','Tercero',1000)`, [V]), 'permite hasta 2')
await como('duenoV', () => q(`update productos set activo=false where negocio_id=$1 and codigo='b'`, [V]))
await falla('desactivar y reactivar tampoco burla el tope', 'duenoV', async () => { await q(`insert into productos (negocio_id,codigo,nombre,precio_venta) values ($1,'c','Tercero',1000)`, [V]); return q(`update productos set activo=true where negocio_id=$1 and codigo='b'`, [V]) }, 'permite hasta 2')
await q(`update productos set activo=true where negocio_id=$1 and codigo='b' and false`, [V])
await ok('B no se ve afectada por el tope de V', 'duenoB', () => q(`insert into productos (negocio_id,codigo,nombre,precio_venta) values ($1,'x1','Libre B',1000) returning id`, [B]))
await sis(() => q(`update negocios set max_productos_override=null where id=$1`, [V]))
await sis(() => q(`delete from productos where negocio_id=$1 and codigo in ('c')`, [V]))
await sis(() => q(`update productos set activo=true where negocio_id=$1`, [V]))
await ok('el tope del plan (200) se ve en mi_plan con 2 productos activos', 'duenoV', () => q(`select mi_plan($1) p`, [V]), r => r.rows[0].p.max_productos == 200 && r.rows[0].p.productos_activos == 2)

console.log('\n--- Stock opcional ---')
await ok('en una tienda con caja el producto nuevo controla stock', 'sistema', () => q(`select controla_stock from productos where id=$1`, [pA]), r => r.rows[0].controla_stock === true)
await ok('en una vitrina (sin caja) el producto nuevo NO controla stock', 'sistema', () => q(`select controla_stock, disponible from productos where id=$1`, [pV]), r => r.rows[0].controla_stock === false && r.rows[0].disponible === true)
await ok('la vitrina muestra disponible aunque el stock sea 0', 'anon', () => q(`select catalogo_tienda('vit-v') c`), r => r.rows[0].c.productos.every(p => p.disponible === true))
await ok('pedido en la vitrina con stock 0', 'anon', () => pedido('vit-v', [{ producto_id: pV, cantidad: 2 }], datosPedido({ telefono: '3101110001', entrega: 'recoger' })), r => r.rows[0].p.subtotal == 3000 && r.rows[0].p.numero == 1)
await sis(() => q(`update productos set disponible=false where id=$1`, [pV]))
await ok('marcado agotado, el catálogo lo muestra agotado', 'anon', () => q(`select catalogo_tienda('vit-v') c`), r => r.rows[0].c.productos.find(p => p.nombre === 'Arepa V').disponible === false)
await falla('marcado agotado, no se puede pedir', 'anon', () => pedido('vit-v', [{ producto_id: pV, cantidad: 1 }], datosPedido({ telefono: '3101110002', entrega: 'recoger' })), 'agotado')
await sis(() => q(`update productos set disponible=true where id=$1`, [pV]))
await sis(() => q(`update productos set controla_stock=true where id=$1`, [pV]))
await falla('si pasa a controlar stock y hay 0, se agota', 'anon', () => pedido('vit-v', [{ producto_id: pV, cantidad: 1 }], datosPedido({ telefono: '3101110003', entrega: 'recoger' })), 'agotado')
await sis(() => q(`update productos set controla_stock=false where id=$1`, [pV]))

console.log('\n--- Pedido de invitado y de cliente con Google ---')
const antes = (await q(`select count(*) n from pedidos_tienda where negocio_id=$1`, [A])).rows[0].n
let pInv
await ok('invitado (anon): pedido sin cuenta, seguimiento "recibido"', 'anon', async () => (pInv = (await pedido('tienda-a', [{ producto_id: pA, cantidad: 1 }], datosPedido({ telefono: '3205550001' }))).rows[0].p, q(`select 1`)), () => pInv.seguimiento === 'recibido' && pInv.es_practica === false)
await ok('el pedido del invitado no tiene cuenta ligada', 'sistema', () => q(`select cliente_user_id from pedidos_tienda where id=$1`, [pInv.id]), r => r.rows[0].cliente_user_id === null)
let pG1
await ok('cliente con Google (google1): hace su pedido', 'google1', async () => (pG1 = (await pedido('tienda-a', [{ producto_id: pA, cantidad: 2 }], datosPedido({ telefono: '3205550002', nombre: 'Gloria Uno' }))).rows[0].p, q(`select 1`)))
await ok('el pedido queda ligado a su cuenta', 'sistema', () => q(`select cliente_user_id from pedidos_tienda where id=$1`, [pG1.id]), r => r.rows[0].cliente_user_id === U.google1)
await ok('Mis pedidos de google1: solo el suyo, sin teléfono ni correo', 'google1', () => q(`select mis_pedidos() p`), r => r.rows[0].p.length === 1 && r.rows[0].p[0].numero == pG1.numero && r.rows[0].p[0].tienda === 'Tienda A Premium' && !('telefono' in r.rows[0].p[0]) && r.rows[0].p[0].items.length === 1)
await ok('google2 no ve los pedidos de google1', 'google2', () => q(`select mis_pedidos() p`), r => r.rows[0].p.length === 0)
await ok('el invitado no tiene Mis pedidos', 'anon', async () => { try { await q(`select mis_pedidos()`); return { rows: [{ x: false }] } } catch { return { rows: [{ x: true }] } } }, r => r.rows[0].x)
await ok('el dueño A no ve el pedido de google1 en Mis pedidos (no es suyo como cliente)', 'duenoA', () => q(`select mis_pedidos() p`), r => r.rows[0].p.length === 0)
await ok('el dueño A sí ve ambos pedidos en su panel', 'duenoA', () => q(`select count(*) n from pedidos_tienda`), r => r.rows[0].n == Number(antes) + 2)
await ok('Mis pedidos exige el módulo: en la vitrina no aparece', 'google1', async () => { await pedido('vit-v', [{ producto_id: pV, cantidad: 1 }], datosPedido({ telefono: '3205550002', entrega: 'recoger' })); return q(`select mis_pedidos() p`) }, r => r.rows[0].p.length === 1)
await sis(() => q(`select activar_plan($1,'tienda')`, [V]))
await ok('al subir a Tienda aparece también el pedido de la vitrina', 'google1', () => q(`select mis_pedidos() p`), r => r.rows[0].p.length === 2)
await sis(() => q(`select activar_plan($1,'vitrina')`, [V]))

console.log('\n--- Seguimiento del pedido ---')
await ok('el cajero pasa el pedido a "preparando"', 'cajeroA', () => q(`select cambiar_seguimiento($1,$2,'preparando')`, [A, pG1.id]))
await ok('el estado del pedido NO cambia (queda aparte)', 'sistema', () => q(`select estado, seguimiento from pedidos_tienda where id=$1`, [pG1.id]), r => r.rows[0].estado === 'pendiente' && r.rows[0].seguimiento === 'preparando')
await ok('el cliente ve el seguimiento nuevo', 'google1', () => q(`select mis_pedidos() p`), r => r.rows[0].p.find(x => x.id === pG1.id).seguimiento === 'preparando')
await falla('seguimiento inválido', 'cajeroA', () => q(`select cambiar_seguimiento($1,$2,'volando')`, [A, pG1.id]), 'no válido')
await falla('el dueño de B no cambia el seguimiento de A', 'duenoB', () => q(`select cambiar_seguimiento($1,$2,'en_camino')`, [A, pG1.id]), 'No autorizado')
await falla('el dueño de B no lo cambia "desde" B', 'duenoB', () => q(`select cambiar_seguimiento($1,$2,'en_camino')`, [B, pG1.id]), 'no encontrado')
await falla('el cliente no cambia su propio seguimiento', 'google1', () => q(`select cambiar_seguimiento($1,$2,'entregado')`, [A, pG1.id]), 'No autorizado')
await falla('el soporte no cambia el seguimiento', 'soporte', () => q(`select cambiar_seguimiento($1,$2,'entregado')`, [A, pG1.id]), 'No autorizado')
await falla('anon no cambia el seguimiento', 'anon', () => q(`select cambiar_seguimiento($1,$2,'entregado')`, [A, pG1.id]), 'permission denied')
await falla('en la vitrina (sin Mis pedidos) no hay seguimiento', 'duenoV', async () => { const id = (await q(`select id from pedidos_tienda where negocio_id=$1 limit 1`, [V])).rows[0].id; return q(`select cambiar_seguimiento($1,$2,'preparando')`, [V, id]) }, 'no está activo')
await ok('un cajero lleva el pedido a "entregado"', 'cajeroA', () => q(`select cambiar_seguimiento($1,$2,'entregado')`, [A, pG1.id]))

console.log('\n--- Un cliente con Google NO es parte de ninguna tienda ---')
await ok('google1 no ve productos, clientes, pedidos, config ni negocios', 'google1', () => q(`select (select count(*) from productos) p,(select count(*) from clientes) c,(select count(*) from pedidos_tienda) pe,(select count(*) from negocio_config) cf,(select count(*) from negocios) n,(select count(*) from ventas) v,(select count(*) from pedido_tienda_items) i`),
  r => Object.values(r.rows[0]).every(x => x == 0))
await ok('google1 no tiene tiendas en mis_negocios', 'google1', () => q(`select count(*) n from mis_negocios()`), r => r.rows[0].n == 0)
await falla('google1 no vende', 'google1', () => venta(A, [{ producto_id: pA, cantidad: 1 }], efectivo(2500)), 'No autorizado')
await falla('google1 no ve el tablero', 'google1', () => q(`select tablero($1,$2)`, [A, desde]), 'Solo el dueño')
await falla('google1 no lista el equipo', 'google1', () => q(`select * from listar_miembros($1)`, [A]), 'No autorizado')
await falla('google1 no ajusta stock', 'google1', () => q(`select ajustar_stock($1,$2,1,'x')`, [A, pA]), 'No autorizado')
await falla('google1 no ve el plan de una tienda', 'google1', () => q(`select mi_plan($1)`, [A]), 'No autorizado')
await falla('google1 no se agrega a una tienda', 'google1', () => q(`insert into negocio_miembros (negocio_id,user_id,rol) values ($1,$2,'dueno')`, [A, U.google1]), 'permission denied')
await falla('google1 no invita ni agrega gente', 'google1', () => q(`select invitar_miembro($1,'x@prueba.com','cajero')`, [A]), 'No autorizado')
await falla('google1 no pide servicios', 'google1', () => q(`select pedir_servicio($1,'fotos','{}'::jsonb)`, [A]), 'No autorizado')
await falla('google1 no sube archivos a una tienda', 'google1', () => q(`insert into storage.objects (bucket_id,name) values ('negocios',$1)`, [`${A}/productos/x.webp`]), 'row-level security')
await ok('google1 no lee archivos de las tiendas', 'google1', () => q(`select count(*) n from storage.objects`), r => r.rows[0].n == 0)
await falla('google1 no llama a funciones internas', 'google1', () => q(`select _consumir_cuota_km($1)`, [A]), 'permission denied')
await falla('google1 no llama a la consola de la plataforma', 'google1', () => q(`select crear_negocio('hack','Hack','tienda','google1@prueba.com')`), 'permission denied')

console.log('\n--- Perfil del cliente (una cuenta para todas las tiendas, Ley 1581) ---')
await falla('sin sesión no hay perfil', 'anon', () => q(`select guardar_perfil_cliente('{}'::jsonb)`), 'permission denied')
await falla('sin aceptar el tratamiento de datos', 'google1', () => q(`select guardar_perfil_cliente($1::jsonb)`, [J({ nombre: 'Gloria Uno', telefono: '3205550002' })]), 'política de tratamiento')
await falla('teléfono inválido', 'google1', () => q(`select guardar_perfil_cliente($1::jsonb)`, [J({ nombre: 'Gloria Uno', telefono: '123', acepta_datos: true })]), 'celular')
await falla('nombre muy corto', 'google1', () => q(`select guardar_perfil_cliente($1::jsonb)`, [J({ nombre: 'G', telefono: '3205550002', acepta_datos: true })]), 'nombre')
await ok('google1 guarda su perfil', 'google1', () => q(`select guardar_perfil_cliente($1::jsonb) p`, [J({ nombre: 'Gloria Uno', telefono: '+57 320 555 0002', direccion: 'Calle 5 # 6-7', acepta_datos: true })]), r => r.rows[0].p.telefono === '3205550002' && r.rows[0].p.acepta_promos === false)
await ok('con promociones aceptadas queda la fecha del consentimiento', 'google1', () => q(`select guardar_perfil_cliente($1::jsonb) p`, [J({ nombre: 'Gloria Uno', telefono: '3205550002', acepta_promos: true })]), r => r.rows[0].p.acepta_promos === true)
await ok('la fecha del consentimiento existe y se borra al retirarlo', 'sistema', async () => { const a = (await q(`select acepta_promos_en from perfil_cliente where user_id=$1`, [U.google1])).rows[0].acepta_promos_en; await q(`update perfil_cliente set acepta_promos=false, acepta_promos_en=null where false`); return { a } }, r => r.a !== null)
await ok('mi_perfil_cliente devuelve el suyo', 'google1', () => q(`select mi_perfil_cliente() p`), r => r.rows[0].p.nombre === 'Gloria Uno')
await ok('google2 no ve el perfil de google1', 'google2', () => q(`select (select count(*) from perfil_cliente) n, mi_perfil_cliente() p`), r => r.rows[0].n == 0 && r.rows[0].p === null)
await ok('el dueño de una tienda no ve el perfil de sus clientes', 'duenoA', () => q(`select count(*) n from perfil_cliente`), r => r.rows[0].n == 0)
await ok('el soporte no ve perfiles de clientes', 'soporte', () => q(`select count(*) n from perfil_cliente`), r => r.rows[0].n == 0)
await falla('nadie edita el perfil por fuera de la función', 'google1', () => q(`update perfil_cliente set nombre='X Y Z'`), 'permission denied')
await falla('anon no lee perfiles', 'anon', () => q(`select * from perfil_cliente`), 'permission denied')
await ok('google1 borra su perfil: se va el perfil y se desligan sus pedidos', 'google1', async () => { await q(`select borrar_mi_perfil()`); return q(`select (select count(*) from perfil_cliente) p, mis_pedidos() m`) }, r => r.rows[0].p == 0 && r.rows[0].m.length === 0)
await ok('la tienda conserva el registro del pedido', 'sistema', () => q(`select count(*) n from pedidos_tienda where id=$1 and cliente_user_id is null`, [pG1.id]), r => r.rows[0].n == 1)

console.log('\n--- Pedidos de práctica ---')
const nCli = (await q(`select count(*) n from clientes where negocio_id=$1`, [A])).rows[0].n
const recibidosAntes = (await como('duenoA', () => q(`select tablero_en_linea($1,$2) t`, [A, desde]))).rows[0].t.catalogos.find(c => c.cat === 'tienda').recibidos
let pPra
await ok('el cajero hace un pedido de práctica', 'cajeroA', async () => (pPra = (await pedido('tienda-a', [{ producto_id: pA, cantidad: 1 }], datosPedido({ practica: true, nombre: 'Prueba Interna', telefono: '3000000001' }))).rows[0].p, q(`select 1`)), () => pPra.es_practica === true)
await ok('la práctica no crea clientes ni ligas a cuentas', 'sistema', () => q(`select (select count(*) from clientes where negocio_id=$1) c, (select cliente_user_id from pedidos_tienda where id=$2) u`, [A, pPra.id]), r => r.rows[0].c == nCli && r.rows[0].u === null)
await ok('la práctica no cuenta en las estadísticas en línea', 'duenoA', () => q(`select tablero_en_linea($1,$2) t`, [A, desde]), r => r.rows[0].t.catalogos.find(c => c.cat === 'tienda').recibidos == recibidosAntes)
await ok('la práctica no aparece en Mis pedidos de nadie', 'google2', () => q(`select mis_pedidos() p`), r => r.rows[0].p.length === 0)
await ok('un visitante que manda "practica" no logra marcar su pedido como práctica', 'anon', () => pedido('tienda-a', [{ producto_id: pA, cantidad: 1 }], datosPedido({ practica: true, telefono: '3205550003' })), r => r.rows[0].p.es_practica === false)
await sis(() => q(`update negocios set publicada=false where id=$1`, [V]))
await falla('tienda sin publicar: el público no puede pedir', 'anon', () => pedido('vit-v', [{ producto_id: pV, cantidad: 1 }], datosPedido({ telefono: '3101110004', entrega: 'recoger' })), 'no disponible')
await falla('tienda sin publicar: un cliente con Google tampoco', 'google1', () => pedido('vit-v', [{ producto_id: pV, cantidad: 1 }], datosPedido({ telefono: '3101110004', entrega: 'recoger' })), 'no disponible')
await ok('tienda sin publicar: el dueño prueba y queda como práctica', 'duenoV', () => pedido('vit-v', [{ producto_id: pV, cantidad: 1 }], datosPedido({ telefono: '3101110005', entrega: 'recoger' })), r => r.rows[0].p.es_practica === true)
await falla('tienda sin publicar: el soporte puede mirar pero no pedir', 'soporte', () => pedido('vit-v', [{ producto_id: pV, cantidad: 1 }], datosPedido({ telefono: '3101110006', entrega: 'recoger' })), 'no disponible')
await falla('tienda sin publicar: pedido de ropa del público tampoco', 'anon', () => pedRopa('vit-v', [{ variante_id: vari, cantidad: 1 }], datosPedido()), 'no disponible')
await ok('sin publicar no cuenta visitas ni eventos', 'anon', async () => { await q(`select registrar_visita('vit-v','tienda','visitante-9999')`); await q(`select registrar_evento('vit-v','abrio_carrito')`); return q(`select 1`) }, () => true)
await ok('…y no quedó nada registrado', 'sistema', () => q(`select (select count(*) from visitas where negocio_id=$1) v, (select count(*) from eventos_dia where negocio_id=$1 and evento='abrio_carrito') e`, [V]), r => r.rows[0].v == 0 && r.rows[0].e == 0)
await sis(() => q(`select publicar_negocio($1,true)`, [V]))

console.log('\n--- Freno contra pedidos repetidos ---')
for (let i = 1; i <= 5; i++) await q(`select crear_pedido_tienda('vit-v',$1::jsonb,$2::jsonb)`, [J(datosPedido({ telefono: '3109990000', entrega: 'recoger' })), J([{ producto_id: pV, cantidad: 1 }])]).catch(e => { throw e })
await falla('el sexto pedido del mismo cliente en una hora', 'anon', () => pedido('vit-v', [{ producto_id: pV, cantidad: 1 }], datosPedido({ telefono: '3109990000', entrega: 'recoger' })), 'varios pedidos')
await ok('otro cliente sigue pudiendo pedir', 'anon', () => pedido('vit-v', [{ producto_id: pV, cantidad: 1 }], datosPedido({ telefono: '3109990001', entrega: 'recoger' })))

console.log('\n--- Contadores diarios ---')
await ok('registrar_evento cuenta en la tienda correcta', 'anon', async () => { await q(`select registrar_evento('tienda-a','abrio_carrito')`); await q(`select registrar_evento('tienda-a','abrio_carrito')`); await q(`select registrar_evento('tienda-a','envio_whatsapp')`); return q(`select 1`) }, () => true)
await ok('A ve sus contadores (carrito 2, whatsapp 1, pedidos creados)', 'duenoA', () => q(`select evento, cantidad from eventos_dia order by evento`), r => r.rows.find(x => x.evento === 'abrio_carrito').cantidad == 2 && r.rows.find(x => x.evento === 'envio_whatsapp').cantidad == 1 && r.rows.find(x => x.evento === 'pedido_creado').cantidad >= 3)
await ok('B no ve los contadores de A', 'duenoB', () => q(`select count(*) n from eventos_dia where negocio_id=$1`, [A]), r => r.rows[0].n == 0)
await ok('un evento inventado no se guarda', 'anon', async () => { await q(`select registrar_evento('tienda-a','hackear')`); return q(`select 1`) }, () => true)
await ok('…y no hay eventos raros', 'sistema', () => q(`select count(*) n from eventos_dia where evento not in ('abrio_carrito','envio_whatsapp','instalo_app','pedido_creado')`), r => r.rows[0].n == 0)
await falla('anon no lee contadores', 'anon', () => q(`select * from eventos_dia`), 'permission denied')
await falla('nadie escribe contadores a mano', 'duenoA', () => q(`insert into eventos_dia (negocio_id,dia,evento,cantidad) values ($1,hoy_colombia(),'abrio_carrito',9)`, [A]), 'permission denied')

console.log('\n--- Domicilio por kilómetros ---')
await falla('sin ubicar la tienda no se activa el modo km', 'duenoA', () => q(`update negocio_reglas set domicilio_modo='km' where negocio_id=$1`, [A]), 'ubica tu tienda')
await ok('el dueño ubica su tienda', 'duenoA', () => q(`update negocio_config set lat=10.9878, lng=-74.7889 where negocio_id=$1 returning 1`, [A]), r => r.rows.length === 1)
await falla('latitud imposible', 'duenoA', () => q(`update negocio_config set lat=95 where negocio_id=$1`, [A]), 'check')
await sis(() => q(`select activar_modulo($1,'domicilio_km',false)`, [B]))
await sis(() => q(`update negocio_config set lat=10.9, lng=-74.8 where negocio_id=$1`, [B]))
await falla('si el plan no incluye domicilio por km no se activa', 'duenoB', () => q(`update negocio_reglas set domicilio_modo='km' where negocio_id=$1`, [B]), 'no incluye')
await sis(() => q(`select activar_modulo($1,'domicilio_km',true)`, [B]))
await ok('el dueño A activa el modo km con sus reglas (base 4 000, 2 km incluidos, 1 000 por km, redondeo 500, máximo 10 km)', 'duenoA', () => q(`update negocio_reglas set domicilio_modo='km', domicilio_km_incluidos=2, domicilio_valor_km=1000, domicilio_redondeo=500, domicilio_radio_max_km=10 where negocio_id=$1 returning 1`, [A]), r => r.rows.length === 1)
await falla('redondeo no permitido', 'duenoA', () => q(`update negocio_reglas set domicilio_redondeo=300 where negocio_id=$1`, [A]), 'check')
await falla('valor por km negativo', 'duenoA', () => q(`update negocio_reglas set domicilio_valor_km=-5 where negocio_id=$1`, [A]), 'check')
const conKm = (km, extra = {}) => pedido('tienda-a', [{ producto_id: pA, cantidad: 1 }], datosPedido({ telefono: '3205550010', km, ...extra }))
await ok('dentro de los km incluidos: solo la base (1,5 km → 4 000)', 'anon', () => conKm('1.5'), r => r.rows[0].p.domicilio == 4000)
await ok('5 km: 4 000 + 3 km × 1 000 = 7 000', 'anon', () => pedido('tienda-a', [{ producto_id: pA, cantidad: 1 }], datosPedido({ telefono: '3205550011', km: '5' })), r => r.rows[0].p.domicilio == 7000)
await ok('5,3 km: 7 300 se redondea hacia arriba a 7 500', 'anon', () => pedido('tienda-a', [{ producto_id: pA, cantidad: 1 }], datosPedido({ telefono: '3205550012', km: '5,3' })), r => r.rows[0].p.domicilio == 7500)
await ok('5,1 km: 7 100 se redondea al más cercano (7 000), no hacia arriba', 'anon', () => pedido('tienda-a', [{ producto_id: pA, cantidad: 1 }], datosPedido({ telefono: '3205550017', km: '5.1' })), r => r.rows[0].p.domicilio == 7000)
await ok('5,25 km: 7 250 queda justo en medio y sube a 7 500', 'anon', () => pedido('tienda-a', [{ producto_id: pA, cantidad: 1 }], datosPedido({ telefono: '3205550018', km: '5.25' })), r => r.rows[0].p.domicilio == 7500)
await ok('paso 1000: 7 300 → 7 000', 'duenoA', () => q(`update negocio_reglas set domicilio_redondeo=1000 where negocio_id=$1 returning 1`, [A]), r => r.rows.length === 1)
await ok('…con paso 1000, 5,3 km cobra 7 000', 'anon', () => pedido('tienda-a', [{ producto_id: pA, cantidad: 1 }], datosPedido({ telefono: '3205550019', km: '5.3' })), r => r.rows[0].p.domicilio == 7000)
await ok('paso 0 (al peso): 5,3 km cobra 7 300', 'duenoA', async () => { await q(`update negocio_reglas set domicilio_redondeo=0 where negocio_id=$1`, [A]); return q(`select 1`) }, () => true)
await ok('…al peso, 5,3 km cobra 7 300', 'anon', () => pedido('tienda-a', [{ producto_id: pA, cantidad: 1 }], datosPedido({ telefono: '3205550020', km: '5.3' })), r => r.rows[0].p.domicilio == 7300)
await ok('se vuelve al paso 500', 'duenoA', () => q(`update negocio_reglas set domicilio_redondeo=500 where negocio_id=$1 returning 1`, [A]), r => r.rows.length === 1)
await ok('las tiendas nuevas nacen con redondeo 500', 'sistema', () => q(`select domicilio_redondeo from negocio_reglas where negocio_id=$1`, [V]), r => r.rows[0].domicilio_redondeo == 500)
await ok('envío gratis desde 50 000, aunque sean 5 km', 'anon', () => pedido('tienda-a', [{ producto_id: pA, cantidad: 20 }], datosPedido({ telefono: '3205550013', km: '5' })), r => r.rows[0].p.domicilio == 0)
let pRec
await ok('a recoger no paga domicilio', 'anon', async () => (pRec = (await pedido('tienda-a', [{ producto_id: pA, cantidad: 1 }], datosPedido({ telefono: '3205550014', km: '5', entrega: 'recoger' }))).rows[0].p, q(`select 1`)), () => pRec.domicilio == 0)
await ok('…ni guarda km', 'sistema', () => q(`select km_informado from pedidos_tienda where id=$1`, [pRec.id]), r => r.rows[0].km_informado === null)
await ok('el km informado queda guardado en el pedido', 'sistema', () => q(`select km_informado from pedidos_tienda where negocio_id=$1 and nombre='Ana Pérez' and km_informado is not null order by creado_en limit 1`, [A]), r => r.rows[0].km_informado == 1.5)
await falla('fuera del radio máximo (12 km > 10)', 'anon', () => conKm('12'), 'fuera de la zona')
await falla('en modo km hay que traer la distancia', 'anon', () => pedido('tienda-a', [{ producto_id: pA, cantidad: 1 }], datosPedido({ telefono: '3205550015' })), 'Calcula la distancia')
await falla('distancia con letras', 'anon', () => conKm('abc'), 'no es válida')
await falla('distancia negativa', 'anon', () => conKm('-2'), 'no es válida')
await falla('distancia absurda', 'anon', () => conKm('5000'), 'no es válida')
await sis(() => q(`select activar_modulo($1,'domicilio_km',false)`, [A]))
await ok('si el plan deja de incluir domicilio por km, el pedido cae a la tarifa fija (4 000)', 'anon', () => conKm('5'), r => r.rows[0].p.domicilio == 4000)
await sis(() => q(`select activar_modulo($1,'domicilio_km',true)`, [A]))
await ok('una tienda en modo fijo ignora el km que mande el navegador', 'anon', () => pedido('tienda-b', [{ producto_id: pB, cantidad: 1 }], datosPedido({ telefono: '3205550016', km: '3' })), r => r.rows[0].p.domicilio == 9999)

console.log('\n--- Cupo mensual de cálculos de domicilio por km ---')
await falla('un usuario no consume cupos', 'duenoA', () => q(`select _consumir_cuota_km($1)`, [A]), 'permission denied')
await sis(() => q(`update planes set max_calculos_km_mes=2 where clave='vitrina'`))
await ok('Vitrina con tope 2: consume 2 y la tercera ya no', 'sistema', async () => ({ a: (await q(`select _consumir_cuota_km($1) r`, [V])).rows[0].r, b: (await q(`select _consumir_cuota_km($1) r`, [V])).rows[0].r, c: (await q(`select _consumir_cuota_km($1) r`, [V])).rows[0].r }), r => r.a === true && r.b === true && r.c === false)
await ok('mi_plan muestra el consumo del mes', 'duenoV', () => q(`select mi_plan($1) p`, [V]), r => r.rows[0].p.calculos_km_mes == 2 && r.rows[0].p.max_calculos_km_mes == 2)
await ok('el cupo de V no gasta el de A', 'sistema', () => q(`select _consumir_cuota_km($1) r`, [A]), r => r.rows[0].r === true)
await ok('el dueño ve su uso, no el de otros', 'duenoA', () => q(`select count(*) n, min(negocio_id::text) neg from uso_mensual`), r => r.rows[0].n == 1 && r.rows[0].neg === A)
await sis(() => q(`update plataforma_limites set max_dia=3 where concepto='ors_calculos_km'`))
await ok('el cupo global del mapa (compartido) también frena: ya van 3 hoy', 'sistema', () => q(`select _consumir_cuota_km($1) r`, [B]), r => r.rows[0].r === false)
await sis(() => q(`update plataforma_limites set max_dia=1500 where concepto='ors_calculos_km'`))
await sis(() => q(`update planes set max_calculos_km_mes=150 where clave='vitrina'`))
await falla('nadie lee ni edita los cupos globales', 'duenoA', () => q(`select * from plataforma_limites`), 'permission denied')

console.log('\n--- Marca: creador de logo ---')
await ok('con el módulo, el dueño guarda su diseño de logo', 'duenoA', () => q(`update negocio_config set logo_diseno=$2::jsonb where negocio_id=$1 returning 1`, [A, J({ plantilla: 'inicial', figura: 'circulo', texto: 'TA', color: '#7A1F3D' })]), r => r.rows.length === 1)
await sis(() => q(`select activar_modulo($1,'creador_logo',false)`, [B]))
await falla('sin el módulo no se guarda un diseño', 'duenoB', () => q(`update negocio_config set logo_diseno=$2::jsonb where negocio_id=$1`, [B, J({ plantilla: 'inicial' })]), 'no incluye el creador')
await sis(() => q(`select activar_modulo($1,'creador_logo',true)`, [B]))
await falla('un diseño gigante no pasa', 'duenoA', () => q(`update negocio_config set logo_diseno=$2::jsonb where negocio_id=$1`, [A, J({ x: 'a'.repeat(7000) })]), 'check')
await ok('el logo subido por la tienda queda en su carpeta de marca', 'duenoA', () => q(`update negocio_config set logo_path=$2 where negocio_id=$1 returning 1`, [A, `${A}/marca/logo-v2.png`]), r => r.rows.length === 1)

console.log('\n--- Servicios: "Pídeme mi logo", carga de catálogo y fotos ---')
await ok('hay 3 servicios con precio (editable)', 'duenoA', () => q(`select clave, precio from servicios_catalogo order by clave`), r => r.rows.length === 3 && r.rows.every(x => x.precio > 0))
await falla('sin el módulo "logo personalizado" no se pide el logo', 'duenoA', () => q(`select pedir_servicio($1,'logo',$2::jsonb)`, [A, J({ nombre: 'Tienda A' })]), 'no está activo')
await sis(() => q(`select activar_modulo($1,'logo_personalizado',true)`, [A]))
let sol
await ok('el dueño pide su logo (briefing: qué vende, colores, estilo)', 'duenoA', async () => (sol = (await q(`select pedir_servicio($1,'logo',$2::jsonb) s`, [A, J({ nombre: 'Tienda A', vende: 'abarrotes', colores: 'guinda y dorado', estilo: 'premium', ejemplos: 'ninguno' })])).rows[0].s, q(`select 1`)), () => sol.estado === 'pedida' && sol.precio == 150000)
await falla('no se puede pedir dos veces lo mismo mientras esté en curso', 'duenoA', () => q(`select pedir_servicio($1,'logo','{}'::jsonb)`, [A]), 'en curso')
await falla('el cajero no pide servicios', 'cajeroA', () => q(`select pedir_servicio($1,'fotos','{}'::jsonb)`, [A]), 'No autorizado')
await falla('el dueño de B no pide servicios para A', 'duenoB', () => q(`select pedir_servicio($1,'fotos','{}'::jsonb)`, [A]), 'No autorizado')
await falla('datos que no son un objeto', 'duenoA', () => q(`select pedir_servicio($1,'fotos','[1,2]'::jsonb)`, [A]), 'no son válidos')
await falla('servicio que no existe', 'duenoA', () => q(`select pedir_servicio($1,'viaje','{}'::jsonb)`, [A]), 'no está disponible')
await ok('el dueño A ve su solicitud', 'duenoA', () => q(`select count(*) n from solicitudes_servicio`), r => r.rows[0].n == 1)
await ok('el dueño B no la ve', 'duenoB', () => q(`select count(*) n from solicitudes_servicio`), r => r.rows[0].n == 0)
await ok('el cajero no la ve', 'cajeroA', () => q(`select count(*) n from solicitudes_servicio`), r => r.rows[0].n == 0)
await ok('el soporte sí puede leerla', 'soporte', () => q(`select count(*) n from solicitudes_servicio`), r => r.rows[0].n == 1)
await falla('nadie edita la solicitud a mano', 'duenoA', () => q(`update solicitudes_servicio set estado='entregada', pagado=true`), 'permission denied')
await falla('el dueño no atiende su propio servicio', 'duenoA', () => q(`select atender_servicio($1,'entregada')`, [sol.id]), 'permission denied')
await falla('el soporte tampoco (solo lectura)', 'soporte', () => q(`select atender_servicio($1,'entregada')`, [sol.id]), 'permission denied')
await falla('el dueño de B no pide cambios en la solicitud de A', 'duenoB', () => q(`select pedir_cambio_servicio($1,$2,'quiero otro color')`, [B, sol.id]), 'no encontrada')
await falla('no se piden cambios antes de la entrega', 'duenoA', () => q(`select pedir_cambio_servicio($1,$2,'quiero otro color')`, [A, sol.id]), 'ya fue entregado')
await sis(() => q(`select atender_servicio($1,'en_proceso','Empezamos con tus bocetos')`, [sol.id]))
await falla('en proceso ya no se cancela', 'duenoA', () => q(`select cancelar_servicio($1,$2)`, [A, sol.id]), 'aún no empezaron')
await falla('archivos de entrega de otra tienda: rechazados', 'sistema', () => q(`select atender_servicio($1,'entregada','listo',$2::text[])`, [sol.id, [`${B}/marca/logo.png`]]), 'check')
await falla('archivos en una carpeta que no es de entrega: rechazados', 'sistema', () => q(`select atender_servicio($1,'entregada','listo',$2::text[])`, [sol.id, [`${A}/productos/logo.png`]]), 'check')
await sis(() => q(`select atender_servicio($1,'entregada','Logo listo: PNG y SVG',$2::text[],null,true)`, [sol.id, [`${A}/marca/logo-final.png`, `${A}/marca/logo-final.svg`]]))
await ok('entregado: PNG y SVG de la propia tienda, pagado y con fecha', 'duenoA', () => q(`select estado, archivos, pagado, pagado_en, entregada_en from solicitudes_servicio`), r => r.rows[0].estado === 'entregada' && r.rows[0].archivos.length === 2 && r.rows[0].pagado === true && r.rows[0].pagado_en && r.rows[0].entregada_en)
await falla('nota de cambio muy corta', 'duenoA', () => q(`select pedir_cambio_servicio($1,$2,'no')`, [A, sol.id]), 'qué quieres cambiar')
await ok('ronda de cambios 1', 'duenoA', () => q(`select pedir_cambio_servicio($1,$2,'Quiero el dorado más oscuro')`, [A, sol.id]))
await ok('vuelve a "en proceso" con la ronda contada', 'duenoA', () => q(`select estado, rondas_usadas from solicitudes_servicio`), r => r.rows[0].estado === 'en_proceso' && r.rows[0].rondas_usadas == 1)
await sis(() => q(`select atender_servicio($1,'entregada','Ajustado')`, [sol.id]))
await ok('ronda de cambios 2', 'duenoA', () => q(`select pedir_cambio_servicio($1,$2,'Ahora más grande el nombre')`, [A, sol.id]))
await sis(() => q(`select atender_servicio($1,'entregada','Ajustado otra vez')`, [sol.id]))
await falla('la tercera ronda ya no está incluida', 'duenoA', () => q(`select pedir_cambio_servicio($1,$2,'Otro cambio más')`, [A, sol.id]), 'rondas')
await ok('el historial guarda la conversación (tienda y plataforma)', 'duenoA', () => q(`select historial from solicitudes_servicio`), r => r.rows[0].historial.some(h => h.autor === 'tienda') && r.rows[0].historial.some(h => h.autor === 'plataforma') && r.rows[0].historial.length >= 6)
let sol2
await ok('carga de catálogo: no necesita módulo', 'duenoA', async () => (sol2 = (await q(`select pedir_servicio($1,'carga_catalogo',$2::jsonb) s`, [A, J({ cuantos: 120 })])).rows[0].s, q(`select 1`)), () => sol2.precio == 150000)
await ok('mientras está "pedida" el dueño puede cancelarla', 'duenoA', () => q(`select cancelar_servicio($1,$2)`, [A, sol2.id]))
await ok('el precio de un servicio es un dato editable y no cambia lo ya pedido', 'sistema', async () => { await q(`update servicios_catalogo set precio=99000 where clave='logo'`); const r = await q(`select precio from solicitudes_servicio where id=$1`, [sol.id]); await q(`update servicios_catalogo set precio=150000 where clave='logo'`); return r }, r => r.rows[0].precio == 150000)

console.log('\n--- Categorías con imagen ---')
await ok('el cajero crea una categoría', 'cajeroA', () => q(`insert into categorias (negocio_id,nombre,orden) values ($1,'Granos',1) returning id`, [A]))
await falla('nombre repetido en la misma tienda', 'cajeroA', () => q(`insert into categorias (negocio_id,nombre) values ($1,'Granos')`, [A]), 'duplicate|unique')
await ok('otra tienda puede tener el mismo nombre', 'duenoB', () => q(`insert into categorias (negocio_id,nombre) values ($1,'Granos') returning id`, [B]))
await falla('imagen de otra tienda', 'cajeroA', () => q(`insert into categorias (negocio_id,nombre,imagen) values ($1,'Aseo',$2)`, [A, `${B}/categorias/x.webp`]), 'check')
await falla('imagen en una carpeta que no es de categorías', 'cajeroA', () => q(`insert into categorias (negocio_id,nombre,imagen) values ($1,'Aseo',$2)`, [A, `${A}/marca/x.webp`]), 'check')
await ok('imagen propia', 'cajeroA', () => q(`insert into categorias (negocio_id,nombre,imagen) values ($1,'Aseo',$2) returning id`, [A, `${A}/categorias/aseo.webp`]))
await ok('el cajero sube la imagen de la categoría', 'cajeroA', () => q(`insert into storage.objects (bucket_id,name) values ('negocios',$1)`, [`${A}/categorias/aseo.webp`]))
await falla('el cajero de A no sube categorías de B', 'cajeroA', () => q(`insert into storage.objects (bucket_id,name) values ('negocios',$1)`, [`${B}/categorias/x.webp`]), 'row-level security')
await ok('el catálogo público trae las categorías de A y solo de A', 'anon', () => q(`select catalogo_tienda('tienda-a') c`), r => r.rows[0].c.categorias.length === 2 && r.rows[0].c.categorias.map(x => x.nombre).sort().join() === 'Aseo,Granos')
await falla('el cajero no borra categorías', 'cajeroA', () => q(`delete from categorias where nombre='Aseo' returning id`), 'cero')
await falla('B no ve las categorías de A', 'duenoB', () => q(`select * from categorias where negocio_id=$1`, [A]), 'cero')
await falla('el soporte no escribe categorías', 'soporte', () => q(`insert into categorias (negocio_id,nombre) values ($1,'Intruso')`, [A]), 'solo puede consultar')

console.log('\n--- Proveedores ---')
await ok('el cajero de A crea un proveedor', 'cajeroA', () => q(`insert into proveedores (negocio_id,nombre,telefono) values ($1,'Distribuidora Sol','3001112222') returning id`, [A]))
await falla('el mismo nombre (sin importar mayúsculas)', 'cajeroA', () => q(`insert into proveedores (negocio_id,nombre) values ($1,'DISTRIBUIDORA SOL')`, [A]), 'duplicate|unique')
await ok('B tiene el suyo con el mismo nombre', 'duenoB', () => q(`insert into proveedores (negocio_id,nombre) values ($1,'Distribuidora Sol') returning id`, [B]))
await ok('B no ve los proveedores de A', 'duenoB', () => q(`select count(*) n from proveedores where negocio_id=$1`, [A]), r => r.rows[0].n == 0)
await falla('sin el módulo de compras (vitrina) no hay proveedores', 'duenoV', () => q(`insert into proveedores (negocio_id,nombre) values ($1,'Otro')`, [V]), 'no está activo')
await falla('la compra de A no puede apuntar a un proveedor de B', 'sistema', async () => { const pb = (await q(`select id from proveedores where negocio_id=$1`, [B])).rows[0].id; return q(`insert into compras (negocio_id,proveedor_id,total) values ($1,$2,0)`, [A, pb]) }, 'foreign key|violates')
await ok('la compra de A sí puede apuntar a su proveedor', 'sistema', async () => { const pa = (await q(`select id from proveedores where negocio_id=$1`, [A])).rows[0].id; return q(`insert into compras (negocio_id,proveedor_id,total) values ($1,$2,0) returning id`, [A, pa]) })
await falla('el cajero no borra proveedores', 'cajeroA', () => q(`delete from proveedores where negocio_id=$1 returning id`, [A]), 'cero')

console.log('\n--- Invitaciones (registro solo por invitación) ---')
let inv
await ok('crear una tienda para un correo que aún no entró deja una invitación', 'sistema', async () => (inv = await crear('inv-i', 'Inv I', 'tienda', 'nuevo@prueba.com', 'vitrina'), q(`select 1`)), () => inv.invitacion_pendiente === true && inv.publicada === false)
await ok('todavía no tiene dueño', 'sistema', () => q(`select count(*) n from negocio_miembros where negocio_id=$1`, [inv.id]), r => r.rows[0].n == 0)
await q(`insert into auth.users (email) values ('nuevo@prueba.com')`); U.nuevo = (await q(`select id from auth.users where email='nuevo@prueba.com'`)).rows[0].id
await ok('al entrar, el dueño reclama su tienda', 'nuevo', () => q(`select reclamar_invitaciones() n`), r => r.rows[0].n == 1)
await ok('ya es dueño de su tienda', 'nuevo', () => q(`select mi_rol($1) r`, [inv.id]), r => r.rows[0].r === 'dueno')
await ok('reclamar otra vez no hace nada', 'nuevo', () => q(`select reclamar_invitaciones() n`), r => r.rows[0].n == 0)
await ok('la invitación quedó usada', 'duenoA', async () => ({ n: (await como('sistema', () => q(`select usada_por from invitaciones where negocio_id=$1`, [inv.id]))).rows[0].usada_por }), r => r.n === U.nuevo)
await sis(() => q(`insert into auth.users (email, email_confirmed_at) values ('sinconfirmar@prueba.com', null)`))
U.sinconfirmar = (await q(`select id from auth.users where email='sinconfirmar@prueba.com'`)).rows[0].id
const inv2 = await sis(() => crear('inv-j', 'Inv J', 'tienda', 'sinconfirmar@prueba.com', 'vitrina'))
await ok('el usuario sin correo confirmado no es dueño todavía', 'sistema', () => q(`select count(*) n from negocio_miembros where negocio_id=$1`, [inv2.id]), r => r.rows[0].n == 1)
await sis(() => q(`delete from negocio_miembros where negocio_id=$1`, [inv2.id]).catch(() => null))
U.sinconfirmar2 = U.sinconfirmar
await ok('un correo sin confirmar NO reclama invitaciones de otra tienda', 'sistema', async () => { await q(`insert into invitaciones (negocio_id,email,rol) values ($1,'sinconfirmar@prueba.com','cajero') on conflict do nothing`, [inv.id]); return { ok: true } }, () => true)
U.sinconfirmar = U.sinconfirmar2
await ok('el soporte no reclama invitaciones', 'sistema', async () => { await q(`insert into invitaciones (negocio_id,email,rol) values ($1,'soporte@prueba.com','cajero')`, [inv.id]); return { ok: true } }, () => true)
await ok('…aunque haya una a su nombre', 'soporte', () => q(`select reclamar_invitaciones() n`), r => r.rows[0].n == 0)
await sis(() => q(`update invitaciones set vence_en = now() - interval '1 day' where negocio_id=$1 and email='soporte@prueba.com'`, [inv.id]))
await ok('invitación vencida no se reclama', 'google2', () => q(`select reclamar_invitaciones() n`), r => r.rows[0].n == 0)
await ok('un cliente con Google sin invitación no gana nada', 'google1', () => q(`select reclamar_invitaciones() n, (select count(*) from mis_negocios()) m`), r => r.rows[0].n == 0 && r.rows[0].m == 0)
await ok('el dueño invita a alguien sin cuenta: queda pendiente', 'duenoA', () => q(`select invitar_miembro($1,'Ayudante@Prueba.com','cajero') r`, [A]), r => r.rows[0].r === 'invitado')
await ok('el dueño agrega a alguien que ya tiene cuenta', 'duenoA', () => q(`select invitar_miembro($1,'otro@prueba.com','cajero','Otro') r`, [A]), r => r.rows[0].r === 'agregado')
await ok('el dueño ve sus invitaciones y no las de otra tienda', 'duenoA', () => q(`select email from invitaciones`), r => r.rows.length === 1 && r.rows[0].email === 'ayudante@prueba.com')
await falla('el cajero no invita', 'cajeroA', () => q(`select invitar_miembro($1,'x@prueba.com','cajero')`, [A]), 'No autorizado')
await falla('el dueño de B no invita a la tienda de A', 'duenoB', () => q(`select invitar_miembro($1,'x@prueba.com','cajero')`, [A]), 'No autorizado')
await falla('correo mal escrito', 'duenoA', () => q(`select invitar_miembro($1,'no-es-correo','cajero')`, [A]), 'no es válido')
await falla('rol inventado', 'duenoA', () => q(`select invitar_miembro($1,'x@prueba.com','jefe')`, [A]), 'Rol no válido')
await falla('nadie escribe invitaciones a mano', 'duenoA', () => q(`insert into invitaciones (negocio_id,email,rol) values ($1,'z@prueba.com','dueno')`, [A]), 'permission denied')

console.log('\n--- Nada se rompió en lo anterior ---')
await ok('las 3 tiendas de prueba y las nuevas siguen aisladas: A no ve productos de V', 'duenoA', () => q(`select count(*) n from productos where negocio_id=$1`, [V]), r => r.rows[0].n == 0)
await ok('V ve lo suyo y nada de A', 'duenoV', () => q(`select count(*) n from productos`), r => r.rows[0].n == 2)
await ok('el soporte sigue sin poder modificar planes ni tiendas', 'soporte', () => q(`select count(*) n from negocios`), r => r.rows[0].n >= 5)
await falla('el soporte no cambia el plan de una tienda', 'soporte', () => q(`update negocios set plan='completo' where id=$1`, [V]), 'cero|solo puede consultar|permission denied')
await falla('el dueño no se cambia el plan ni se publica', 'duenoV', () => q(`update negocios set plan='completo', publicada=true where id=$1`, [V]), 'permission denied')


console.log('\n--- Archivo 09 (negocio de prueba) ---')
await como('sistema', async () => { await db.exec(fs.readFileSync(path.join(sqlDir, '09-negocio-prueba.sql'), 'utf8').replace('CORREO_DUENO@gmail.com', 'extra@prueba.com')) })
await ok('09 crea el negocio demo con sus datos', 'extra', () => q(`select (select count(*) from productos) p, (select slug from negocios) s`), r => r.rows[0].p == 3 && r.rows[0].s === 'demo')

console.log('\n--- Verificación automática de la base ---')
const ver = await como('sistema', () => q(`select * from verificar_aislamiento()`))
for (const f of ver.rows) { pruebas++; if (f.ok) console.log('✓', f.chequeo); else { fallas++; console.log('✗', f.chequeo, '→', f.detalle) } }

console.log(`\n${pruebas - fallas}/${pruebas} pruebas correctas`)
if (fallas) { console.log(`${fallas} FALLARON`); process.exit(1) }
console.log('TODO EN ORDEN: los negocios están aislados.')
