// «Producto agotado»: la venta se detiene hasta que el dueño autorice. Si se autoriza, el stock quedará en negativo.
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { pedirPermiso } from '../lib/autorizar'
import { claseInput } from '../lib/estilos'

const n = (x) => String(Math.round(x * 1000) / 1000).replace('.', ',')

export default function DialogoAgotado({ info, dueno, onAutorizado, onCerrar }) {
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [enviando, setEnviando] = useState(false)
  useEffect(() => {
    const tecla = (e) => { if (e.key === 'Escape') onCerrar() }
    window.addEventListener('keydown', tecla)
    return () => window.removeEventListener('keydown', tecla)
  }, [onCerrar])

  const quedaria = info.quedan - info.pides
  const autorizar = async () => {
    if (!dueno && !/^\d{4,8}$/.test(pin)) return setError('La clave del dueño tiene de 4 a 8 números')
    setEnviando(true); setError('')
    const r = await pedirPermiso(dueno ? null : pin)
    setEnviando(false)
    if (!r.ok) return setError(r.error)
    onAutorizado(r.autorizacion)
  }

  return createPortal(
    <div className="fixed inset-0 z-[95] grid place-items-center bg-black/55 p-5" onClick={onCerrar}>
      <div role="dialog" aria-modal="true" aria-labelledby="agotado-titulo" onClick={(e) => e.stopPropagation()}
           className="w-full max-w-sm bg-white rounded-3xl p-5 space-y-4 shadow-xl">
        <div className="space-y-1 text-center">
          <h2 id="agotado-titulo" className="text-lg font-bold text-red-600">Producto agotado</h2>
          <p className="text-sm text-slate-600 break-words">
            <strong>{info.nombre}</strong>: {info.quedan > 0 ? `solo quedan ${n(info.quedan)}` : 'no queda stock'} y pides {n(info.pides)}.
          </p>
        </div>
        <p className="rounded-2xl bg-red-50 py-3 px-3 text-center text-sm text-red-700">
          Si lo vendes, el stock quedará en <strong>{n(quedaria)}</strong>.
        </p>
        {dueno ? (
          <p className="text-xs text-slate-500 text-center">Solo tú puedes autorizar esta venta.</p>
        ) : (
          <div className="space-y-2">
            <p className="text-xs text-slate-500 text-center">Para venderlo, el dueño debe autorizar con su clave.</p>
            <input type="password" inputMode="numeric" autoComplete="off" maxLength={8} value={pin}
                   onChange={e => { setPin(e.target.value.replace(/\D/g, '')); setError('') }}
                   onKeyDown={e => { if (e.key === 'Enter') autorizar() }}
                   placeholder="Clave del dueño" className={`${claseInput} text-center tracking-widest`} />
          </div>
        )}
        {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
        <div className="grid grid-cols-2 gap-3">
          <button onClick={onCerrar} className="min-h-12 rounded-xl bg-white ring-1 ring-slate-200 text-slate-600 font-medium active:bg-slate-50">← Volver</button>
          <button onClick={autorizar} disabled={enviando}
                  className="min-h-12 rounded-xl bg-negro text-champagne font-semibold active:opacity-90 disabled:opacity-50">
            {enviando ? 'Autorizando…' : dueno ? 'Autorizar y vender' : 'Autorizar'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
