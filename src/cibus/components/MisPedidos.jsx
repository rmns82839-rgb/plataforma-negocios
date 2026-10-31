// Seguimiento del pedido para el cliente: en qué va (recibido, preparando, en camino, entregado) y volver a pedir lo mismo.
import EntregaCliente from './EntregaCliente'
import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { dinero, numero } from '../lib/formato'
import { etapaDe } from '../lib/etapaPedido'
import Modal from './Modal'

const fecha = (iso) => new Date(iso).toLocaleDateString('es-CO', { day: 'numeric', month: 'short' })

/** Los pedidos de quien tiene la sesión iniciada. Se vuelve a pedir cada 30 s mientras haya uno en camino. */
export function useMisPedidos(sesion) {
  const [lista, setLista] = useState([])
  const recargar = useCallback(async () => {
    if (!sesion) return setLista([])
    const { data, error } = await supabase.rpc('mis_pedidos')
    if (!error && Array.isArray(data)) setLista(data)           // sin migracion-v41: no se muestra nada
  }, [sesion])
  useEffect(() => { recargar() }, [recargar])
  const hayActivo = lista.some(p => etapaDe(p).activo)
  useEffect(() => {
    if (!hayActivo) return undefined
    const t = setInterval(() => { if (!document.hidden) recargar() }, 30000)
    return () => clearInterval(t)
  }, [hayActivo, recargar])
  return { lista, recargar }
}

/** Barra de avance: columnas iguales, el paso actual resaltado. */
export function Avance({ etapa }) {
  if (etapa.cancelado) return <p className="rounded-xl bg-red-50 text-red-700 text-base font-semibold px-3 py-2">Cancelado</p>
  return (
    <ol className="grid gap-1" style={{ gridTemplateColumns: `repeat(${etapa.pasos.length}, minmax(0, 1fr))` }} aria-label="Avance del pedido">
      {etapa.pasos.map((t, i) => (
        <li key={t} className="space-y-1 text-center">
          <span className={`block h-2 rounded-full ${i <= etapa.paso ? 'bg-emerald-500' : 'bg-slate-200'}`} />
          <span className={`block text-[13px] min-[400px]:text-sm leading-tight [overflow-wrap:normal] ${i === etapa.paso ? 'font-bold text-slate-900' : 'text-slate-500'}`}>{t}</span>
        </li>
      ))}
    </ol>
  )
}

/** Tarjeta de arriba: "Tu pedido N.º 45 · En camino". Solo aparece si hay uno en curso. */
export function TarjetaPedidoActivo({ lista, onAbrir }) {
  const p = lista.find(x => etapaDe(x).activo)
  if (!p) return null
  const e = etapaDe(p)
  return (
    <button onClick={onAbrir} className="w-full rounded-2xl bg-white px-4 py-3 shadow-sm ring-1 ring-emerald-400 text-left space-y-2 active:opacity-80">
      <span className="grid grid-cols-[1fr_auto] gap-3 items-center">
        <span className="text-base font-semibold text-slate-800 break-words">Tu pedido N.º {p.numero}: {e.texto}</span>
        <span className="text-sm font-semibold text-cibus">Ver ›</span>
      </span>
      <Avance etapa={e} />
    </button>
  )
}

function TarjetaPedido({ p, onPedirDeNuevo }) {
  const e = etapaDe(p)
  return (
    <li className="rounded-2xl bg-white ring-1 ring-slate-200 p-4 space-y-3">
      <div className="grid grid-cols-[1fr_auto] gap-3 items-baseline">
        <span className="text-lg font-bold text-slate-800">Pedido N.º {p.numero}</span>
        <span className="text-sm text-slate-500">{fecha(p.creado_en)}</span>
      </div>
      <Avance etapa={e} />
      <p className="text-base text-slate-700 break-words">{e.ayuda}</p>
      <ul className="text-base text-slate-700 space-y-0.5">
        {(p.items ?? []).map((it, i) => <li key={i} className="break-words">{numero(it.cantidad)}{it.unidad === 'und' ? '×' : ' ' + (it.unidad ?? '')} {it.nombre}</li>)}
      </ul>
      <p className="grid grid-cols-[1fr_auto] text-lg font-bold text-slate-800"><span>Total</span><span>{p.por_confirmar ? `${dinero(Number(p.total))} + domicilio` : dinero(Number(p.total))}</span></p>
      <EntregaCliente pedido={p} />
      <button onClick={() => onPedirDeNuevo(p)} className="w-full min-h-14 rounded-xl bg-negro text-champagne text-lg font-semibold active:opacity-90">Pedir lo mismo otra vez</button>
    </li>
  )
}

export function VentanaMisPedidos({ lista, productos, onRepetir, onCerrar, recargar }) {
  useEffect(() => { recargar() }, [recargar])
  const repetir = (p) => {
    const lineas = [], faltan = []
    for (const it of p.items ?? []) {
      const prod = productos.find(x => x.id === it.producto_id)
      if (prod && prod.disponible) lineas.push({ producto: prod, cantidad: Number(it.cantidad) }); else faltan.push(it.nombre)
    }
    onRepetir(lineas, faltan.length)
  }
  return (
    <Modal titulo="Mis pedidos" onCerrar={onCerrar}>
      {lista.length === 0 ? <p className="text-center text-base text-slate-500 py-6">Aquí verás tus pedidos y en qué van.</p> : (
        <ul className="space-y-3">{lista.map(p => <TarjetaPedido key={p.numero} p={p} onPedirDeNuevo={repetir} />)}</ul>
      )}
      <button onClick={onCerrar} className="w-full h-14 rounded-xl bg-slate-100 text-slate-600 text-base font-medium active:bg-slate-200">← Volver</button>
    </Modal>
  )
}

/** Para quien compró sin cuenta: con el número del pedido y su celular ve en qué va. */
export function SeguirPedido({ numero: n, telefono, onCerrar }) {
  const [p, setP] = useState(undefined)
  useEffect(() => {
    let vivo = true
    const cargar = () => supabase.rpc('estado_pedido', { p_numero: n, p_telefono: telefono }).then(({ data, error }) => { if (vivo) setP(error ? null : (data ?? null)) })
    cargar()
    const t = setInterval(() => { if (!document.hidden) cargar() }, 30000)
    return () => { vivo = false; clearInterval(t) }
  }, [n, telefono])
  const e = p ? etapaDe(p) : null
  return (
    <Modal titulo={`Pedido N.º ${n}`} onCerrar={onCerrar}>
      {p === undefined && <p className="text-center text-base text-slate-500 py-6">Consultando…</p>}
      {p === null && <p className="text-base text-slate-600 py-4">No pudimos consultar el estado. Escríbenos por WhatsApp y te contamos.</p>}
      {e && (
        <div className="space-y-4">
          <p className="text-2xl font-bold text-slate-800">{e.texto}</p>
          <Avance etapa={e} />
          <p className="text-base text-slate-700">{e.ayuda}</p>
          <p className="text-sm text-slate-500">Se actualiza solo cada 30 segundos.</p>
        </div>
      )}
      <button onClick={onCerrar} className="w-full h-14 rounded-xl bg-slate-100 text-slate-600 text-base font-medium active:bg-slate-200">← Volver</button>
    </Modal>
  )
}
