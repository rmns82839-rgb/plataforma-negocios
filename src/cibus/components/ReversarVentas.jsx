// Reversar una venta: vuelve a la caja (stock y deuda se devuelven y sus productos regresan al carrito).
// El cajero ve sus últimas 5 ventas; el dueño ve las últimas 20 de todos.
import { useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '../lib/supabase'
import { dinero } from '../lib/formato'
import { confirmar } from '../lib/confirmar'
import { numeroFactura } from '../lib/factura'

const hora = (f) => new Date(f).toLocaleString('es-CO', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })

export default function ReversarVentas({ dueno, onReversada, onCerrar }) {
  const [ventas, setVentas] = useState(null)
  const [error, setError] = useState('')
  const [trabajando, setTrabajando] = useState(null)

  const cargar = useCallback(async () => {
    const { data, error: e } = await supabase.rpc('ventas_recientes', { p_limite: dueno ? 20 : 5 })
    if (e) { setError(/ventas_recientes|schema cache|Could not find/i.test(e.message) ? 'Falta ejecutar 53-reversar-agotados.sql en Supabase.' : e.message); setVentas([]); return }
    setVentas(data ?? [])
  }, [dueno])
  useEffect(() => { cargar() }, [cargar])
  useEffect(() => {
    const tecla = (e) => { if (e.key === 'Escape') onCerrar() }
    window.addEventListener('keydown', tecla)
    return () => window.removeEventListener('keydown', tecla)
  }, [onCerrar])

  const reversar = async (v) => {
    if (!(await confirmar({ titulo: `¿Reversar la factura ${numeroFactura(v.numero)}?`, texto: `${dinero(v.total)} · el dinero y el stock se devuelven y los productos vuelven a la caja para cobrarlos de nuevo.`, si: 'Sí, reversar' }))) return
    setTrabajando(v.id); setError('')
    const { data, error: e } = await supabase.rpc('reversar_venta', { p_venta_id: v.id })
    setTrabajando(null)
    if (e) return setError(e.message)
    onReversada(data)
  }

  return createPortal(
    <div className="fixed inset-0 z-[95] grid place-items-center bg-black/55 p-4" onClick={onCerrar}>
      <div role="dialog" aria-modal="true" aria-labelledby="rev-titulo" onClick={(e) => e.stopPropagation()}
           className="w-full max-w-md max-h-[85vh] flex flex-col bg-white rounded-3xl p-5 gap-3 shadow-xl">
        <div className="text-center space-y-1">
          <h2 id="rev-titulo" className="text-lg font-bold text-slate-800">Reversar una venta</h2>
          <p className="text-xs text-slate-500">{dueno ? 'Las últimas 20 ventas. Para una más antigua, búscala en Ventas.' : 'Tus últimas 5 ventas. Para otra, pídele al dueño.'}</p>
        </div>
        {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2 break-words">{error}</p>}
        <div className="overflow-y-auto overscroll-contain divide-y divide-slate-100 rounded-2xl ring-1 ring-slate-100">
          {ventas === null && <p className="text-center text-sm text-slate-400 py-6">Cargando…</p>}
          {ventas?.length === 0 && !error && <p className="text-center text-sm text-slate-400 py-6">No hay ventas para reversar.</p>}
          {ventas?.map(v => (
            <div key={v.id} className="p-3 space-y-2">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-800">{numeroFactura(v.numero)} · {hora(v.fecha)}</p>
                  <p className="text-xs text-slate-500 break-words">{v.resumen}</p>
                </div>
                <p className="text-sm font-bold tabular-nums text-marca shrink-0">{dinero(v.total)}</p>
              </div>
              <button onClick={() => reversar(v)} disabled={trabajando !== null}
                      className="w-full min-h-11 rounded-xl bg-negro text-champagne text-sm font-semibold active:opacity-90 disabled:opacity-50">
                {trabajando === v.id ? 'Reversando…' : '↩️ Reversar a la caja'}
              </button>
            </div>
          ))}
        </div>
        <button onClick={onCerrar} className="w-full min-h-12 rounded-xl bg-white ring-1 ring-slate-200 text-slate-600 font-medium active:bg-slate-50">← Volver</button>
      </div>
    </div>,
    document.body
  )
}
