// Hoja inferior reutilizable (se ve como modal en móvil)
// Se dibuja en el <body> para que ninguna barra fija (encabezado, menú inferior) la tape.
import { createPortal } from 'react-dom'

export default function Modal({ titulo, onCerrar, children, ancho = 'max-w-md' }) {
  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center bg-black/50"
         onClick={onCerrar}>
      <div
        className={`w-full ${ancho} max-h-[88vh] max-h-[88dvh] overflow-y-auto overscroll-contain bg-white rounded-t-3xl sm:rounded-3xl px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] space-y-4`}
        onClick={e => e.stopPropagation()}
      >
        <div className="sticky top-0 z-10 -mx-5 px-5 py-3 bg-white/95 backdrop-blur flex items-center justify-between gap-3">
          <h2 className="text-lg font-bold text-marca min-w-0">{titulo}</h2>
          <button onClick={onCerrar} className="h-10 w-10 shrink-0 rounded-full bg-slate-100 text-slate-500">✕</button>
        </div>
        {children}
      </div>
    </div>,
    document.body
  )
}

export function Campo({ etiqueta, children }) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-medium text-slate-500">{etiqueta}</span>
      {children}
    </label>
  )
}
