// Ventana de confirmación (ver lib/confirmar.js). Dos botones del mismo tamaño; Escape o tocar fuera = cancelar.
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { registrarConfirmar } from '../lib/confirmar'

export default function DialogoConfirmar() {
  const [op, setOp] = useState(null)
  useEffect(() => registrarConfirmar((o) => setOp(prev => { prev?.resolver(false); return o })), [])

  const cerrar = (valor) => { op?.resolver(valor); setOp(null) }
  useEffect(() => {
    if (!op) return undefined
    const tecla = (e) => { if (e.key === 'Escape') cerrar(false) }
    window.addEventListener('keydown', tecla)
    return () => window.removeEventListener('keydown', tecla)
  })
  if (!op) return null

  return createPortal(
    <div className="fixed inset-0 z-[95] grid place-items-center bg-black/55 p-5" onClick={(e) => { e.stopPropagation(); cerrar(false) }}>
      <div role="alertdialog" aria-modal="true" aria-labelledby="confirmar-titulo"
           onClick={(e) => e.stopPropagation()}
           className="w-full max-w-sm bg-white rounded-3xl p-5 space-y-4 shadow-xl">
        <div className="space-y-1 text-center">
          <h2 id="confirmar-titulo" className="text-lg font-bold text-slate-800">{op.titulo}</h2>
          {op.texto && <p className="text-sm text-slate-500">{op.texto}</p>}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <button autoFocus onClick={() => cerrar(false)} className="min-h-12 rounded-xl bg-slate-100 text-slate-700 font-medium active:bg-slate-200">{op.no ?? 'Cancelar'}</button>
          <button onClick={() => cerrar(true)} className="min-h-12 rounded-xl bg-red-500 text-white font-semibold active:bg-red-600">{op.si ?? 'Sí, quitar'}</button>
        </div>
      </div>
    </div>,
    document.body
  )
}
