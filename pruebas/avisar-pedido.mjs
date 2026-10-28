// Pruebas de /api/avisar-pedido (sin red: Supabase y push simulados)
import assert from 'node:assert/strict'
import { avisarPedido, cargaAviso } from '../api/_pedidoPush.js'
let ok = 0
const t = async (n, f) => { try { await f(); ok++; console.log('✓', n) } catch (e) { console.log('✗', n, '→', e.message); process.exitCode = 1 } }
const base = 'https://x.supabase.co'
const vapid = { pub: 'pub', priv: 'priv' }
const INFO = { negocio_id: 'n1', tienda: 'Moda Luna', numero: 7, total: 85000, entrega: 'domicilio', cliente: 'Ana', suscripciones: [{ endpoint: 'https://a', p256dh: 'p', auth: 'a' }, { endpoint: 'https://b', p256dh: 'p', auth: 'a' }] }
function sim(info = INFO, rpcOk = true) {
  const llamadas = []
  const f = async (url, init) => { const n = url.split('/').pop(); llamadas.push({ n, cuerpo: JSON.parse(init.body), auth: init.headers.Authorization }); return { ok: rpcOk, status: rpcOk ? 200 : 500, json: async () => (n === 'reclamar_aviso_pedido' ? info : 1) } }
  return { f, llamadas }
}
const b = { cuerpo: { slug: 'moda-luna', tipo: 'ropa', numero: 7, telefono: '300 123 4567' }, base, servicio: 'srv', vapid }

await t('pedido real: avisa a cada aparato con el texto correcto', async () => {
  const s = sim(); const enviados = []
  const r = await avisarPedido(b, s.f, async (sub, c) => { enviados.push({ sub, c: JSON.parse(c) }) })
  assert.equal(r.http, 200); assert.equal(r.cuerpo.avisados, 2); assert.equal(enviados.length, 2)
  assert.equal(enviados[0].c.titulo, '🛒 Pedido nuevo N.º 7'); assert.match(enviados[0].c.cuerpo, /\$85\.000 · a domicilio de Ana/); assert.equal(enviados[0].c.url, '/t/moda-luna/panel')
  assert.equal(s.llamadas[0].cuerpo.p_telefono, '3001234567'); assert.equal(s.llamadas[0].auth, 'Bearer srv')
})
await t('pedido inexistente / ya avisado / de práctica (la base responde null): no avisa a nadie', async () => {
  let n = 0; const r = await avisarPedido(b, sim(null).f, async () => { n++ }); assert.equal(r.http, 200); assert.equal(r.cuerpo.avisados, 0); assert.equal(n, 0)
})
await t('aparato que ya no existe (410): se retira y los demás igual reciben', async () => {
  const s = sim()
  const r = await avisarPedido(b, s.f, async (sub) => { if (sub.endpoint === 'https://a') { const e = new Error('gone'); e.statusCode = 410; throw e } })
  assert.equal(r.cuerpo.avisados, 1)
  const ret = s.llamadas.find((x) => x.n === 'retirar_suscripciones_personal'); assert.deepEqual(ret.cuerpo, { p_negocio_id: 'n1', p_endpoints: ['https://a'] })
})
await t('falla temporal del push (500): no retira la suscripción', async () => {
  const s = sim(); await avisarPedido(b, s.f, async () => { const e = new Error('x'); e.statusCode = 500; throw e })
  assert.equal(s.llamadas.some((x) => x.n === 'retirar_suscripciones_personal'), false)
})
await t('datos inválidos → 400 sin tocar la base', async () => {
  for (const c of [{ ...b.cuerpo, slug: 'A B' }, { ...b.cuerpo, numero: 0 }, { ...b.cuerpo, numero: 'x' }, { ...b.cuerpo, telefono: '123' }, {}]) {
    const s = sim(); const r = await avisarPedido({ ...b, cuerpo: c }, s.f, async () => {}); assert.equal(r.http, 400); assert.equal(s.llamadas.length, 0)
  }
})
await t('sin llave de servicio o sin VAPID → 503', async () => {
  assert.equal((await avisarPedido({ ...b, servicio: '' }, sim().f, async () => {})).http, 503)
  assert.equal((await avisarPedido({ ...b, vapid: {} }, sim().f, async () => {})).http, 503)
})
await t('la base falla → 502', async () => assert.equal((await avisarPedido(b, sim(INFO, false).f, async () => {})).http, 502))
await t('pedido para recoger: el texto lo dice', () => assert.match(cargaAviso({ ...INFO, slug: 's', entrega: 'recoger' }).cuerpo, /recoge en tienda/))
console.log(`\n${ok} pruebas ok`)
