// Rangos de fechas de los reportes (archivo .js aparte por el Fast Refresh de Vite)
import { inicioDia } from './formato'

export const PERIODOS = [
  { id: 'hoy',   texto: 'Hoy' },
  { id: 'sem',   texto: '7 días' },
  { id: 'mes',   texto: '30 días' },
  { id: 'rango', texto: 'Rango' },
]

/** "2026-09-30" (input date) → inicio de ese día local como ISO. */
const diaLocal = (txt, desplazar = 0) => {
  const [y, m, d] = txt.split('-').map(Number)
  return new Date(y, m - 1, d + desplazar).toISOString()
}

/** Date → "2026-09-30" con la fecha local (no UTC). */
export const fechaATexto = (d) => {
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

export const hoyTexto = () => fechaATexto(new Date())

/** @returns { desde: ISO, hasta: ISO | null }  (hasta es exclusivo) */
export function rangoDe(periodo, desdeTxt, hastaTxt) {
  if (periodo === 'hoy') return { desde: inicioDia(0), hasta: null }
  if (periodo === 'sem') return { desde: inicioDia(-6), hasta: null }
  if (periodo === 'mes') return { desde: inicioDia(-29), hasta: null }
  const d = desdeTxt || hoyTexto()
  const h = hastaTxt || d
  return { desde: diaLocal(d), hasta: diaLocal(h, 1) }
}
