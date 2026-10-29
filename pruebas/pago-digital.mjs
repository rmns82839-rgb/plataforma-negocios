// (base copiada de vitrina.mjs) Pruebas del SQL 21 (opiniones, menú del día, música, estado del pedido, favorito). Uso:  cd pruebas ; npm run vitrina
// Carga el 21 DOS veces a propósito: así se comprueba que se puede ejecutar repetido.
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
const pA = (await q(`insert into productos (negocio_id,codigo,nombre,precio_venta,stock,publicado) values ($1,'1','Arroz A',2500,10,true),($1,'2','Aceite A',9000,5,true) returning id`, [A])).rows[0].id
const pB = (await q(`insert into productos (negocio_id,codigo,nombre,precio_venta,stock,publicado) values ($1,'1','Arroz B',2600,7,true) returning id`, [B])).rows[0].id
const cA = (await q(`insert into clientes (negocio_id,nombre,tipo_documento,documento,telefono,direccion) values ($1,'Cliente A','CC','1000001','3001000001','Calle 1 # 1-1') returning id`, [A])).rows[0].id
const cB = (await q(`insert into clientes (negocio_id,nombre,tipo_documento,documento,telefono,direccion) values ($1,'Cliente B','CC','1000002','3001000002','Calle 2 # 2-2') returning id`, [B])).rows[0].id

const meta=(u,n)=>q(`update auth.users set raw_user_meta_data=$2 where id=$1`,[U[u],JSON.stringify({full_name:n})])
await meta('google1','maría fernanda pérez gómez')
const fixMod = await q(`select modulo from negocio_modulos where negocio_id=$1 and modulo in ('opiniones','menu_del_dia','musica_fondo') order by 1`,[A])
console.log('modulos A', fixMod.rows.map(r=>r.modulo).join(','))


console.log('\n--- SQL 31: pago digital ---')
for (const f of ['25-horarios-directorio.sql', '26-solicitudes-negocio.sql', '27-administrador-miembro.sql', '28-avisos-pedidos.sql', '29-cuenta-cliente.sql', '30-directorio-externo.sql']) await db.exec(fs.readFileSync(path.join(sqlDir, f), 'utf8'))
const sql31 = fs.readFileSync(path.join(sqlDir, '31-pago-digital.sql'), 'utf8')
await db.exec(sql31); await db.exec(sql31)          // se puede correr repetido
const J = (o) => JSON.stringify(o)
const datosP = { nombre: 'Ana Pérez', telefono: '3001234567', direccion: 'Calle 10 # 5-20', acepta_datos: true, entrega: 'recoger' }
const nuevoPedido = async (slug, prod) => (await como('sistema', () => q(`select crear_pedido_tienda($1,$2::jsonb,$3::jsonb) r`, [slug, J(datosP), J([{ producto_id: prod, cantidad: 1 }])]))).rows[0].r
await ok('sin configurar: el público no ve pago digital', 'anon', () => q(`select datos_pago_digital('tienda-a') r`), r => r.rows[0].r === null)
const p1 = await nuevoPedido('tienda-a', pA)
await falla('sin configurar no se registra pago', 'anon', () => q(`select registrar_pago_digital('tienda-a',$1,'nequi',false)`, [p1.id]), 'no recibe pagos')
await falla('cajero no configura', 'cajeroA', () => q(`select guardar_pago_digital($1,'3005008432',array['nequi'])`, [A]), 'Solo el dueño')
await falla('dueño B no configura A', 'duenoB', () => q(`select guardar_pago_digital($1,'3005008432',array['nequi'])`, [A]), 'Solo el dueño')
await falla('anónimo no configura', 'anon', () => q(`select guardar_pago_digital($1,'3005008432',array['nequi'])`, [A]), 'permission denied')
await falla('número corto', 'duenoA', () => q(`select guardar_pago_digital($1,'300',array['nequi'])`, [A]), '10 dígitos')
await falla('medio raro', 'duenoA', () => q(`select guardar_pago_digital($1,'3005008432',array['paypal'])`, [A]), 'no válido')
await ok('dueño A guarda número y 3 medios', 'duenoA', () => q(`select guardar_pago_digital($1,'+57 300 500 8432',array['nequi','llave','daviplata','nequi'],'Tienda A') r`, [A]), r => r.rows[0].r.numero === '3005008432' && r.rows[0].r.medios.length === 3)
await ok('el público de A ve el número', 'anon', () => q(`select datos_pago_digital('tienda-a') r`), r => r.rows[0].r.numero === '3005008432' && r.rows[0].r.titular === 'Tienda A')
await ok('la tienda B NO hereda el número de A', 'anon', () => q(`select datos_pago_digital('tienda-b') r`), r => r.rows[0].r === null)
await ok('el pedido devuelve su id', 'sistema', async () => ({ rows: [{ r: p1 }] }), r => !!r.rows[0].r.id)
await ok('elige Nequi → por_pagar', 'anon', () => q(`select registrar_pago_digital('tienda-a',$1,'nequi',false) r`, [p1.id]), r => r.rows[0].r.pago_estado === 'por_pagar')
await ok('avisa con referencia → avisado', 'anon', () => q(`select registrar_pago_digital('tienda-a',$1,'daviplata',true,'M123 45;--') r`, [p1.id]), r => r.rows[0].r.pago_estado === 'avisado')
await ok('referencia limpia', 'sistema', () => q(`select pago_referencia, pago_medio from pedidos_tienda where id=$1`, [p1.id]), r => r.rows[0].pago_referencia === 'M123 45--' && r.rows[0].pago_medio === 'daviplata')
await falla('pedido de A no se avisa desde la tienda B', 'anon', () => q(`select registrar_pago_digital('tienda-b',$1,'nequi',true)`, [p1.id]), 'no recibe pagos|No encontramos')
await falla('pedido inexistente', 'anon', () => q(`select registrar_pago_digital('tienda-a',gen_random_uuid(),'nequi',true)`), 'No encontramos')
await falla('medio inválido', 'anon', () => q(`select registrar_pago_digital('tienda-a',$1,'bitcoin',true)`, [p1.id]), 'no está disponible')
await falla('anónimo no confirma', 'anon', () => q(`select confirmar_pago_pedido($1,$2,true)`, [A, p1.id]), 'permission denied')
await falla('dueño B no confirma pedido de A', 'duenoB', () => q(`select confirmar_pago_pedido($1,$2,true)`, [A, p1.id]), 'No tienes permiso')
await falla('soporte no confirma', 'soporte', () => q(`select confirmar_pago_pedido($1,$2,true)`, [A, p1.id]), 'No tienes permiso')
await ok('cajero de A marca «no me llegó»', 'cajeroA', () => q(`select confirmar_pago_pedido($1,$2,false) r`, [A, p1.id]), r => r.rows[0].r.pago_estado === 'no_recibido')
await ok('dueño A confirma', 'duenoA', () => q(`select confirmar_pago_pedido($1,$2,true) r`, [A, p1.id]), r => r.rows[0].r.pago_estado === 'confirmado')
await ok('confirmado no se pisa', 'anon', () => q(`select registrar_pago_digital('tienda-a',$1,'nequi',true) r`, [p1.id]), r => r.rows[0].r.pago_estado === 'confirmado')
const p2 = await nuevoPedido('tienda-a', pA)
await falla('pedido sin pago digital no se confirma', 'duenoA', () => q(`select confirmar_pago_pedido($1,$2,true)`, [A, p2.id]), 'no tiene pago digital')
await ok('dueño A ve el pago en su pedido', 'duenoA', () => q(`select pago_estado, pago_medio from pedidos_tienda where negocio_id=$1 and id=$2`, [A, p1.id]), r => r.rows[0].pago_estado === 'confirmado')
await ok('dueño B no ve pedidos de A', 'duenoB', () => q(`select count(*)::int n from pedidos_tienda where id=$1`, [p1.id]), r => r.rows[0].n === 0)
await ok('dueño A apaga los pagos digitales', 'duenoA', () => q(`select guardar_pago_digital($1,null,'{}') r`, [A]), r => r.rows[0].r.numero === null)
await ok('apagado: el público no lo ve', 'anon', () => q(`select datos_pago_digital('tienda-a') r`), r => r.rows[0].r === null)
await ok('verificar_aislamiento sigue todo true', 'sistema', () => q(`select * from verificar_aislamiento()`), r => r.rows.every(x => x.ok) || (console.log(r.rows.filter(x => !x.ok)), false))
const veri = await db.query(sql31.split('-- ---------- VERIFICACIÓN')[1].replace(/^[^\n]*\n/, ''))
pruebas++; if (veri.rows.every(x => x.ok)) console.log('✓ verificación del SQL: 5 filas en true'); else { fallas++; console.log('✗ verificación', JSON.stringify(veri.rows)) }
console.log(`\n${pruebas - fallas}/${pruebas} pruebas ok`)
process.exit(fallas ? 1 : 0)
