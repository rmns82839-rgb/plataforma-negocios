// En cada pedido a domicilio: quién lo lleva. Elegir de la lista de la ciudad, llamarlo o quitarlo.
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { usePlataforma } from '../context/plataforma'
import { enlaceWhatsApp } from '../lib/datosCliente'
import Modal from './Modal'
import { useDomiciliarios } from './DomiciliariosRed'

const VEH = { moto: 'Moto', bicicleta: 'Bicicleta', carro: 'Carro', a_pie: 'A pie' }

function Lista({ pedido, onCerrar, onListo }) {
  const { lista, error: errLista } = useDomiciliarios()
  const [error, setError] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const elegir = async (id) => {
    setOcupado(true); setError('')
    const { error: e } = await supabase.rpc('asignar_domiciliario', { p_pedido_id: pedido.id, p_domiciliario_id: id })
    setOcupado(false)
    if (e) return setError(e.message)
    onListo()
  }
  return (
    <Modal titulo="Asignar domiciliario" onCerrar={onCerrar}>
      {(error || errLista) && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error || errLista}</p>}
      {!lista && !errLista && <p className="text-center text-sm text-slate-400 py-6">Cargando…</p>}
      {lista?.length === 0 && !errLista && <p className="text-sm text-slate-500">No hay domiciliarios aprobados en tu ciudad todavía.</p>}
      <ul className="space-y-2">
        {lista?.map(d => (
          <li key={d.id}>
            <button disabled={ocupado} onClick={() => elegir(d.id)} className="w-full min-h-14 px-4 py-2 rounded-xl ring-1 ring-slate-200 bg-white grid grid-cols-[1fr_auto] gap-3 items-center text-left active:bg-slate-50 disabled:opacity-50">
              <span className="min-w-0">
                <span className="block text-sm font-medium break-words">{d.nombre}</span>
                <span className="block text-xs text-slate-400 break-words">{VEH[d.vehiculo] ?? d.vehiculo}</span>
              </span>
              <span className={`text-xs font-semibold ${d.disponible ? 'text-marca' : 'text-slate-400'}`}>{d.disponible ? 'Disponible' : 'No disponible'}</span>
            </button>
          </li>
        ))}
      </ul>
    </Modal>
  )
}

export default function AsignarDomiciliario({ pedido, onCambio }) {
  const { modulos } = usePlataforma()
  const activo = modulos.includes('domiciliarios')
  const [dom, setDom] = useState(undefined)
  const [abrir, setAbrir] = useState(false)
  const [error, setError] = useState('')
  const termino = pedido.estado === 'cancelado' || pedido.seguimiento === 'entregado'

  useEffect(() => {
    if (!activo || pedido.entrega === 'recoger') return
    let vivo = true
    if (!pedido.domiciliario_id) { setDom(null); return }
    supabase.rpc('domiciliario_del_pedido', { p_pedido_id: pedido.id }).then(({ data }) => { if (vivo) setDom(data ?? null) })
    return () => { vivo = false }
  }, [activo, pedido.id, pedido.domiciliario_id, pedido.entrega])

  if (!activo || pedido.entrega === 'recoger') return null
  const quitar = async () => {
    const { error: e } = await supabase.rpc('asignar_domiciliario', { p_pedido_id: pedido.id, p_domiciliario_id: null })
    if (e) return setError(e.message)
    onCambio?.()
  }
  const wa = dom?.telefono && enlaceWhatsApp(dom.telefono, `Hola ${dom.nombre}, te asignamos un domicilio.`)
  return (
    <div className="space-y-2 rounded-xl bg-slate-50 p-3">
      <p className="text-sm text-slate-600">Domiciliario: <b className="text-slate-800 break-words">{dom ? `${dom.nombre} (${VEH[dom.vehiculo] ?? dom.vehiculo})` : 'sin asignar'}</b></p>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {dom ? (
        <div className="grid grid-cols-3 gap-2">
          <a href={`tel:${dom.telefono}`} className="min-h-11 grid place-items-center rounded-xl bg-white ring-1 ring-slate-200 text-xs font-semibold">Llamar</a>
          {wa ? <a href={wa} target="_blank" rel="noreferrer" className="min-h-11 grid place-items-center rounded-xl bg-white ring-1 ring-slate-200 text-xs font-semibold">WhatsApp</a> : <span />}
          {!termino ? <button onClick={quitar} className="min-h-11 rounded-xl bg-white ring-1 ring-slate-200 text-xs font-semibold text-slate-600">Quitar</button> : <span />}
        </div>
      ) : !termino && (
        <button onClick={() => setAbrir(true)} className="w-full min-h-11 rounded-xl bg-champagne text-negro text-sm font-semibold active:opacity-90">Asignar domiciliario</button>
      )}
      {abrir && <Lista pedido={pedido} onCerrar={() => setAbrir(false)} onListo={() => { setAbrir(false); onCambio?.() }} />}
    </div>
  )
}
