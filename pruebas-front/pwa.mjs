// Pruebas de la app instalable: manifest por tienda, íconos PNG de verdad, service worker y guía de instalación.
// Correr:  node pruebas-front/pwa.mjs      (necesita «sharp», que se instala con npm install sharp)
import assert from 'node:assert/strict'
import vm from 'node:vm'
import fs from 'node:fs'
import sharp from 'sharp'
let ok = 0
const t = (n, f) => Promise.resolve().then(f).then(() => { ok++; console.log('✓', n) }, (e) => { console.log('✗', n, '→', e.message); process.exitCode = 1 })

const { armarManifest, nombreCorto, slugValido } = await import('../api/_manifest.js')
const { dibujarIcono } = await import('../api/_icono.js')
const man = await import('../api/manifest.js')
const ico = await import('../api/icono.js')
const P = await import('../src/lib/pwa.js')

const N = { slug: 'don-pepe', nombre: 'Tienda Don Pepe del Barrio', eslogan: 'Lo fresco del día', color_principal: '#8B1E2D', logo: null, icono: null }

console.log('--- manifest ---')
await t('cumple lo que pide Chrome para instalar', () => {
  const m = armarManifest(N)
  assert.ok(m.name && m.short_name && m.start_url && m.display === 'standalone')
  assert.ok(m.icons.some((i) => i.sizes === '192x192' && i.type === 'image/png'))
  assert.ok(m.icons.some((i) => i.sizes === '512x512' && i.type === 'image/png'))
  assert.ok(m.start_url.startsWith(m.scope.slice(0, -1)), 'el inicio debe caer dentro del alcance')
})
await t('cada tienda tiene su propio id, alcance y colores', () => {
  const a = armarManifest(N), b = armarManifest({ ...N, slug: 'otra', color_principal: '#112233' })
  assert.notEqual(a.id, b.id); assert.notEqual(a.scope, b.scope); assert.equal(a.theme_color, '#8B1E2D'); assert.equal(b.theme_color, '#112233')
})
await t('la app del panel abre directo el panel y es otra instalación', () => {
  const t1 = armarManifest(N), p = armarManifest(N, { panel: true })
  assert.equal(p.start_url, '/t/don-pepe/panel'); assert.notEqual(p.id, t1.id); assert.match(p.name, /^Panel/); assert.ok(p.start_url.startsWith('/t/don-pepe/'))
})
await t('color inválido cae al negro de la marca (no rompe el manifest)', () => assert.equal(armarManifest({ ...N, color_principal: 'rojo' }).theme_color, '#0B0B0C'))
await t('nombre corto: cabe bajo el ícono', () => {
  assert.equal(nombreCorto('Tienda Don Pepe del Barrio'), 'Tienda Don'); assert.equal(nombreCorto('Pepe'), 'Pepe'); assert.ok(nombreCorto('Supercalifragilisticoespialidoso').length <= 12); assert.equal(nombreCorto('  '), 'Tienda')
})
await t('slug válido: rechaza rutas, mayúsculas y vacío', () => {
  assert.ok(slugValido('don-pepe')); for (const x of ['', '../x', 'A', 'a b', '-a', 'a-', 'a/b', undefined, 'x'.repeat(60)]) assert.ok(!slugValido(x), String(x))
})

console.log('--- íconos (se dibujan de verdad) ---')
const png = (b) => b[0] === 0x89 && b.toString('latin1', 1, 4) === 'PNG'
await t('sin logo: PNG del tamaño pedido y del color de la tienda', async () => {
  const b = await dibujarIcono({ logo: null, color: '#8B1E2D', size: 192 }); assert.ok(png(b))
  const { width, height } = await sharp(b).metadata(); assert.deepEqual([width, height], [192, 192])
  const { data } = await sharp(b).raw().toBuffer({ resolveWithObject: true }); assert.deepEqual([data[0], data[1], data[2]], [0x8B, 0x1E, 0x2D])   // la esquina es del color de la tienda
})
await t('con logo: se centra sobre blanco y no se deforma', async () => {
  const logo = await sharp({ create: { width: 400, height: 200, channels: 4, background: '#FF0000' } }).png().toBuffer()
  const b = await dibujarIcono({ logo, color: '#8B1E2D', size: 512 }); const { data, info } = await sharp(b).raw().toBuffer({ resolveWithObject: true })
  assert.equal(info.width, 512)
  const px = (x, y) => [...data.slice((y * 512 + x) * info.channels, (y * 512 + x) * info.channels + 3)]
  assert.deepEqual(px(2, 2), [255, 255, 255]); assert.deepEqual(px(256, 256), [255, 0, 0]); assert.deepEqual(px(256, 60), [255, 255, 255], 'el logo de 2:1 deja franjas blancas arriba')
})
await t('ícono para máscara deja más margen que el normal', async () => {
  const logo = await sharp({ create: { width: 300, height: 300, channels: 4, background: '#0000FF' } }).png().toBuffer()
  const borde = async (mascara) => { const b = await dibujarIcono({ logo, color: '#000000', size: 512, mascara }); const { data, info } = await sharp(b).raw().toBuffer({ resolveWithObject: true }); let x = 0; while (data[(256 * 512 + x) * info.channels + 2] === 255 && data[(256 * 512 + x) * info.channels] === 255) x++; return x }
  assert.ok(await borde(true) > await borde(false))
})
await t('logo dañado no tumba el ícono', async () => { await assert.rejects(dibujarIcono({ logo: Buffer.from('no soy una imagen'), color: '#000000', size: 192 })) })
await t('tamaño no permitido se rechaza', async () => { await assert.rejects(dibujarIcono({ logo: null, color: '#000', size: 1000 })) })

console.log('--- rutas del servidor (con Supabase y Storage simulados) ---')
const res = () => { const r = { cod: 200, h: {}, cuerpo: null, status(c) { r.cod = c; return r }, setHeader(k, v) { r.h[k] = v }, json(o) { r.cuerpo = o; return r }, send(b) { r.cuerpo = b; return r } }; return r }
const falsoFetch = (n, logo) => async (url, op) => {
  if (String(url).includes('/rpc/negocio_publico')) { falsoFetch.llamadas.push(JSON.parse(op.body)); return { ok: true, json: async () => n } }
  if (String(url).includes('/storage/v1/object/public/negocios/')) { falsoFetch.fotos.push(String(url)); return logo ? { ok: true, headers: { get: () => String(logo.length) }, arrayBuffer: async () => logo } : { ok: false } }
  throw new Error('pidió algo inesperado: ' + url)
}
falsoFetch.llamadas = []; falsoFetch.fotos = []
process.env.VITE_SUPABASE_URL = 'https://x.supabase.co/rest/v1/'; process.env.VITE_SUPABASE_ANON_KEY = 'anon-publica'
const realFetch = globalThis.fetch

await t('manifest: devuelve JSON válido con el tipo correcto y caché', async () => {
  globalThis.fetch = falsoFetch(N); const r = res(); await man.default({ query: { slug: 'Don-Pepe' } }, r); globalThis.fetch = realFetch
  assert.equal(r.cod, 200); assert.match(r.h['Content-Type'], /manifest\+json/); assert.match(r.h['Cache-Control'], /s-maxage/); assert.equal(JSON.parse(r.cuerpo).start_url, '/t/don-pepe'); assert.equal(falsoFetch.llamadas.at(-1).p_slug, 'don-pepe')
})
await t('manifest: usa solo la clave pública, nunca la de servicio', async () => {
  let cab; globalThis.fetch = async (u, op) => { cab = op.headers; return { ok: true, json: async () => N } }; process.env.SUPABASE_SERVICE_ROLE_KEY = 'SECRETA'
  await man.default({ query: { slug: 'don-pepe' } }, res()); globalThis.fetch = realFetch; delete process.env.SUPABASE_SERVICE_ROLE_KEY
  assert.equal(cab.apikey, 'anon-publica'); assert.ok(!JSON.stringify(cab).includes('SECRETA'))
})
await t('manifest: panel=1 y tienda inexistente', async () => {
  globalThis.fetch = falsoFetch(N); let r = res(); await man.default({ query: { slug: 'don-pepe', panel: '1' } }, r); assert.equal(JSON.parse(r.cuerpo).start_url, '/t/don-pepe/panel')
  globalThis.fetch = falsoFetch(null); r = res(); await man.default({ query: { slug: 'nadie' } }, r); globalThis.fetch = realFetch; assert.equal(r.cod, 404)
})
await t('manifest: slug raro ni siquiera llega a la base', async () => {
  const antes = falsoFetch.llamadas.length; globalThis.fetch = falsoFetch(N); const r = res(); await man.default({ query: { slug: '../../etc' } }, r); globalThis.fetch = realFetch
  assert.equal(r.cod, 400); assert.equal(falsoFetch.llamadas.length, antes)
})
await t('manifest: si Supabase falla responde 502 sin filtrar detalles', async () => {
  globalThis.fetch = async () => { throw new Error('clave anon-publica en el mensaje') }; const r = res(); await man.default({ query: { slug: 'don-pepe' } }, r); globalThis.fetch = realFetch
  assert.equal(r.cod, 502); assert.ok(!JSON.stringify(r.cuerpo).includes('anon-publica'))
})
await t('ícono: dibuja el logo de la tienda desde su carpeta de marca', async () => {
  const id = '11111111-2222-3333-4444-555555555555', logo = await sharp({ create: { width: 100, height: 100, channels: 3, background: '#00FF00' } }).png().toBuffer()
  falsoFetch.fotos.length = 0; globalThis.fetch = falsoFetch({ ...N, logo: `${id}/marca/logo-1.webp` }, logo); const r = res(); await ico.default({ query: { slug: 'don-pepe', size: '192' } }, r); globalThis.fetch = realFetch
  assert.equal(r.cod, 200); assert.equal(r.h['Content-Type'], 'image/png'); assert.ok(png(r.cuerpo)); assert.equal(falsoFetch.fotos[0], `https://x.supabase.co/storage/v1/object/public/negocios/${id}/marca/logo-1.webp`)
})
await t('ícono: una ruta de logo que no sea de marca NO se descarga (sin pedir cosas ajenas)', async () => {
  falsoFetch.fotos.length = 0; globalThis.fetch = falsoFetch({ ...N, logo: 'http://malo.com/x.png', icono: '../../secreto' }, Buffer.alloc(10)); const r = res(); await ico.default({ query: { slug: 'don-pepe', size: '512' } }, r); globalThis.fetch = realFetch
  assert.equal(r.cod, 200); assert.equal(falsoFetch.fotos.length, 0); assert.ok(png(r.cuerpo))
})
await t('ícono: tamaño o tienda inválidos = 400', async () => {
  for (const q of [{ slug: 'don-pepe', size: '999' }, { slug: '../x', size: '192' }, { slug: 'don-pepe' }]) { const r = res(); await ico.default({ query: q }, r); assert.equal(r.cod, 400) }
})

console.log('--- service worker ---')
function montarSW() {
  const almacenes = new Map(), oyentes = {}, pedidos = []
  const almacen = (n) => { if (!almacenes.has(n)) almacenes.set(n, new Map()); const m = almacenes.get(n); return { put: async (k, v) => { const u = typeof k === 'string' ? k : k.url; m.delete(u); m.set(u, v) }, match: async (k) => m.get(typeof k === 'string' ? k : k.url), add: async (k) => { m.set(typeof k === 'string' ? k : k.url, new Response('shell')) }, keys: async () => [...m.keys()].map((url) => ({ url })), delete: async (k) => m.delete(typeof k === 'string' ? k : k.url) } }
  const caches = { open: async (n) => almacen(n), keys: async () => [...almacenes.keys()], delete: async (n) => almacenes.delete(n), match: async (k) => { for (const m of almacenes.values()) { const v = m.get(typeof k === 'string' ? k : k.url); if (v) return v } } }
  const ctx = { self: { location: new URL('https://app.test/'), addEventListener: (e, f) => { oyentes[e] = f }, skipWaiting: async () => {}, clients: { claim: async () => {} } }, caches, Request, Response, URL, fetch: async (r) => { pedidos.push(r.url || String(r)); return ctx.respuesta(r) }, respuesta: () => new Response('x') }
  vm.createContext(ctx); vm.runInContext(fs.readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8'), ctx)
  const pedir = async (url, { method = 'GET', mode = 'no-cors', destination = '' } = {}) => {
    const e = { request: { url, method, mode, destination }, resp: undefined, respondWith(p) { e.resp = p }, waitUntil() {} }
    oyentes.fetch(e); return e.resp ? await e.resp : undefined
  }
  return { ctx, almacenes, pedidos, pedir, oyentes }
}
const foto = 'https://x.supabase.co/storage/v1/object/public/negocios/aaa/productos/p1.webp'
await t('no toca POST, /api, la base de datos ni el login', async () => {
  const sw = montarSW()
  for (const [u, o] of [['https://app.test/api/manifest', {}], ['https://app.test/x', { method: 'POST' }], ['https://x.supabase.co/rest/v1/productos', {}], ['https://x.supabase.co/auth/v1/user', {}], ['https://x.supabase.co/rest/v1/rpc/catalogo_tienda', {}], ['https://app.test/sw.js', {}]]) assert.equal(await sw.pedir(u, o), undefined, u)
})
await t('no toca la música (rangos de audio)', async () => { assert.equal(await montarSW().pedir('https://x.supabase.co/storage/v1/object/public/musica-negocios/aaa/fondo.mp3', { destination: 'audio' }), undefined) })
await t('foto buena: se guarda y la segunda vez sale del caché', async () => {
  const sw = montarSW(); sw.ctx.respuesta = () => new Response('img', { status: 200 })
  const r1 = await sw.pedir(foto, { destination: 'image' }); assert.equal(await r1.text(), 'img'); assert.ok(sw.almacenes.get('fotos-v1').has(foto))
  sw.ctx.respuesta = () => { throw new Error('sin red') }; const r2 = await sw.pedir(foto, { destination: 'image' }); assert.equal(await r2.text(), 'img')
})
await t('foto con error (404/500) NO se guarda: no queda rota para siempre', async () => {
  for (const st of [404, 500, 403]) { const sw = montarSW(); sw.ctx.respuesta = () => new Response('mal', { status: st }); await sw.pedir(foto, { destination: 'image' }); assert.ok(!(sw.almacenes.get('fotos-v1')?.has(foto)), 'estado ' + st) }
})
await t('las fotos se piden con CORS (así se puede saber si salieron bien)', async () => {
  const sw = montarSW(); let modo; sw.ctx.fetch = async (r) => { modo = r.mode; return new Response('i') }; await sw.pedir(foto, { destination: 'image' }); assert.equal(modo, 'cors')
})
await t('foto que se repara: si el servidor responde bien después, se guarda', async () => {
  const sw = montarSW(); sw.ctx.respuesta = () => new Response('', { status: 500 }); await sw.pedir(foto, { destination: 'image' }); assert.ok(!sw.almacenes.get('fotos-v1')?.has(foto))
  sw.ctx.respuesta = () => new Response('ok', { status: 200 }); await sw.pedir(foto, { destination: 'image' }); assert.ok(sw.almacenes.get('fotos-v1').has(foto))
})
await t('máximo 600 fotos guardadas (se borran las más viejas)', async () => {
  const sw = montarSW(); sw.ctx.respuesta = () => new Response('i')
  for (let i = 0; i < 605; i++) await sw.pedir(`${foto}?n=${i}`, { destination: 'image' })
  const m = sw.almacenes.get('fotos-v1'); assert.equal(m.size, 600); assert.ok(!m.has(`${foto}?n=0`)); assert.ok(m.has(`${foto}?n=604`))
})
await t('página: primero la red; sin internet abre la última guardada', async () => {
  const sw = montarSW(); sw.ctx.respuesta = () => new Response('<html>nueva</html>')
  assert.equal(await (await sw.pedir('https://app.test/t/don-pepe', { mode: 'navigate' })).text(), '<html>nueva</html>')
  sw.ctx.respuesta = () => { throw new Error('sin red') }; assert.equal(await (await sw.pedir('https://app.test/t/otra', { mode: 'navigate' })).text(), '<html>nueva</html>')
})
await t('página sin internet y sin nada guardado: mensaje claro (no pantalla en blanco)', async () => {
  const sw = montarSW(); sw.ctx.respuesta = () => { throw new Error('sin red') }; const r = await sw.pedir('https://app.test/', { mode: 'navigate' }); assert.equal(r.status, 503); assert.match(await r.text(), /Sin internet/)
})
await t('una página con error del servidor no reemplaza la guardada', async () => {
  const sw = montarSW(); sw.ctx.respuesta = () => new Response('buena'); await sw.pedir('https://app.test/', { mode: 'navigate' })
  sw.ctx.respuesta = () => new Response('error', { status: 500 }); await sw.pedir('https://app.test/', { mode: 'navigate' }); assert.equal(await (await sw.almacenes.get('app-v1').get('/')).text(), 'buena')
})
await t('/assets con huella: se guarda y no se vuelve a pedir', async () => {
  const sw = montarSW(); sw.ctx.respuesta = () => new Response('js'); const u = 'https://app.test/assets/index-abc123.js'
  await sw.pedir(u); const n = sw.pedidos.length; assert.equal(await (await sw.pedir(u)).text(), 'js'); assert.equal(sw.pedidos.length, n)
})
await t('al activarse borra los cachés de versiones viejas', async () => {
  const sw = montarSW(); await sw.ctx.caches.open('fotos-v0'); await sw.ctx.caches.open('app-v1'); let fin; sw.oyentes.activate({ waitUntil: (p) => { fin = p } }); await fin
  assert.ok(!sw.almacenes.has('fotos-v0')); assert.ok(sw.almacenes.has('app-v1'))
})

console.log('--- guía de instalación ---')
const UA = { android: 'Mozilla/5.0 (Linux; Android 13) Chrome/120 Mobile Safari/537.36', iosSafari: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605 Version/17.0 Mobile/15E148 Safari/604.1', iosChrome: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605 CriOS/120 Mobile/15E148 Safari/604.1' }
await t('Android con aviso del navegador: botón directo', () => assert.equal(P.guiaInstalacion({ instalada: false, tienePrompt: true, ua: UA.android }).tipo, 'boton'))
await t('iPhone Safari: guía de Compartir', () => assert.equal(P.guiaInstalacion({ instalada: false, tienePrompt: false, ua: UA.iosSafari, maxTouch: 5 }).tipo, 'ios'))
await t('iPhone con Chrome: avisa que debe usar Safari', () => assert.equal(P.guiaInstalacion({ instalada: false, tienePrompt: false, ua: UA.iosChrome, maxTouch: 5 }).tipo, 'ios-otro-navegador'))
await t('iPad moderno (se hace pasar por Mac) se detecta', () => assert.ok(P.esIOS('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 5)) && assert.ok(!P.esIOS('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 0)))
await t('ya instalada: no se muestra nada', () => assert.equal(P.guiaInstalacion({ instalada: true, tienePrompt: true, ua: UA.android }).tipo, 'ninguna'))
await t('sin aviso en Android: explica el menú del navegador', () => assert.equal(P.guiaInstalacion({ instalada: false, tienePrompt: false, ua: UA.android }).tipo, 'menu'))
await t('direcciones del manifest e ícono Apple llevan el slug codificado', () => { assert.equal(P.urlManifest('don-pepe', true), '/api/manifest?slug=don-pepe&panel=1'); assert.equal(P.urlIconoApple('a b'), '/api/icono?slug=a%20b&size=180') })

console.log(`\n${ok} pruebas pasaron`)
