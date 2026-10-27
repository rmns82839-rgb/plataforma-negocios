// Lo de arriba de cada pantalla (botones, buscador, filtros) se queda fijo debajo de la cabecera mientras se baja por la lista.
// nivel: rem que ya ocupa otra barra fija de arriba (p. ej. 3.75 bajo el selector de fechas, 4 bajo las pestañas de Ropa).
import { useState } from 'react'

export default function BarraFija({ children, nivel = 0 }) {
  return (
    <div style={{ top: `calc(3.5rem + 1px + env(safe-area-inset-top) + ${nivel}rem)` }}
         className="sticky z-20 -mx-4 lg:-mx-8 px-4 lg:px-8 pt-2 pb-2.5 bg-fondo/95 backdrop-blur-sm space-y-2 border-b border-transparent [&:not(:first-child)]:shadow-none">
      {children}
    </div>
  )
}

/** Bloque que se abre y se cierra (cerrado por defecto) para ocupar menos pantalla. */
export function Desplegable({ titulo, nota, abierto = false, children }) {
  const [on, setOn] = useState(abierto)
  return (
    <section className="bg-white rounded-2xl shadow-sm overflow-hidden">
      <button onClick={() => setOn(o => !o)} aria-expanded={on}
        className="w-full min-h-12 px-4 py-2 grid grid-cols-[1fr_auto] gap-3 items-center text-left active:bg-slate-50">
        <span className="min-w-0">
          <span className="block text-sm font-semibold leading-snug break-words">{titulo}</span>
          {nota && <span className="block text-[11px] text-slate-400 leading-snug break-words">{nota}</span>}
        </span>
        <span className={`text-slate-400 transition-transform duration-200 ${on ? 'rotate-90' : ''}`} aria-hidden="true">›</span>
      </button>
      {on && <div className="px-4 pb-4 space-y-3">{children}</div>}
    </section>
  )
}
