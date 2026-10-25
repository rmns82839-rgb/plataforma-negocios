// Cálculos del carrito. Son SOLO una estimación para mostrar al cliente:
// el precio, las ofertas y el domicilio definitivos los decide siempre el servidor (crear_pedido_tienda).

export const cop = (n) => '$' + Math.round(Number(n) || 0).toLocaleString('es-CO')

export const soloDigitos = (t) => String(t || '').replace(/\D/g, '')

// Igual que promo_descuento() en la base de datos
export function descuentoPromo(p, precio, cant) {
  let d = 0
  if (p.tipo === 'porcentaje') d = Math.round((precio * cant * p.valor) / 100)
  else if (p.tipo === 'precio') d = precio > p.valor ? Math.round((precio - p.valor) * cant) : 0
  else if (p.tipo === 'nxm') d = Math.round(Math.floor(cant / p.lleva) * (p.lleva - p.paga) * precio)
  return Math.max(0, Math.min(d, Math.round(precio * cant) - 1))
}

export function mejorPromo(promos, prod, cant) {
  let mejor = { d: 0, nombre: null }
  for (const p of promos || []) {
    if (!(p.producto_id === prod.id || (p.categoria && p.categoria === prod.categoria))) continue
    const d = descuentoPromo(p, Number(prod.precio_venta), cant)
    if (d > mejor.d) mejor = { d, nombre: p.nombre }
  }
  return mejor
}

// Redondeo al múltiplo MÁS CERCANO del paso de la tienda (0 = al peso), igual que Matriz
export function redondear(v, paso) {
  return paso > 0 ? Math.round(v / paso) * paso : Math.round(v)
}

export function costoDomicilio(n, subtotal, km) {
  if (!n) return 0
  const gratis = Number(n.envio_gratis_desde) || 0
  if (n.domicilio_modo === 'km' && (n.modulos || []).includes('domicilio_km')) {
    if (km == null || Number.isNaN(km)) return null              // todavía falta la distancia
    if (n.domicilio_radio_max_km != null && km > Number(n.domicilio_radio_max_km)) return undefined   // fuera de zona
    if (gratis > 0 && subtotal >= gratis) return 0
    const v = (Number(n.domicilio_costo) || 0) + Math.max(km - Number(n.domicilio_km_incluidos || 0), 0) * Number(n.domicilio_valor_km || 0)
    return redondear(v, Number(n.domicilio_redondeo || 0))
  }
  if (n.domicilio_costo == null) return 0
  return gratis > 0 && subtotal >= gratis ? 0 : Number(n.domicilio_costo)
}

// Tarifa fija de respaldo (cuando el mapa no pudo calcular): la que define la tienda, o la base del domicilio
export function tarifaRespaldo(n, subtotal) {
  const gratis = Number(n?.envio_gratis_desde) || 0
  if (gratis > 0 && subtotal >= gratis) return 0
  return Number(n?.domicilio_tarifa_respaldo ?? n?.domicilio_costo ?? 0) || 0
}

// Domicilio según el cálculo del servidor. calculo = { estado: 'ok', km } | { respaldo: true } | { estado: 'fuera_de_zona' } | null
// Devuelve: número · null (falta calcular) · undefined (fuera de zona)
export function costoDomicilioCalculado(n, subtotal, calculo) {
  if (!(n?.domicilio_modo === 'km' && (n.modulos || []).includes('domicilio_km'))) return costoDomicilio(n, subtotal, null)
  if (!calculo) return null
  if (calculo.estado === 'fuera_de_zona') return undefined
  if (calculo.respaldo) return tarifaRespaldo(n, subtotal)
  return costoDomicilio(n, subtotal, Number(calculo.km))
}

// Totales del carrito: items = [{ producto, cantidad }]
export function totales(items, promos) {
  let bruto = 0, desc = 0
  const lineas = items.map(({ producto, cantidad }) => {
    const b = Math.round(Number(producto.precio_venta) * cantidad)
    const m = mejorPromo(promos, producto, cantidad)
    bruto += b; desc += m.d
    return { producto, cantidad, bruto: b, descuento: m.d, promo: m.nombre, total: b - m.d }
  })
  return { lineas, bruto, descuento: desc, subtotal: bruto - desc }
}

// ---- WhatsApp ----
export function numeroWhatsapp(tel) {
  const d = soloDigitos(tel)
  if (d.length === 10) return '57' + d
  if (d.length === 12 && d.startsWith('57')) return d
  return d.length >= 10 ? d : null
}

export function mensajePedido({ tienda, numero, nombre, lineas, subtotal, domicilio, total, entrega, direccion, nota, practica }) {
  const l = []
  if (practica) l.push('*PEDIDO DE PRÁCTICA (no es real)*')
  l.push(`Hola ${tienda}, quiero confirmar mi pedido *#${numero}*.`)
  l.push('')
  for (const x of lineas) l.push(`• ${x.cantidad} × ${x.nombre} — ${cop(x.subtotal)}${x.promo ? ` (oferta: ${x.promo})` : ''}`)
  l.push('')
  l.push(`Productos: ${cop(subtotal)}`)
  l.push(entrega === 'recoger' ? 'Entrega: recojo en la tienda' : `Domicilio: ${domicilio > 0 ? cop(domicilio) : 'sin costo'}`)
  l.push(`*Total: ${cop(total)}*`)
  l.push('')
  l.push(`Nombre: ${nombre}`)
  if (entrega !== 'recoger' && direccion) l.push(`Dirección: ${direccion}`)
  if (nota) l.push(`Nota: ${nota}`)
  return l.join('\n')
}

export function urlWhatsapp(tel, texto) {
  const n = numeroWhatsapp(tel)
  return n ? `https://wa.me/${n}?text=${encodeURIComponent(texto)}` : null
}

// Validación de los datos del cliente (la base de datos vuelve a validar)
export function validarDatos(d, n, calculo) {
  const e = {}
  if (String(d.nombre || '').trim().length < 3) e.nombre = 'Escribe tu nombre completo'
  let t = soloDigitos(d.telefono)
  if (t.length === 12 && t.startsWith('57')) t = t.slice(2)
  if (t.length !== 10) e.telefono = 'Escribe tu celular de 10 dígitos'
  if (d.entrega === 'domicilio') {
    if (String(d.direccion || '').trim().length < 6) e.direccion = 'Escribe tu dirección completa (barrio y número)'
    if (n.domicilio_modo === 'km' && (n.modulos || []).includes('domicilio_km')) {
      if (!calculo) e.calculo = 'Confirma tu dirección en el mapa para calcular el domicilio'
      else if (calculo.estado === 'fuera_de_zona') e.calculo = 'Tu dirección queda fuera de la zona de entrega'
    }
  }
  return e
}

export function parseKm(t) {
  const s = String(t ?? '').trim().replace(',', '.')
  if (!/^[0-9]{1,3}(\.[0-9]{1,2})?$/.test(s)) return null
  return Number(s)
}
