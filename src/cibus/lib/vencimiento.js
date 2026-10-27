// Vencimiento de productos (archivo .js aparte por el Fast Refresh de Vite)

export const DIAS_AVISO = 30

/** Días que faltan para vencer (negativo = ya venció). null si no tiene fecha. */
export function diasParaVencer(fecha) {
  if (!fecha) return null
  const [y, m, d] = String(fecha).slice(0, 10).split('-').map(Number)
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0)
  return Math.round((new Date(y, m - 1, d) - hoy) / 86400000)
}

/** El vencimiento que cuenta: el del lote más próximo (p.vence) o, si no hay lotes, el manual. */
export const venceDe = (p) => p.vence ?? p.fecha_vencimiento ?? null

export const porVencer = (p) => {
  const d = diasParaVencer(venceDe(p))
  return d !== null && d <= DIAS_AVISO
}

export function textoVence(fecha) {
  const d = diasParaVencer(fecha)
  if (d === null) return ''
  if (d < 0) return `Vencido hace ${-d} d`
  if (d === 0) return 'Vence hoy'
  return `Vence en ${d} d`
}
