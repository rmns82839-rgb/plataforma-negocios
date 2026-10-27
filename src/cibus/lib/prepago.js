// Saldo prepago: plata que el cliente deja adelantada y va gastando. Ayudas compartidas (.js aparte por el Fast Refresh de Vite).
import { practicaActiva, prepagoSimulado } from './practica'

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

/** Saldo que dejan estos movimientos. */
export const saldoDeMovs = (movs) => (movs ?? []).reduce((s, m) => s + signoMov(m) * Number(m.monto), 0)

/** Saldo real (de la base) más lo que se haya simulado en el modo práctica. */
export const saldoVisible = (real, clienteId) => Number(real ?? 0) + (practicaActiva() ? prepagoSimulado(clienteId) : 0)

/** Formas con las que puede entrar o salir la plata de una recarga o devolución (no fiado ni el propio saldo). */
export const formasDeRecarga = (formas) => (formas ?? []).filter(f => f.activa !== false && ['efectivo', 'digital', 'datafono'].includes(f.tipo))

/** Fecha "2026-11-20" → "20 nov 2026". */
export const textoFecha = (txt) => {
  if (!txt) return ''
  const [y, m, d] = String(txt).slice(0, 10).split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' })
}

/** "2026-11-20" sumando días a hoy (fecha local). */
export const fechaEn = (dias) => {
  const d = new Date(); d.setDate(d.getDate() + dias)
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}
