// Cuando el cliente entrega menos de lo que vale la venta: ¿con qué paga lo que falta?
// Botones del mismo tamaño en 3 columnas; la última fila se reparte completa.
import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { dinero } from '../lib/formato'

export default function DialogoResto({ recibido, falta, formas, nombreRecibido, detalle, onElegir, onCerrar }) {
  useEffect(() => {
    const tecla = (e) => { if (e.key === 'Escape') onCerrar() }
    window.addEventListener('keydown', tecla)
    return () => window.removeEventListener('keydown', tecla)
  }, [onCerrar])
  const n = formas.length
  const resto = n % 3
  return createPortal(
    <div className="fixed inset-0 z-[95] grid place-items-center bg-black/55 p-5" onClick={onCerrar}>
      <div role="dialog" aria-modal="true" aria-labelledby="resto-titulo" onClick={(e) => e.stopPropagation()}
           className="w-full max-w-sm bg-white rounded-3xl p-5 space-y-4 shadow-xl">
        <div className="space-y-1 text-center">
          <h2 id="resto-titulo" className="text-lg font-bold text-slate-800">¿Con qué paga el resto?</h2>
          <p className="text-sm text-slate-500">{detalle ?? `Entregó ${dinero(recibido)} en ${nombreRecibido}.`}</p>
        </div>
        <div className="rounded-2xl bg-red-50 py-3 text-center">
          <span className="block text-[11px] uppercase tracking-[0.18em] text-red-400">Falta</span>
          <span className="block text-3xl font-bold tabular-nums text-red-600">{dinero(falta)}</span>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {formas.map((f, i) => (
            <button key={f.id} onClick={() => onElegir(f.id)}
              style={i === n - 1 && resto !== 0 ? { gridColumn: `span ${4 - resto}` } : undefined}
              className="min-h-12 px-1 py-2 rounded-xl bg-slate-100 text-sm font-medium leading-tight text-slate-700 active:bg-negro active:text-champagne">
              {f.nombre}
            </button>
          ))}
        </div>
        <button onClick={onCerrar} className="w-full min-h-12 rounded-xl bg-white ring-1 ring-slate-200 text-slate-600 font-medium active:bg-slate-50">← Volver</button>
      </div>
    </div>,
    document.body
  )
}
