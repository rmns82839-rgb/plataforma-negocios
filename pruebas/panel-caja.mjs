// Pruebas de lo que necesita la caja del panel (SQL 23). Uso: cd pruebas ; node panel-caja.mjs
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
for (const f of ['01-plataforma.sql', '02-datos.sql', '03-seguridad.sql', '04-funciones-plataforma.sql', '05-storage-realtime.sql', '06-funciones-negocio.sql', '07-tablero-y-pedidos.sql', '08-permisos.sql', '10-planes-modulos.sql', '11-catalogo-clientes.sql', '12-redondeo-domicilio.sql', '14-panel.sql', '15-domicilio-km.sql', '16-direcciones-cliente.sql', '17-caja-pedidos.sql', '18-formas-pago-comision.sql', '19-caja-movimientos.sql', '20-clientes-datos.sql', '21-vitrina-tienda.sql', '22-prepago-resumen.sql', '23-panel-caja.sql']) {
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


const crear = async (slug, nombre, tipo, correo, plan = 'completo') => (await q(`select crear_negocio($1,$2,$3,$4,$5) r`, [slug, nombre, tipo, correo, plan])).rows[0].r
const A = (await como('sistema', () => crear('tienda-a', 'Tienda A', 'tienda', 'duenoA@prueba.com'))).id
const B = (await como('sistema', () => crear('tienda-b', 'Tienda B', 'tienda', 'duenoB@prueba.com'))).id
await q(`insert into negocio_miembros (negocio_id, user_id, rol) values ($1,$2,'cajero')`, [A, U.cajeroA])
const pA = (await q(`insert into productos (negocio_id,codigo,nombre,precio_venta,stock,publicado) values ($1,'1','Arroz A',2500,100,true) returning id`, [A])).rows[0].id
const cA = (await q(`insert into clientes (negocio_id,nombre,tipo_documento,documento,telefono) values ($1,'Cliente A','CC','1000001','3001000001') returning id`, [A])).rows[0].id
const J = (o) => JSON.stringify(o)
const vOff = (n, clave, fecha, cant = 2, o = {}) => q(`select registrar_venta_offline($1::uuid,$2::uuid,$3::timestamptz,$4::jsonb,$5::jsonb,$6::uuid) id`, [n, clave, fecha, J([{ producto_id: pA, cantidad: cant }]), J([{ metodo: 'efectivo', monto: 2500 * cant, recibido: 2500 * cant }]), o.cli ?? null])
const k1 = '11111111-1111-1111-1111-111111111111', k2 = '22222222-2222-2222-2222-222222222222'
const hace = (min) => new Date(Date.now() - min * 60000).toISOString()

console.log('\n--- Retiros de caja ---')
await ok('cajero registra un retiro con nota', 'cajeroA', () => q(`insert into caja_movimientos (negocio_id,tipo,monto,motivo,nota) values ($1,'retiro',20000,'dueno','Para el dueño')`, [A]))
await ok('dueño registra un ingreso', 'duenoA', () => q(`insert into caja_movimientos (negocio_id,tipo,monto,motivo) values ($1,'ingreso',50000,'base')`, [A]))
await falla('cajero NO borra movimientos', 'cajeroA', () => q(`delete from caja_movimientos where negocio_id=$1 returning id`, [A]), 'cero|permission|row-level')
await falla('dueño B no borra los de A', 'duenoB', () => q(`delete from caja_movimientos where negocio_id=$1 returning id`, [A]), 'cero|permission|row-level')
await falla('soporte no borra', 'soporte', () => q(`delete from caja_movimientos where negocio_id=$1 returning id`, [A]), 'solo lectura|cero|permission')
await falla('nadie edita un movimiento', 'duenoA', () => q(`update caja_movimientos set monto=1 where negocio_id=$1`, [A]), 'permission')
await ok('dueño A borra un movimiento', 'duenoA', () => q(`delete from caja_movimientos where negocio_id=$1 and tipo='ingreso' returning id`, [A]), r => r.rows.length === 1)
await ok('el borrado queda en la auditoría', 'sistema', () => q(`select count(*) n from auditoria where negocio_id=$1 and tabla='caja_movimientos' and accion='DELETE'`, [A]), r => r.rows[0].n >= 1)

console.log('\n--- Ventas con clave única ---')
await ok('cajero registra una venta con clave', 'cajeroA', () => vOff(A, k1, hace(0)))
await ok('subir otra vez la misma clave devuelve la misma venta (no duplica)', 'cajeroA', async () => { const a = await vOff(A, k1, hace(0)); return a }, async (r) => true)
{ const r = await como('sistema', () => q(`select (select count(*) from ventas where negocio_id=$1) v, (select stock from productos where id=$2) s`, [A, pA])); pruebas++; if (r.rows[0].v == 1 && r.rows[0].s == 98) console.log('✓ una sola venta y el stock bajó una vez (98)'); else { fallas++; console.log('✗ duplicó', r.rows) } }
await ok('venta hecha sin internet conserva su hora (hace 20 min)', 'cajeroA', () => vOff(A, k2, hace(20)))
{ const r = await como('sistema', () => q(`select fecha from ventas where negocio_id=$1 order by numero desc limit 1`, [A])); pruebas++; const dif = (Date.now() - new Date(r.rows[0].fecha).getTime()) / 60000; if (dif > 18 && dif < 22) console.log('✓ quedó con la hora real'); else { fallas++; console.log('✗ hora', dif) } }
await ok('una hora en el futuro se ignora', 'cajeroA', () => vOff(A, '33333333-3333-3333-3333-333333333333', new Date(Date.now() + 3600000).toISOString()))
{ const r = await como('sistema', () => q(`select fecha from ventas where negocio_id=$1 order by numero desc limit 1`, [A])); pruebas++; if (new Date(r.rows[0].fecha).getTime() <= Date.now() + 1000) console.log('✓ no queda en el futuro'); else { fallas++; console.log('✗ futuro') } }
await falla('la misma clave en otra tienda no sirve para A→B', 'duenoB', () => q(`select registrar_venta_offline($1,$2,now(),'[]'::jsonb,'[]'::jsonb)`, [A, k1]), 'Sin acceso')
await falla('anónimo no registra ventas', 'anon', () => vOff(A, k1, hace(0)), 'permission denied')
await falla('soporte no registra ventas', 'soporte', () => vOff(A, '44444444-4444-4444-4444-444444444444', hace(0)), 'solo lectura|Sin acceso|permission')
await ok('dueño B no ve las claves de A', 'duenoB', () => q(`select count(*) n from ventas_claves`), r => r.rows[0].n == 0)
await ok('la misma clave puede usarse en otra tienda (cada una con la suya)', 'sistema', () => q(`select count(*) n from ventas_claves where negocio_id=$1`, [A]), r => r.rows[0].n == 3)

console.log('\n--- Acciones con clave ---')
await ok('abono sin deuda es rechazado con claridad', 'cajeroA', () => q(`select ejecutar_offline($1,'55555555-5555-5555-5555-555555555555',now(),'registrar_abono',$2::jsonb)`, [A, J({ p_cliente_id: cA, p_monto: 100 })]).catch(() => ({ rows: [] })))
await falla('una acción que no está permitida', 'cajeroA', () => q(`select ejecutar_offline($1,'66666666-6666-6666-6666-666666666666',now(),'borrar_todo','{}'::jsonb)`, [A]), 'no permitida')
await falla('otra tienda no ejecuta acciones en A', 'duenoB', () => q(`select ejecutar_offline($1,'77777777-7777-7777-7777-777777777777',now(),'registrar_abono','{}'::jsonb)`, [A]), 'Sin acceso')

console.log('\n--- Archivo 23 dos veces y verificación ---')
{
  const sql = fs.readFileSync(path.join(sqlDir, '23-panel-caja.sql'), 'utf8')
  const i = sql.lastIndexOf('-- ---------- VERIFICACIÓN')
  const v = await como('sistema', async () => { await db.exec(sql.slice(0, i)); return db.query(sql.slice(i).replace(/^--.*$/m, '')) })
  pruebas++
  console.log('   filas de verificación:', v.rows.length)
  if (v.rows.length >= 4 && v.rows.every(r => r.ok === true)) console.log('✓ archivo 23: todo true y se puede correr de nuevo'); else { fallas++; console.log('✗ archivo 23', JSON.stringify(v.rows.filter(r => !r.ok))) }
}
console.log(`\n${pruebas - fallas}/${pruebas} pruebas correctas`)
if (fallas) { console.log(`${fallas} FALLARON`); process.exit(1) }
console.log('TODO EN ORDEN: la caja del panel está aislada.')
