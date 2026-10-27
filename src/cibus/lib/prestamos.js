// Cálculo de préstamos. Es la MISMA fórmula que usa la función crear_prestamo de la base
// de datos (migracion-v2.sql); aquí solo sirve para mostrar el simulador antes de guardar.
// Archivo .js aparte por el Fast Refresh de Vite.
import { fechaATexto } from './periodo'

export const FRECUENCIAS = [
  { id: 'semanal',   texto: 'Semanal',   dias: 7 },
  { id: 'quincenal', texto: 'Quincenal', dias: 15 },
  { id: 'mensual',   texto: 'Mensual',   dias: 30 },
]

const partir = (t) => t.split('-').map(Number)

function sumarDias(texto, n) {
  const [y, m, d] = partir(texto)
  return fechaATexto(new Date(y, m - 1, d + n))
}

function sumarMeses(texto, n) {
  const [y, m, d] = partir(texto)
  const total = (m - 1) + n
  const ny = y + Math.floor(total / 12)
  const nm = ((total % 12) + 12) % 12
  const ultimo = new Date(ny, nm + 1, 0).getDate()
  return fechaATexto(new Date(ny, nm, Math.min(d, ultimo)))
}

/**
 * Interés simple: monto × tasa mensual × meses de duración.
 * Meses = cuotas × días por cuota / 30. Cuotas iguales; la última absorbe el redondeo.
 * @returns { interes, total, cuotas: [{ numero, fecha, capital, interes, valor }] }
 */
export function simularPrestamo({ monto, tasaMensual, frecuencia, cuotas, inicio }) {
  const dias = FRECUENCIAS.find(f => f.id === frecuencia)?.dias
  const n = Math.round(Number(cuotas))
  const m = Math.round(Number(monto))
  if (!dias || !(n >= 1) || !(m > 0) || !(Number(tasaMensual) >= 0)) return null

  const tasaCent = Math.round(Number(tasaMensual) * 100)           // 2.5% → 250 (enteros: sin errores de coma flotante)
  const interes = Math.round((m * tasaCent * n * dias) / 300000)
  const capBase = Math.round(m / n)
  const intBase = Math.round(interes / n)

  const lista = []
  for (let i = 1; i <= n; i++) {
    const ultima = i === n
    const capital = ultima ? m - capBase * (n - 1) : capBase
    const inte = ultima ? interes - intBase * (n - 1) : intBase
    lista.push({
      numero: i,
      fecha: frecuencia === 'mensual' ? sumarMeses(inicio, i) : sumarDias(inicio, i * dias),
      capital, interes: inte, valor: capital + inte,
    })
  }
  return { interes, total: m + interes, cuotas: lista }
}
