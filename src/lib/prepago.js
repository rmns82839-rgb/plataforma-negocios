// Saldo prepago: plata que el cliente deja adelantada y va gastando. Ayudas compartidas (.js aparte por el Fast Refresh de Vite).
const SUMAN = new Set(['recarga', 'reverso', 'ajuste_mas', 'bono'])

export const TEXTO_MOV = {
  recarga: 'Recarga',
  consumo: 'Compra con saldo',
  reverso: 'Venta anulada (se devolvió el saldo)',
  devolucion: 'Devolución de saldo',
  ajuste_mas: 'Corrección (suma)',
  ajuste_menos: 'Corrección (resta)',
  bono: 'Bono de regalo',
}

/** +1 si el movimiento aumenta el saldo, −1 si lo baja. */
export const signoMov = (m) => (SUMAN.has(m.tipo) ? 1 : -1)

/** Formas con las que puede entrar o salir la plata de una recarga o devolución (no el fiado ni el propio saldo). */
export const formasDeRecarga = (formas) => (formas ?? []).filter((f) => f.activa !== false && ['efectivo', 'digital', 'datafono'].includes(f.tipo))

/** Valor del bono según lo que eligió el dueño: 'no' · '5' · '10' (porcentaje) · 'otro' (valor escrito). */
export function valorBono(modo, recarga, textoOtro) {
  const r = Math.round(Number(recarga) || 0)
  if (!(r > 0) || modo === 'no') return 0
  if (modo === 'otro') return Math.max(0, Math.round(Number(String(textoOtro ?? '').replace(/\D/g, '')) || 0))
  return Math.round((r * Number(modo)) / 100)
}

/** Fecha "2026-11-20" → "20 nov 2026". */
export const textoFecha = (txt) => {
  if (!txt) return ''
  const [y, m, d] = String(txt).slice(0, 10).split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' })
}

/** "2026-11-20": hoy más estos días (fecha local). */
export const fechaEn = (dias, desde = new Date()) => {
  const d = new Date(desde); d.setDate(d.getDate() + dias)
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

/** Cuánto saldo puede usar de un pago: lo que tiene, sin pasar de lo que falta. */
export const maxConSaldo = (saldo, falta) => Math.max(0, Math.min(Math.round(Number(saldo) || 0), Math.round(Number(falta) || 0)))

/** Un identificador para que reintentar una recarga no la duplique. */
export const idNuevo = () => (globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID()
  : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => { const r = (Math.random() * 16) | 0; return (c === 'x' ? r : (r & 3) | 8).toString(16) }))
