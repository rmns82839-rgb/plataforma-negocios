// Aviso al cliente cuando la tienda cambia el estado de su pedido. Lógica pura: la red y el envío push se inyectan, así se prueba sola.
// Nadie de afuera puede disparar avisos a voluntad: la tienda crea un aviso en la base (solo su equipo puede) y este servidor lo
// «reclama» con su número: la base lo entrega UNA sola vez y solo dentro de los 10 minutos siguientes.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Texto del aviso según el estado. */
export function cargaEstado(r) {
  const n = `N.º ${r.numero}`
  const recoger = r.entrega === 'recoger'
  const base = { url: `/t/${r.slug}/mis-pedidos`, tag: `estado-${r.slug}-${r.numero}` }
  switch (r.seguimiento) {
    case 'recibido': return { ...base, titulo: `✅ Recibimos tu pedido ${n}`, cuerpo: `${r.tienda} ya tiene tu pedido.` }
    case 'preparando': return { ...base, titulo: `👩‍🍳 Estamos preparando tu pedido ${n}`, cuerpo: `${r.tienda} lo está alistando.` }
    case 'en_camino': return recoger
      ? { ...base, titulo: `🛍️ Tu pedido ${n} está listo`, cuerpo: `Ya puedes recogerlo en ${r.tienda}.` }
      : { ...base, titulo: `🛵 Tu pedido ${n} va en camino`, cuerpo: `${r.tienda} ya lo despachó.` }
    case 'entregado': return { ...base, titulo: `🎉 Pedido ${n} entregado`, cuerpo: `Gracias por comprar en ${r.tienda}.` }
    default: return null
  }
}

export async function avisarEstado({ cuerpo, base, servicio, vapid }, f = fetch, enviar) {
  const fin = (http, c) => ({ http, cuerpo: c })
  if (!base || !servicio) return fin(503, { error: 'Falta SUPABASE_SERVICE_ROLE_KEY en Vercel' })
  if (!vapid?.pub || !vapid?.priv) return fin(503, { error: 'Faltan las llaves VAPID en Vercel' })
  const aviso = String(cuerpo?.aviso || '')
  if (!UUID.test(aviso)) return fin(400, { error: 'Aviso no válido' })

  const rpc = (nombre, args) => f(`${base}/rest/v1/rpc/${nombre}`, {
    method: 'POST', headers: { apikey: servicio, Authorization: `Bearer ${servicio}`, 'Content-Type': 'application/json' }, body: JSON.stringify(args),
  })
  const r = await rpc('reclamar_aviso_estado', { p_id: aviso }).catch(() => null)
  if (!r || !r.ok) return fin(502, { error: 'No se pudo consultar el aviso' })
  const info = await r.json().catch(() => null)
  if (!info) return fin(200, { ok: true, avisados: 0 })          // no existe, ya se envió o venció

  const carga = cargaEstado(info)
  if (!carga) return fin(200, { ok: true, avisados: 0 })
  const texto = JSON.stringify(carga)
  const muertas = []
  let avisados = 0
  await Promise.all((info.suscripciones || []).map(async (s) => {
    try {
      await enviar({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, texto, { TTL: 60 * 60 * 3, urgency: 'high' })
      avisados++
    } catch (e) {
      if (e?.statusCode === 404 || e?.statusCode === 410) muertas.push(s.endpoint)     // el aparato ya no recibe: se retira
    }
  }))
  if (muertas.length) await rpc('retirar_suscripciones_cliente', { p_user_id: info.user_id, p_endpoints: muertas }).catch(() => {})
  return fin(200, { ok: true, avisados })
}
