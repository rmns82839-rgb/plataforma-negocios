// Cálculos de la caja, los fiados y los reportes del panel (sin pantallas ni base de datos, para poder probarlos).
// El total real de una venta SIEMPRE lo calcula el servidor (previsualizar_venta / registrar_venta): aquí solo se
// arman los datos, se valida lo que se escribe y se calculan fechas y porcentajes.
const BOGOTA_MS = 5 * 60 * 60 * 1000   // Colombia es UTC−5 todo el año (no tiene horario de verano)

// 'YYYY-MM-DD' de hoy en Bogotá
export function diaBogota(ahora = new Date()) {
  return new Date(ahora.getTime() - BOGOTA_MS).toISOString().slice(0, 10)
}
// Instante (ISO) en que empieza ese día en Bogotá
export function inicioDia(dia) { return new Date(`${dia}T00:00:00-05:00`).toISOString() }
const sumarDias = (dia, n) => new Date(new Date(`${dia}T12:00:00Z`).getTime() + n * 86400000).toISOString().slice(0, 10)

// Rangos del tablero: hoy · últimos 7 días · últimos 30 días · este mes. "hasta" queda abierto (mañana 00:00).
export const PERIODOS = [['hoy', 'Hoy'], ['7d', '7 días'], ['30d', '30 días'], ['mes', 'Este mes']]
export function rangoPeriodo(clave, ahora = new Date()) {
  const hoy = diaBogota(ahora)
  const hasta = inicioDia(sumarDias(hoy, 1))
  let desdeDia = hoy
  if (clave === '7d') desdeDia = sumarDias(hoy, -6)
  else if (clave === '30d') desdeDia = sumarDias(hoy, -29)
  else if (clave === 'mes') desdeDia = `${hoy.slice(0, 7)}-01`
  return { desde: inicioDia(desdeDia), hasta }
}

// Cambio de cuánto sube o baja contra el periodo anterior (null si no hay con qué comparar)
export function variacion(actual, anterior) {
  const a = Number(actual), b = Number(anterior)
  if (!Number.isFinite(a) || !Number.isFinite(b) || b <= 0) return null
  return Math.round(((a - b) / b) * 100)
}

export const soloDigitos = (t) => String(t ?? '').replace(/\D/g, '')
export const aNumero = (t) => { const n = Number(soloDigitos(t)); return Number.isFinite(n) ? n : 0 }

// Subtotal a precio de lista (el servidor puede dar menos por promociones o precio mayorista)
export function subtotalLista(lineas) {
  return lineas.reduce((s, l) => s + Math.round(Number(l.producto.precio_venta) * Number(l.cantidad)), 0)
}

// Pagos de una venta: [{metodo, monto}] que deben sumar el total. El último método se queda con lo que falte.
export function armarPagos(filas, total, recibido) {
  const t = Math.round(Number(total))
  if (!(t > 0)) return { error: 'El total de la venta debe ser mayor a cero' }
  const usadas = filas.filter((f) => f.metodo)
  if (usadas.length === 0) return { error: 'Elige cómo paga el cliente' }
  const pagos = []
  let suma = 0
  usadas.forEach((f, i) => {
    const ultimo = i === usadas.length - 1
    const monto = ultimo ? t - suma : aNumero(f.monto)
    suma += monto
    pagos.push({ metodo: f.metodo, monto })
  })
  if (pagos.some((p) => !(p.monto > 0))) return { error: usadas.length > 1 ? 'Cada forma de pago debe tener un valor mayor a cero y no pasar del total' : 'El pago debe ser mayor a cero' }
  if (new Set(pagos.map((p) => p.metodo)).size !== pagos.length) return { error: 'No repitas la misma forma de pago' }
  const r = aNumero(recibido)
  if (pagos.length === 1 && r > 0) {
    if (r < t) return { error: 'El efectivo recibido es menor que el total' }
    pagos[0].recibido = r
  }
  return { pagos }
}

export const cambio = (recibido, total) => { const r = aNumero(recibido); return r > 0 && r >= total ? r - total : null }

// Recordatorio de cobro por WhatsApp (tono amable, sin presionar)
export function mensajeCobro({ nombre, saldo, tienda }) {
  const primero = String(nombre || '').trim().split(/\s+/)[0] || ''
  return `Hola ${primero}, te escribimos de ${tienda}. Te recordamos con mucho gusto que tienes un saldo pendiente de $${Math.round(saldo).toLocaleString('es-CO')}. Cuando puedas, pásanos a pagar. ¡Gracias!`
}
