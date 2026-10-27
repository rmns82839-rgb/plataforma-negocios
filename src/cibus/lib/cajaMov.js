// Retiros e ingresos de caja (efectivo que sale o entra sin ser una venta). Archivo .js aparte por el Fast Refresh de Vite.
export const MOTIVOS_RETIRO = [
  { id: 'dueno', texto: 'Para el dueño' },
  { id: 'banco', texto: 'Consignar al banco' },
  { id: 'proveedor', texto: 'Pago a proveedor' },
  { id: 'cambio', texto: 'Cambio / monedas' },
  { id: 'otro', texto: 'Otro' },
]
export const MOTIVOS_INGRESO = [
  { id: 'base', texto: 'Base inicial del día' },
  { id: 'cambio', texto: 'Cambio / monedas' },
  { id: 'otro', texto: 'Otro' },
]
export const textoMotivo = (id) =>
  [...MOTIVOS_RETIRO, ...MOTIVOS_INGRESO].find(m => m.id === id)?.texto ?? 'Otro'

/** Total que entra y sale de la caja por retiros e ingresos. */
export function totalesCaja(filas) {
  let retiros = 0, ingresos = 0
  for (const f of filas ?? []) {
    if (f.tipo === 'retiro') retiros += Number(f.monto)
    else if (f.tipo === 'ingreso') ingresos += Number(f.monto)
  }
  return { retiros, ingresos }
}
