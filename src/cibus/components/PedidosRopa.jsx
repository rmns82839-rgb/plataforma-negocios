// Pedidos que los clientes envían desde /ropa. Desde aquí se atienden: "Registrar venta" descuenta stock y crea la factura.
import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import BarraFija from './BarraFija'
import { dinero } from '../lib/formato'
import VentaRopa from './VentaRopa'
import { confirmar } from '../lib/confirmar'

const ESTADOS = [
  { id: 'pendiente', texto: 'Pendientes' },
  { id: 'vendido', texto: 'Vendidos' },
  { id: 'cancelado', texto: 'Cancelados' },
]

const hace = (iso) => {
  const m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000))
  if (m < 1) return 'ahora'
  if (m < 60) return `hace ${m} min`
  if (m < 1440) return `hace ${Math.round(m / 60)} h`
  return new Date(iso).toLocaleDateString('es-CO', { day: 'numeric', month: 'short' })
}

export default function PedidosRopa({ onCambio }) {
  const [estado, setEstado] = useState('pendiente')
  const [lista, setLista] = useState([])
  const [cuentas, setCuentas] = useState({})
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [vender, setVender] = useState(null)

  const cargar = useCallback(async () => {
    setCargando(true)
    const { data, error: err } = await supabase.from('pedidos_ropa').select('*, pedido_ropa_items(*)')
      .eq('estado', estado).order('creado_en', { ascending: false }).range(0, 99)
    if (err) setError(/relation .*pedidos_ropa|schema cache|does not exist/i.test(err.message) ? 'Falta ejecutar migracion-v11.sql en Supabase.' : err.message)
    else setError('')
    setLista(data ?? [])
    const { data: todos } = await supabase.from('pedidos_ropa').select('estado').range(0, 999)
    const c = {}
    for (const x of todos ?? []) c[x.estado] = (c[x.estado] ?? 0) + 1
    setCuentas(c); onCambio?.(c.pendiente ?? 0)
    setCargando(false)
  }, [estado, onCambio])
  useEffect(() => { cargar() }, [cargar])

  const cancelar = async (p) => {
    if (!(await confirmar({ titulo: `¿Cancelar el pedido N.º ${p.numero}?`, texto: 'No descuenta stock.', si: 'Sí, cancelar' }))) return
    const { error: err } = await supabase.from('pedidos_ropa').update({ estado: 'cancelado' }).eq('id', p.id)
    if (err) return setError(err.message)
    cargar()
  }

  return (
    <div className="space-y-4">
      <BarraFija nivel={4}>
      <div className="grid grid-cols-3 gap-2">
        {ESTADOS.map(e => (
          <button key={e.id} onClick={() => setEstado(e.id)}
            className={`h-10 rounded-xl text-xs font-medium ${estado === e.id ? 'bg-marca text-white' : 'bg-white text-slate-600 shadow-sm'}`}>
            {e.texto}{cuentas[e.id] ? ` (${cuentas[e.id]})` : ''}
          </button>
        ))}
      </div>
      </BarraFija>

      {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}

      {cargando ? (
        <p className="text-center text-sm text-slate-400 py-8">Cargando…</p>
      ) : lista.length === 0 ? (
        <p className="text-center text-sm text-slate-400 py-8">
          {estado === 'pendiente' ? 'No hay pedidos pendientes. Llegan cuando un cliente envía su pedido desde /ropa.' : 'Nada por aquí.'}
        </p>
      ) : (
        <ul className="grid gap-3 lg:grid-cols-2 lg:[&>li:last-child:nth-child(odd)]:col-span-2">
          {lista.map(p => {
            const tel = (p.telefono ?? '').replace(/\D/g, '')
            const wa = tel ? `https://wa.me/${tel.length === 10 ? '57' + tel : tel}?text=${encodeURIComponent(`Hola ${p.nombre ?? ''}, te escribimos por tu pedido N.º ${p.numero}.`)}` : null
            return (
              <li key={p.id} className="bg-white rounded-2xl shadow-sm p-4 space-y-3">
                <div className="grid grid-cols-[1fr_auto] gap-3 items-start">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold break-words">Pedido N.º {p.numero}{p.nombre ? ` · ${p.nombre}` : ''}</p>
                    <p className="text-xs text-slate-400">{hace(p.creado_en)}{p.telefono ? ` · ${p.telefono}` : ''}</p>
                    {p.entrega !== 'recoger' && p.direccion && <p className="text-xs text-slate-400 break-words">{p.direccion}</p>}
                    <p className="pt-1">
                      <span className={`inline-block text-[11px] font-semibold px-2.5 py-0.5 rounded-full ${p.entrega === 'recoger' ? 'bg-oro/20 text-oro-oscuro' : 'bg-marca text-champagne'}`}>
                        {p.entrega === 'recoger' ? 'Recoge en tienda' : 'A domicilio'}
                      </span>
                    </p>
                  </div>
                  <p className="text-base font-bold">{dinero(p.total)}</p>
                </div>
                <ul className="text-sm text-slate-600 space-y-0.5">
                  {p.pedido_ropa_items.map(it => (
                    <li key={it.id} className="grid grid-cols-[1fr_auto] gap-2">
                      <span className="min-w-0">{it.cantidad}× {it.nombre} ({it.talla}{it.color ? `, ${it.color}` : ''}){it.promo ? <span className="text-xs text-oro-oscuro"> · {it.promo}</span> : null}</span>
                      <span className="text-sm text-slate-800 tabular-nums">{dinero(Math.round(Number(it.precio_unitario) * Number(it.cantidad)) - Number(it.descuento ?? 0))}</span>
                    </li>
                  ))}
                </ul>
                <div className="border-t border-slate-100 pt-2 space-y-0.5 text-xs text-slate-500">
                  {(p.entrega === 'recoger' || Number(p.domicilio) > 0) && (
                    <>
                      <p className="grid grid-cols-[1fr_auto]"><span>Prendas</span><span>{dinero(Number(p.total) - Number(p.domicilio ?? 0))}</span></p>
                      <p className="grid grid-cols-[1fr_auto]"><span>Domicilio</span><span>{p.entrega === 'recoger' ? 'No aplica' : dinero(p.domicilio)}</span></p>
                    </>
                  )}
                  <p className="grid grid-cols-[1fr_auto] text-sm font-bold text-slate-800"><span>Total</span><span>{dinero(p.total)}</span></p>
                </div>
                {p.estado === 'pendiente' && (
                  <div className="grid grid-cols-3 gap-2">
                    {wa
                      ? <a href={wa} target="_blank" rel="noopener noreferrer" className="h-11 rounded-xl bg-slate-100 text-slate-600 text-xs font-medium grid place-items-center">WhatsApp</a>
                      : <span className="h-11 rounded-xl bg-slate-50 text-slate-300 text-xs font-medium grid place-items-center">Sin teléfono</span>}
                    <button onClick={() => cancelar(p)} className="h-11 rounded-xl bg-red-50 text-red-600 text-xs font-medium">Cancelar</button>
                    <button onClick={() => setVender(p)} className="h-11 rounded-xl bg-marca text-white text-xs font-semibold active:bg-marca-oscuro">Registrar venta</button>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}

      {vender && <VentaRopa pedido={vender} onCerrar={() => setVender(null)} onVendido={cargar} />}
    </div>
  )
}
