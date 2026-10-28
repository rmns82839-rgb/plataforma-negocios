// Pruebas del SQL 28 (avisos de pedido nuevo al celular del equipo). Uso:  cd pruebas ; node avisos.mjs
// Carga el 28 DOS veces a propósito: así se comprueba que se puede ejecutar repetido.
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
for (const f of ['25-horarios-directorio.sql', '26-solicitudes-negocio.sql', '27-administrador-miembro.sql', '28-avisos-pedidos.sql', '28-avisos-pedidos.sql']) {
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
await como('sistema', () => q(`select crear_negocio('tienda-b','Tienda B','tienda','duenoB@prueba.com','vitrina')`))
const NA = (await q(`select id from negocios where slug='tienda-a'`)).rows[0].id
const NB = (await q(`select id from negocios where slug='tienda-b'`)).rows[0].id
await db.exec(`insert into negocio_miembros (negocio_id, user_id, rol) values ('${NA}', '${U.cajeroA}', 'cajero') on conflict do nothing`)
const sub = (n) => ['https://push.ejemplo/' + n, 'P256-' + n, 'AUTH-' + n]
const guardar = (neg, n) => q(`select guardar_suscripcion_personal($1,$2,$3,$4)`, [neg, ...sub(n)])
const pedido = (n, tel = '3001234567', extra = '') => db.exec(`insert into pedidos_tienda (negocio_id, numero, nombre, telefono, total, entrega ${extra ? ', es_practica' : ''}) values ('${NA}', ${n}, 'Ana María López', '${tel}', 42500, 'recoger' ${extra ? ', true' : ''})`)

console.log('\n--- Activar avisos ---')
await ok('verificar_aislamiento todo true', 'sistema', () => q(`select * from verificar_aislamiento()`), r => r.rows.every(x => x.ok) || (console.log(r.rows.filter(x => !x.ok)), false))
await ok('el dueño activa sus avisos', 'duenoA', () => guardar(NA, 1))
await ok('el cajero activa los suyos', 'cajeroA', () => guardar(NA, 2))
await ok('la misma suscripción dos veces no se duplica', 'cajeroA', () => guardar(NA, 2))
await ok('hay 2 suscripciones en la tienda A', 'sistema', () => q(`select count(*)::int n from suscripciones_personal where negocio_id='${NA}'`), r => r.rows[0].n === 2)
await falla('el dueño de OTRA tienda no puede activar avisos aquí', 'duenoB', () => guardar(NA, 3), 'equipo de la tienda')
await falla('un desconocido no puede', 'extra', () => guardar(NA, 4), 'equipo de la tienda')
await falla('anónimo no puede ejecutar la función', 'anon', () => guardar(NA, 5), 'permission denied')
await falla('soporte es de solo lectura', 'soporte', () => guardar(NA, 6), 'equipo de la tienda|solo lectura')
await ok('(se apaga pedidos_en_linea en la tienda B, solo en la prueba)', 'sistema', () => q(`update negocio_modulos set activo=false where modulo='pedidos_en_linea' and negocio_id=(select id from negocios where slug='tienda-b')`))
await falla('tienda sin el módulo pedidos en línea no puede', 'duenoB', () => guardar(NB, 7), 'no está activo')
await falla('endpoint que no es https', 'duenoA', () => q(`select guardar_suscripcion_personal($1,'http://malo','p','a')`, [NA]), 'no válida')
await falla('sin llaves', 'duenoA', () => q(`select guardar_suscripcion_personal($1,'https://x','','')`, [NA]), 'no válida')
await falla('nadie lee la tabla directo (dueño)', 'duenoA', () => q(`select * from suscripciones_personal`), 'permission denied')
await ok('máximo 5 aparatos por persona (se conservan 5)', 'cajeroA', async () => { for (let i = 10; i < 17; i++) { await guardar(NA, i); await db.exec('select pg_sleep(0.01)') } return { rows: [{ n: 5 }] } }, r => r.rows[0].n === 5)
await ok('…comprobado en la tabla', 'sistema', () => q(`select count(*)::int n from suscripciones_personal where negocio_id='${NA}' and user_id='${U.cajeroA}'`), r => r.rows[0].n === 5)
await ok('el dueño ve cuántas personas tienen avisos (2)', 'duenoA', () => q(`select cantidad_avisos_personal($1) n`, [NA]), r => r.rows[0].n === 2)
await falla('el cajero no puede ver ese conteo', 'cajeroA', () => q(`select cantidad_avisos_personal($1) n`, [NA]), 'Solo el dueño')
await ok('quitar la suya', 'cajeroA', () => q(`select borrar_suscripcion_personal($1,$2)`, [NA, sub(16)[0]]))
await ok('quitar la de otra persona no hace nada', 'cajeroA', () => q(`select borrar_suscripcion_personal($1,$2)`, [NA, sub(1)[0]]))
await ok('la del dueño sigue ahí', 'sistema', () => q(`select count(*)::int n from suscripciones_personal where endpoint=$1`, [sub(1)[0]]), r => r.rows[0].n === 1)

console.log('\n--- Reclamar el aviso (solo el servidor) ---')
await pedido(1); await pedido(2, '3001234567', 'practica')
const rec = (num, tel = '3001234567', slug = 'tienda-a', tipo = 'tienda') => q(`select reclamar_aviso_pedido($1,$2,$3,$4) r`, [slug, tipo, num, tel])
for (const quien of ['anon', 'duenoA', 'cajeroA']) await falla(`${quien} no puede reclamar`, quien, () => rec(1), 'permission denied')
await ok('pedido real: entrega datos y suscripciones de ESA tienda', 'sistema', () => rec(1), r => { const x = r.rows[0].r; return x.numero == 1 && x.total == 42500 && x.entrega === 'recoger' && x.cliente === 'Ana' && x.tienda === 'Tienda A' && x.suscripciones.length === 5 })
await ok('segunda vez: ya se avisó → null (un aviso por pedido)', 'sistema', () => rec(1), r => r.rows[0].r === null)
await ok('con el celular de otra persona → null', 'sistema', async () => { await pedido(3); return rec(3, '3119999999') }, r => r.rows[0].r === null)
await ok('…y sigue sin avisarse (el pedido 3 conserva su turno)', 'sistema', () => rec(3), r => r.rows[0].r?.numero == 3)
await ok('celular con 57 y espacios también coincide', 'sistema', async () => { await pedido(4); return rec(4, '+57 300 123 4567') }, r => r.rows[0].r?.numero == 4)
await ok('pedido de práctica → null', 'sistema', () => rec(2), r => r.rows[0].r === null)
await ok('pedido inexistente → null', 'sistema', () => rec(999), r => r.rows[0].r === null)
await ok('tienda equivocada → null', 'sistema', () => rec(1, '3001234567', 'tienda-b'), r => r.rows[0].r === null)
await ok('tipo inválido → null', 'sistema', () => rec(1, '3001234567', 'tienda-a', 'otro'), r => r.rows[0].r === null)
await ok('ropa: reclama el pedido de ropa', 'sistema', async () => { await db.exec(`insert into pedidos_ropa (negocio_id, numero, nombre, telefono, total) values ('${NA}', 50, 'Luisa', '3001234567', 90000)`); return rec(50, '3001234567', 'tienda-a', 'ropa') }, r => r.rows[0].r?.cliente === 'Luisa')
await ok('el servidor retira suscripciones muertas', 'sistema', () => q(`select retirar_suscripciones_personal($1, array[$2]) n`, [NA, sub(1)[0]]), r => r.rows[0].n === 1)
await falla('el dueño no puede retirar por la función del servidor', 'duenoA', () => q(`select retirar_suscripciones_personal($1, array['https://x'])`, [NA]), 'permission denied')

console.log('\n--- Aislamiento final ---')
await ok('verificar_aislamiento sigue todo true', 'sistema', () => q(`select * from verificar_aislamiento()`), r => r.rows.every(x => x.ok))
console.log(`\n${pruebas - fallas}/${pruebas} pruebas ok`)
process.exit(fallas ? 1 : 0)
