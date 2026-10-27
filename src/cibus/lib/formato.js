// Utilidades de formato compartidas (van en .js aparte por el Fast Refresh de Vite)

const cop = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  maximumFractionDigits: 0,
})

export const dinero = (n) => cop.format(Number(n) || 0)

export const numero = (n) =>
  new Intl.NumberFormat('es-CO', { maximumFractionDigits: 3 }).format(Number(n) || 0)

/** Convierte lo que el usuario digita ("12.500", "12500") a número entero. */
export const aNumero = (txt) => {
  const limpio = String(txt ?? '').replace(/[^\d.,-]/g, '').replace(/\./g, '').replace(',', '.')
  const n = Number(limpio)
  return Number.isFinite(n) ? n : 0
}

export const fechaHora = (iso) =>
  new Date(iso).toLocaleString('es-CO', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
  })

/** Inicio del día local (Bogotá/navegador) como ISO, para filtrar ventas de "hoy". */
export const inicioDia = (desplazarDias = 0) => {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() + desplazarDias)
  return d.toISOString()
}

/**
 * Cantidades (kilos, libras, unidades): acepta coma o punto como decimal.
 * "1,5" y "1.5" valen 1.5; "1.250,5" vale 1250.5. Hasta 3 decimales.
 */
export const aCantidad = (txt) => {
  let s = String(txt ?? '').replace(/[^\d.,-]/g, '')
  const ult = Math.max(s.lastIndexOf('.'), s.lastIndexOf(','))
  if (ult >= 0) s = s.slice(0, ult).replace(/[.,]/g, '') + '.' + s.slice(ult + 1)
  const n = Number(s)
  return Number.isFinite(n) ? Math.round(n * 1000) / 1000 : 0
}

export const fechaSolo = (iso) => {
  if (!iso) return ''
  const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' })
}
