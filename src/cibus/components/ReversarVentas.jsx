// Reversar una venta: vuelve a la caja (stock y deuda se devuelven y sus productos regresan al carrito).
// El cajero ve sus últimas 5 ventas; el dueño ve las últimas 20 de todos.
import { useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '../lib/supabase'
import { dinero } from '../lib/formato'
import { confirmar } from '../lib/confirmar'
import { numeroFactura } from '../lib/factura'
import { cantidadTexto } from '../lib/cantidadVenta'
import Miniatura from './Miniatura'

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
        <div className="overflow-y-auto overscroll-contain space-y-3">
          {ventas === null && <p className="text-center text-sm text-slate-400 py-6">Cargando…</p>}
          {ventas?.length === 0 && !error && <p className="text-center text-sm text-slate-400 py-6">No hay ventas para reversar.</p>}
          {ventas?.map((v, n) => (
            <div key={v.id} className={`p-3 space-y-3 rounded-2xl border-l-8 ring-1 ${n % 2 === 0 ? 'bg-white border-slate-400 ring-slate-200' : 'bg-amber-50 border-amber-400 ring-amber-200'}`}>
              <div className="grid grid-cols-[1fr_auto] items-start gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-800">{numeroFactura(v.numero)}</p>
                  <p className="text-xs text-slate-500">{hora(v.fecha)}</p>
                </div>
                <p className="text-base font-bold tabular-nums text-marca">{dinero(v.total)}</p>
              </div>
              {Array.isArray(v.items) && v.items.length > 0 ? (
                <ul className="space-y-2">
                  {v.items.map((it, i) => {
                    const c = cantidadTexto(it)
                    return (
                      <li key={i} className="grid grid-cols-[auto_1fr_auto] items-center gap-3">
                        <Miniatura producto={{ nombre: it.nombre, imagenes: it.imagenes }} tam="h-12 w-12" />
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-slate-800 break-words leading-snug">{it.nombre}</p>
                          <p className="text-xs text-slate-500">
                            <span className="font-semibold text-slate-700">{c.principal}</span>{c.extra ? ` · ${c.extra}` : ''} · a {dinero(it.precio)}
                          </p>
                        </div>
                        <p className="text-sm font-semibold tabular-nums text-slate-700">{dinero(it.total)}</p>
                      </li>
                    )
                  })}
                </ul>
              ) : (
                v.resumen && <p className="text-xs text-slate-500 break-words">{v.resumen}</p>
              )}
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
