// Pruebas de la ruta del servidor /api/domicilio (sin red: el mapa y la base son simulados)
import assert from 'node:assert/strict'
import { manejar, distanciaLineaKm, MENSAJES } from '../api/_domicilio.js'
import { geocodificar, rutaKm } from '../api/_ors.js'
let ok = 0
const t = async (n, f) => { try { await f(); ok++; console.log('✓', n) } catch (e) { console.log('✗', n, '→', e.message); process.exitCode = 1 } }

const TIENDA = { lat: 10.9878, lng: -74.7889 }
const NEG = '11111111-1111-1111-1111-111111111111'
function simulado(o = {}) {
  const llamadas = []
  const ctx = { ok: true, negocio_id: NEG, lat: TIENDA.lat, lng: TIENDA.lng, radio_max_km: 10, tarifa_respaldo: 6000, ciudad: 'Barranquilla', ...(o.ctx || {}) }
  const d = {
    llamadas,
    cupo: o.cupo ?? true,
    async rpc(n, a) {
      llamadas.push([n, a])
      if (o.rpcFalla) throw new Error('base caída')
      if (n === 'domicilio_contexto') return o.sinCtx ? { ok: false, motivo: 'sin_modulo' } : ctx
      if (n === 'domicilio_consumir') return d.cupo
      if (n === 'domicilio_guardar') return 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
    },
    async buscar(texto, foco) { llamadas.push(['buscar', texto, foco]); if (o.mapaFalla) throw new Error('ORS 500'); return o.candidatos ?? [{ etiqueta: 'Calle 84 # 50-20, Barranquilla', lat: 10.99, lng: -74.80, confianza: 0.9 }] },
    async ruta(a, b) { llamadas.push(['ruta']); if (o.rutaFalla) throw new Error('ORS 500'); return o.km ?? 5.234 },
  }
  return d
}
const nombres = d => d.llamadas.map(x => x[0])

await t('slug inválido → 400', async () => assert.equal((await manejar({ slug: 'A B', accion: 'buscar' }, simulado())).http, 400))
await t('acción desconocida → 400', async () => assert.equal((await manejar({ slug: 'demo', accion: 'x' }, simulado())).http, 400))
await t('buscar: texto muy corto', async () => assert.equal((await manejar({ slug: 'demo', accion: 'buscar', texto: 'cl' }, simulado())).cuerpo.estado, 'texto_corto'))
await t('buscar: devuelve candidatos y agrega la ciudad de la tienda', async () => {
  const d = simulado(); const r = (await manejar({ slug: 'demo', accion: 'buscar', texto: 'calle 84 50 20' }, d)).cuerpo
  assert.equal(r.estado, 'ok'); assert.equal(r.candidatos.length, 1); assert.equal(r.candidatos[0].dudosa, false)
  assert.match(d.llamadas.find(x => x[0] === 'buscar')[1], /Barranquilla$/)
})
await t('buscar: devuelve el centro (la tienda) para abrir el mapa', async () => { const r = (await manejar({ slug: 'demo', accion: 'buscar', texto: 'calle 84 50 20' }, simulado())).cuerpo; assert.deepEqual(r.centro, TIENDA) })
await t('buscar: sin resultados igual devuelve el centro para marcar el pin', async () => { const r = (await manejar({ slug: 'demo', accion: 'buscar', texto: 'dirección inventada' }, simulado({ candidatos: [] }))).cuerpo; assert.equal(r.estado, 'no_encontrada'); assert.deepEqual(r.centro, TIENDA) })
await t('buscar: confianza baja → dudosa', async () => assert.equal((await manejar({ slug: 'demo', accion: 'buscar', texto: 'por el parque grande' }, simulado({ candidatos: [{ etiqueta: 'X', lat: 1, lng: 1, confianza: 0.3 }] }))).cuerpo.candidatos[0].dudosa, true))
await t('buscar: sin resultados → no_encontrada (sin error técnico)', async () => { const r = (await manejar({ slug: 'demo', accion: 'buscar', texto: 'dirección inventada' }, simulado({ candidatos: [] }))).cuerpo; assert.equal(r.estado, 'no_encontrada'); assert.ok(!/error|500/i.test(r.mensaje)) })
await t('buscar: mapa caído → respaldo con mensaje claro', async () => { const r = (await manejar({ slug: 'demo', accion: 'buscar', texto: 'calle 84 50 20' }, simulado({ mapaFalla: true }))).cuerpo; assert.equal(r.estado, 'mapa_fallo'); assert.equal(r.respaldo, true); assert.equal(r.mensaje, MENSAJES.mapa_fallo) })
await t('buscar: sin cupo → no llama al mapa', async () => { const d = simulado(); d.cupo = false; const r = (await manejar({ slug: 'demo', accion: 'buscar', texto: 'calle 84 50 20' }, d)).cuerpo; assert.equal(r.estado, 'sin_cupo'); assert.ok(!nombres(d).includes('buscar')) })
await t('buscar: tienda sin el módulo → no disponible', async () => assert.equal((await manejar({ slug: 'demo', accion: 'buscar', texto: 'calle 84 50 20' }, simulado({ sinCtx: true }))).cuerpo.estado, 'no_disponible'))
await t('buscar: base caída → no explota, respaldo', async () => { const r = await manejar({ slug: 'demo', accion: 'buscar', texto: 'calle 84 50 20' }, simulado({ rpcFalla: true })); assert.equal(r.http, 200); assert.equal(r.cuerpo.respaldo, true) })

await t('calcular: ok guarda el km (2 decimales) y devuelve el calculo_id', async () => {
  const d = simulado({ km: 5.2349 }); const r = (await manejar({ slug: 'demo', accion: 'calcular', lat: 10.99, lng: -74.8, etiqueta: 'Calle 84' }, d)).cuerpo
  assert.equal(r.estado, 'ok'); assert.equal(r.km, 5.23); assert.match(r.calculo_id, /^[0-9a-f-]{36}$/)
  const g = d.llamadas.find(x => x[0] === 'domicilio_guardar')[1]; assert.equal(g.p_km, 5.23); assert.equal(g.p_motivo, 'ok')
})
await t('calcular: ignora lo que el navegador diga de km o negocio', async () => {
  const d = simulado(); await manejar({ slug: 'demo', accion: 'calcular', lat: 10.99, lng: -74.8, km: 0.1, negocio_id: 'x' }, d)
  assert.equal(d.llamadas.find(x => x[0] === 'domicilio_guardar')[1].p_negocio_id, NEG)
})
await t('calcular: fuera del radio por línea recta → avisa y NO gasta cupo ni mapa', async () => {
  const d = simulado(); const r = (await manejar({ slug: 'demo', accion: 'calcular', lat: 11.24, lng: -74.2 }, d)).cuerpo   // Santa Marta, ~70 km
  assert.equal(r.estado, 'fuera_de_zona'); assert.equal(r.maximo_km, 10); assert.match(r.mensaje, /WhatsApp/); assert.match(r.mensaje, /recoger/)
  assert.ok(!nombres(d).includes('domicilio_consumir') && !nombres(d).includes('ruta'))
})
await t('calcular: la ruta real supera el radio → fuera de zona', async () => assert.equal((await manejar({ slug: 'demo', accion: 'calcular', lat: 10.99, lng: -74.8 }, simulado({ km: 11.4 }))).cuerpo.estado, 'fuera_de_zona'))
await t('calcular: sin cupo → respaldo con tarifa fija (no bloquea)', async () => {
  const d = simulado(); d.cupo = false; const r = (await manejar({ slug: 'demo', accion: 'calcular', lat: 10.99, lng: -74.8 }, d)).cuerpo
  assert.equal(r.estado, 'sin_cupo'); assert.equal(r.respaldo, true); assert.equal(r.tarifa_fija, 6000); assert.ok(r.calculo_id); assert.ok(!nombres(d).includes('ruta'))
  assert.equal(d.llamadas.find(x => x[0] === 'domicilio_guardar')[1].p_km, null)
})
await t('calcular: ruta caída → respaldo', async () => { const r = (await manejar({ slug: 'demo', accion: 'calcular', lat: 10.99, lng: -74.8 }, simulado({ rutaFalla: true }))).cuerpo; assert.equal(r.estado, 'mapa_fallo'); assert.equal(r.respaldo, true); assert.ok(r.calculo_id) })
await t('calcular: coordenadas basura → respaldo', async () => assert.equal((await manejar({ slug: 'demo', accion: 'calcular', lat: 'abc', lng: null }, simulado())).cuerpo.respaldo, true))
await t('calcular: tienda sin ubicación → respaldo', async () => assert.equal((await manejar({ slug: 'demo', accion: 'calcular', lat: 10.99, lng: -74.8 }, simulado({ ctx: { lat: null, lng: null } }))).cuerpo.respaldo, true))
await t('calcular: tienda en modo fijo → no disponible', async () => assert.equal((await manejar({ slug: 'demo', accion: 'calcular', lat: 10.99, lng: -74.8 }, simulado({ sinCtx: true }))).cuerpo.estado, 'no_disponible'))
await t('calcular: sin radio máximo calcula (hasta 200 km en línea)', async () => assert.equal((await manejar({ slug: 'demo', accion: 'calcular', lat: 11.24, lng: -74.2 }, simulado({ ctx: { radio_max_km: null }, km: 90 }))).cuerpo.estado, 'ok'))
await t('calcular: ruta absurda (negativa) → respaldo', async () => assert.equal((await manejar({ slug: 'demo', accion: 'calcular', lat: 10.99, lng: -74.8 }, simulado({ km: -3 }))).cuerpo.respaldo, true))
await t('respaldo manual: queda registrado con el motivo', async () => {
  const d = simulado(); const r = (await manejar({ slug: 'demo', accion: 'respaldo', motivo: 'manual', etiqueta: 'Casa azul esquina' }, d)).cuerpo
  assert.equal(r.respaldo, true); assert.equal(r.tarifa_fija, 6000); assert.equal(d.llamadas.find(x => x[0] === 'domicilio_guardar')[1].p_motivo, 'manual')
})
await t('respaldo: un motivo inventado se vuelve "manual"', async () => { const d = simulado(); await manejar({ slug: 'demo', accion: 'respaldo', motivo: 'gratis' }, d); assert.equal(d.llamadas.find(x => x[0] === 'domicilio_guardar')[1].p_motivo, 'manual') })
await t('el texto se limpia (sin etiquetas ni saltos)', async () => { const d = simulado(); await manejar({ slug: 'demo', accion: 'respaldo', etiqueta: '<b>Casa</b>\n\n  azul' }, d); assert.equal(d.llamadas.find(x => x[0] === 'domicilio_guardar')[1].p_direccion, 'bCasa/b azul') })
await t('distancia en línea recta: Barranquilla–Santa Marta ≈ 85 km', () => { const k = distanciaLineaKm({ lat: 10.9685, lng: -74.7813 }, { lat: 11.2408, lng: -74.1990 }); assert.ok(k > 60 && k < 80, String(k)) })

// OpenRouteService: forma de las llamadas y de las respuestas (fetch simulado)
await t('ORS geocode: clave en el encabezado (nunca en la URL), país CO, foco en la tienda', async () => {
  let visto
  const f = async (url, o) => { visto = { url, o }; return { ok: true, json: async () => ({ features: [
    { geometry: { coordinates: [-74.8, 10.99] }, properties: { label: 'A, Barranquilla', confidence: 0.9 } },
    { geometry: { coordinates: [-74.8, 10.99] }, properties: { label: 'A, Barranquilla', confidence: 0.8 } },
    { geometry: { coordinates: ['x', 1] }, properties: { label: 'roto' } }] }) } }
  const r = await geocodificar('calle 1', TIENDA, 'CLAVE-SECRETA', f)
  assert.equal(r.length, 1); assert.ok(!visto.url.includes('CLAVE-SECRETA')); assert.equal(visto.o.headers.Authorization, 'CLAVE-SECRETA')
  assert.match(visto.url, /boundary\.country=CO/); assert.match(visto.url, /focus\.point\.lat=10\.9878/)
})
await t('ORS ruta: convierte metros a km y manda [lng, lat]', async () => {
  let body
  const f = async (url, o) => { body = JSON.parse(o.body); return { ok: true, json: async () => ({ routes: [{ summary: { distance: 5234.5 } }] }) } }
  assert.equal(await rutaKm(TIENDA, { lat: 10.99, lng: -74.8 }, 'K', f), 5.2345)
  assert.deepEqual(body.coordinates[0], [TIENDA.lng, TIENDA.lat])
})
await t('ORS: error HTTP → lanza (el servidor lo vuelve respaldo)', async () => { await assert.rejects(() => rutaKm(TIENDA, TIENDA, 'K', async () => ({ ok: false, status: 403 })), /403/) })
await t('ORS: respuesta sin distancia → lanza', async () => { await assert.rejects(() => rutaKm(TIENDA, TIENDA, 'K', async () => ({ ok: true, json: async () => ({ routes: [] }) })), /sin distancia/) })
await t('ORS: se corta por tiempo', async () => {
  const f = (url, o) => new Promise((_, rej) => o.signal.addEventListener('abort', () => rej(new Error('abortado'))))
  const ini = Date.now(); await assert.rejects(() => rutaKm(TIENDA, TIENDA, 'K', f), /abortado/); assert.ok(Date.now() - ini < 9500)
})
console.log(`\n${ok} pruebas correctas`)
