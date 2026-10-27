// Como useState, pero lo que se va escribiendo en un formulario nuevo sobrevive a recargar la página
// o a que el navegador cierre la pestaña. Solo vive en este dispositivo y caduca a las 12 horas.
// `activo` = false (por ejemplo al editar algo que ya existe) lo desactiva por completo.
import { useCallback, useEffect, useState } from 'react'
import { DOCE_HORAS, leerBorrador, guardarBorrador } from './borrador'

export function useBorradorForm(clave, inicial, activo = true) {
  const [vacio] = useState(() => JSON.stringify(inicial))
  const [rec] = useState(() => (activo ? leerBorrador(clave, DOCE_HORAS) : null))
  const [valor, setValor] = useState(() => {
    if (rec === null || rec === undefined) return inicial
    return Array.isArray(inicial) || typeof inicial !== 'object' || inicial === null ? rec : { ...inicial, ...rec }
  })
  const [recuperado, setRecuperado] = useState(rec !== null && rec !== undefined)

  useEffect(() => {
    if (!activo) return
    guardarBorrador(clave, JSON.stringify(valor) === vacio ? null : valor)
  }, [valor, activo, clave, vacio])

  const limpiar = useCallback(() => { if (activo) guardarBorrador(clave, null) }, [activo, clave])
  const empezarDeNuevo = useCallback(() => { setValor(inicial); setRecuperado(false); guardarBorrador(clave, null) },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [clave])
  return [valor, setValor, { recuperado, limpiar, empezarDeNuevo }]
}
