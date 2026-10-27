// Pruebas del saldo prepago y el resumen semanal (SQL 22). Uso: cd pruebas ; node prepago.mjs
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
for (const f of ['01-plataforma.sql', '02-datos.sql', '03-seguridad.sql', '04-funciones-plataforma.sql', '05-storage-realtime.sql', '06-funciones-negocio.sql', '07-tablero-y-pedidos.sql', '08-permisos.sql', '10-planes-modulos.sql', '11-catalogo-clientes.sql', '12-redondeo-domicilio.sql', '14-panel.sql', '15-domicilio-km.sql', '16-direcciones-cliente.sql', '17-caja-pedidos.sql', '18-formas-pago-comision.sql', '19-caja-movimientos.sql', '20-clientes-datos.sql', '21-vitrina-tienda.sql', '22-prepago-resumen.sql', '22-prepago-resumen.sql']) {
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
const V = (await como('sistema', () => crear('vitrina-v', 'Vitrina V', 'tienda', 'duenoV@prueba.com', 'vitrina'))).id
await q(`insert into negocio_miembros (negocio_id, user_id, rol) values ($1,$2,'cajero')`, [A, U.cajeroA])
const pA = (await q(`insert into productos (negocio_id,codigo,nombre,precio_venta,stock,publicado) values ($1,'1','Arroz A',2500,100,true) returning id`, [A])).rows[0].id
const cA = (await q(`insert into clientes (negocio_id,nombre,tipo_documento,documento,telefono) values ($1,'Cliente A','CC','1000001','3001000001') returning id`, [A])).rows[0].id
const cA2 = (await q(`insert into clientes (negocio_id,nombre,tipo_documento,documento,telefono) values ($1,'Cliente A2','CC','1000003','3001000003') returning id`, [A])).rows[0].id
const cB = (await q(`insert into clientes (negocio_id,nombre,tipo_documento,documento,telefono) values ($1,'Cliente B','CC','1000002','3001000002') returning id`, [B])).rows[0].id
const J = (o) => JSON.stringify(o)
const venta = (n, items, pagos, o = {}) => q(`select registrar_venta($1::uuid,$2::jsonb,$3::jsonb,$4::uuid,$5::text,$6::date,$7::numeric,$8::jsonb) id`, [n, J(items), J(pagos), o.cli ?? null, o.nota ?? null, null, 0, null])
const item = (cant) => [{ producto_id: pA, cantidad: cant }]
const prepago = (m) => [{ metodo: 'prepago', monto: m }]
const saldo = async (cli) => (await q(`select * from prepago_saldos where cliente_id=$1`, [cli])).rows[0]
const rec = (n, c, m, met = 'efectivo', nota = null, clave = null, bono = 0, vence = null) => q(`select prepago_recargar($1,$2,$3,$4,$5,$6,$7,$8) id`, [n, c, m, met, nota, clave, bono, vence])
const manana = (d) => new Date(Date.now() + d * 864e5).toISOString().slice(0, 10)

console.log('\n--- Módulo y forma de pago ---')
await ok('verificar_aislamiento todo true', 'sistema', () => q(`select * from verificar_aislamiento()`), r => r.rows.every(x => x.ok) || (console.log(r.rows.filter(x => !x.ok)), false))
await ok('A (completo) tiene forma de pago prepago activa', 'duenoA', () => q(`select * from formas_pago where id='prepago'`), r => r.rows.length === 1 && r.rows[0].activa && r.rows[0].tipo === 'prepago')
await ok('Vitrina no tiene el módulo ni la forma de pago', 'sistema', () => q(`select (select count(*) from negocio_modulos where negocio_id=$1 and modulo='prepago' and activo) m, (select count(*) from formas_pago where negocio_id=$1 and id='prepago' and activa) f`, [V]), r => r.rows[0].m == 0 && r.rows[0].f == 0)

console.log('\n--- Recargar ---')
await falla('cajero no recarga', 'cajeroA', () => rec(A, cA, 50000), 'Solo el dueño')
await falla('dueño B no recarga en A', 'duenoB', () => rec(A, cA, 50000), 'Solo el dueño')
await falla('soporte no recarga', 'soporte', () => rec(A, cA, 50000), 'Solo el dueño')
await falla('anónimo no recarga', 'anon', () => rec(A, cA, 50000), 'permission denied')
await falla('monto cero', 'duenoA', () => rec(A, cA, 0), 'mayor a cero')
await falla('monto enorme', 'duenoA', () => rec(A, cA, 6000000), '5.000.000')
await falla('método fiado no vale', 'duenoA', () => rec(A, cA, 1000, 'fiado'), 'con qué pagó')
await falla('bono mayor que recarga', 'duenoA', () => rec(A, cA, 1000, 'efectivo', null, null, 2000), 'bono')
await falla('bono con fecha pasada', 'duenoA', () => rec(A, cA, 1000, 'efectivo', null, null, 100, '2020-01-01'), 'después de hoy')
await falla('cliente de otra tienda', 'duenoA', () => rec(A, cB, 1000), 'Cliente no encontrado')
await falla('módulo apagado en Vitrina', 'duenoV', () => rec(V, cA, 1000), 'Solo el dueño|módulo|plan')
const clave = '11111111-1111-1111-1111-111111111111'
await ok('dueño recarga 50.000 con bono 10.000 que vence en 30 días', 'duenoA', () => rec(A, cA, 50000, 'efectivo', 'Primera', clave, 10000, manana(30)))
await ok('reintento con la misma clave no duplica', 'duenoA', () => rec(A, cA, 50000, 'efectivo', 'Primera', clave, 10000, manana(30)))
{ const s = await como('sistema', () => saldo(cA)); pruebas++; if (s.saldo == 60000 && s.saldo_real == 50000 && s.bono == 10000 && s.recargado == 50000) console.log('✓ saldo 60.000 = 50.000 propio + 10.000 bono'); else { fallas++; console.log('✗ saldo', s) } }

console.log('\n--- Cobrar con saldo ---')
await falla('sin cliente no se cobra con saldo', 'duenoA', () => venta(A, item(2), prepago(5000)), 'Elige el cliente')
await falla('saldo insuficiente: toda la venta se cancela', 'duenoA', () => venta(A, item(30), prepago(75000), { cli: cA }), 'insuficiente')
{ const n = (await como('sistema', () => q(`select (select count(*) from ventas where negocio_id=$1) v, (select stock from productos where id=$2) s`, [A, pA]))).rows[0]; pruebas++; if (n.s == 100) console.log('✓ nada quedó a medias (stock intacto)'); else { fallas++; console.log('✗ stock', n) } }
await falla('cliente sin saldo no gasta', 'duenoA', () => venta(A, item(1), prepago(2500), { cli: cA2 }), 'insuficiente')
await ok('cajero cobra 25.000 (usa bono primero)', 'cajeroA', () => venta(A, item(10), prepago(25000), { cli: cA }))
{ const s = await como('sistema', () => saldo(cA)); pruebas++; if (s.saldo == 35000 && s.bono == 0 && s.saldo_real == 35000) console.log('✓ gastó 10.000 de bono y 15.000 propios'); else { fallas++; console.log('✗ después de cobrar', s) } }
const v1 = (await q(`select id from ventas where negocio_id=$1 order by fecha desc limit 1`, [A])).rows[0].id
await ok('anular devuelve plata y bono', 'duenoA', () => q(`update ventas set anulada=true where id=$1 and negocio_id=$2`, [v1, A]))
{ const s = await como('sistema', () => saldo(cA)); pruebas++; if (s.saldo == 60000 && s.bono == 10000 && s.saldo_real == 50000) console.log('✓ volvió todo: 50.000 + bono 10.000'); else { fallas++; console.log('✗ tras anular', s) } }
await ok('anular dos veces no devuelve doble', 'sistema', async () => { await q(`update ventas set anulada=false where id=$1`, [v1]); return q(`update ventas set anulada=true where id=$1`, [v1]) })
{ const s = await como('sistema', () => saldo(cA)); pruebas++; if (s.saldo == 60000) console.log('✓ sin doble reverso'); else { fallas++; console.log('✗ doble reverso', s) } }

console.log('\n--- Orden de bonos y vencimiento ---')
await ok('segunda recarga con bono que vence antes (5 días)', 'duenoA', () => rec(A, cA2, 20000, 'digital' === 'x' ? '' : 'nequi', null, null, 4000, manana(5)))
await ok('otro bono sin fecha', 'duenoA', () => rec(A, cA2, 10000, 'efectivo', null, null, 6000, null))
await ok('cobra 7.500: gasta primero el que vence antes', 'duenoA', () => venta(A, item(3), prepago(7500), { cli: cA2 }))
{ const r = (await como('sistema', () => q(`select b.vence, b.monto - coalesce((select sum(u.monto) from prepago_bono_usos u where u.bono_id=b.id),0) queda from prepago_movimientos b where b.cliente_id=$1 and b.tipo='bono' order by b.vence nulls last`, [cA2]))).rows; pruebas++; if (r[0].queda == 0 && r[1].queda == 2500) console.log('✓ bono de 4.000 agotado y 3.500 del bono sin fecha (quedan 2.500)'); else { fallas++; console.log('✗ orden de bonos', r) } }

console.log('\n--- Devolver y ajustar ---')
await falla('no se devuelve más que la plata propia', 'duenoA', () => q(`select prepago_devolver($1,$2,$3,'efectivo','Se va')`, [A, cA, 50001]), 'Solo se puede devolver')
await falla('devolución sin motivo', 'duenoA', () => q(`select prepago_devolver($1,$2,1000,'efectivo','')`, [A, cA]), 'motivo')
await falla('cajero no devuelve', 'cajeroA', () => q(`select prepago_devolver($1,$2,1000,'efectivo','x ok')`, [A, cA]), 'Solo el dueño')
await ok('dueño devuelve 10.000 en efectivo', 'duenoA', () => q(`select prepago_devolver($1,$2,10000,'efectivo','Pidió su plata')`, [A, cA]))
await falla('ajuste a negativo imposible', 'duenoA', () => q(`select prepago_ajustar($1,$2,-999999,'error')`, [A, cA]), 'negativo')
await ok('ajuste +500 con motivo', 'duenoA', () => q(`select prepago_ajustar($1,$2,500,'Corrección')`, [A, cA]))
{ const s = await como('sistema', () => saldo(cA)); pruebas++; if (s.saldo_real == 40500 && s.bono == 10000) console.log('✓ saldo 40.500 + bono'); else { fallas++; console.log('✗ saldo final', s) } }

console.log('\n--- Historial inmutable ---')
await falla('nadie edita el historial (ni el dueño)', 'duenoA', () => q(`update prepago_movimientos set monto=1 where negocio_id=$1`, [A]), 'cero|permission denied|row-level|no se modifica')
await falla('nadie borra el historial', 'duenoA', () => q(`delete from prepago_movimientos where negocio_id=$1`, [A]), 'cero|permission denied|row-level|no se modifica')
await falla('ni el sistema edita', 'sistema', () => q(`update prepago_movimientos set monto=1`), 'no se modifica')
await falla('ni el sistema borra', 'sistema', () => q(`delete from prepago_movimientos`), 'no se modifica')
await falla('dueño no inserta directo', 'duenoA', () => q(`insert into prepago_movimientos (negocio_id,cliente_id,tipo,monto) values ($1,$2,'recarga',999999)`, [A, cA]), 'permission denied|row-level')

console.log('\n--- Aislamiento ---')
await ok('dueño B no ve movimientos de A', 'duenoB', () => q(`select count(*) n from prepago_movimientos`), r => r.rows[0].n == 0)
await ok('dueño B no ve saldos de A', 'duenoB', () => q(`select count(*) n from prepago_saldos`), r => r.rows[0].n == 0)
await ok('dueño A ve sus saldos', 'duenoA', () => q(`select count(*) n from prepago_saldos`), r => r.rows[0].n == 2)
await ok('cajero A ve saldos (para cobrar)', 'cajeroA', () => q(`select count(*) n from prepago_saldos`), r => r.rows[0].n == 2)
await ok('soporte ve (solo lectura)', 'soporte', () => q(`select count(*) n from prepago_saldos`), r => r.rows[0].n == 2)
await falla('anónimo no lee', 'anon', () => q(`select * from prepago_saldos`), 'permission denied')
await falla('anónimo no lee movimientos', 'anon', () => q(`select * from prepago_movimientos`), 'permission denied')

console.log('\n--- Módulo apagado ---')
await q(`update negocio_modulos set activo=false where negocio_id=$1 and modulo='prepago'`, [A])
await ok('la forma de pago se apaga sola', 'sistema', () => q(`select activa from formas_pago where negocio_id=$1 and id='prepago'`, [A]), r => r.rows[0].activa === false)
await falla('no se cobra con saldo con el módulo apagado', 'duenoA', () => venta(A, item(1), prepago(2500), { cli: cA }), 'no está disponible|módulo|plan')
await q(`update negocio_modulos set activo=true where negocio_id=$1 and modulo='prepago'`, [A])
await ok('al encender vuelve', 'sistema', () => q(`select activa from formas_pago where negocio_id=$1 and id='prepago'`, [A]), r => r.rows[0].activa === true)

console.log('\n--- Caja del día ---')
await ok('venta con saldo para la caja', 'duenoA', () => venta(A, item(1), prepago(2500), { cli: cA }))
await ok('recargas y devoluciones en la caja; efectivo = 60.000 − 10.000', 'duenoA', () => q(`select caja_dia($1) c`, [A]), r => { const c = r.rows[0].c; return c.recargas_total == 80000 && c.devoluciones_total == 10000 && c.efectivo_esperado == 50000 && c.vendido > 0 })
await ok('la venta con saldo cuenta como vendida pero no como efectivo', 'duenoA', () => q(`select caja_dia($1) c`, [A]), r => r.rows[0].c.por_pago.some(p => p.tipo === 'prepago'))

console.log('\n--- Resumen semanal ---')
await falla('cajero no ve el resumen', 'cajeroA', () => q(`select resumen_semanal($1)`, [A]), 'Solo el dueño')
await falla('dueño B no ve el de A', 'duenoB', () => q(`select resumen_semanal($1)`, [A]), 'Solo el dueño')
await falla('anónimo no', 'anon', () => q(`select resumen_semanal($1)`, [A]), 'permission denied')
await ok('dueño A lo ve', 'duenoA', () => q(`select resumen_semanal($1) r`, [A]), r => r.rows[0].r.dias === 7 && 'pedidos' in r.rows[0].r && Array.isArray(r.rows[0].r.productos))
await ok('soporte lo ve', 'soporte', () => q(`select resumen_semanal($1) r`, [A]))
await ok('días fuera de rango se limitan', 'duenoA', () => q(`select resumen_semanal($1, 999) r`, [A]), r => r.rows[0].r.dias === 31)

console.log('\n--- Idempotencia del archivo 22 y verificación ---')
{
  const sql = fs.readFileSync(path.join(sqlDir, '22-prepago-resumen.sql'), 'utf8')
  const i = sql.lastIndexOf('-- ---------- VERIFICACIÓN')
  const v = await como('sistema', async () => { await db.exec(sql.slice(0, i)); return db.query(sql.slice(i).replace(/^--.*$/m, '')) })
  pruebas++
  console.log('   filas de verificación:', v.rows.length)
  if (v.rows.length >= 6 && v.rows.every(r => r.ok === true)) console.log('✓ archivo 22: todo true y se puede correr de nuevo'); else { fallas++; console.log('✗ archivo 22', JSON.stringify(v.rows.filter(r => !r.ok))) }
}

console.log(`\n${pruebas - fallas}/${pruebas} pruebas correctas`)
if (fallas) { console.log(`${fallas} FALLARON`); process.exit(1) }
console.log('TODO EN ORDEN: el prepago está aislado.')
