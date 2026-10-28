// Aviso de pedido nuevo al celular del equipo de la tienda. Lógica pura: la red y el envío push se inyectan, así se prueba sola.
// Nadie de afuera puede disparar avisos a voluntad: la base solo entrega las suscripciones si el pedido EXISTE (tienda + número +
// celular de quien pidió), no es de práctica y todavía no se avisó. Cada pedido avisa una sola vez.
const SLUG = /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/
const pesos = (n) => `$${Math.round(Number(n) || 0).toLocaleString('es-CO')}`

/** Texto del aviso. */
export function cargaAviso(r) {
  const entrega = r.entrega === 'recoger' ? 'recoge en tienda' : 'a domicilio'
  const quien = r.cliente ? ` de ${r.cliente}` : ''
  return {
    titulo: `🛒 Pedido nuevo N.º ${r.numero}`,
    cuerpo: `${pesos(r.total)} · ${entrega}${quien}`,
    url: '/t/' + r.slug + '/panel',
    tag: `pedido-${r.slug}-${r.numero}`,
  }
}

export async function avisarPedido({ cuerpo, base, servicio, vapid }, f = fetch, enviar) {
  const fin = (http, c) => ({ http, cuerpo: c })
  if (!base || !servicio) return fin(503, { error: 'Falta SUPABASE_SERVICE_ROLE_KEY en Vercel' })
  if (!vapid?.pub || !vapid?.priv) return fin(503, { error: 'Faltan las llaves VAPID en Vercel' })
  const slug = String(cuerpo?.slug || '').toLowerCase()
  const tipo = cuerpo?.tipo === 'ropa' ? 'ropa' : 'tienda'
  const numero = Number(cuerpo?.numero)
  const telefono = String(cuerpo?.telefono || '').replace(/\D/g, '')
  if (!SLUG.test(slug) || !Number.isInteger(numero) || numero < 1 || telefono.length < 10) return fin(400, { error: 'Datos del pedido no válidos' })

  const rpc = (nombre, args) => f(`${base}/rest/v1/rpc/${nombre}`, {
    method: 'POST', headers: { apikey: servicio, Authorization: `Bearer ${servicio}`, 'Content-Type': 'application/json' }, body: JSON.stringify(args),
  })
  const r = await rpc('reclamar_aviso_pedido', { p_slug: slug, p_tipo: tipo, p_numero: numero, p_telefono: telefono }).catch(() => null)
  if (!r || !r.ok) return fin(502, { error: 'No se pudo consultar el pedido' })
  const info = await r.json().catch(() => null)
  if (!info) return fin(200, { ok: true, avisados: 0 })          // no existe, es de práctica o ya se avisó

  const carga = JSON.stringify(cargaAviso({ ...info, slug }))
  const muertas = []
  let avisados = 0
  await Promise.all((info.suscripciones || []).map(async (s) => {
    try {
      await enviar({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, carga, { TTL: 60 * 60 * 6, urgency: 'high' })
      avisados++
    } catch (e) {
      if (e?.statusCode === 404 || e?.statusCode === 410) muertas.push(s.endpoint)     // el aparato ya no recibe: se retira
    }
  }))
  if (muertas.length) await rpc('retirar_suscripciones_personal', { p_negocio_id: info.negocio_id, p_endpoints: muertas }).catch(() => {})
  return fin(200, { ok: true, avisados })
}
