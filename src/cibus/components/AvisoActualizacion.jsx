// Avisa cuando hay una versión nueva de la app y deja actualizar con un solo toque.
// Al abrir la app, si hay versión nueva, se actualiza sola (todavía no hay nada escrito).
// Con la app ya en uso solo avisa, para no borrar un pedido o una venta a medias.
import { useEffect, useState } from 'react'
import { hayVersionNueva, actualizarAhora, yaIntentoRecargar, marcarRecarga } from '../lib/versionApp'

const CADA_MS = 5 * 60 * 1000

export default function AvisoActualizacion() {
  const [nueva, setNueva] = useState(false)
  const [cargando, setCargando] = useState(false)
  const [progreso, setProgreso] = useState(0)

  useEffect(() => {
    let vivo = true
    const revisar = async (alAbrir = false) => {
      if (!(await hayVersionNueva()) || !vivo) return
      if (alAbrir && !yaIntentoRecargar('auto')) { marcarRecarga('auto'); setCargando(true); setNueva(true); actualizarAhora(setProgreso); return }
      setNueva(true)
    }
    revisar(true)
    const reloj = setInterval(() => revisar(), CADA_MS)
    const alVolver = () => { if (document.visibilityState === 'visible') revisar() }
    document.addEventListener('visibilitychange', alVolver)
    window.addEventListener('online', alVolver)
    return () => { vivo = false; clearInterval(reloj); document.removeEventListener('visibilitychange', alVolver); window.removeEventListener('online', alVolver) }
  }, [])

  if (!nueva) return null
  // Aviso pequeño y discreto arriba. Al tocar, una barrita de progreso y la sesión se conserva.
  return (
    <div role="status" aria-live="polite" className="fixed inset-x-0 top-0 z-[60] px-3 pt-[calc(0.5rem+env(safe-area-inset-top))] flex justify-center pointer-events-none">
      <div className="pointer-events-auto w-full max-w-sm rounded-2xl bg-negro/95 text-hueso shadow-lg ring-1 ring-champagne/30 px-3 py-2">
        {cargando ? (
          <div className="space-y-1.5 py-1">
            <p className="text-sm text-champagne">Actualizando… tu sesión sigue abierta</p>
            <div className="h-1.5 rounded-full bg-white/15 overflow-hidden" role="progressbar" aria-valuenow={progreso} aria-valuemin={0} aria-valuemax={100}>
              <div className="h-full bg-champagne transition-all duration-300" style={{ width: `${progreso}%` }} />
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-[1fr_auto_auto] gap-2 items-center">
            <p className="text-sm leading-snug">Hay una versión nueva</p>
            <button onClick={() => setNueva(false)} aria-label="Cerrar aviso" className="h-10 w-10 rounded-xl text-hueso/70 text-lg active:bg-white/10">✕</button>
            <button onClick={() => { setCargando(true); actualizarAhora(setProgreso) }}
              className="h-10 px-4 rounded-xl bg-champagne text-negro text-sm font-semibold active:opacity-90">Actualizar</button>
          </div>
        )}
      </div>
    </div>
  )
}
