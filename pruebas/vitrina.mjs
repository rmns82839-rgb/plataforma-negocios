// Pruebas del SQL 21 (opiniones, menú del día, música, estado del pedido, favorito). Uso:  cd pruebas ; npm run vitrina
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

console.log('\n--- Opiniones ---')
await ok('verificar_aislamiento todo true', 'sistema', () => q(`select * from verificar_aislamiento()`), r => r.rows.every(x=>x.ok) || (console.log(r.rows.filter(x=>!x.ok)),false))
await falla('anónimo no opina', 'anon', () => q(`select publicar_opinion('tienda-a',5,'x',true)`), 'permission denied')
await ok('google1 opina', 'google1', () => q(`select publicar_opinion('tienda-a',5,'Muy buena <b>tienda</b>',true) r`), r => r.rows[0].r.estado==='pendiente')
await falla('sin aceptar', 'google1', () => q(`select publicar_opinion('tienda-a',5,'x',false)`), 'aceptar')
await falla('estrellas 6', 'google1', () => q(`select publicar_opinion('tienda-a',6,'x',true)`), 'estrellas')
await ok('el público aún no la ve', 'anon', () => q(`select extras_tienda('tienda-a') e`), r => r.rows[0].e.opiniones.total===0)
await ok('dueño A la ve pendiente con nombre corto', 'duenoA', () => q(`select listar_opiniones_admin($1) l`,[A]), r => r.rows[0].l.length===1 && r.rows[0].l[0].nombre==='María G.' && r.rows[0].l[0].estado==='pendiente' && !('user_id' in r.rows[0].l[0]))
await falla('dueño B no ve las de A', 'duenoB', () => q(`select listar_opiniones_admin($1)`,[A]), 'Sin acceso')
await falla('cajero no modera', 'cajeroA', () => q(`select moderar_opinion($1,(select id from opiniones limit 1),'publicado',null)`,[A]), 'Solo el dueño|No existe')
const oid=(await db.query(`select id from opiniones limit 1`)).rows[0].id
await falla('dueño B no modera la de A', 'duenoB', () => q(`select moderar_opinion($1,$2,'publicado',null)`,[B,oid]), 'No existe')
await ok('dueño A aprueba y responde', 'duenoA', () => q(`select moderar_opinion($1,$2,'publicado','Gracias!')`,[A,oid]))
await ok('ahora el público la ve', 'anon', () => q(`select extras_tienda('tienda-a') e`), r => r.rows[0].e.opiniones.total===1 && r.rows[0].e.opiniones.promedio==5 && r.rows[0].e.opiniones.lista[0].respuesta==='Gracias!' && !('user_id' in r.rows[0].e.opiniones.lista[0]))
await ok('tienda B no mezcla opiniones', 'anon', () => q(`select extras_tienda('tienda-b') e`), r => r.rows[0].e.opiniones.total===0)
await falla('límite 2 por día', 'google1', async()=>{await q(`select publicar_opinion('tienda-a',4,'otra',true)`); return q(`select publicar_opinion('tienda-a',4,'tercera',true)`)}, 'hoy')
await ok('google2 no puede borrar las de google1', 'google2', () => q(`select borrar_mis_opiniones('tienda-a') n`), r => r.rows[0].n===0)
await ok('google1 borra las suyas', 'google1', () => q(`select borrar_mis_opiniones('tienda-a') n`), r => r.rows[0].n===2)
await falla('soporte no puede moderar', 'soporte', () => q(`select moderar_opinion($1,$2,'oculto',null)`,[A,oid]), 'Solo el dueño|No existe')
await falla('authenticated no lee la tabla de otro negocio', 'duenoB', () => q(`select * from opiniones`), 'cero')

console.log('\n--- Menú del día ---')
await ok('dueño A fija el menú', 'duenoA', () => q(`select fijar_menu_hoy($1,'m1','Sancocho','Con yuca',$2,'🍲','almuerzo','[{"n":"Arroz","k":"arroz"}]'::jsonb,false)`,[A,`${A}/anuncios/sancocho.jpg`]))
await ok('el público ve el menú de hoy', 'anon', () => q(`select extras_tienda('tienda-a') e`), r => r.rows[0].e.menu_hoy?.nombre==='Sancocho' && r.rows[0].e.menu_hoy.ingredientes.length===1)
await ok('otra tienda no ve ese menú', 'anon', () => q(`select extras_tienda('tienda-b') e`), r => r.rows[0].e.menu_hoy===null)
await falla('foto de otro negocio', 'duenoA', () => q(`select fijar_menu_hoy($1,null,'X',null,$2,null,null,'[]'::jsonb,false)`,[A,`${B}/anuncios/x.jpg`]), 'check')
await falla('cajero no fija menú', 'cajeroA', () => q(`select fijar_menu_hoy($1,null,'X',null,null,null,null,'[]'::jsonb,false)`,[A]), 'Solo el dueño')
await falla('dueño B no fija menú en A', 'duenoB', () => q(`select fijar_menu_hoy($1,null,'X',null,null,null,null,'[]'::jsonb,false)`,[A]), 'Solo el dueño')
await ok('menú para mañana no se ve hoy', 'duenoA', () => q(`select fijar_menu_hoy($1,null,'Mañana',null,null,null,null,'[]'::jsonb,true)`,[A]))
await ok('…no aparece', 'anon', () => q(`select extras_tienda('tienda-a') e`), r => r.rows[0].e.menu_hoy===null)
await falla('más de 20 ingredientes', 'duenoA', () => q(`select fijar_menu_hoy($1,null,'X',null,null,null,null,(select jsonb_agg(i) from generate_series(1,21) i),false)`,[A]), 'check')
await ok('quitar menú', 'duenoA', () => q(`select quitar_menu_hoy($1)`,[A]))

console.log('\n--- Música ---')
await ok('dueño A fija música', 'duenoA', () => q(`select fijar_musica_fondo($1,$2,'Cumbia suave')`,[A,`${A}/fondo.mp3`]))
await ok('público ve la música', 'anon', () => q(`select extras_tienda('tienda-a') e`), r => r.rows[0].e.musica?.nombre==='Cumbia suave')
await falla('ruta de otro negocio', 'duenoA', () => q(`select fijar_musica_fondo($1,$2,'x')`,[A,`${B}/fondo.mp3`]), 'check')
await falla('B no cambia la música de A', 'duenoB', () => q(`select fijar_musica_fondo($1,$2,'x')`,[A,`${A}/f.mp3`]), 'Solo el dueño')
await ok('quitar música', 'duenoA', () => q(`select quitar_musica_fondo($1)`,[A]))
await ok('sin música', 'anon', () => q(`select extras_tienda('tienda-a') e`), r => r.rows[0].e.musica===null)

console.log('\n--- Módulo apagado ---')
await como('sistema', () => q(`select activar_modulo($1,'opiniones',false)`,[A]))
await ok('sin módulo no hay opiniones en extras', 'anon', () => q(`select extras_tienda('tienda-a') e`), r => r.rows[0].e.opiniones===null)
await falla('sin módulo no se opina', 'google2', () => q(`select publicar_opinion('tienda-a',5,'x',true)`), 'módulo')
await como('sistema', () => q(`select activar_modulo($1,'opiniones',true)`,[A]))

console.log('\n--- Estado del pedido ---')
const pid = (await como('sistema', () => q(`select crear_pedido_tienda('tienda-a', $1::jsonb, $2::jsonb) r`, [JSON.stringify({nombre:'Ana Pérez',telefono:'3001234567',direccion:'Calle 10 # 5-20',acepta_datos:true,entrega:'recoger'}), JSON.stringify([{producto_id:pA,cantidad:1}])]))).rows[0].r
console.log('pedido', JSON.stringify(pid).slice(0,120))
const num = pid.numero
await ok('estado con celular correcto', 'anon', () => q(`select estado_pedido('tienda-a',$1,'+57 300 123 4567') e`,[num]), r => r.rows[0].e?.estado==='pendiente' && !('nombre' in r.rows[0].e) && !('telefono' in r.rows[0].e))
await ok('celular ajeno = null', 'anon', () => q(`select estado_pedido('tienda-a',$1,'3110000000') e`,[num]), r => r.rows[0].e===null)
await ok('tienda equivocada = null', 'anon', () => q(`select estado_pedido('tienda-b',$1,'3001234567') e`,[num]), r => r.rows[0].e===null)
await ok('celular corto = null', 'anon', () => q(`select estado_pedido('tienda-a',$1,'123') e`,[num]), r => r.rows[0].e===null)

console.log('\n--- Favorito ---')
await ok('dueño ve favoritos (sin error)', 'duenoA', () => q(`select * from listar_producto_favorito($1)`,[A]), r => Array.isArray(r.rows))
await falla('cajero no ve favoritos', 'cajeroA', () => q(`select * from listar_producto_favorito($1)`,[A]), 'Solo el dueño')
await falla('dueño B no ve favoritos de A', 'duenoB', () => q(`select * from listar_producto_favorito($1)`,[A]), 'Solo el dueño')
console.log(`\n${pruebas} pruebas, ${fallas} fallas`)
process.exit(fallas?1:0)
