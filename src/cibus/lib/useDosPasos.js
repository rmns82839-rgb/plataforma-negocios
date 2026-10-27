import { useCallback, useEffect, useState } from 'react'
import { factorActivo } from './mfa'

const EVENTO = 'mfa-cambio'
/** Avisa a toda la app que se activó o desactivó la verificación en dos pasos. */
export const avisarCambioMfa = () => window.dispatchEvent(new Event(EVENTO))

/** { cargando, activo } — ¿esta cuenta tiene la verificación en dos pasos? Se actualiza sola al cambiar. */
export function useDosPasos() {
  const [estado, setEstado] = useState({ cargando: true, activo: false })
  const cargar = useCallback(async () => {
    const f = await factorActivo()
    setEstado({ cargando: false, activo: Boolean(f) })
  }, [])
  useEffect(() => {
    cargar()
    window.addEventListener(EVENTO, cargar)
    return () => window.removeEventListener(EVENTO, cargar)
  }, [cargar])
  return estado
}
