// Fórmula del domicilio por distancia (la misma que usa la base de datos: función calcular_domicilio).
// Aquí solo sirve para mostrar ejemplos al dueño y validar lo que escribe; el cobro real lo calcula el servidor.
export const redondear = (costo, paso) => (paso === 500 || paso === 1000 ? Math.round(costo / paso) * paso : Math.round(costo))

// Tarifa base fija hasta los km incluidos; lo que pasa de ahí se cobra por kilómetro (proporcional: también cuenta los metros)
export const costoDomicilio = ({ base, porKm, redondeo = 0, incluidos = 0 }, km) =>
  redondear(Number(base) + Math.max(0, Number(km) - Number(incluidos || 0)) * Number(porKm), Number(redondeo))

/** Texto de error de la configuración (o '' si está bien). */
export function validarDomicilioKm(f) {
  if (f.dom_modo !== 'km') return ''
  const pesos = (t) => String(t ?? '').replace(/\D/g, '')
  if (pesos(f.dom_base) === '') return 'Escribe la tarifa base del domicilio (puede ser 0)'
  if (pesos(f.dom_por_km) === '') return 'Escribe el valor por kilómetro (puede ser 0)'
  const max = Number(String(f.dom_max_km ?? '').replace(',', '.'))
  if (!Number.isFinite(max) || max <= 0 || max > 100) return 'Escribe la distancia máxima de cobertura (entre 1 y 100 km)'
  const inc = Number(String(f.dom_km_incluidos ?? '0').replace(',', '.') || 0)
  if (!Number.isFinite(inc) || inc < 0 || inc > 20) return 'Los kilómetros incluidos deben estar entre 0 y 20'
  if (inc > max) return 'Los kilómetros incluidos no pueden ser más que la distancia máxima'
  if (String(f.dom_origen ?? '').trim().length < 8) return 'Escribe la dirección desde donde salen los domicilios (la de la tienda)'
  return ''
}
