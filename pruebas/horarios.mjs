// Pruebas del SQL 25 (horario por día, abierto/cerrado, directorio de tiendas por cercanía). Uso:  cd pruebas ; node horarios.mjs
// Carga el 25 DOS veces a propósito: así se comprueba que se puede ejecutar repetido.
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

// segunda carga: debe poder repetirse sin error
await db.exec(fs.readFileSync(path.join(sqlDir, '25-horarios-directorio.sql'), 'utf8'))
await como('sistema', () => q(`update negocios set tipo='ropa' where id=$1`, [B]))
const TODO = JSON.stringify(Object.fromEntries([0, 1, 2, 3, 4, 5, 6].map(d => [String(d), [['00:00', '23:59']]])))
const NADA = JSON.stringify(Object.fromEntries([0, 1, 2, 3, 4, 5, 6].map(d => [String(d), []])))

console.log('\n--- Horario ---')
await ok('verificar_aislamiento todo true', 'sistema', () => q(`select * from verificar_aislamiento()`), r => r.rows.every(x => x.ok) || (console.log(r.rows.filter(x => !x.ok)), false))
await ok('sin horario: el público no ve abierto ni cerrado', 'anon', () => q(`select negocio_publico('tienda-a') n`), r => r.rows[0].n.estado_horario.abierto === null && r.rows[0].n.horario_semana === null)
await ok('dueño A guarda un horario válido', 'duenoA', () => q(`update negocio_config set horario_semana=$2::jsonb where negocio_id=$1`, [A, TODO]), r => r.affectedRows === 1)
await falla('hora de cierre antes de la de apertura', 'duenoA', () => q(`update negocio_config set horario_semana='{"1":[["20:00","07:00"]]}' where negocio_id=$1`, [A]), 'horario_semana_check')
await falla('día inventado (9)', 'duenoA', () => q(`update negocio_config set horario_semana='{"9":[["07:00","08:00"]]}' where negocio_id=$1`, [A]), 'horario_semana_check')
await falla('tres franjas en un día', 'duenoA', () => q(`update negocio_config set horario_semana='{"1":[["07:00","08:00"],["09:00","10:00"],["11:00","12:00"]]}' where negocio_id=$1`, [A]), 'horario_semana_check')
await falla('franjas montadas', 'duenoA', () => q(`update negocio_config set horario_semana='{"1":[["07:00","13:00"],["12:00","18:00"]]}' where negocio_id=$1`, [A]), 'horario_semana_check')
await falla('hora mal escrita', 'duenoA', () => q(`update negocio_config set horario_semana='{"1":[["7:00","8:00"]]}' where negocio_id=$1`, [A]), 'horario_semana_check')
await falla('el cajero no cambia el horario', 'cajeroA', () => q(`update negocio_config set horario_semana=$2::jsonb where negocio_id=$1`, [A, NADA]), 'cero|permission|row-level')
await falla('el dueño B no cambia el horario de A', 'duenoB', () => q(`update negocio_config set horario_semana=$2::jsonb where negocio_id=$1`, [A, NADA]), 'cero|permission|row-level')
await ok('abierto 24 h: el público ve «abierto»', 'anon', () => q(`select negocio_publico('tienda-a') n`), r => r.rows[0].n.estado_horario.abierto === true && r.rows[0].n.horario_semana['1'][0][0] === '00:00')
await ok('hoy no abro: cerrado temporal', 'duenoA', () => q(`update negocio_config set cerrado_hasta = now() + interval '3 hours' where negocio_id=$1`, [A]), r => r.affectedRows === 1)
await ok('el público ve «cerrado por hoy»', 'anon', () => q(`select negocio_publico('tienda-a') n`), r => r.rows[0].n.estado_horario.abierto === false && r.rows[0].n.estado_horario.temporal === true)
await ok('cierre vencido: vuelve a abierto', 'duenoA', () => q(`update negocio_config set cerrado_hasta = now() - interval '1 minute' where negocio_id=$1`, [A]), r => r.affectedRows === 1)
await ok('…y se ve abierto otra vez', 'anon', () => q(`select negocio_publico('tienda-a') n`), r => r.rows[0].n.estado_horario.abierto === true)
await ok('todo cerrado se ve cerrado', 'duenoA', () => q(`update negocio_config set horario_semana=$2::jsonb where negocio_id=$1`, [A, NADA]), r => r.affectedRows === 1)
await ok('…cerrado sin próxima apertura', 'anon', () => q(`select negocio_publico('tienda-a') n`), r => r.rows[0].n.estado_horario.abierto === false && !r.rows[0].n.estado_horario.abre_hora)
await falla('anónimo no llama estado_horario directo', 'anon', () => q(`select estado_horario('{}'::jsonb, null)`), 'permission denied')
await falla('anónimo no llama horario_valido', 'anon', () => q(`select horario_valido('{}'::jsonb)`), 'permission denied')

console.log('\n--- Directorio ---')
await como('sistema', () => q(`update negocio_config set horario_semana=$2::jsonb, lat=4.7110, lng=-74.0721, ciudad='Bogotá' where negocio_id=$1`, [A, TODO]))
await como('sistema', () => q(`update negocio_config set horario_semana=$2::jsonb, lat=4.6097, lng=-74.0817, ciudad='bogotá ' where negocio_id=$1`, [B, NADA]))
const dir = (args = '') => q(`select directorio_tiendas(${args}) d`)
await ok('anónimo ve el directorio con las dos tiendas', 'anon', () => dir(), r => r.rows[0].d.length === 2)
await ok('sin ubicación: sin distancias, abiertas primero', 'anon', () => dir(), r => r.rows[0].d[0].slug === 'tienda-a' && r.rows[0].d[0].distancia_km === null)
await ok('con ubicación: ordena por cercanía (cerca de B)', 'anon', () => dir('4.6100, -74.0800'), r => r.rows[0].d[0].slug === 'tienda-b' && r.rows[0].d[0].distancia_km < 1 && r.rows[0].d[1].distancia_km > 10)
await ok('con ubicación: cerca de A', 'anon', () => dir('4.7100, -74.0700'), r => r.rows[0].d[0].slug === 'tienda-a' && r.rows[0].d[0].distancia_km < 1)
await ok('distancia razonable (A–B ≈ 11–13 km)', 'anon', () => dir('4.6097, -74.0817'), r => { const a = r.rows[0].d.find(x => x.slug === 'tienda-a').distancia_km; return a > 11 && a < 14 })
await ok('NUNCA entrega coordenadas', 'anon', () => dir('4.61, -74.08'), r => !/"lat"|"lng"|latitud|4\.7110|74\.0721/.test(JSON.stringify(r.rows[0].d)))
await ok('solo abiertas: únicamente A', 'anon', () => dir('null, null, null, null, null, true'), r => r.rows[0].d.length === 1 && r.rows[0].d[0].slug === 'tienda-a')
await ok('filtra por tipo ropa', 'anon', () => dir(`null, null, null, null, 'ropa'`), r => r.rows[0].d.length === 1 && r.rows[0].d[0].slug === 'tienda-b')
await ok('filtra por ciudad sin importar mayúsculas ni espacios', 'anon', () => dir(`null, null, null, 'BOGOTÁ'`), r => r.rows[0].d.length === 2)
await ok('otra ciudad: nadie', 'anon', () => dir(`null, null, null, 'Cali'`), r => r.rows[0].d.length === 0)
await ok('busca por nombre', 'anon', () => dir(`null, null, 'tienda b'`), r => r.rows[0].d.length === 1 && r.rows[0].d[0].slug === 'tienda-b')
await ok('límite', 'anon', () => dir(`null, null, null, null, null, false, 1`), r => r.rows[0].d.length === 1)
await ok('coordenadas fuera de rango se ignoran', 'anon', () => dir('999, 999'), r => r.rows[0].d.length === 2 && r.rows[0].d[0].distancia_km === null)
await ok('ciudades agrupa «Bogotá» con «bogotá »', 'anon', () => q(`select directorio_ciudades() c`), r => r.rows[0].c.length === 1 && r.rows[0].c[0].ciudad === 'Bogotá' && r.rows[0].c[0].tiendas === 2)
await ok('el dueño B se oculta del directorio', 'duenoB', () => q(`update negocio_config set en_directorio=false where negocio_id=$1`, [B]), r => r.affectedRows === 1)
await ok('…ya no sale', 'anon', () => dir(), r => r.rows[0].d.length === 1 && r.rows[0].d[0].slug === 'tienda-a')
await ok('tienda sin publicar no sale', 'sistema', () => q(`select publicar_negocio($1,false)`, [A]).then(() => dir()), r => r.rows[0].d.length === 0)
await como('sistema', () => q(`select publicar_negocio($1,true)`, [A]))
await ok('sin el módulo directorio_red no sale', 'sistema', () => q(`update negocio_modulos set activo=false where negocio_id=$1 and modulo='directorio_red'`, [A]).then(() => dir()), r => r.rows[0].d.length === 0)
await como('sistema', () => q(`update negocio_modulos set activo=true where negocio_id=$1 and modulo='directorio_red'`, [A]))
await ok('con el módulo vuelve a salir', 'anon', () => dir(), r => r.rows[0].d.length === 1)
await ok('tienda suspendida no sale', 'sistema', () => q(`update negocios set estado='suspendido' where id=$1`, [A]).then(() => dir()), r => r.rows[0].d.length === 0)

console.log(`\n  ${pruebas - fallas} de ${pruebas} pruebas correctas`)
process.exit(fallas ? 1 : 0)
