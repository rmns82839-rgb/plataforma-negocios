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

// =====================================================================
// C6a: ventas en espera, descuentos y pagos por partes
// =====================================================================
export const MAX_VENTAS = 6
const DOS_DIAS = 2 * 86400000

// Venta nueva: el número es el menor libre (1 a 6) para que las pestañas no se salten
export function nuevaVenta(abiertas = [], ahora = Date.now()) {
  const usados = new Set(abiertas.map((v) => v.n))
  let n = 1
  while (usados.has(n)) n++
  return { id: `v${ahora.toString(36)}${Math.random().toString(36).slice(2, 6)}`, n, ts: ahora, paso: 'armar', carrito: {}, cliente: null, descTipo: 'monto', descValor: '', descLinea: {}, pagos: [], plazo: 0, dom: { on: false, direccion: '', telefono: '', costo: '' } }
}

// Lo que se guarda en el equipo: solo ventas con forma válida y de menos de 2 días (por si cambió algo)
export function sanearVentas(obj, ahora = Date.now()) {
  if (!obj || !Array.isArray(obj.lista)) return null
  const num = (x) => (Number.isFinite(Number(x)) ? Number(x) : 0)
  const lista = obj.lista.slice(0, MAX_VENTAS).filter((v) => v && typeof v.id === 'string' && ahora - num(v.ts) < DOS_DIAS).map((v) => ({
    id: v.id, n: Math.min(Math.max(Math.round(num(v.n)) || 1, 1), MAX_VENTAS), ts: num(v.ts),
    paso: v.paso === 'cobrar' ? 'cobrar' : 'armar',
    carrito: Object.fromEntries(Object.entries(v.carrito || {}).filter(([, c]) => num(c) > 0).map(([k, c]) => [k, Math.min(Math.round(num(c) * 1000) / 1000, 9999)])),
    cliente: v.cliente && typeof v.cliente.id === 'string' ? { id: v.cliente.id, nombre: String(v.cliente.nombre || ''), telefono: v.cliente.telefono ?? null, saldo: num(v.cliente.saldo), cupo_credito: num(v.cliente.cupo_credito) } : null,
    descTipo: v.descTipo === 'pct' ? 'pct' : 'monto',
    descValor: soloDigitos(v.descValor).slice(0, 9),
    descLinea: Object.fromEntries(Object.entries(v.descLinea || {}).filter(([, d]) => num(d) > 0).map(([k, d]) => [k, String(Math.round(num(d)))])),
    pagos: (Array.isArray(v.pagos) ? v.pagos : []).filter((p) => p && typeof p.metodo === 'string' && num(p.monto) > 0).map((p) => ({ metodo: p.metodo, monto: Math.round(num(p.monto)), ...(num(p.recibido) > 0 ? { recibido: Math.round(num(p.recibido)) } : {}) })),
    plazo: [0, 7, 15, 30].includes(num(v.plazo)) ? num(v.plazo) : 0,
    dom: { on: !!v.dom?.on, direccion: String(v.dom?.direccion || '').slice(0, 160), telefono: soloDigitos(v.dom?.telefono).slice(0, 12), costo: soloDigitos(v.dom?.costo).slice(0, 7) },
  }))
  if (lista.length === 0) return null
  const activa = lista.some((v) => v.id === obj.activa) ? obj.activa : lista[0].id
  return { lista, activa }
}

// Descuento general en pesos a partir de lo que escribió el cajero ($ o %) y el subtotal
export function descuentoGeneral(tipo, valor, base) {
  const v = aNumero(valor)
  if (tipo === 'pct') return Math.round((Number(base) || 0) * Math.min(v, 100) / 100)
  return v
}

// Suma un pago a la lista. Si ya había uno con la misma forma, los junta.
export function agregarPago(pagos, nuevo) {
  const monto = Math.round(Number(nuevo.monto))
  if (!(monto > 0)) return pagos
  const i = pagos.findIndex((p) => p.metodo === nuevo.metodo)
  const rec = (p) => (p.recibido > 0 ? p.recibido : p.monto)
  if (i < 0) return [...pagos, { metodo: nuevo.metodo, monto, ...(nuevo.recibido > monto ? { recibido: Math.round(nuevo.recibido) } : {}) }]
  const ya = pagos[i]
  const suma = ya.monto + monto
  const recibido = rec(ya) + (nuevo.recibido > monto ? Math.round(nuevo.recibido) : monto)
  return pagos.map((p, k) => (k === i ? { metodo: p.metodo, monto: suma, ...(recibido > suma ? { recibido } : {}) } : p))
}
export const quitarPago = (pagos, metodo) => pagos.filter((p) => p.metodo !== metodo)
export const sumaPagos = (pagos) => pagos.reduce((s, p) => s + p.monto, 0)
export const faltante = (pagos, total) => Math.round(Number(total) || 0) - sumaPagos(pagos)

// Cuánto devuelve en total (suma del cambio de cada pago en efectivo)
export const cambioTotal = (pagos) => pagos.reduce((s, p) => s + (p.recibido > p.monto ? p.recibido - p.monto : 0), 0)

// Botones de formas de pago: 3 por fila; si la última fila queda incompleta, se reparte el ancho (2 → mitad y mitad, 1 → toda la fila)
export function spansMetodos(n) {
  const filas = Math.floor(n / 3)
  const resto = n % 3
  const clases = Array(filas * 3).fill('col-span-2')
  if (resto === 1) clases.push('col-span-6')
  if (resto === 2) clases.push('col-span-3', 'col-span-3')
  return clases
}

export const BILLETES = [20000, 50000, 100000]

// Comisión que cobra la forma de pago sobre un monto
export const comisionDe = (forma, monto) => Math.round((Number(monto) || 0) * (Number(forma?.comision) || 0) / 100)

// Fecha límite del fiado: hoy (Bogotá) + n días
export function fechaLimite(dias, ahora = new Date()) {
  if (!(dias > 0)) return null
  return sumarDias(diaBogota(ahora), dias)
}

// Nombre de forma de pago → id válido para la base (a-z, 0-9 y _; 2 a 30 caracteres)
export function idForma(nombre, existentes = []) {
  const base = String(nombre || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 26)
  if (base.length < 2) return null
  let id = base, k = 2
  while (existentes.includes(id)) id = `${base}_${k++}`
  return id
}

// Comisión escrita por una persona ("2,5" o "2.5") → número entre 0 y 20, o null si no sirve
export function leerComision(texto) {
  const t = String(texto ?? '').trim().replace(',', '.')
  if (t === '') return 0
  if (!/^\d{1,2}(\.\d{1,2})?$/.test(t)) return null
  const n = Number(t)
  return n >= 0 && n <= 20 ? n : null
}

// Domicilio de una venta de mostrador: cuánto cobra de envío (0 si no hay) y los datos que viajan al servidor
export const envioDe = (dom) => (dom?.on ? aNumero(dom.costo) : 0)
export function domicilioParaServidor(dom) {
  if (!dom?.on) return { dom: null }
  const direccion = String(dom.direccion || '').trim()
  if (direccion.length < 5) return { error: 'Escribe la dirección del domicilio' }
  return { dom: { direccion, telefono: soloDigitos(dom.telefono) || null, costo: aNumero(dom.costo) } }
}
