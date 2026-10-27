// src/hooks/usePistola.js
// ------------------------------------------------------------
// Captura lecturas de una pistola de escaneo USB/Bluetooth.
// Las lectoras se comportan como teclado: escriben los caracteres
// muy rápido y cierran con Enter. Este hook escucha a nivel de
// documento, así que funciona sin que ningún input esté enfocado.
// ------------------------------------------------------------
import { useEffect, useRef } from 'react'

const MS_ENTRE_TECLAS = 80   // sobre esto se asume digitación humana
const LARGO_MINIMO   = 4     // descarta pulsaciones sueltas (códigos internos cortos caben)

export function usePistola(onLectura, activo = true) {
  const buffer = useRef('')
  const ultimaTecla = useRef(0)
  const callback = useRef(onLectura)

  // Mantiene la referencia fresca sin re-suscribir el listener
  useEffect(() => { callback.current = onLectura }, [onLectura])

  useEffect(() => {
    if (!activo) return

    const alTeclear = (e) => {
      // Si el usuario está escribiendo en un campo de texto, no interferir,
      // salvo que el input esté marcado como destino de escaneo.
      const el = document.activeElement
      const enCampo = el && ['INPUT', 'TEXTAREA'].includes(el.tagName)
      if (enCampo && el.dataset.escaner !== 'true') return

      const ahora = Date.now()
      if (ahora - ultimaTecla.current > MS_ENTRE_TECLAS) buffer.current = ''
      ultimaTecla.current = ahora

      if (e.key === 'Enter') {
        const leido = buffer.current
        buffer.current = ''
        if (leido.length >= LARGO_MINIMO) {
          e.preventDefault()
          callback.current?.(leido)
        }
        return
      }

      // El separador FNC1 de GS1 llega como GS (\x1D) en algunos escáneres
      if (e.key.length === 1) buffer.current += e.key
    }

    document.addEventListener('keydown', alTeclear)
    return () => document.removeEventListener('keydown', alTeclear)
  }, [activo])
}