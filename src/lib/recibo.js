// Recibo de una venta: texto para WhatsApp y página lista para imprimir (80 mm). Sin pantallas ni base de datos.
import { textoCantidad } from './pesaje.js'

const cop = (n) => `$${Math.round(Number(n) || 0).toLocaleString('es-CO')}`
const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))

export function fechaRecibo(fecha) {
  return new Date(fecha).toLocaleString('es-CO', { timeZone: 'America/Bogota', day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' })
}

// Arma el recibo con lo que guardó el servidor (precios finales, descuentos, envío y pagos reales)
export function armarRecibo({ tienda = {}, venta, items = [], pagos = [], formas = [], cliente = null }) {
  const lineas = items.map((i) => ({ nombre: i.nombre, cantidad: Number(i.cantidad), unitario: Number(i.precio_unitario), total: Math.round(Number(i.precio_unitario) * Number(i.cantidad)) - Math.round(Number(i.descuento_linea || 0)) }))
  const subtotal = lineas.reduce((s, l) => s + l.total, 0)
  const nombre = (m) => formas.find((f) => f.id === m)?.nombre || m
  const pg = pagos.map((p) => ({ nombre: nombre(p.metodo), monto: Number(p.monto), recibido: p.recibido ? Number(p.recibido) : null }))
  const cambio = pg.reduce((s, p) => s + (p.recibido && p.recibido > p.monto ? p.recibido - p.monto : 0), 0)
  return {
    tienda: { nombre: tienda.nombre || '', nit: tienda.nit || '', direccion: tienda.direccion || '', telefono: tienda.telefono || '', ciudad: tienda.ciudad || '' },
    numero: venta.numero, fecha: venta.fecha, lineas, subtotal,
    descuento: Math.round(Number(venta.descuento || 0)), envio: Math.round(Number(venta.dom_costo || 0)), total: Math.round(Number(venta.total)),
    pagos: pg, cambio, cliente: cliente?.nombre || cliente || '', anulada: !!venta.anulada,
  }
}

export function textoRecibo(r) {
  const L = []
  L.push(`*${r.tienda.nombre}*`)
  if (r.tienda.nit) L.push(`NIT ${r.tienda.nit}`)
  const donde = [r.tienda.direccion, r.tienda.telefono].filter(Boolean).join(' · ')
  if (donde) L.push(donde)
  L.push('', `Recibo de venta #${r.numero}`, fechaRecibo(r.fecha))
  if (r.cliente) L.push(`Cliente: ${r.cliente}`)
  L.push('')
  r.lineas.forEach((l) => L.push(`${textoCantidad(l.cantidad)} × ${l.nombre} — ${cop(l.total)}`))
  L.push('')
  if (r.descuento > 0 || r.envio > 0) L.push(`Subtotal: ${cop(r.subtotal)}`)
  if (r.descuento > 0) L.push(`Descuento: −${cop(r.descuento)}`)
  if (r.envio > 0) L.push(`Domicilio: ${cop(r.envio)}`)
  L.push(`*TOTAL: ${cop(r.total)}*`)
  r.pagos.forEach((p) => L.push(`${p.nombre}: ${cop(p.monto)}`))
  if (r.cambio > 0) L.push(`Devuelto: ${cop(r.cambio)}`)
  if (r.anulada) L.push('', '⚠ VENTA ANULADA')
  L.push('', '¡Gracias por tu compra!')
  return L.join('\n')
}

export function htmlRecibo(r) {
  const fila = (a, b, fuerte) => `<tr${fuerte ? ' class="t"' : ''}><td>${esc(a)}</td><td class="d">${esc(b)}</td></tr>`
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Recibo ${esc(r.numero)}</title>
<style>@page{size:80mm auto;margin:4mm}body{font:13px/1.35 ui-monospace,Menlo,Consolas,monospace;width:72mm;margin:0 auto;color:#000}
h1{font-size:16px;text-align:center;margin:0 0 2px}.c{text-align:center}hr{border:0;border-top:1px dashed #000;margin:6px 0}
table{width:100%;border-collapse:collapse}td{padding:1px 0;vertical-align:top}.d{text-align:right;white-space:nowrap;padding-left:6px}.t td{font-weight:700;font-size:15px}</style></head><body>
<h1>${esc(r.tienda.nombre)}</h1>
<p class="c">${[r.tienda.nit && 'NIT ' + r.tienda.nit, r.tienda.direccion, r.tienda.telefono].filter(Boolean).map(esc).join('<br>')}</p><hr>
<p>Recibo de venta #${esc(r.numero)}<br>${esc(fechaRecibo(r.fecha))}${r.cliente ? '<br>Cliente: ' + esc(r.cliente) : ''}</p><hr>
<table>${r.lineas.map((l) => fila(`${textoCantidad(l.cantidad)} × ${l.nombre}`, cop(l.total))).join('')}</table><hr>
<table>${r.descuento > 0 || r.envio > 0 ? fila('Subtotal', cop(r.subtotal)) : ''}${r.descuento > 0 ? fila('Descuento', '−' + cop(r.descuento)) : ''}${r.envio > 0 ? fila('Domicilio', cop(r.envio)) : ''}${fila('TOTAL', cop(r.total), true)}</table><hr>
<table>${r.pagos.map((p) => fila(p.nombre, cop(p.monto))).join('')}${r.cambio > 0 ? fila('Devuelto', cop(r.cambio)) : ''}</table>
${r.anulada ? '<p class="c"><b>VENTA ANULADA</b></p>' : ''}<hr><p class="c">¡Gracias por tu compra!</p></body></html>`
}

// Enlace de WhatsApp con el recibo; si el cliente tiene celular colombiano de 10 dígitos, abre su chat
export function enlaceWhatsApp(texto, telefono) {
  const t = String(telefono || '').replace(/\D/g, '')
  const num = t.length === 10 && t.startsWith('3') ? `57${t}` : t.length === 12 && t.startsWith('57') ? t : ''
  return `https://wa.me/${num}?text=${encodeURIComponent(texto)}`
}
