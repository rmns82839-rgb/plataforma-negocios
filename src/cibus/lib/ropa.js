// Ropa: géneros y promociones de prendas (archivo .js aparte por el Fast Refresh de Vite).
import { promoDescuento, vigente } from './promos'
import { hoyTexto } from './periodo'

export const GENEROS = [
  { id: 'mujer',  texto: 'Mujer' },
  { id: 'hombre', texto: 'Hombre' },
  { id: 'ninos',  texto: 'Niños' },
  { id: 'unisex', texto: 'Unisex' },
]
export const textoGenero = (id) => GENEROS.find(g => g.id === id)?.texto ?? 'Unisex'

/** ¿La promoción (de ropa) aplica a esta prenda? Por prenda, por categoría de ropa o por género. */
export const aplicaAPrenda = (p, prenda) =>
  p.prenda_id === prenda.id
  || (Boolean(p.categoria_ropa) && p.categoria_ropa === prenda.categoria)
  || (Boolean(p.genero) && p.genero === (prenda.genero ?? 'unisex'))

/** La promoción que más descuenta para esta prenda (mismos cálculos que el servidor). */
export function mejorPromoPrenda(promos, prenda, cant = 1, hoy = hoyTexto()) {
  let mejor = null
  for (const p of promos) {
    if (!vigente({ activa: true, desde: '0000-01-01', ...p }, hoy) || !aplicaAPrenda(p, prenda)) continue
    const d = promoDescuento(p, Number(prenda.precio), cant)
    if (d > 0 && (!mejor || d > mejor.descuento)) mejor = { id: p.id, nombre: p.nombre, tipo: p.tipo, valor: p.valor, lleva: p.lleva, paga: p.paga, descuento: d }
  }
  return mejor
}

/** Etiqueta corta para la tarjeta: "3x2", "−20 %", "Oferta". */
export const etiquetaPromo = (m) =>
  m.tipo === 'nxm' ? `${m.lleva}x${m.paga}` : m.tipo === 'porcentaje' ? `−${Number(m.valor)} %` : 'Oferta'

/** Precio de una unidad con la promoción (solo si la promo cambia el precio unitario). */
export const precioConPromo = (m, prenda) =>
  m && m.tipo !== 'nxm' ? Number(prenda.precio) - promoDescuento(m, Number(prenda.precio), 1) : null

/** Total de un pedido (líneas {prenda, cantidad}) con las promociones. */
export function totalesPedido(promos, lineas) {
  let bruto = 0, descuento = 0
  const detalle = lineas.map(l => {
    const b = Number(l.prenda.precio) * l.cantidad
    const m = mejorPromoPrenda(promos, l.prenda, l.cantidad)
    bruto += b; descuento += m?.descuento ?? 0
    return { ...l, bruto: b, descuento: m?.descuento ?? 0, promo: m?.nombre ?? null }
  })
  return { bruto, descuento, total: bruto - descuento, detalle }
}
