// Texto y comparaciones del resumen de la semana. Archivo .js aparte (Fast Refresh).
const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']
export const nombreDia = (dow) => DIAS[dow] ?? ''
export const pesos = (n) => '$' + Math.round(Number(n) || 0).toLocaleString('es-CO')

/** Compara dos números: { texto, tono } con tono 'sube' | 'baja' | 'igual' | 'nuevo'. */
export function comparar(actual, anterior) {
  const a = Number(actual) || 0, b = Number(anterior) || 0
  if (b === 0) return a === 0 ? { texto: 'igual que antes', tono: 'igual' } : { texto: 'antes no había', tono: 'nuevo' }
  const p = Math.round(((a - b) / b) * 100)
  if (p === 0) return { texto: 'igual que antes', tono: 'igual' }
  return { texto: `${p > 0 ? '+' : ''}${p} % frente a antes`, tono: p > 0 ? 'sube' : 'baja' }
}

export const conversion = (r) => (Number(r?.visitas?.actual) > 0 ? Math.round((Number(r.pedidos.actual) / Number(r.visitas.actual)) * 100) : null)
export const ticketPromedio = (r) => (Number(r?.pedidos?.actual) > 0 ? Number(r.ventas.actual) / Number(r.pedidos.actual) : 0)

/** Mensaje listo para WhatsApp. */
export function textoResumen(r, nombreTienda = 'mi tienda') {
  if (!r) return ''
  const l = [`📊 *Resumen de la semana · ${nombreTienda}*`, `(últimos ${r.dias} días)`, '']
  l.push(`👀 Visitas al catálogo: ${r.visitas.actual} (${comparar(r.visitas.actual, r.visitas.anterior).texto})`)
  l.push(`🛒 Pedidos: ${r.pedidos.actual} (${comparar(r.pedidos.actual, r.pedidos.anterior).texto})`)
  l.push(`💰 Ventas en línea: ${pesos(r.ventas.actual)} (${comparar(r.ventas.actual, r.ventas.anterior).texto})`)
  if (r.pedidos.actual > 0) l.push(`🧾 Pedido promedio: ${pesos(ticketPromedio(r))}`)
  l.push(`🛵 Domicilios: ${r.domicilios} · 🏪 Recoger: ${r.recoger}`)
  const c = conversion(r); if (c !== null) l.push(`🎯 De cada 100 visitas, ${c} hicieron pedido`)
  if (r.mejor_dia) l.push(`📅 Mejor día: ${nombreDia(r.mejor_dia.dow)} (${r.mejor_dia.pedidos} ${r.mejor_dia.pedidos === 1 ? 'pedido' : 'pedidos'})`)
  if (r.productos?.length) { l.push('', '🏆 Lo más pedido:'); r.productos.forEach((p, i) => l.push(`${i + 1}. ${p.nombre} (${Number(p.cantidad)})`)) }
  l.push('', `👥 Clientes nuevos: ${r.clientes_nuevos}`)
  l.push(`⭐ Opiniones nuevas: ${r.opiniones.nuevas}${r.opiniones.nuevas > 0 ? ` (promedio ${r.opiniones.promedio})` : ''}${r.opiniones.pendientes > 0 ? ` · ${r.opiniones.pendientes} por revisar` : ''}`)
  if (r.cancelados > 0) l.push(`❌ Cancelados: ${r.cancelados}`)
  return l.join('\n')
}
