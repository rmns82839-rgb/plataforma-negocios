// Pruebas del SQL 26 (registro de negocios nuevos: solicitud pública, aprobación y rechazo del equipo). Uso:  cd pruebas ; node solicitudes.mjs
// Carga el 26 DOS veces a propósito: así se comprueba que se puede ejecutar repetido.
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
for (const f of ['25-horarios-directorio.sql', '26-solicitudes-negocio.sql']) {
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
const SOL = (o = {}) => JSON.stringify({ nombre_negocio: 'Moda Luna Boutique', tipo: 'ropa', ciudad: 'Bogotá', nombre_contacto: 'Luisa Pérez', email: 'luisa@correo.com', telefono: '3001234567', plan: 'tienda', mensaje: 'Quiero vender ropa', acepta_datos: true, ...o })
const enviar = (o) => q(`select enviar_solicitud_negocio($1::jsonb) r`, [SOL(o)])
const lista = (est = 'pendiente') => q(`select listar_solicitudes_negocio($1) l`, [est])
await db.exec(fs.readFileSync(path.join(sqlDir, '26-solicitudes-negocio.sql'), 'utf8'))     // segunda carga

console.log('\n--- Planes y envío (anónimo) ---')
await ok('verificar_aislamiento todo true', 'sistema', () => q(`select * from verificar_aislamiento()`), r => r.rows.every(x => x.ok) || (console.log(r.rows.filter(x => !x.ok)), false))
await ok('anónimo ve los 4 planes con precios y módulos', 'anon', () => q(`select planes_publicos() p`), r => r.rows[0].p.length === 4 && r.rows[0].p[0].clave === 'vitrina' && r.rows[0].p[3].modulos.length > 3)
await ok('anónimo envía una solicitud válida', 'anon', () => enviar(), r => r.rows[0].r.ok === true && r.rows[0].r.repetida === false)
await ok('la misma solicitud otra vez no se duplica', 'anon', () => enviar(), r => r.rows[0].r.repetida === true)
await ok('solo quedó una fila', 'sistema', () => q(`select count(*)::int n from solicitudes_negocio`), r => r.rows[0].n === 1)
await ok('celular con 57 delante se guarda con 10 dígitos', 'anon', () => enviar({ email: 'otra@correo.com', nombre_negocio: 'Otra tienda', telefono: '+57 311 222 3344' }), r => r.rows[0].r.ok)
await ok('…quedó 3112223344', 'sistema', () => q(`select telefono from solicitudes_negocio where email='otra@correo.com'`), r => r.rows[0].telefono === '3112223344')
for (const [n, o, pat] of [
  ['nombre muy corto', { nombre_negocio: 'A' }, 'nombre de tu negocio'],
  ['tipo inventado', { tipo: 'bar' }, 'qué vendes'],
  ['sin ciudad', { ciudad: '' }, 'ciudad'],
  ['contacto muy corto', { nombre_contacto: 'Li' }, 'nombre completo'],
  ['correo malo', { email: 'luisa@' }, 'correo'],
  ['celular de 9 dígitos', { telefono: '300123456' }, 'celular'],
  ['plan que no existe', { plan: 'oro' }, 'plan'],
  ['mensaje de 301 letras', { mensaje: 'x'.repeat(301) }, 'muy largo'],
  ['sin aceptar los datos', { acepta_datos: false }, 'tratamiento de tus datos'],
]) await falla('rechaza: ' + n, 'anon', () => enviar({ email: 'x' + Math.random().toString(36).slice(2, 6) + '@correo.com', telefono: '3' + String(Math.floor(Math.random() * 1e9)).padStart(9, '0'), ...o }), pat)
await falla('tope de 3 por correo en 24 horas', 'anon', async () => { for (let i = 0; i < 4; i++) await enviar({ email: 'spam@correo.com', telefono: '32' + (10000000 + i), nombre_negocio: 'Spam ' + i }) }, 'Ya recibimos')
await falla('anónimo no lee la tabla', 'anon', () => q(`select * from solicitudes_negocio`), 'permission denied')
await falla('anónimo no lista las solicitudes', 'anon', () => lista(), 'permission denied')
await falla('anónimo no aprueba', 'anon', () => q(`select aprobar_solicitud_negocio(gen_random_uuid(), 'x-tienda')`), 'permission denied')

console.log('\n--- Administrador de la plataforma ---')
await falla('soporte (solo lectura) no puede listar', 'soporte', () => lista(), 'administrador de la plataforma')
await falla('soporte no puede aprobar', 'soporte', () => q(`select aprobar_solicitud_negocio(gen_random_uuid(), 'x-tienda')`), 'administrador de la plataforma')
await falla('un dueño de tienda no puede listar', 'duenoA', () => lista(), 'administrador de la plataforma')
await falla('un dueño de tienda no puede leer la tabla', 'duenoA', () => q(`select * from solicitudes_negocio`), 'permission denied')
const idLuisa = (await como('sistema', () => q(`select id from solicitudes_negocio where email='luisa@correo.com'`))).rows[0].id
await falla('un dueño de tienda no puede aprobar', 'duenoA', () => q(`select aprobar_solicitud_negocio($1, 'moda-luna')`, [idLuisa]), 'administrador de la plataforma')
await ok('soy_administrador_plataforma: el administrador sí', 'admin', async () => ({ a: (await q(`select soy_administrador_plataforma() s`)).rows[0].s }), r => r.a === true)
await ok('…dueño no', 'duenoA', () => q(`select soy_administrador_plataforma() s`), r => r.rows[0].s === false)
await ok('soporte ve las pendientes con la dirección sugerida', 'admin', () => lista(), r => r.rows[0].l.length >= 2 && r.rows[0].l.some(x => x.slug_sugerido === 'moda-luna-boutique' && x.plan_nombre === 'Tienda'))
await falla('dirección con espacios no sirve', 'admin', () => q(`select aprobar_solicitud_negocio($1, 'Moda Luna')`, [idLuisa]), 'minúsculas')
await falla('dirección reservada (admin) no sirve', 'admin', () => q(`select aprobar_solicitud_negocio($1, 'admin')`, [idLuisa]), 'check|negocios_slug')
await falla('dirección ya usada', 'admin', () => q(`select aprobar_solicitud_negocio($1, 'tienda-a')`, [idLuisa]), 'ya está en uso')
await ok('soporte aprueba: crea la tienda', 'admin', () => q(`select aprobar_solicitud_negocio($1, 'moda-luna') r`, [idLuisa]), r => r.rows[0].r.slug === 'moda-luna' && r.rows[0].r.plan === 'tienda' && r.rows[0].r.invitacion_pendiente === true && r.rows[0].r.telefono === '3001234567')
await ok('…con el tipo, el plan y los módulos', 'sistema', () => q(`select n.tipo, n.plan, n.publicada, (select count(*)::int from negocio_modulos m where m.negocio_id = n.id and m.activo and m.modulo = 'ropa') ropa, (select count(*)::int from negocio_modulos m where m.negocio_id = n.id and m.activo and m.modulo = 'catalogo_publico') cat from negocios n where slug = 'moda-luna'`), r => r.rows[0].tipo === 'ropa' && r.rows[0].plan === 'tienda' && r.rows[0].publicada === false && r.rows[0].ropa === 1 && r.rows[0].cat === 1)
await ok('…con ciudad, celular y WhatsApp de la solicitud', 'sistema', () => q(`select c.nombre_comercial, c.ciudad, c.telefono, c.whatsapp, c.email from negocio_config c join negocios n on n.id = c.negocio_id where n.slug = 'moda-luna'`), r => r.rows[0].nombre_comercial === 'Moda Luna Boutique' && r.rows[0].ciudad === 'Bogotá' && r.rows[0].telefono === '3001234567' && r.rows[0].whatsapp === '573001234567' && r.rows[0].email === 'luisa@correo.com')
await ok('…y el dueño queda invitado con su correo', 'sistema', () => q(`select i.email, i.rol from invitaciones i join negocios n on n.id = i.negocio_id where n.slug = 'moda-luna'`), r => r.rows[0].email === 'luisa@correo.com' && r.rows[0].rol === 'dueno')
await ok('la solicitud quedó aprobada y ligada a la tienda', 'admin', () => lista('aprobada'), r => r.rows[0].l.length === 1 && r.rows[0].l[0].slug_creado === 'moda-luna' && r.rows[0].l[0].estado === 'aprobada')
await falla('no se aprueba dos veces', 'admin', () => q(`select aprobar_solicitud_negocio($1, 'moda-luna-2')`, [idLuisa]), 'ya fue aprobada')
await falla('no se puede rechazar una ya aprobada', 'admin', () => q(`select rechazar_solicitud_negocio($1, 'no')`, [idLuisa]), 'ya fue resuelta')
const idOtra = (await como('sistema', () => q(`select id from solicitudes_negocio where email='otra@correo.com'`))).rows[0].id
await ok('soporte aprueba con otro plan', 'admin', () => q(`select aprobar_solicitud_negocio($1, 'otra-tienda', 'gestion') r`, [idOtra]), r => r.rows[0].r.plan === 'gestion')
await falla('un dueño no rechaza', 'duenoA', () => q(`select rechazar_solicitud_negocio(gen_random_uuid(), 'x')`), 'administrador de la plataforma')
await ok('envía una más para rechazar', 'anon', () => enviar({ email: 'no@correo.com', telefono: '3150000000', nombre_negocio: 'No Cumple' }), r => r.rows[0].r.ok)
const idNo = (await como('sistema', () => q(`select id from solicitudes_negocio where email='no@correo.com'`))).rows[0].id
await ok('soporte rechaza con nota', 'admin', () => q(`select rechazar_solicitud_negocio($1, 'No es un negocio real')`, [idNo]), () => true)
await ok('…queda rechazada con su nota', 'admin', () => lista('rechazada'), r => r.rows[0].l.length === 1 && r.rows[0].l[0].nota_equipo === 'No es un negocio real')
await ok('la lista «todas» trae las de todos los estados', 'admin', () => lista('todas'), r => r.rows[0].l.length >= 4)

console.log('\n--- crear_negocio de consola sigue igual ---')
await falla('un usuario con sesión no crea negocios', 'duenoA', () => q(`select crear_negocio('hack','Hack','tienda','x@y.com')`), 'permission denied|solo desde la consola')
await ok('la consola (sin sesión) sí', 'sistema', () => q(`select crear_negocio('desde-consola','Desde consola','tienda','c@correo.com') r`), r => r.rows[0].r.slug === 'desde-consola' && r.rows[0].r.plan === 'vitrina')
await falla('_alta_negocio no se llama desde fuera', 'duenoA', () => q(`select _alta_negocio('x-x','X','tienda','a@b.com','vitrina')`), 'permission denied')
await ok('al final el aislamiento sigue completo', 'sistema', () => q(`select * from verificar_aislamiento()`), r => r.rows.every(x => x.ok) || (console.log(r.rows.filter(x => !x.ok)), false))

console.log(`\n  ${pruebas - fallas} de ${pruebas} pruebas correctas`)
process.exit(fallas ? 1 : 0)
