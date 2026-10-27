// Pruebas de la tarjeta al compartir enlaces (/api/compartir, /api/tarjeta): sin red.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import sharp from 'sharp'
import { datosTarjeta, armarCompartir, origenDe, esc } from '../api/_compartir.js'
import { dibujarTarjeta } from '../api/_icono.js'
let ok = 0
const t = async (n, f) => { try { await f(); ok++; console.log('✓', n) } catch (e) { console.log('✗', n, '→', e.message); process.exitCode = 1 } }
const BASE = 'https://plataforma-negocios-seven.vercel.app'
const LOGO = '11111111-1111-1111-1111-111111111111/marca/logo.png'

await t('tienda con logo: nombre, eslogan, enlace propio y tarjeta propia', async () => {
  const d = datosTarjeta({ nombre: 'Repuestos El Rayo', eslogan: 'Todo para tu moto', icono: LOGO }, 'el-rayo', BASE)
  assert.equal(d.titulo, 'Repuestos El Rayo'); assert.equal(d.descripcion, 'Todo para tu moto')
  assert.equal(d.url, `${BASE}/t/el-rayo`); assert.equal(d.imagen, `${BASE}/api/tarjeta?slug=el-rayo`); assert.equal(d.propia, true)
})
await t('tienda sin logo: sale la tarjeta de Matriz pero con SU nombre', async () => {
  const d = datosTarjeta({ nombre: 'Tienda Sin Logo' }, 'sin-logo', BASE)
  assert.equal(d.titulo, 'Tienda Sin Logo'); assert.equal(d.imagen, `${BASE}/compartir-matriz.jpg`); assert.match(d.descripcion, /Tienda Sin Logo/)
})
await t('tienda que no existe o slug raro: tarjeta de Matriz', async () => {
  for (const [n, s] of [[null, 'x'], [{ nombre: 'A' }, 'A B'], [undefined, '']]) {
    const d = datosTarjeta(n, s, BASE); assert.match(d.titulo, /^Matriz/); assert.equal(d.imagen, `${BASE}/compartir-matriz.jpg`); assert.equal(d.url, `${BASE}/`)
  }
})
await t('la plataforma (sin slug) muestra Matriz y su eslogan', async () => {
  const h = armarCompartir(datosTarjeta(null, '', BASE))
  assert.match(h, /og:title" content="Matriz · El origen de lo bueno"/); assert.match(h, /compartir-matriz\.jpg/)
})
await t('el HTML trae todas las etiquetas que piden WhatsApp/Facebook/Twitter', async () => {
  const h = armarCompartir(datosTarjeta({ nombre: 'Mi Tienda', logo: LOGO }, 'mi-tienda', BASE))
  for (const k of ['og:title', 'og:description', 'og:image', 'og:image:width" content="1200', 'og:image:height" content="630', 'og:url', 'twitter:card" content="summary_large_image', 'twitter:image']) assert.ok(h.includes(k), k)
})
await t('un nombre con comillas o etiquetas no rompe el HTML', async () => {
  const h = armarCompartir(datosTarjeta({ nombre: '"><script>alert(1)</script>', eslogan: "a' b & c" }, 'x', BASE))
  assert.ok(!h.includes('<script>')); assert.ok(h.includes('&lt;script&gt;')); assert.equal(esc('<&>"\''), '&lt;&amp;&gt;&quot;&#39;')
})
await t('nombre larguísimo se acorta', async () => assert.ok(datosTarjeta({ nombre: 'N'.repeat(300) }, 'x', BASE).titulo.length <= 60))
await t('origenDe: usa el dominio que manda Vercel y rechaza valores raros', async () => {
  assert.equal(origenDe({ 'x-forwarded-host': 'tienda.com', 'x-forwarded-proto': 'https' }), 'https://tienda.com')
  assert.equal(origenDe({ host: 'localhost:3000', 'x-forwarded-proto': 'http' }), 'http://localhost:3000')
  assert.equal(origenDe({ host: 'a.com"><x' }), ''); assert.equal(origenDe({}), '')
})
await t('vercel.json: solo los programas de vista previa van a /api/compartir; las personas no', async () => {
  const v = JSON.parse(fs.readFileSync(new URL('../vercel.json', import.meta.url)))
  const reglas = v.rewrites.filter((r) => r.has)
  assert.ok(reglas.length >= 3); assert.ok(v.rewrites.indexOf(reglas[0]) < v.rewrites.findIndex((r) => !r.has))
  const re = new RegExp(`^${reglas[0].has[0].value}$`)
  for (const ua of ['WhatsApp/2.23.20.0 A', 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)', 'TelegramBot (like TwitterBot)', 'Mozilla/5.0 (compatible; Discordbot/2.0; +https://discordapp.com)', 'Twitterbot/1.0', 'Mozilla/5.0 (Macintosh) Applebot/0.1']) assert.ok(re.test(ua), ua)
  for (const ua of ['Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36', 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) AppleWebKit/605.1.15 Safari/604.1', 'Mozilla/5.0 (compatible; Googlebot/2.1)']) assert.ok(!re.test(ua), ua)
  assert.ok(v.rewrites.some((r) => !r.has && r.destination === '/index.html'))
})
await t('la tarjeta de Matriz existe y mide 1200×630', async () => {
  const m = await sharp(new URL('../public/compartir-matriz.jpg', import.meta.url).pathname).metadata()
  assert.equal(m.width, 1200); assert.equal(m.height, 630)
})
await t('dibujarTarjeta: logo cuadrado, ancho y con transparencia → JPG 1200×630', async () => {
  for (const [w, h] of [[512, 512], [900, 200], [300, 900]]) {
    const logo = await sharp({ create: { width: w, height: h, channels: 4, background: { r: 200, g: 30, b: 30, alpha: 0.5 } } }).png().toBuffer()
    const out = await dibujarTarjeta({ logo }); const m = await sharp(out).metadata()
    assert.equal(m.format, 'jpeg'); assert.equal(m.width, 1200); assert.equal(m.height, 630); assert.ok(out.length < 300_000, 'pesa ' + out.length)
  }
})
console.log(`\n${ok} pruebas correctas`)
