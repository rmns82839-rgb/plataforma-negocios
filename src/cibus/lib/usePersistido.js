// Como useState, pero el valor sobrevive a recargar la página o a cerrar la pestaña (solo en este dispositivo,
// caduca a las 12 horas). Si el valor vuelve a ser el inicial, el borrador se borra solo.
// Sirve para campos sueltos de un formulario: se cambia `useState(x)` por `usePersistido('clave', x)` y nada más.
// No usar para contraseñas ni datos sensibles.
import { useEffect, useState } from 'react'
import { DOCE_HORAS, leerBorrador, guardarBorrador } from './borrador'

export const PREFIJO_BD = 'bd:'
// Ventanas abiertas y página actual: se reabren solo si se recarga pronto (así mañana la app arranca limpia, en la Caja)
export const TREINTA_MIN = 30 * 60 * 1000

export function usePersistido(clave, inicial, activo = true, caducaMs = DOCE_HORAS) {
  const k = PREFIJO_BD + clave
  const [valor, setValor] = useState(() => {
    if (!activo) return inicial
    const r = leerBorrador(k, caducaMs)
    return r === null || r === undefined ? inicial : r
  })
  useEffect(() => {
    if (!activo) return
    guardarBorrador(k, JSON.stringify(valor) === JSON.stringify(inicial) ? null : valor)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valor, k, activo])
  return [valor, setValor]
}

/** Borra todos los borradores de un formulario (todos los que empiezan con ese prefijo). Se llama al guardar o al cerrar a propósito. */
export function borrarBorradores(prefijo) {
  try {
    const p = PREFIJO_BD + prefijo
    for (const k of Object.keys(localStorage)) if (k.startsWith(p)) localStorage.removeItem(k)
  } catch { /* sin almacenamiento */ }
}
