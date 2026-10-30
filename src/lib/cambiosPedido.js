// Detecta cuándo cambió el estado de un pedido entre dos consultas de «Mis pedidos» y arma el texto del aviso dentro de la app.
export function textoEstado(p) {
  const n = `N.º ${p.numero}`, recoger = p.entrega === 'recoger'
  switch (p.seguimiento) {
    case 'recibido': return `${p.tienda} recibió tu pedido ${n}.`
    case 'preparando': return `${p.tienda} está preparando tu pedido ${n}.`
    case 'en_camino': return recoger ? `Tu pedido ${n} está listo para recoger en ${p.tienda}.` : `Tu pedido ${n} de ${p.tienda} va en camino.`
    case 'entregado': return `Tu pedido ${n} de ${p.tienda} fue entregado. ¡Gracias por tu compra!`
    default: return ''
  }
}

/** anterior: { [id]: seguimiento } de la consulta anterior (null la primera vez: no avisa). actual: lista de pedidos. */
export function detectarCambios(anterior, actual) {
  const mapa = Object.fromEntries((actual || []).map((p) => [p.id, p.seguimiento]))
  if (!anterior) return { mapa, cambios: [] }
  const cambios = (actual || []).filter((p) => p.estado !== 'cancelado' && anterior[p.id] && anterior[p.id] !== p.seguimiento).map((p) => ({ id: p.id, texto: textoEstado(p) })).filter((c) => c.texto)
  return { mapa, cambios }
}
