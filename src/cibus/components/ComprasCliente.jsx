import { useCallback, useEffect, useMemo, useState } from 'react'
import { coincide } from '../lib/buscar'
import { supabase } from '../lib/supabase'
import { dinero, numero } from '../lib/formato'
import { claseInput } from '../lib/estilos'
import { textoMetodo } from '../lib/pagos'
import { usePersistido, TREINTA_MIN } from '../lib/usePersistido'
import { rangoDe, hoyTexto } from '../lib/periodo'
import { numeroFactura } from '../lib/factura'

const PERIODOS = [
  { id: 'hoy', texto: 'Hoy' },
  { id: 'sem', texto: '7 días' },
  { id: 'mes', texto: '30 días' },
  { id: 'todo', texto: 'Todo' },
  { id: 'rango', texto: 'Rango' },
]
const LIMITE = 200
const fechaHora = (iso) => new Date(iso).toLocaleString('es-CO', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' })

// Todo lo que ha comprado un cliente: cada compra con fecha, hora y productos. Filtro por fechas y por producto.
export default function ComprasCliente({ cliente, estados }) {
  const base = `compras:${cliente.id}:`
  const [periodo, setPeriodo] = usePersistido(base + 'periodo', 'mes', true, TREINTA_MIN)
  const [desde, setDesde] = usePersistido(base + 'desde', hoyTexto(), true, TREINTA_MIN)
  const [hasta, setHasta] = usePersistido(base + 'hasta', hoyTexto(), true, TREINTA_MIN)
  const [texto, setTexto] = usePersistido(base + 'texto', '', true, TREINTA_MIN)
  const [ventas, setVentas] = useState(null)
  const [error, setError] = useState('')

  const cargar = useCallback(async () => {
    setVentas(null); setError('')
    const sel = 'id, numero, fecha, total, descuento, anulada, metodo, venta_items(id, nombre, cantidad, precio_unitario, descuento_linea), venta_pagos(metodo, monto)'
    let q = supabase.from('ventas').select(sel).eq('cliente_id', cliente.id).order('fecha', { ascending: false }).range(0, LIMITE - 1)
    if (periodo !== 'todo') {
      const r = rangoDe(periodo, desde, hasta)
      q = q.gte('fecha', r.desde)
      if (r.hasta) q = q.lt('fecha', r.hasta)
    }
    const { data, error: e } = await q
    if (e) return setError(e.message)
    setVentas(data ?? [])
  }, [cliente.id, periodo, desde, hasta])
  useEffect(() => { cargar() }, [cargar])

  const q = texto.trim()
  const visibles = useMemo(() => (ventas ?? []).filter(v => !q || v.venta_items.some(i => coincide([i.nombre], q))), [ventas, q])
  const validas = visibles.filter(v => !v.anulada)
  const total = validas.reduce((s, v) => s + Number(v.total), 0)
  // Qué debe y qué ya pagó de estas compras (solo si se sabe el estado de los fiados)
  const debeVenta = (v) => (estados?.get(v.id)?.debe ?? 0)
  const debe = validas.reduce((s, v) => s + Math.min(debeVenta(v), Number(v.total)), 0)

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-5 gap-1.5">
        {PERIODOS.map(p => (
          <button key={p.id} onClick={() => setPeriodo(p.id)}
            className={`h-10 rounded-lg text-[11px] font-medium ${periodo === p.id ? 'bg-negro text-champagne' : 'bg-slate-100 text-slate-600'}`}>{p.texto}</button>
        ))}
      </div>
      {periodo === 'rango' && (
        <div className="grid grid-cols-2 gap-2">
          <label className="space-y-1"><span className="text-[11px] text-slate-400">Desde</span>
            <input type="date" value={desde} max={hasta} onChange={e => setDesde(e.target.value)} className={claseInput} /></label>
          <label className="space-y-1"><span className="text-[11px] text-slate-400">Hasta</span>
            <input type="date" value={hasta} min={desde} onChange={e => setHasta(e.target.value)} className={claseInput} /></label>
        </div>
      )}
      <input value={texto} onChange={e => setTexto(e.target.value)} placeholder="Buscar un producto que haya comprado" className={claseInput} />

      {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
      {ventas === null && !error && <p className="text-center text-sm text-slate-400 py-4">Cargando…</p>}
      {ventas && (
        <>
          <div className="grid grid-cols-2 gap-2 text-center">
            <div className="rounded-xl bg-slate-50 py-2"><p className="text-lg font-bold">{validas.length}</p><p className="text-sm text-slate-500">compras</p></div>
            <div className="rounded-xl bg-slate-50 py-2"><p className="text-lg font-bold">{dinero(total)}</p><p className="text-sm text-slate-500">en total</p></div>
            {estados && (
              <>
                <div className="rounded-xl bg-orange-50 ring-1 ring-orange-200 py-2"><p className="text-lg font-bold text-orange-700">{dinero(debe)}</p><p className="text-sm text-orange-800">todavía debe</p></div>
                <div className="rounded-xl bg-emerald-50 ring-1 ring-emerald-200 py-2"><p className="text-lg font-bold text-emerald-700">{dinero(total - debe)}</p><p className="text-sm text-emerald-800">ya pagado</p></div>
              </>
            )}
          </div>
          {visibles.length === 0 ? (
            <p className="text-center text-sm text-slate-400 py-4">{q ? 'Ninguna compra tiene ese producto.' : 'No hay compras en este periodo.'}</p>
          ) : (
            <ul className="space-y-2">
              {visibles.map(v => (
                <li key={v.id} className={`rounded-xl ring-1 p-3 space-y-2 ${v.anulada ? 'ring-red-100 bg-red-50/40' : !estados ? 'ring-slate-100' : debeVenta(v) > 0 ? 'ring-orange-300 bg-orange-50/50 border-l-4 border-orange-400' : 'ring-emerald-200 bg-emerald-50/40 border-l-4 border-emerald-400'}`}>
                  <div className="grid grid-cols-[1fr_auto] gap-x-3 items-start">
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold">{fechaHora(v.fecha)}</span>
                      <span className="block text-xs text-slate-400">N.º {numeroFactura(v.numero)} · {(v.venta_pagos?.length ? v.venta_pagos.map(p => textoMetodo(p.metodo)) : [textoMetodo(v.metodo)]).join(' + ')}</span>
                    </span>
                    <span className={`text-sm font-bold tabular-nums ${v.anulada ? 'line-through text-slate-400' : ''}`}>{dinero(v.total)}</span>
                  </div>
                  {v.anulada && <p className="text-xs font-medium text-red-500">Venta anulada</p>}
                  {estados && !v.anulada && (
                    debeVenta(v) > 0
                      ? <p className="text-sm font-bold text-orange-700">DEBE {dinero(debeVenta(v))}{debeVenta(v) < Number(v.total) ? ` (de ${dinero(v.total)})` : ''}</p>
                      : <p className="text-sm font-bold text-emerald-700">{estados.get(v.id)?.fiado ? 'PAGADA · era fiado' : 'PAGADA'}</p>
                  )}
                  <ul className="space-y-0.5">
                    {v.venta_items.map(i => (
                      <li key={i.id} className="grid grid-cols-[1fr_auto] gap-x-3 text-xs text-slate-600">
                        <span className="min-w-0 break-words">{numero(i.cantidad)}× {i.nombre}</span>
                        <span className="tabular-nums">{dinero(Math.round(Number(i.precio_unitario) * Number(i.cantidad)) - Number(i.descuento_linea ?? 0))}</span>
                      </li>
                    ))}
                    {Number(v.descuento) > 0 && <li className="grid grid-cols-[1fr_auto] text-xs text-marca"><span>Descuento</span><span>− {dinero(v.descuento)}</span></li>}
                  </ul>
                </li>
              ))}
            </ul>
          )}
          {ventas.length >= LIMITE && <p className="text-[11px] text-slate-400 text-center">Se muestran las últimas {LIMITE} compras. Acota las fechas para ver otras.</p>}
        </>
      )}
    </div>
  )
}
