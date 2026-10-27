import { useCallback, useEffect, useRef, useState } from 'react'
import { copiarTexto } from './copiar'

/**
 * Para botones "Copiar enlace": devuelve [estado, copiar].
 * estado: null | 'ok' | 'error' (vuelve a null a los 2,5 s).
 * Si no se pudo copiar, se muestra el enlace en un cuadro para copiarlo a mano.
 */
export function useCopiado() {
  const [estado, setEstado] = useState(null)
  const t = useRef(null)
  useEffect(() => () => clearTimeout(t.current), [])
  const copiar = useCallback(async (texto) => {
    const ok = await copiarTexto(texto)
    if (!ok) window.prompt('Copia este enlace:', texto)
    setEstado(ok ? 'ok' : 'error')
    clearTimeout(t.current)
    t.current = setTimeout(() => setEstado(null), 2500)
    return ok
  }, [])
  return [estado, copiar]
}

/** Texto del botón según el estado. */
export const textoCopiar = (estado, normal = 'Copiar enlace') =>
  estado === 'ok' ? '¡Enlace copiado!' : estado === 'error' ? 'Cópialo a mano' : normal
