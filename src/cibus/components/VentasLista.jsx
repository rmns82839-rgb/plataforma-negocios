import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { dinero, numero, fechaHora } from '../lib/formato'
import { claseInput } from '../lib/estilos'
import { textoMetodo } from '../lib/pagos'
import { coincide } from '../lib/buscar'
import Modal, { Campo } from './Modal'
import Factura from './Factura'
import { numeroFactura, subtotalVenta } from '../lib/factura'
import { useDueno } from '../context/rol'
import BarraFija from './BarraFija'

// Lista de ventas del periodo. Desde aquí el dueño puede anular una venta (con motivo).
export default function VentasLista({ rango }) {
  const dueno = useDueno()
  const [ventas, setVentas] = useState([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [texto, setTexto] = useState('')
  const [abierta, setAbierta] = useState(null)
  const [anulando, setAnulando] = useState(false)
  const [motivo, setMotivo] = useState('')
  const [errorAnular, setErrorAnular] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [facturaId, setFacturaId] = useState(null)

  const cargar = useCallback(async () => {
    setCargando(true); setError('')
    let q = supabase.from('ventas')
      .select('*, clientes(nombre, documento), venta_items(nombre, cantidad, precio_unitario, descuento_linea, promo), venta_pagos(metodo, monto)')
      .gte('fecha', rango.desde)
    if (rango.hasta) q = q.lt('fecha', rango.hasta)
    const { data, error: err } = await q.order('fecha', { ascending: false }).range(0, 999)
    if (err) setError(err.message)
    setVentas(data ?? [])
    setCargando(false)
  }, [rango])
  useEffect(() => { cargar() }, [cargar])

  const visibles = ventas.filter(v => coincide(
    [numeroFactura(v.numero), String(v.numero), textoMetodo(v.metodo), v.clientes?.nombre, v.clientes?.documento, v.nota, ...v.venta_items.map(i => i.nombre)], texto))
  const validas = visibles.filter(v => !v.anulada)
  const total = validas.reduce((s, v) => s + Number(v.total), 0)

  const abrir = (v) => { setAbierta(v); setAnulando(false); setMotivo(''); setErrorAnular('') }

  const anular = async () => {
    if (motivo.trim().length < 3) return setErrorAnular('Escribe el motivo de la anulación')
    setEnviando(true); setErrorAnular('')
    const { error: err } = await supabase.rpc('anular_venta', { p_venta_id: abierta.id, p_motivo: motivo })
    setEnviando(false)
    if (err) return setErrorAnular(err.message)
    setAbierta(null)
    cargar()
  }

  return (
    <div className="space-y-4">
      <BarraFija nivel={3.75}>
      <div className="bg-white rounded-2xl shadow-sm p-4 grid grid-cols-2 gap-3">
        <div>
          <p className="text-xs text-slate-400">Ventas</p>
          <p className="text-2xl font-bold">{validas.length}</p>
        </div>
        <div className="text-right">
          <p className="text-xs text-slate-400">Total</p>
          <p className="text-2xl font-bold text-marca">{dinero(total)}</p>
        </div>
      </div>

      <input value={texto} onChange={e => setTexto(e.target.value)}
             placeholder="Buscar cliente, producto o pago" className={claseInput} />
      </BarraFija>

      {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}

      {cargando ? (
        <p className="text-center text-sm text-slate-400 py-8">Cargando…</p>
      ) : visibles.length === 0 ? (
        <p className="text-center text-sm text-slate-400 py-8">No hay ventas {texto.trim() ? 'con esa búsqueda' : 'en este periodo'}</p>
      ) : (
        <ul className="bg-white rounded-2xl shadow-sm divide-y divide-slate-100">
          {visibles.map(v => (
            <li key={v.id}>
              <button onClick={() => abrir(v)}
                className="w-full min-h-14 px-4 py-2 grid grid-cols-[1fr_auto] gap-3 items-center text-left active:bg-slate-50">
                <div className="min-w-0">
                  <p className={`text-sm font-medium break-words ${v.anulada ? 'text-slate-400 line-through' : ''}`}>
                    N.º {numeroFactura(v.numero)} · {textoMetodo(v.metodo)}{v.clientes?.nombre ? ` · ${v.clientes.nombre}` : ''}
                  </p>
                  <p className="text-xs text-slate-400 break-words">
                    {fechaHora(v.fecha)} · {v.venta_items.length} {v.venta_items.length === 1 ? 'producto' : 'productos'}
                    {v.anulada && <span className="text-red-500 font-medium"> · Anulada</span>}
                  </p>
                  {v.nota && <p className="text-xs font-medium text-red-600 break-words">Nota: {v.nota}</p>}
                </div>
                <span className={`text-sm font-semibold ${v.anulada ? 'text-slate-300 line-through' : ''}`}>
                  {dinero(v.total)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {abierta && (
        <Modal titulo="Detalle de la venta" onCerrar={() => setAbierta(null)}>
          <div className="grid grid-cols-2 gap-3 items-end">
            <div>
              <p className="text-xs text-slate-400">N.º {numeroFactura(abierta.numero)} · {fechaHora(abierta.fecha)}</p>
              <p className="text-sm font-medium">
                {textoMetodo(abierta.metodo)}{abierta.clientes?.nombre ? ` · ${abierta.clientes.nombre}` : ''}
              </p>
            </div>
            <p className="text-2xl font-bold text-marca text-right">{dinero(abierta.total)}</p>
          </div>

          <ul className="divide-y divide-slate-100">
            {abierta.venta_items.map((it, i) => (
              <li key={i} className="py-2 grid grid-cols-[1fr_auto] gap-3 text-sm">
                <span className="break-words">{numero(it.cantidad)} × {it.nombre}{it.promo ? ` · ${it.promo}` : ''}</span>
                <span className="font-semibold">{dinero(Math.round(it.precio_unitario * it.cantidad) - Number(it.descuento_linea || 0))}</span>
              </li>
            ))}
          </ul>

          {(abierta.venta_pagos ?? []).length > 1 && (
            <div className="space-y-1 text-sm text-slate-500">
              {abierta.venta_pagos.map((p, i) => (
                <p key={i} className="flex justify-between"><span>{textoMetodo(p.metodo)}</span><span>{dinero(p.monto)}</span></p>
              ))}
            </div>
          )}

          {abierta.nota && (
            <p className="text-sm font-medium text-red-600 bg-red-50 rounded-lg px-3 py-2 break-words">Nota: {abierta.nota}</p>
          )}

          {abierta.domicilio && (
            <p className="text-sm text-slate-500">Domicilio ({abierta.dom_estado?.replace('_', ' ')}): {abierta.dom_direccion} · envío {dinero(abierta.dom_costo)}</p>
          )}

          {Number(abierta.descuento) > 0 && (
            <div className="space-y-1 text-sm text-slate-500">
              <p className="flex justify-between"><span>Subtotal</span><span>{dinero(subtotalVenta(abierta))}</span></p>
              <p className="flex justify-between"><span>Descuento</span><span>− {dinero(abierta.descuento)}</span></p>
            </div>
          )}

          <button onClick={() => setFacturaId(abierta.id)}
            className="w-full h-12 rounded-xl bg-lima/20 text-marca font-semibold active:bg-lima/30">
            Ver e imprimir factura
          </button>

          {abierta.anulada ? (
            <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">
              Anulada el {fechaHora(abierta.anulada_en)}{abierta.anulada_por ? ` por ${abierta.anulada_por}` : ''}. Motivo: {abierta.motivo_anulacion}
            </p>
          ) : anulando ? (
            <div className="space-y-3">
              <Campo etiqueta="Motivo de la anulación">
                <input autoFocus value={motivo} onChange={e => setMotivo(e.target.value)}
                       placeholder="Error de cobro, devolución…" className={claseInput} />
              </Campo>
              <p className="text-xs text-slate-400">
                Se devuelven las unidades al stock{abierta.metodo === 'fiado' ? ' y se quita la deuda del cliente' : ''}.
              </p>
              {errorAnular && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{errorAnular}</p>}
              <div className="grid grid-cols-2 gap-3">
                <button onClick={() => setAnulando(false)}
                  className="h-12 rounded-xl bg-slate-100 text-slate-600 font-medium">Cancelar</button>
                <button onClick={anular} disabled={enviando}
                  className="h-12 rounded-xl bg-red-500 text-white font-semibold disabled:opacity-40 active:bg-red-600">
                  {enviando ? 'Anulando…' : 'Anular venta'}
                </button>
              </div>
            </div>
          ) : dueno === true ? (
            <button onClick={() => setAnulando(true)}
              className="w-full h-12 rounded-xl bg-red-50 text-red-600 font-semibold active:bg-red-100">
              Anular esta venta
            </button>
          ) : (
            <p className="text-xs text-slate-400 text-center">Solo el dueño puede anular una venta.</p>
          )}
        </Modal>
      )}

      {facturaId && <Factura ventaId={facturaId} onCerrar={() => setFacturaId(null)} />}
    </div>
  )
}
