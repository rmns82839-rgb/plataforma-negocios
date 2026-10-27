// Pedidos a domicilio: quién espera qué, a dónde, y en qué estado va.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { dinero, fechaHora } from '../lib/formato'
import { numeroFactura } from '../lib/factura'
import { useConfig } from '../lib/config'
import BarraFija from './BarraFija'

const ESTADOS = [
  { id: 'pendiente', texto: 'Pendientes' },
  { id: 'en_camino', texto: 'En camino' },
  { id: 'entregado', texto: 'Entregados' },
  { id: 'todos', texto: 'Todos' },
]
const ETIQUETA = { pendiente: 'Pendiente', en_camino: 'En camino', entregado: 'Entregado', cancelado: 'Cancelado' }
const COLOR = {
  pendiente: 'bg-champagne/30 text-oro-oscuro', en_camino: 'bg-lima/20 text-marca',
  entregado: 'bg-esmeralda/10 text-esmeralda', cancelado: 'bg-slate-100 text-slate-500',
}

export default function Domicilios() {
  useConfig()   // (para que el prefijo de la factura esté cargado)
  const [lista, setLista] = useState([])
  const [filtro, setFiltro] = useState('pendiente')
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [trabajando, setTrabajando] = useState('')

  const cargar = useCallback(async () => {
    const { data, error: err } = await supabase.from('ventas')
      .select('id, numero, fecha, total, nota, dom_direccion, dom_telefono, dom_costo, dom_estado, dom_entregado_en, clientes(nombre, telefono)')
      .eq('domicilio', true).eq('anulada', false).order('fecha', { ascending: false }).range(0, 199)
    if (err) setError(/domicilio|column|schema cache/i.test(err.message) ? 'Falta ejecutar migracion-v9.sql en Supabase.' : err.message)
    setLista(data ?? [])
    setCargando(false)
  }, [])
  useEffect(() => { cargar() }, [cargar])

  const visibles = useMemo(() => lista.filter(v => filtro === 'todos' || v.dom_estado === filtro), [lista, filtro])
  const cuenta = (id) => lista.filter(v => v.dom_estado === id).length

  const mover = async (v, estado) => {
    setTrabajando(v.id); setError('')
    const { error: err } = await supabase.rpc('cambiar_estado_domicilio', { p_venta_id: v.id, p_estado: estado })
    setTrabajando('')
    if (err) return setError(err.message)
    cargar()
  }

  return (
    <div className="space-y-4">
      <BarraFija>
      <div className="grid grid-cols-4 gap-2">
        {ESTADOS.map(e => (
          <button key={e.id} onClick={() => setFiltro(e.id)}
            className={`h-10 rounded-xl text-xs font-medium ${filtro === e.id ? 'bg-marca text-white' : 'bg-white text-slate-600 shadow-sm'}`}>
            {e.texto}{e.id !== 'todos' && e.id !== 'entregado' ? ` (${cuenta(e.id)})` : ''}
          </button>
        ))}
      </div>
      </BarraFija>

      {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}

      {cargando ? (
        <p className="text-center text-sm text-slate-400 py-8">Cargando…</p>
      ) : visibles.length === 0 ? (
        <p className="text-center text-sm text-slate-400 py-8">No hay domicilios {filtro === 'todos' ? '' : 'en este estado'}.</p>
      ) : (
        <ul className="grid gap-3 lg:grid-cols-2 lg:[&>li:last-child:nth-child(odd)]:col-span-2">
          {visibles.map(v => {
            const tel = (v.dom_telefono || v.clientes?.telefono || '').replace(/\D/g, '')
            return (
              <li key={v.id} className="bg-white rounded-2xl shadow-sm p-4 space-y-3">
                <div className="grid grid-cols-[1fr_auto] gap-3 items-start">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold break-words">N.º {numeroFactura(v.numero)}{v.clientes?.nombre ? ` · ${v.clientes.nombre}` : ''}</p>
                    <p className="text-xs text-slate-400">{fechaHora(v.fecha)}</p>
                  </div>
                  <span className={`text-[11px] font-medium rounded-full px-2.5 py-1 ${COLOR[v.dom_estado] ?? COLOR.pendiente}`}>
                    {ETIQUETA[v.dom_estado] ?? v.dom_estado}
                  </span>
                </div>
                <p className="text-sm">{v.dom_direccion}</p>
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div className="rounded-xl bg-slate-50 px-3 py-2"><p className="text-slate-400">Total a cobrar</p><p className="text-base font-bold">{dinero(v.total)}</p></div>
                  <div className="rounded-xl bg-slate-50 px-3 py-2"><p className="text-slate-400">Costo del envío</p><p className="text-base font-bold">{dinero(v.dom_costo)}</p></div>
                </div>
                {v.nota && <p className="text-xs text-slate-500">Nota: {v.nota}</p>}
                <div className="grid grid-cols-2 gap-2">
                  {tel ? (
                    <a href={`https://wa.me/57${tel}`} target="_blank" rel="noreferrer"
                       className="h-11 rounded-xl bg-lima/20 text-marca text-sm font-semibold grid place-items-center">WhatsApp</a>
                  ) : <span className="h-11 rounded-xl bg-slate-50 text-slate-300 text-sm grid place-items-center">Sin teléfono</span>}
                  {v.dom_estado === 'pendiente' && (
                    <button disabled={trabajando === v.id} onClick={() => mover(v, 'en_camino')}
                      className="h-11 rounded-xl bg-negro text-champagne text-sm font-semibold disabled:opacity-40 active:opacity-90">Salió a entregar</button>
                  )}
                  {v.dom_estado === 'en_camino' && (
                    <button disabled={trabajando === v.id} onClick={() => mover(v, 'entregado')}
                      className="h-11 rounded-xl bg-esmeralda text-white text-sm font-semibold disabled:opacity-40 active:opacity-90">Marcar entregado</button>
                  )}
                  {v.dom_estado === 'entregado' && (
                    <button disabled={trabajando === v.id} onClick={() => mover(v, 'pendiente')}
                      className="h-11 rounded-xl bg-slate-100 text-slate-600 text-sm font-medium disabled:opacity-40">‹ Volver a pendiente</button>
                  )}
                </div>
                {v.dom_estado === 'en_camino' && (
                  <button disabled={trabajando === v.id} onClick={() => mover(v, 'pendiente')}
                    className="w-full h-10 rounded-xl bg-slate-100 text-slate-600 text-xs font-medium disabled:opacity-40">‹ Volver a pendiente</button>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
