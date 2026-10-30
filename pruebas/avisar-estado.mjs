// Pruebas de /api/avisar-estado (sin red: Supabase y push simulados)   node pruebas/avisar-estado.mjs
import assert from 'node:assert/strict'
import { avisarEstado, cargaEstado } from '../api/_estadoPush.js'
let ok = 0
const t = async (n, f) => { try { await f(); ok++; console.log('✓', n) } catch (e) { console.log('✗', n, '→', e.message); process.exitCode = 1 } }
const base = 'https://x.supabase.co', vapid = { pub: 'pub', priv: 'priv' }
const AV = '3f1c2a52-8f5e-4d6a-9d3a-0b1c2d3e4f50'
const INFO = { user_id: 'u1', slug: 'tienda-a', tienda: 'Tienda A', numero: 7, entrega: 'domicilio', seguimiento: 'en_camino', suscripciones: [{ endpoint: 'https://a', p256dh: 'p', auth: 'a' }, { endpoint: 'https://b', p256dh: 'p', auth: 'a' }] }
function sim(info = INFO, rpcOk = true) {
  const llamadas = []
  const f = async (url, init) => { const n = url.split('/').pop(); llamadas.push({ n, cuerpo: JSON.parse(init.body), auth: init.headers.Authorization }); return { ok: rpcOk, status: rpcOk ? 200 : 500, json: async () => (n === 'reclamar_aviso_estado' ? info : 1) } }
  return { f, llamadas }
}
const b = { cuerpo: { aviso: AV }, base, servicio: 'srv', vapid }

await t('aviso real: llega a cada aparato con el texto del estado', async () => {
  const s = sim(); const enviados = []
  const r = await avisarEstado(b, s.f, async (sub, c) => { enviados.push({ sub, c: JSON.parse(c) }) })
  assert.equal(r.http, 200); assert.equal(r.cuerpo.avisados, 2); assert.equal(enviados.length, 2)
  assert.equal(enviados[0].c.titulo, '🛵 Tu pedido N.º 7 va en camino'); assert.equal(enviados[0].c.url, '/t/tienda-a/mis-pedidos')
  assert.deepEqual(s.llamadas[0].cuerpo, { p_id: AV }); assert.equal(s.llamadas[0].auth, 'Bearer srv')
})
await t('los 4 estados tienen texto, y recoger cambia «en camino» por «listo»', () => {
  for (const sg of ['recibido', 'preparando', 'en_camino', 'entregado']) { const c = cargaEstado({ ...INFO, seguimiento: sg }); assert.ok(c.titulo.includes('7') && c.cuerpo && c.tag === 'estado-tienda-a-7', sg) }
  assert.match(cargaEstado({ ...INFO, entrega: 'recoger' }).titulo, /listo/); assert.match(cargaEstado({ ...INFO, entrega: 'recoger' }).cuerpo, /recogerlo en Tienda A/)
  assert.equal(cargaEstado({ ...INFO, seguimiento: 'raro' }), null)
})
await t('aviso inexistente, ya enviado o vencido (la base responde null): no avisa a nadie', async () => {
  let n = 0; const r = await avisarEstado(b, sim(null).f, async () => { n++ }); assert.equal(r.http, 200); assert.equal(r.cuerpo.avisados, 0); assert.equal(n, 0)
})
await t('aparato que ya no existe (410): se retira y el otro igual recibe', async () => {
  const s = sim()
  const r = await avisarEstado(b, s.f, async (sub) => { if (sub.endpoint === 'https://a') { const e = new Error('gone'); e.statusCode = 410; throw e } })
  assert.equal(r.cuerpo.avisados, 1)
  assert.deepEqual(s.llamadas.find((x) => x.n === 'retirar_suscripciones_cliente').cuerpo, { p_user_id: 'u1', p_endpoints: ['https://a'] })
})
await t('falla temporal del push (500): no retira la suscripción', async () => {
  const s = sim(); await avisarEstado(b, s.f, async () => { const e = new Error('x'); e.statusCode = 500; throw e })
  assert.equal(s.llamadas.some((x) => x.n === 'retirar_suscripciones_cliente'), false)
})
await t('número de aviso inválido → 400 sin tocar la base', async () => {
  for (const c of [{}, { aviso: '1' }, { aviso: 'no-es-uuid' }, { aviso: `${AV}; drop table x` }, { aviso: 5 }]) { const s = sim(); const r = await avisarEstado({ ...b, cuerpo: c }, s.f, async () => {}); assert.equal(r.http, 400); assert.equal(s.llamadas.length, 0) }
})
await t('sin llave de servicio o sin VAPID → 503', async () => {
  assert.equal((await avisarEstado({ ...b, servicio: '' }, sim().f, async () => {})).http, 503)
  assert.equal((await avisarEstado({ ...b, vapid: {} }, sim().f, async () => {})).http, 503)
})
await t('la base falla → 502', async () => assert.equal((await avisarEstado(b, sim(INFO, false).f, async () => {})).http, 502))
console.log(`\n${ok} pruebas ok`)
