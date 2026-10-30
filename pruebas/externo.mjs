// Pruebas del SQL 30 (tiendas externas en el directorio: Cibus). Uso:  cd pruebas ; node externo.mjs
// Carga el 30 DOS veces a propósito: así se comprueba que se puede ejecutar repetido.
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
for (const f of ['25-horarios-directorio.sql', '26-solicitudes-negocio.sql', '27-administrador-miembro.sql', '28-avisos-pedidos.sql', '29-cuenta-cliente.sql', '30-directorio-externo.sql', '34-directorio-mapa.sql', '35-directorio-contacto.sql']) {
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

const dir = (a = []) => q(`select directorio_tiendas(${a.join(',')}) as d`)
const lista = (r) => r.rows[0].d
await ok('verificar_aislamiento todo true', 'sistema', () => q(`select * from verificar_aislamiento()`), r => r.rows.every(x => x.ok) || (console.log(r.rows.filter(x => !x.ok)), false))
await ok('Cibus sale en el directorio para un anónimo', 'anon', () => dir(), r => lista(r).some(t => t.slug === 'cibus' && t.externa === true && t.url === 'https://matriz-cibus.vercel.app/tienda' && t.logo_url === '/cibus-logo.webp'))
await ok('la tarjeta lleva lat y lng (para el mapa; vacías si la tienda no tiene punto)', 'anon', () => dir(), r => lista(r).every(t => 'lat' in t && 'lng' in t))
await ok('buscar por nombre', 'anon', () => dir([`null`, `null`, `'cib'`]), r => lista(r).length === 1 && lista(r)[0].slug === 'cibus')
await ok('buscar algo que no existe', 'anon', () => dir([`null`, `null`, `'zzzz'`]), r => lista(r).length === 0)
await ok('filtro de tipo ropa no la trae', 'anon', () => dir([`null`, `null`, `null`, `null`, `'ropa'`]), r => !lista(r).some(t => t.slug === 'cibus'))
await ok('filtro de tipo tienda sí', 'anon', () => dir([`null`, `null`, `null`, `null`, `'tienda'`]), r => lista(r).some(t => t.slug === 'cibus'))
await ok('sin horario no dice abierta: «solo abiertas» la oculta', 'anon', () => dir([`null`, `null`, `null`, `null`, `null`, `true`]), r => !lista(r).some(t => t.slug === 'cibus'))
await como('sistema', () => q(`update directorio_externo set ciudad='Puerto Colombia', direccion='Calle 10 # 5-20', lat=10.9878, lng=-74.9548, horario_semana='{"0":[["00:00","23:59"]],"1":[["00:00","23:59"]],"2":[["00:00","23:59"]],"3":[["00:00","23:59"]],"4":[["00:00","23:59"]],"5":[["00:00","23:59"]],"6":[["00:00","23:59"]]}' where slug='cibus'`))
await ok('con horario completo aparece abierta', 'anon', () => dir([`null`, `null`, `null`, `null`, `null`, `true`]), r => lista(r).some(t => t.slug === 'cibus' && t.estado_horario.abierto === true))
await ok('con punto, la tarjeta entrega sus coordenadas', 'anon', () => dir(), r => { const t = lista(r).find(x => x.slug === 'cibus'); return t && Number(t.lat) === 10.9878 && Number(t.lng) === -74.9548 })
await como('sistema', () => q(`update directorio_externo set telefono='3005550101' where slug='cibus'`))
await ok('la tarjeta de Cibus entrega su teléfono', 'anon', () => dir(), r => lista(r).find(x => x.slug === 'cibus')?.telefono === '3005550101')
await falla('teléfono mal escrito rechazado', 'sistema', () => q(`update directorio_externo set telefono='12345' where slug='cibus'`), 'telefono_ck|check')
await ok('distancia desde un punto cercano', 'anon', () => dir([`10.99`, `-74.95`]), r => { const t = lista(r).find(x => x.slug === 'cibus'); return t && t.distancia_km != null && t.distancia_km < 3 })
await ok('filtro por ciudad', 'anon', () => dir([`null`, `null`, `null`, `'puerto colombia'`]), r => lista(r).some(t => t.slug === 'cibus'))
await ok('otra ciudad no la trae', 'anon', () => dir([`null`, `null`, `null`, `'Bogotá'`]), r => !lista(r).some(t => t.slug === 'cibus'))
await ok('la ciudad suma en directorio_ciudades', 'anon', () => q(`select directorio_ciudades() as c`), r => r.rows[0].c.some(c => c.ciudad === 'Puerto Colombia' && c.tiendas >= 1))
await ok('desactivarla la oculta', 'sistema', async () => { await q(`update directorio_externo set activo=false where slug='cibus'`); return dir() }, r => !lista(r).some(t => t.slug === 'cibus'))
await q(`update directorio_externo set activo=true where slug='cibus'`)
// candados
await falla('un cliente con cuenta no lee la tabla directo', 'google1', () => q(`select * from directorio_externo`), 'permission denied')
await falla('anónimo no lee la tabla', 'anon', () => q(`select * from directorio_externo`), 'permission denied')
await falla('anónimo no inserta', 'anon', () => q(`insert into directorio_externo (slug,nombre,url) values ('x-tienda','X','https://x.com')`), 'permission denied')
await falla('un dueño no inserta', 'duenoA', () => q(`insert into directorio_externo (slug,nombre,url) values ('x-tienda','X','https://x.com')`), 'permission denied')
await falla('dirección que no es https se rechaza', 'sistema', () => q(`insert into directorio_externo (slug,nombre,url) values ('mala-url','Mala','http://x.com')`), 'violates check')
await falla('dirección con javascript se rechaza', 'sistema', () => q(`insert into directorio_externo (slug,nombre,url) values ('mala-js','Mala','javascript:alert(1)')`), 'violates check')
await falla('logo fuera de la carpeta propia se rechaza', 'sistema', () => q(`insert into directorio_externo (slug,nombre,url,logo_url) values ('mala-img','Mala','https://x.com','https://evil.com/a.png')`), 'violates check')
await falla('horario inválido se rechaza', 'sistema', () => q(`insert into directorio_externo (slug,nombre,url,horario_semana) values ('mala-hor','Mala','https://x.com','{"9":[["08:00","12:00"]]}')`), 'violates check')
await falla('ubicación a medias se rechaza', 'sistema', () => q(`insert into directorio_externo (slug,nombre,url,lat) values ('mala-ubi','Mala','https://x.com',10)`), 'violates check')
await ok('verificar_aislamiento sigue todo true', 'sistema', () => q(`select * from verificar_aislamiento()`), r => r.rows.every(x => x.ok))
console.log(`\n${pruebas - fallas}/${pruebas} pruebas ok`)
process.exit(fallas ? 1 : 0)
