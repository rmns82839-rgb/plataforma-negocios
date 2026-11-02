// Prueba de la importación de Cibus: arma la base de Nelson (sus SQL reales) con datos de ejemplo, la "respalda" a JSON como lo hace
// el script 01, la importa a una base de la plataforma (los SQL reales 01-59) y comprueba que cuadre todo. Uso: node migracion.mjs
import { PGlite } from '@electric-sql/pglite'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { importar } from '../scripts/migracion/importar-lib.mjs'

const stubs = `
create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
create schema auth; create schema storage; create schema realtime; create schema extensions;
create table auth.users (id uuid primary key default gen_random_uuid(), email text, encrypted_password text, last_sign_in_at timestamptz, email_confirmed_at timestamptz, raw_user_meta_data jsonb, raw_app_meta_data jsonb, created_at timestamptz default now());
create table auth.mfa_factors (id uuid primary key default gen_random_uuid(), user_id uuid, status text, factor_type text);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
create function auth.role() returns text language sql stable as $$ select 'authenticated' $$;
create function auth.email() returns text language sql stable as $$ select 'x' $$;
create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text, owner uuid);
alter table storage.objects enable row level security;
create table realtime.messages (id uuid primary key default gen_random_uuid(), topic text);
alter table realtime.messages enable row level security;
create function realtime.topic() returns text language sql stable as $$ select current_setting('realtime.topic', true) $$;
create publication supabase_realtime;
grant usage on schema auth, storage, realtime, extensions to anon, authenticated, service_role;
`
let fallas = 0
const ok = (c, m) => { if (c) console.log('✓', m); else { fallas++; console.log('✗', m) } }
const sqlDir = path.join(import.meta.dirname, '..', 'supabase')
const nd = '/tmp/n/tienda-barrio-master/supabase/'
if (!fs.existsSync(nd)) { console.log('Sin el código de Nelson en', nd, '→ prueba omitida'); process.exit(0) }

// ---- Base de Nelson con datos de ejemplo ----
const nel = new PGlite(); await nel.exec(stubs + `insert into auth.users (id,email) values ('11111111-1111-1111-1111-111111111111','dueno@x.com'),('22222222-2222-2222-2222-222222222222','cliente@x.com'),('33333333-3333-3333-3333-333333333333','a@x.com'),('44444444-4444-4444-4444-444444444444','b@x.com'),('55555555-5555-5555-5555-555555555555','soporte@x.com');`)
const orden = fs.readdirSync(nd).filter((f) => /^(schema|migracion-.*)\.sql$/.test(f)).sort((a, b) => { const k = (s) => s === 'schema.sql' ? -1 : s === 'migracion-mejoras.sql' ? 0.5 : parseFloat((s.match(/v(\d+)/) || [0, 999])[1]); return k(a) - k(b) })
for (const f of orden) await nel.exec(fs.readFileSync(nd + f, 'utf8').replace(/CORREO_DUENO_1@gmail.com/g, 'a@x.com').replace(/CORREO_DUENO_2@gmail.com/g, 'b@x.com'))
await nel.exec(`set session_replication_role = replica`)
const VIEJA = 'https://viejo.supabase.co'
await nel.exec(`
delete from perfiles;
insert into perfiles (user_id, rol, nombre) values ('11111111-1111-1111-1111-111111111111','dueno','Nelson'), ('55555555-5555-5555-5555-555555555555','soporte','Iván');
update negocio set nombre='Cibus', ciudad='Puerto Colombia', whatsapp='3005550000', dom_modo='km', dom_base=2000, dom_por_km=1200, dom_max_km=8, dom_origen='10.99,-74.95', logo='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
insert into clientes (id, nombre, telefono, cupo_credito) values ('c0000000-0000-0000-0000-000000000001','Ana','3001','50000'),('c0000000-0000-0000-0000-000000000002','Luis','3002','0');
insert into productos (id, codigo, nombre, categoria, precio_compra, precio_venta, stock, imagenes) values
 ('a0000000-0000-0000-0000-000000000001','111','Arroz','Granos',2000,3000,10,array['${VIEJA}/storage/v1/object/public/prendas/arroz.jpg']),
 ('a0000000-0000-0000-0000-000000000002','222','Leche','Lácteos',2500,3500,20,'{}');
insert into ventas (id, total, metodo, cliente_id, numero) values ('b0000000-0000-0000-0000-000000000001',6500,'efectivo',null,41),('b0000000-0000-0000-0000-000000000002',3500,'fiado','c0000000-0000-0000-0000-000000000001',42);
insert into venta_items (venta_id, producto_id, nombre, cantidad, precio_unitario, costo_unitario) values ('b0000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000001','Arroz',1,3000,2000),('b0000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000002','Leche',1,3500,2500),('b0000000-0000-0000-0000-000000000002','a0000000-0000-0000-0000-000000000002','Leche',1,3500,2500);
insert into fiado_movimientos (cliente_id, tipo, monto, venta_id) values ('c0000000-0000-0000-0000-000000000001','cargo',3500,'b0000000-0000-0000-0000-000000000002');
insert into gastos (tipo, descripcion, monto) values ('servicios','Luz', 40000);
insert into caja_movimientos (tipo, motivo, monto, creado_por) values ('retiro','banco',100000,'11111111-1111-1111-1111-111111111111');
insert into pedidos_tienda (numero, nombre, telefono, direccion, total, estado, dom_km, user_id) values (7,'Ana','3001','Cra 1',9000,'atendido',2.5,'22222222-2222-2222-2222-222222222222');
insert into perfil_cliente (user_id, nombre, telefono, direccion, acepta_datos_en) values ('22222222-2222-2222-2222-222222222222','Ana','3001234567','Carrera 1 número 2-3 Puerto Colombia', now());
insert into suscripciones_push (endpoint, user_id, p256dh, auth) values ('https://push.x/1','11111111-1111-1111-1111-111111111111','k','a'),('https://push.x/2','22222222-2222-2222-2222-222222222222','k','a');
insert into visitas (dia, catalogo, visitante) values (current_date,'tienda','visitante-de-prueba-0001');
insert into avisos_auto (id, activo, menus_ids) values (true, true, '{}') on conflict (id) do update set activo = true;
`).catch((e) => { console.log('FALLA preparando datos de Nelson:', e.message); process.exit(1) })
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'respaldo-'))
fs.mkdirSync(path.join(dir, 'tablas'))
const tablas = ['clientes', 'productos', 'ventas', 'venta_items', 'fiado_movimientos', 'gastos', 'caja_movimientos', 'pedidos_tienda', 'perfil_cliente', 'suscripciones_push', 'visitas', 'avisos_auto', 'perfiles', 'negocio', 'formas_pago']
for (const t of tablas) fs.writeFileSync(path.join(dir, 'tablas', t + '.json'), JSON.stringify((await nel.query(`select to_jsonb(t) f from "${t}" t`)).rows.map((r) => r.f)))

// ---- Base de la plataforma ----
const pl = new PGlite(); await pl.exec(stubs)
for (const f of fs.readdirSync(sqlDir).filter((f) => /^\d\d-.*\.sql$/.test(f) && !f.startsWith('09-')).sort()) await pl.exec(fs.readFileSync(path.join(sqlDir, f), 'utf8'))
await pl.exec(`insert into auth.users (id,email) values ('aaaaaaaa-0000-0000-0000-000000000001','dueno@x.com'),('aaaaaaaa-0000-0000-0000-000000000002','cliente@x.com')`)
const mapa = { '11111111-1111-1111-1111-111111111111': 'aaaaaaaa-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222': 'aaaaaaaa-0000-0000-0000-000000000002' }
const q = (sql, p) => pl.query(sql, p)
const base = { q, dir, urlViejo: VIEJA, mapaUsuarios: mapa, log: () => {} }

const antes = (await pl.query(`select count(*)::int n from productos`)).rows[0].n
process.on('uncaughtException', (e) => { console.log('ERROR:', String(e.message).slice(0, 300)); process.exit(1) })
const r1 = await importar({ ...base })                    // ensayo en seco
ok(r1.ok && !r1.aplicado, 'ensayo en seco: todo cuadra y no se guarda nada')
console.log('   (tras el ensayo) productos:', (await q(`select count(*)::int n from productos`)).rows[0].n, 'tiendas cibus:', (await q(`select count(*)::int n from negocios where slug='cibus'`)).rows[0].n)
ok((await q(`select count(*)::int n from productos`)).rows[0].n === antes && (await q(`select count(*)::int n from negocios where slug='cibus'`)).rows[0].n === 0, 'el ensayo en seco no dejó nada (ni productos ni la tienda)')
const r2 = await importar({ ...base, aplicar: true })
ok(r2.ok && r2.aplicado, 'importación real: cuadra y se guarda')
const neg = r2.negocio_id
const c = async (sql) => (await q(sql, [neg])).rows[0]
ok((await c(`select count(*)::int n from productos where negocio_id=$1`)).n === 2, '2 productos')
ok((await c(`select count(*)::int n from ventas where negocio_id=$1`)).n === 2, '2 ventas')
ok(Number((await c(`select sum(total) s from ventas where negocio_id=$1`)).s) === 10000, 'la suma de ventas es 10.000')
ok((await c(`select ultimo::int u from negocio_contadores where negocio_id=$1 and tipo='venta'`)).u === 42, 'el contador de ventas sigue en 42 (la próxima será la 43)')
ok((await c(`select ultimo::int u from negocio_contadores where negocio_id=$1 and tipo='pedido_tienda'`)).u === 7, 'el contador de pedidos sigue en 7')
ok((await c(`select count(*)::int n from fiado_movimientos where negocio_id=$1`)).n === 1, 'el fiado pasó')
ok(r2.logo && fs.existsSync(r2.logo.archivo) && (await c(`select logo_path l from negocio_config where negocio_id=$1`)).l === r2.logo.nueva, 'el logo incrustado se guardó como archivo y su ruta quedó en la tienda')
ok((await c(`select nombre_comercial n from negocio_config where negocio_id=$1`)).n === 'Cibus', 'los datos del negocio pasaron')
ok(Number((await c(`select lat from negocio_config where negocio_id=$1`)).lat) === 10.99, 'el punto de la tienda (lat/lng) pasó')
ok((await c(`select domicilio_modo m, domicilio_costo::int b, domicilio_valor_km::int k from negocio_reglas where negocio_id=$1`)).k === 1200, 'las reglas de domicilio por km pasaron')
ok((await c(`select count(*)::int n from negocio_miembros where negocio_id=$1 and rol='dueno' and user_id='aaaaaaaa-0000-0000-0000-000000000001'`)).n === 1, 'Nelson quedó como dueño con su cuenta nueva')
ok((await c(`select count(*)::int n from negocio_miembros where negocio_id=$1`)).n === 1, 'el soporte (Iván) no entró como miembro')
ok((await c(`select cliente_user_id u from pedidos_tienda where negocio_id=$1`)).u === 'aaaaaaaa-0000-0000-0000-000000000002', 'el pedido quedó con la cuenta nueva del cliente')
ok(Number((await c(`select km_informado k from pedidos_tienda where negocio_id=$1`)).k) === 2.5, 'dom_km pasó a km_informado')
ok((await q(`select count(*)::int n from perfil_cliente where user_id='aaaaaaaa-0000-0000-0000-000000000002'`)).rows[0].n === 1, 'el perfil del cliente pasó')
ok((await q(`select count(*)::int n from suscripciones_personal`)).rows[0].n === 1 && (await q(`select count(*)::int n from suscripciones_cliente`)).rows[0].n === 1, 'los avisos push se separaron en personal y cliente')
ok((await c(`select imagenes[1] i from productos where negocio_id=$1 and codigo='111'`)).i === `${neg}/productos/arroz.jpg`, 'la foto apunta a la ruta nueva')
ok(r2.archivos.some((a) => a.bucket === 'prendas' && a.ruta === 'arroz.jpg' && a.nueva === `${neg}/productos/arroz.jpg`), 'la foto quedó anotada para copiarla')
ok((await c(`select count(*)::int n from avisos_auto where negocio_id=$1 and activo`)).n === 1, 'los avisos automáticos pasaron')
ok((await c(`select count(*)::int n from negocio_modulos where negocio_id=$1 and modulo='ropa' and activo`)).n === 1, 'Cibus tiene su módulo de ropa')
ok((await q(`select bool_and(ok) b from verificar_aislamiento()`)).rows[0].b, 'verificar_aislamiento sigue en orden')
let dio = false; try { await importar({ ...base, aplicar: true }) } catch (e) { dio = /ya tiene datos/.test(e.message) }
ok(dio, 'no se importa dos veces encima sin --limpiar')
const r3 = await importar({ ...base, aplicar: true, limpiar: true })
ok(r3.ok && r3.aplicado && (await c(`select count(*)::int n from ventas where negocio_id=$1`)).n === 2, 'con --limpiar se repite el ensayo desde cero sin duplicar')
console.log(fallas ? `\n${fallas} FALLARON` : '\nTODO EN ORDEN'); process.exit(fallas ? 1 : 0)
