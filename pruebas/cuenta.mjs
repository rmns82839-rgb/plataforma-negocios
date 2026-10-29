// Pruebas del SQL 29 (cuenta del cliente: punto del mapa guardado y resumen de compras). Uso:  cd pruebas ; node cuenta.mjs
// Carga el 29 DOS veces a propósito: así se comprueba que se puede ejecutar repetido.
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
create table auth.users (id uuid primary key default gen_random_uuid(), email text, encrypted_password text, raw_user_meta_data jsonb, last_sign_in_at timestamptz, email_confirmed_at timestamptz default now());
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
for (const f of ['01-plataforma.sql', '02-datos.sql', '03-seguridad.sql', '04-funciones-plataforma.sql', '05-storage-realtime.sql', '06-funciones-negocio.sql', '07-tablero-y-pedidos.sql', '08-permisos.sql', '10-planes-modulos.sql', '11-catalogo-clientes.sql', '12-redondeo-domicilio.sql', '14-panel.sql', '15-domicilio-km.sql', '16-direcciones-cliente.sql', '17-caja-pedidos.sql', '18-formas-pago-comision.sql', '19-caja-movimientos.sql', '20-clientes-datos.sql', '21-vitrina-tienda.sql', '21-vitrina-tienda.sql']) {
  try { await db.exec(fs.readFileSync(path.join(sqlDir, f), 'utf8')); console.log('OK   ', f) }
  catch (e) { console.log('FALLA', f, '→', e.message); process.exit(1) }
}
for (const f of ['25-horarios-directorio.sql', '26-solicitudes-negocio.sql', '27-administrador-miembro.sql', '28-avisos-pedidos.sql', '29-cuenta-cliente.sql', '29-cuenta-cliente.sql']) {
  try { await db.exec(fs.readFileSync(path.join(sqlDir, f), 'utf8')); console.log('OK   ', f) }
  catch (e) { console.log('FALLA', f, '→', e.message); process.exit(1) }
}
U.admin = (await db.query(`insert into auth.users (email) values ('admin@prueba.com') returning id`)).rows[0].id
await db.exec(`insert into plataforma_admins (user_id) values ('${U.soporte}')`)                     // soporte: solo lectura
await db.exec(`insert into plataforma_admins (user_id, nivel) values ('${U.admin}', 'administrador')`)

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

// ---------- Pruebas ----------
await como('sistema', () => q(`select crear_negocio('tienda-a','Tienda A','tienda','duenoA@prueba.com','completo')`))
await como('sistema', () => q(`select crear_negocio('tienda-b','Tienda B','tienda','duenoB@prueba.com','completo')`))
const NA = (await q(`select id from negocios where slug='tienda-a'`)).rows[0].id
const NB = (await q(`select id from negocios where slug='tienda-b'`)).rows[0].id
const guardar = (quien, d) => q(`select guardar_perfil_cliente($1::jsonb) r`, [JSON.stringify(d)])
const perfil = () => q(`select mi_perfil_cliente() r`)
const base = { nombre: 'Ana María López', telefono: '300 123 4567', direccion: 'Calle 10 # 5-20, Barrio Abajo, Barranquilla', acepta_datos: true }

console.log('\n--- Registro ---')
await ok('verificar_aislamiento todo true', 'sistema', () => q(`select * from verificar_aislamiento()`), r => r.rows.every(x => x.ok) || (console.log(r.rows.filter(x => !x.ok)), false))
await ok('sin perfil: mi_perfil_cliente devuelve null', 'google1', perfil, r => r.rows[0].r === null)
await falla('sin aceptar la política no se guarda', 'google1', () => guardar('google1', { ...base, acepta_datos: false }), 'política')
await falla('celular de menos de 10 dígitos', 'google1', () => guardar('google1', { ...base, telefono: '300123' }), 'celular')
await falla('anónimo no puede guardar', 'anon', () => guardar('anon', base), 'permission denied')
await ok('registro con punto del mapa, referencia y correo', 'google1', () => guardar('google1', { ...base, lat: 10.99321, lng: -74.80123, referencia: 'Torre 2, apto 301', email: 'ANA@Correo.com', entrega_preferida: 'domicilio' }),
  r => { const x = r.rows[0].r; return x.telefono === '3001234567' && x.lat == 10.99321 && x.lng == -74.80123 && x.referencia === 'Torre 2, apto 301' && x.email === 'ana@correo.com' && x.entrega_preferida === 'domicilio' })
await ok('mi_perfil_cliente devuelve todo', 'google1', perfil, r => { const x = r.rows[0].r; return x.nombre === 'Ana María López' && x.lat == 10.99321 && x.direccion.startsWith('Calle 10') })
await falla('ubicación fuera de rango', 'google1', () => guardar('google1', { ...base, lat: 99, lng: -74 }), 'ubicación')
await falla('latitud sin longitud', 'google1', () => guardar('google1', { ...base, lat: 10.9, lng: null }), 'ubicación')
await falla('correo mal escrito', 'google1', () => guardar('google1', { ...base, email: 'esto-no-es-correo' }), 'correo')

console.log('\n--- El punto se conserva o se invalida ---')
await ok('guardar SIN mandar el punto, misma dirección → conserva el punto', 'google1', () => guardar('google1', { ...base, acepta_datos: false }), r => r.rows[0].r.lat == 10.99321 && r.rows[0].r.referencia === 'Torre 2, apto 301')
await ok('cambiar la dirección sin punto nuevo → el punto viejo se borra', 'google1', () => guardar('google1', { ...base, direccion: 'Carrera 50 # 70-10, Barranquilla' }), r => r.rows[0].r.lat === null && r.rows[0].r.lng === null)
await ok('mandar un punto nuevo lo guarda', 'google1', () => guardar('google1', { ...base, direccion: 'Carrera 50 # 70-10, Barranquilla', lat: 11.0, lng: -74.8 }), r => r.rows[0].r.lat == 11 && r.rows[0].r.lng == -74.8)
await ok('lat/lng vacíos borran el punto', 'google1', () => guardar('google1', { ...base, direccion: 'Carrera 50 # 70-10, Barranquilla', lat: '', lng: '' }), r => r.rows[0].r.lat === null)
await ok('recoger en tienda (sin dirección) no deja punto', 'google1', () => guardar('google1', { ...base, direccion: '', lat: 11, lng: -74.8, entrega_preferida: 'recoger' }), r => r.rows[0].r.lat === null && r.rows[0].r.direccion === null && r.rows[0].r.entrega_preferida === 'recoger')
await ok('entrega preferida inválida se ignora (conserva)', 'google1', () => guardar('google1', { ...base, entrega_preferida: 'dron' }), r => r.rows[0].r.entrega_preferida === 'recoger')
await ok('otra persona: su perfil es suyo', 'google2', () => guardar('google2', { ...base, nombre: 'Luis Pérez', telefono: '3119998888' }), r => r.rows[0].r.nombre === 'Luis Pérez')
await ok('el perfil de google1 no cambió', 'google1', perfil, r => r.rows[0].r.nombre === 'Ana María López')
await falla('nadie lee la tabla perfil_cliente de otro (RLS: solo el suyo)', 'google1', () => q(`select user_id from perfil_cliente where user_id <> auth.uid()`), 'cero')

console.log('\n--- Resumen de compras ---')
const resumen = (slug = 'tienda-a') => q(`select mi_resumen_cliente($1) r`, [slug])
await ok('sin compras: ceros y listas vacías', 'google1', () => resumen(), r => { const x = r.rows[0].r; return x.pedidos == 0 && x.gastado == 0 && x.ultimos.length === 0 && x.favoritos.length === 0 })
await falla('anónimo no puede pedir el resumen', 'anon', () => resumen(), 'permission denied')
// pedidos de prueba: 7 de google1 en A, 1 de google2 en A, 1 de google1 en B, uno de práctica, uno cancelado
await db.exec(`insert into productos (negocio_id, nombre, precio_venta, activo, publicado) values
  ('${NA}', 'Arroz', 3000, true, true), ('${NA}', 'Aceite', 12000, true, true), ('${NA}', 'Panela', 2500, true, true)`)
const P = Object.fromEntries((await q(`select id, nombre from productos where negocio_id='${NA}'`)).rows.map(x => [x.nombre, x.id]))
let num = 100
async function pedidoDe(user, neg, items, { total = 20000, dom = 3000, estado = 'pendiente', practica = false, dias = 0 } = {}) {
  num++
  const id = (await q(`insert into pedidos_tienda (negocio_id, numero, nombre, telefono, total, domicilio, estado, es_practica, cliente_user_id, creado_en)
                       values ($1,$2,'X','3001234567',$3,$4,$5,$6,$7, now() - ($8 || ' days')::interval) returning id`, [neg, num, total, dom, estado, practica, user, dias])).rows[0].id
  for (const [nom, cant] of items) await q(`insert into pedido_tienda_items (negocio_id, pedido_id, producto_id, nombre, unidad, cantidad, precio_unitario) values ($1,$2,$3,$4,'und',$5,1000)`, [neg, id, neg === NA ? (P[nom] ?? null) : null, nom, cant])
  return num
}
await pedidoDe(U.google1, NA, [['Arroz', 2], ['Aceite', 1]], { dias: 20 })
await pedidoDe(U.google1, NA, [['Arroz', 1], ['Panela', 3]], { dias: 15 })
await pedidoDe(U.google1, NA, [['Arroz', 5]], { dias: 10 })
await pedidoDe(U.google1, NA, [['Aceite', 1]], { dias: 6 })
await pedidoDe(U.google1, NA, [['Arroz', 1]], { dias: 4 })
await pedidoDe(U.google1, NA, [['Arroz', 1], ['Aceite', 2]], { dias: 2 })
await pedidoDe(U.google1, NA, [['Panela', 1]], { dias: 1 })
await pedidoDe(U.google1, NA, [['Arroz', 99]], { dias: 0, estado: 'cancelado' })
await pedidoDe(U.google1, NA, [['Arroz', 99]], { dias: 0, practica: true })
await pedidoDe(U.google2, NA, [['Aceite', 50]], { dias: 0 })
await pedidoDe(U.google1, NB, [['Arroz', 1]], { dias: 0 })
await ok('cuenta 7 pedidos reales (sin cancelados ni práctica ni de otra tienda ni de otra persona)', 'google1', () => resumen(), r => r.rows[0].r.pedidos == 7)
await ok('gastado = suma de total + domicilio de esos 7 (7 × 23.000)', 'google1', () => resumen(), r => Number(r.rows[0].r.gastado) === 161000)
await ok('últimas 5, de la más nueva a la más vieja', 'google1', () => resumen(), r => { const u = r.rows[0].r.ultimos; return u.length === 5 && u[0].items[0].nombre === 'Panela' && new Date(u[0].creado_en) > new Date(u[4].creado_en) })
await ok('cada pedido trae sus productos con producto_id', 'google1', () => resumen(), r => r.rows[0].r.ultimos.every(p => p.items.length > 0 && p.items.every(i => i.producto_id)))
await ok('favoritos: Arroz primero (en 5 pedidos), máximo 5', 'google1', () => resumen(), r => { const f = r.rows[0].r.favoritos; return f.length === 3 && f[0].nombre === 'Arroz' && f[0].veces === 5 && Number(f[0].cantidad) === 10 })
await ok('el pedido cancelado y el de práctica no cuentan en favoritos', 'google1', () => resumen(), r => r.rows[0].r.favoritos.every(f => Number(f.cantidad) < 50))
await ok('lo de google2 no aparece en el resumen de google1', 'google1', () => resumen(), r => !JSON.stringify(r.rows[0].r).includes('"cantidad": 50'))
await ok('google2 ve solo lo suyo', 'google2', () => resumen(), r => r.rows[0].r.pedidos == 1 && r.rows[0].r.favoritos[0].nombre === 'Aceite')
await ok('resumen de la tienda B: solo su pedido', 'google1', () => resumen('tienda-b'), r => r.rows[0].r.pedidos == 1)
await ok('tienda que no existe: vacío, sin error', 'google1', () => resumen('no-existe'), r => r.rows[0].r.pedidos == 0)
await ok('sin el módulo «mis pedidos» el resumen sale vacío', 'sistema', () => q(`update negocio_modulos set activo=false where modulo='mis_pedidos' and negocio_id='${NB}'`))
await ok('…tienda B vacía', 'google1', () => resumen('tienda-b'), r => r.rows[0].r.pedidos == 0)

console.log('\n--- «Borrar mis datos» sigue funcionando ---')
await ok('borra el perfil', 'google2', () => q(`select borrar_mi_perfil()`))
await ok('…y ya no hay perfil', 'google2', perfil, r => r.rows[0].r === null)

console.log('\n--- Aislamiento final ---')
await ok('verificar_aislamiento sigue todo true', 'sistema', () => q(`select * from verificar_aislamiento()`), r => r.rows.every(x => x.ok))
await ok('la verificación del SQL 29 son 6 filas true', 'sistema', () => q(`select count(*)::int n from (select 1 where has_function_privilege('authenticated','mi_resumen_cliente(text)','execute') and not has_function_privilege('anon','mi_resumen_cliente(text)','execute')) t`), r => r.rows[0].n === 1)
console.log(`\n${pruebas - fallas}/${pruebas} pruebas ok`)
process.exit(fallas ? 1 : 0)
