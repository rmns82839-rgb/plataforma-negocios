// Promociones automáticas (van en .js aparte por el Fast Refresh de Vite).
// Hacen exactamente la misma cuenta que promo_descuento() de la base de datos.
import { hoyTexto } from './periodo'

export const TIPOS_PROMO = [
  { id: 'porcentaje', texto: '% de descuento' },
  { id: 'nxm',        texto: 'Lleva N, paga M (3x2)' },
  { id: 'precio',     texto: 'Precio promocional' },
]

/** ¿Está activa y dentro de sus fechas? */
export const vigente = (p, hoy = hoyTexto()) =>
  Boolean(p.activa) && String(p.desde).slice(0, 10) <= hoy && (!p.hasta || String(p.hasta).slice(0, 10) >= hoy)

/** Pesos que descuenta la promoción sobre (precio × cantidad). Nunca llega al valor completo. */
export function promoDescuento(p, precio, cant) {
  const bruto = Math.round(precio * cant)
  let d = 0
  if (p.tipo === 'porcentaje') d = Math.round(precio * cant * Number(p.valor) / 100)
  else if (p.tipo === 'precio') d = precio > Number(p.valor) ? Math.round((precio - Number(p.valor)) * cant) : 0
  else if (p.tipo === 'nxm') d = Math.round(Math.floor(cant / p.lleva) * (p.lleva - p.paga) * precio)
  return Math.max(0, Math.min(d, bruto - 1))
}

/** La promoción que más descuenta para este producto (o su categoría). */
export function mejorPromo(promos, producto, precio, cant, hoy = hoyTexto()) {
  let mejor = null
  for (const p of promos) {
    if (!vigente(p, hoy)) continue
    if (!(p.producto_id === producto.id || (p.categoria && p.categoria === producto.categoria))) continue
    const d = promoDescuento(p, precio, cant)
    if (d > 0 && (!mejor || d > mejor.descuento)) mejor = { nombre: p.nombre, descuento: d }
  }
  return mejor
}

/** Resumen corto: "3x2", "−20 %", "A $ 1.500". */
export const textoPromo = (p, dinero) =>
  p.tipo === 'porcentaje' ? `−${Number(p.valor)} %` : p.tipo === 'nxm' ? `${p.lleva}x${p.paga}` : `A ${dinero(p.valor)}`

/** Promoción que se anuncia en la tarjeta de un producto de la tienda (para el catálogo público). */
export function promoVisible(promos, producto) {
  const precio = Number(producto.precio_venta)
  let mejor = null
  for (const raw of promos) {
    const p = { activa: true, desde: '0000-01-01', ...raw }
    if (!vigente(p) || !(p.producto_id === producto.id || (p.categoria && p.categoria === producto.categoria))) continue
    const cant = p.tipo === 'nxm' ? p.lleva : 1
    const d = promoDescuento(p, precio, cant)
    if (d > 0 && (!mejor || d / cant > mejor.d / mejor.cant)) mejor = { p, d, cant }
  }
  if (!mejor) return null
  const { p, d } = mejor
  return {
    nombre: p.nombre,
    etiqueta: p.tipo === 'nxm' ? `${p.lleva}x${p.paga}` : p.tipo === 'porcentaje' ? `−${Number(p.valor)} %` : `−${Math.max(1, Math.round(d / precio * 100))} %`,
    ahorro: p.tipo === 'nxm' ? 0 : d,
    precio: p.tipo === 'nxm' ? null : precio - d,
    nota: p.tipo === 'nxm' ? `${p.nombre}: lleva ${p.lleva} y paga ${p.paga}` : '',
  }
}
