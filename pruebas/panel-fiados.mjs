// Pruebas de lo que necesita la caja del panel (SQL 24: fiados y préstamos). Uso: cd pruebas ; node panel-fiados.mjs
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
for (const f of ['01-plataforma.sql', '02-datos.sql', '03-seguridad.sql', '04-funciones-plataforma.sql', '05-storage-realtime.sql', '06-funciones-negocio.sql', '07-tablero-y-pedidos.sql', '08-permisos.sql', '10-planes-modulos.sql', '11-catalogo-clientes.sql', '12-redondeo-domicilio.sql', '14-panel.sql', '15-domicilio-km.sql', '16-direcciones-cliente.sql', '17-caja-pedidos.sql', '18-formas-pago-comision.sql', '19-caja-movimientos.sql', '20-clientes-datos.sql', '21-vitrina-tienda.sql', '22-prepago-resumen.sql', '23-panel-caja.sql', '24-panel-fiados.sql', '25-horarios-directorio.sql', '26-solicitudes-negocio.sql', '27-administrador-miembro.sql', '28-avisos-pedidos.sql']) {
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
const pA = (await q(`insert into productos (negocio_id,codigo,nombre,precio_venta,stock) values ($1,'1','Arroz A',2500,100) returning id`, [A])).rows[0].id
const cA = (await q(`insert into clientes (negocio_id,nombre,tipo_documento,documento,telefono,direccion,cupo_credito) values ($1,'Cliente A','CC','1000001','3001000001','Calle 1',100000) returning id`, [A])).rows[0].id
const cB = (await q(`insert into clientes (negocio_id,nombre,tipo_documento,documento,telefono,direccion) values ($1,'Cliente B','CC','2000001','3002000001','Calle 2') returning id`, [B])).rows[0].id
const J = (o) => JSON.stringify(o)
const saldo = async (cli = cA) => Number((await q(`select saldo from clientes_saldo where id=$1`, [cli])).rows[0].saldo)
const pend = async (id) => Number((await q(`select coalesce(sum(pendiente),0) p from fiado_pendiente where cargo_id=$1`, [id])).rows[0].p)

// Dos facturas viejas (saldo anterior): 3.000 (hace 10 días) y 5.000 (hace 2 días)
const vieja = (await como('duenoA', () => q(`select registrar_saldo_anterior($1,$2,3000,(current_date-10)) id`, [A, cA]))).rows[0].id
const nueva = (await como('duenoA', () => q(`select registrar_saldo_anterior($1,$2,5000,(current_date-2)) id`, [A, cA]))).rows[0].id

console.log('\n--- Qué falta de cada factura ---')
await ok('el saldo es 8.000 y cada factura debe lo suyo', 'cajeroA', async () => ({ rows: [{ s: await saldo(), v: await pend(vieja), n: await pend(nueva) }] }), r => r.rows[0].s === 8000 && r.rows[0].v === 3000 && r.rows[0].n === 5000)
await ok('cajero paga 2.000 a la factura nueva', 'cajeroA', () => q(`select registrar_abono_factura($1,$2,2000,'efectivo','Para la de ayer')`, [A, nueva]))
await ok('la factura nueva debe 3.000 y la vieja sigue en 3.000', 'cajeroA', async () => ({ rows: [{ s: await saldo(), v: await pend(vieja), n: await pend(nueva) }] }), r => r.rows[0].s === 6000 && r.rows[0].v === 3000 && r.rows[0].n === 3000)
await ok('un abono general (1.000) paga lo más viejo', 'cajeroA', () => q(`select registrar_abono($1,$2,1000)`, [A, cA]))
await ok('la vieja queda en 2.000 y la nueva en 3.000', 'cajeroA', async () => ({ rows: [{ v: await pend(vieja), n: await pend(nueva) }] }), r => r.rows[0].v === 2000 && r.rows[0].n === 3000)
await falla('no se paga más de lo que falta de la factura', 'cajeroA', () => q(`select registrar_abono_factura($1,$2,3001)`, [A, nueva]), 'mayor que lo que falta')
await falla('abono en cero', 'cajeroA', () => q(`select registrar_abono_factura($1,$2,0)`, [A, nueva]), 'mayor que cero')
await falla('una factura que no existe', 'cajeroA', () => q(`select registrar_abono_factura($1,'99999999-9999-9999-9999-999999999999',10)`, [A]), 'no existe')
await ok('pagar completa la factura nueva', 'cajeroA', () => q(`select registrar_abono_factura($1,$2,3000)`, [A, nueva]))
await falla('una factura ya pagada no se paga otra vez', 'cajeroA', () => q(`select registrar_abono_factura($1,$2,1)`, [A, nueva]), 'ya está pagada')
await ok('el saldo (3.000) coincide con lo pendiente', 'cajeroA', async () => ({ rows: [{ s: await saldo(), v: await pend(vieja) }] }), r => r.rows[0].s === 2000 && r.rows[0].v === 2000)

console.log('\n--- Aislamiento ---')
await falla('el dueño de B no paga facturas de A', 'duenoB', () => q(`select registrar_abono_factura($1,$2,100)`, [A, vieja]), 'Sin acceso')
await falla('anónimo no paga', 'anon', () => q(`select registrar_abono_factura($1,$2,100)`, [A, vieja]), 'permission denied')
await falla('soporte no paga (solo lectura)', 'soporte', () => q(`select registrar_abono_factura($1,$2,100)`, [A, vieja]), 'solo lectura|Sin acceso|permission')
await ok('B no ve lo pendiente de A', 'duenoB', () => q(`select count(*) n from fiado_pendiente`), r => r.rows[0].n == 0)
await ok('B no ve los saldos de A', 'duenoB', () => q(`select count(*) n from clientes_saldo where negocio_id=$1`, [A]), r => r.rows[0].n == 0)
await falla('una factura de A no se paga desde B (aunque se use el id de A en B)', 'duenoB', () => q(`select registrar_abono_factura($1,$2,100)`, [B, vieja]), 'no existe')
await ok('soporte puede mirar lo pendiente', 'soporte', () => q(`select count(*) n from fiado_pendiente where negocio_id=$1`, [A]), r => r.rows[0].n == 1)

console.log('\n--- Préstamo rápido ---')
await falla('el cajero NO presta dinero', 'cajeroA', () => q(`select registrar_prestamo_rapido($1,$2,2000)`, [A, cA]), 'Solo el dueño')
await ok('el dueño presta 2.000 con su nota', 'duenoA', () => q(`select registrar_prestamo_rapido($1,$2,2000,'efectivo','Para el bus')`, [A, cA]))
await ok('el saldo sube y el préstamo queda marcado', 'duenoA', () => q(`select saldo, prestamo_pendiente from clientes_saldo where id=$1`, [cA]), r => Number(r.rows[0].saldo) === 4000 && Number(r.rows[0].prestamo_pendiente) === 2000)
await falla('valor en cero', 'duenoA', () => q(`select registrar_prestamo_rapido($1,$2,0)`, [A, cA]), 'mayor que cero')
await falla('cliente de otro negocio', 'duenoA', () => q(`select registrar_prestamo_rapido($1,$2,100)`, [A, cB]), 'no encontrado')
await falla('el dueño de B no presta en A', 'duenoB', () => q(`select registrar_prestamo_rapido($1,$2,100)`, [A, cA]), 'Solo el dueño')
// el préstamo es lo MÁS NUEVO: los abonos generales pagan primero lo viejo, así que el pendiente del préstamo sigue completo
await ok('lo pendiente del préstamo es 2.000 (lo viejo se paga primero)', 'duenoA', () => q(`select pendiente from fiado_pendiente f join fiado_movimientos m on m.id=f.cargo_id where m.concepto='prestamo'`), r => Number(r.rows[0].pendiente) === 2000)
await ok('clientes_saldo muestra cuánto debe por préstamos', 'duenoA', () => q(`select prestamo_pendiente from clientes_saldo where id=$1`, [cA]), r => Number(r.rows[0].prestamo_pendiente) === 2000)

console.log('\n--- Mora sobre lo que de verdad falta ---')
await q(`update fiado_movimientos set fecha_limite = current_date - 5 where id=$1`, [vieja])
await q(`update negocio_reglas set mora_mensual = 3 where negocio_id=$1`, [A])
await ok('lo vencido es lo que falta de esa factura (2.000), no el total', 'duenoA', () => q(`select vencido, dias_atraso, recargo from clientes_mora where cliente_id=$1`, [cA]), r => Number(r.rows[0].vencido) === 2000 && r.rows[0].dias_atraso == 5)
await ok('el recargo se calcula (2.000 × 5 días × 3%/30 = 10)', 'duenoA', () => q(`select recargo from clientes_mora where cliente_id=$1`, [cA]), r => Number(r.rows[0].recargo) === 10)
await ok('B no ve la mora de A', 'duenoB', () => q(`select count(*) n from clientes_mora`), r => r.rows[0].n == 0)

console.log('\n--- Corregir un movimiento ---')
await falla('el cajero NO corrige', 'cajeroA', () => q(`select corregir_movimiento_fiado($1,$2,2500)`, [A, vieja]), 'Solo el dueño')
await falla('no se baja la factura por debajo de lo ya pagado a ella', 'duenoA', () => q(`select corregir_movimiento_fiado($1,$2,1000)`, [A, nueva]), 'Ya se pagaron')
await ok('el dueño corrige el valor, la fecha y la nota de la vieja', 'duenoA', () => q(`select corregir_movimiento_fiado($1,$2,2500,(current_date-9),'Digitada mal',(current_date+3))`, [A, vieja]))
await ok('quedó con el valor nuevo y fecha límite nueva', 'duenoA', () => q(`select monto, nota, fecha_limite = current_date + 3 as lim from fiado_movimientos where id=$1`, [vieja]), r => Number(r.rows[0].monto) === 2500 && r.rows[0].nota === 'Digitada mal' && r.rows[0].lim === true)
await falla('el dueño de B no corrige en A', 'duenoB', () => q(`select corregir_movimiento_fiado($1,$2,100)`, [A, vieja]), 'Solo el dueño')
await ok('la corrección quedó en la auditoría', 'sistema', () => q(`select count(*) n from auditoria where negocio_id=$1 and tabla='fiado_movimientos' and accion='UPDATE'`, [A]), r => r.rows[0].n >= 1)
await ok('la versión que borra con motivo sigue funcionando', 'duenoA', () => q(`select corregir_movimiento_fiado($1,(select id from fiado_movimientos where concepto='prestamo'),'Se digitó mal') `, [A]))

console.log('\n--- Sin internet (claves únicas) ---')
const k1 = 'aaaaaaaa-1111-1111-1111-111111111111', k2 = 'aaaaaaaa-2222-2222-2222-222222222222', k3 = 'aaaaaaaa-3333-3333-3333-333333333333'
const hace = (min) => new Date(Date.now() - min * 60000).toISOString()
const ab = (clave, fecha, rpc, args, neg = A) => q(`select ejecutar_offline($1,$2,$3::timestamptz,$4,$5::jsonb) id`, [neg, clave, fecha, rpc, J(args)])
const s0 = await como('sistema', () => saldo())
await ok('abono a una factura subido desde el equipo', 'cajeroA', () => ab(k1, hace(30), 'registrar_abono_factura', { p_cargo_id: vieja, p_monto: 500 }))
await ok('subirlo otra vez NO lo duplica', 'cajeroA', () => ab(k1, hace(30), 'registrar_abono_factura', { p_cargo_id: vieja, p_monto: 500 }))
{ const s1 = await como('sistema', () => saldo()); pruebas++; if (s0 - s1 === 500) console.log('✓ el saldo bajó solo una vez (500)'); else { fallas++; console.log('✗ saldo', s0, s1) } }
await ok('el abono quedó con la hora en que se hizo (hace 30 min)', 'cajeroA', () => q(`select (now() - fecha) > interval '25 minutes' as vieja from fiado_movimientos where aplica_a=$1 order by fecha limit 1`, [vieja]), r => r.rows[0].vieja === true)
await ok('abono general sin conexión', 'cajeroA', () => ab(k2, hace(5), 'registrar_abono', { p_cliente_id: cA, p_monto: 100 }))
await falla('el cajero no presta sin conexión', 'cajeroA', () => ab(k3, hace(5), 'registrar_prestamo_rapido', { p_cliente_id: cA, p_monto: 1000 }), 'Solo el dueño')
await ok('el dueño sí presta sin conexión', 'duenoA', () => ab(k3, hace(5), 'registrar_prestamo_rapido', { p_cliente_id: cA, p_monto: 1000, p_nota: 'Para pan' }))
await falla('una acción que no está permitida', 'duenoA', () => ab('aaaaaaaa-4444-4444-4444-444444444444', hace(1), 'borrar_todo', {}), 'no permitida')
await falla('otra tienda no ejecuta en A', 'duenoB', () => ab('aaaaaaaa-5555-5555-5555-555555555555', hace(1), 'registrar_abono', {}), 'Sin acceso')

console.log('\n--- Compras del cliente y segundo contacto ---')
await ok('el cliente guarda un segundo contacto', 'cajeroA', () => q(`update clientes set contacto2='Esposa', telefono2='3009999999' where negocio_id=$1 and id=$2 returning id`, [A, cA]), r => r.rows.length === 1)
await ok('una venta suma a las compras del cliente', 'cajeroA', () => q(`select registrar_venta($1,$2::jsonb,$3::jsonb,$4::uuid)`, [A, J([{ producto_id: pA, cantidad: 2 }]), J([{ metodo: 'efectivo', monto: 5000, recibido: 5000 }]), cA]))
await ok('clientes_saldo muestra compras, total y segundo contacto', 'cajeroA', () => q(`select compras, total_comprado, contacto2, telefono2 from clientes_saldo where id=$1`, [cA]), r => Number(r.rows[0].compras) === 1 && Number(r.rows[0].total_comprado) === 5000 && r.rows[0].contacto2 === 'Esposa')
await ok('B no puede cambiar clientes de A', 'duenoB', () => q(`update clientes set contacto2='X' where negocio_id=$1 returning id`, [A]), r => r.rows.length === 0)

console.log('\n--- Módulo apagado ---')
await q(`update negocio_modulos set activo=false where negocio_id=$1 and modulo='fiados'`, [A])
await falla('con fiados apagado no se paga una factura', 'cajeroA', () => q(`select registrar_abono_factura($1,$2,10)`, [A, vieja]), 'módulo|modulo|plan')
await falla('con fiados apagado no se presta', 'duenoA', () => q(`select registrar_prestamo_rapido($1,$2,10)`, [A, cA]), 'módulo|modulo|plan')
await q(`update negocio_modulos set activo=true where negocio_id=$1 and modulo='fiados'`, [A])

console.log('\n--- Archivo 24 dos veces y verificación ---')
{
  const sql = fs.readFileSync(path.join(sqlDir, '24-panel-fiados.sql'), 'utf8')
  const i = sql.lastIndexOf('-- ---------- VERIFICACIÓN')
  const v = await como('sistema', async () => { await db.exec(sql.slice(0, i)); return db.query(sql.slice(i).replace(/^--.*$/m, '')) })
  pruebas++
  console.log('   filas de verificación:', v.rows.length)
  if (v.rows.length === 15 && v.rows.every(r => r.ok === true)) console.log('✓ archivo 24: 15 filas true y se puede correr de nuevo'); else { fallas++; console.log('✗ archivo 24', JSON.stringify(v.rows.filter(r => !r.ok))) }
  const s = await como('sistema', () => saldo())
  pruebas++; if (Number.isFinite(s)) console.log('✓ los datos siguen igual tras correrlo de nuevo'); else { fallas++; console.log('✗ datos') }
}
console.log(`\n${pruebas - fallas}/${pruebas} pruebas correctas`)
if (fallas) { console.log(`${fallas} FALLARON`); process.exit(1) }
console.log('TODO EN ORDEN: fiados y préstamos están aislados.')
