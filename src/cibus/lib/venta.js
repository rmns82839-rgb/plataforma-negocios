// Cuentas de la venta (van en .js aparte por el Fast Refresh de Vite).
// Una línea de la venta: { producto, cantidad, precio?, descuento? }
//   precio    = precio unitario distinto al de lista (solo para esta venta)
//   descuento = pesos de descuento en esa línea
// Nada de esto cambia el precio del inventario.

import { mejorPromo } from './promos'

export const redondear = (n) => Math.round(Number(n) || 0)

export const precioLista = (l) => Number(l.producto.precio_venta)
/** Precio de la línea sin ajustes manuales: de lista o, si aplica, mayorista (lo calcula conPrecios). */
export const precioBase = (l) => (l.base !== undefined && l.base !== null ? Number(l.base) : precioLista(l))
/** ¿El cajero cambió el precio a mano? (distinto del que ya le tocaba) */
export const esManual = (l) => l.precio !== undefined && l.precio !== null && Number(l.precio) !== precioBase(l)
export const precioDe = (l) => (esManual(l) ? Number(l.precio) : precioBase(l))
export const brutoLinea = (l) => redondear(precioDe(l) * l.cantidad)
/** Descuento puesto a mano en la línea (en pesos). */
export const descuentoLinea = (l) => redondear(l.descuento || 0)
/** Descuento de la promoción automática. */
export const promoLinea = (l) => (esManual(l) ? 0 : Math.min(redondear(l.promoDesc || 0), Math.max(brutoLinea(l) - descuentoLinea(l) - 1, 0)))
export const netoLinea = (l) => brutoLinea(l) - descuentoLinea(l) - promoLinea(l)
export const tieneAjuste = (l) => esManual(l) || descuentoLinea(l) > 0

/**
 * Agrega a cada línea lo que decide el sistema: precio mayorista y mejor promoción.
 * Es la misma regla que aplica registrar_venta en la base de datos.
 * ctx = { cliente, descMayorista, promos, hoy }
 */
export function conPrecios(carrito, { cliente, descMayorista = 0, promos = [], hoy } = {}) {
  const mayorista = cliente?.tipo_cliente === 'mayorista'
  return carrito.map(l => {
    const p = l.producto
    const lista = Number(p.precio_venta)
    let base = lista
    let auto = false
    if (Number(p.precio_mayor) > 0 && ((Number(p.cantidad_mayor) > 0 && l.cantidad >= Number(p.cantidad_mayor)) || mayorista)) {
      base = Number(p.precio_mayor); auto = true
    } else if (mayorista && descMayorista > 0) {
      base = redondear(lista * (1 - descMayorista / 100)); auto = true
    }
    const manual = l.precio !== undefined && l.precio !== null && Number(l.precio) !== base
    const promo = manual ? null : mejorPromo(promos, p, base, l.cantidad, hoy)
    return { ...l, base, auto, promoNombre: promo?.nombre ?? null, promoDesc: promo?.descuento ?? 0 }
  })
}

/** Precio mínimo por unidad: el del producto o, si no tiene, el costo más el margen general. 0 = sin mínimo. */
export const minimoUnidad = (p, margen = 0) => {
  if (p.precio_minimo !== null && p.precio_minimo !== undefined && p.precio_minimo !== '') return Number(p.precio_minimo)
  return margen > 0 ? redondear(Number(p.precio_compra) * (1 + margen / 100)) : 0
}
/** El precio mayorista lo fija el dueño: no se bloquea por el margen mínimo. */
export const minimoDe = (l, margen = 0) => {
  const m = minimoUnidad(l.producto, margen)
  return l.auto && m > 0 ? Math.min(m, precioBase(l)) : m
}
export const minimoLinea = (l, margen) => redondear(minimoDe(l, margen) * l.cantidad)
export const bajoMinimo = (l, margen) => {
  const m = minimoLinea(l, margen)
  return m > 0 && brutoLinea(l) - descuentoLinea(l) < m     // las promociones no cuentan: las define el dueño
}

/** Desglose de la venta para mostrar en grande. */
export function resumen(lineas, descuentoGeneral = 0, envio = 0) {
  const lista = lineas.reduce((s, l) => s + redondear(precioLista(l) * l.cantidad), 0)
  const bruto = lineas.reduce((s, l) => s + brutoLinea(l), 0)
  const manual = lineas.filter(esManual)
  const mayorista = lineas.filter(l => !esManual(l)).reduce((s, l) => s + brutoLinea(l) - redondear(precioLista(l) * l.cantidad), 0)
  const porProducto = lineas.reduce((s, l) => s + descuentoLinea(l), 0)
  const porPromo = lineas.reduce((s, l) => s + promoLinea(l), 0)
  const subtotal = bruto - porProducto - porPromo
  const general = Math.min(redondear(descuentoGeneral), Math.max(subtotal - 1, 0))
  const domicilio = Math.max(redondear(envio), 0)
  return {
    lista,                                                        // lo que sumaría a precios de lista
    mayorista,                                                    // − baja por precio mayorista
    ajustePrecio: manual.reduce((s, l) => s + brutoLinea(l) - redondear(precioLista(l) * l.cantidad), 0), // cambios a mano
    porProducto,                                                  // descuentos por producto
    porPromo,                                                     // promociones automáticas
    subtotal,
    general,                                                      // descuento general
    domicilio,                                                    // costo del envío
    total: subtotal - general + domicilio,
    unidades: lineas.reduce((s, l) => s + l.cantidad, 0),
    productos: lineas.length,
  }
}

/** Lo que falta (positivo) o sobra (negativo) por pagar. */
export const faltaPagar = (total, pagos) => total - pagos.reduce((s, p) => s + redondear(p.monto), 0)

export const comisionDe = (monto, pct) => redondear(redondear(monto) * (Number(pct) || 0) / 100)
