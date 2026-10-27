// Ayudas de la factura (van en .js aparte por el Fast Refresh de Vite)

// Prefijo de la numeración (ej. "FV-"). Lo fija el dueño en Datos del negocio.
let prefijo = ''
export const fijarPrefijo = (p) => { prefijo = String(p ?? '') }

/** Número de factura con ceros a la izquierda: 7 -> "00007" (con prefijo: "FV-00007"). */
export const numeroFactura = (n) => `${prefijo}${String(n ?? '').padStart(5, '0')}`

/** Fecha y hora completas para la factura, en hora local. */
export const fechaFactura = (iso) =>
  new Date(iso).toLocaleString('es-CO', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })

/** "CC 123456" / "NIT 900.123" / "" según lo que tenga el cliente. */
export const documentoCliente = (c) =>
  c?.documento ? `${c.tipo_documento ? c.tipo_documento + ' ' : ''}${c.documento}` : ''

/** Subtotal de los productos antes del descuento general y sin el domicilio (ya con los descuentos por producto). */
export const subtotalVenta = (v) => Number(v.total) + Number(v.descuento || 0) - Number(v.dom_costo || 0)
