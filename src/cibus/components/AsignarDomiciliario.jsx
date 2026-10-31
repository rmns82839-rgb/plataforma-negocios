// En cada pedido a domicilio: ofrecerlo a la red de domiciliarios, o asignar uno a mano, y seguir la entrega hasta calificarla.
import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { usePlataforma } from '../context/plataforma'
import { enlaceWhatsApp } from '../lib/datosCliente'
import { dinero, aNumero } from '../lib/formato'
import { claseInput } from '../lib/estilos'
import Modal from './Modal'
import Estrellas from './Estrellas'
import { useDomiciliarios } from './DomiciliariosRed'

const VEH = { moto: 'Moto', bicicleta: 'Bicicleta', carro: 'Carro', a_pie: 'A pie' }
const PASO = { ofrecida: 'Buscando domiciliario…', aceptada: 'Va a recoger el pedido', recogida: 'Lleva el pedido al cliente', entregada: 'Entregado' }
const estrellasTxt = (d) => (d?.calificacion ? ` · ★ ${Number(d.calificacion).toFixed(1)}` : '')

function Lista({ pedido, tarifa, onCerrar, onListo }) {
  const { lista, error: errLista } = useDomiciliarios()
  const [error, setError] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const elegir = async (id) => {
    setOcupado(true); setError('')
    const { error: e } = await supabase.rpc('asignar_domiciliario', { p_pedido_id: pedido.id, p_domiciliario_id: id, p_tarifa: tarifa })
    setOcupado(false)
    if (e) return setError(e.message)
    onListo()
  }
  return (
    <Modal titulo="Elegir domiciliario" onCerrar={onCerrar}>
      {(error || errLista) && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error || errLista}</p>}
      {!lista && !errLista && <p className="text-center text-sm text-slate-400 py-6">Cargando…</p>}
      {lista?.length === 0 && !errLista && <p className="text-sm text-slate-500">No hay domiciliarios aprobados en tu ciudad todavía.</p>}
      <ul className="space-y-2">
        {lista?.map(d => (
          <li key={d.id}>
            <button disabled={ocupado} onClick={() => elegir(d.id)} className="w-full min-h-14 px-4 py-2 rounded-xl ring-1 ring-slate-200 bg-white grid grid-cols-[1fr_auto] gap-3 items-center text-left active:bg-slate-50 disabled:opacity-50">
              <span className="min-w-0">
                <span className="block text-sm font-medium break-words">{d.nombre}</span>
                <span className="block text-xs text-slate-400 break-words">{VEH[d.vehiculo] ?? d.vehiculo}{estrellasTxt(d)}</span>
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
  const activo = modulos.includes('domiciliarios') && pedido.entrega !== 'recoger'
  const [en, setEn] = useState(undefined)            // undefined = cargando · null = sin entrega · objeto
  const [abrir, setAbrir] = useState(false)
  const [tarifaTxt, setTarifaTxt] = useState(String(Math.round(Number(pedido.domicilio) || 0)))
  const [error, setError] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [estrellas, setEstrellas] = useState(null)

  const cargar = useCallback(async () => {
    const { data } = await supabase.rpc('entrega_del_pedido', { p_pedido_id: pedido.id })
    setEn(data ?? null)
  }, [pedido.id])
  useEffect(() => {
    if (!activo) return undefined
    cargar()
    const vivo = () => en === undefined || (en && ['ofrecida', 'aceptada', 'recogida'].includes(en.estado))
    const t = setInterval(() => { if (vivo() && document.visibilityState === 'visible') cargar() }, 20000)
    return () => clearInterval(t)
  }, [activo, cargar, en?.estado]) // eslint-disable-line react-hooks/exhaustive-deps
  if (!activo || pedido.estado === 'cancelado') return null

  const tarifa = Math.max(0, aNumero(tarifaTxt))
  const correr = async (fn) => { setOcupado(true); setError(''); const { error: e } = await fn(); setOcupado(false); if (e) return setError(e.message); await cargar(); onCambio?.() }
  const ofrecer = () => correr(() => supabase.rpc('ofrecer_entrega', { p_pedido_id: pedido.id, p_tarifa: tarifa }))
  const quitar = () => correr(() => supabase.rpc('asignar_domiciliario', { p_pedido_id: pedido.id, p_domiciliario_id: null }))
  const calificar = () => correr(() => supabase.rpc('calificar_entrega_tienda', { p_entrega_id: en.id, p_estrellas: estrellas }))

  const dom = en?.domiciliario
  const wa = dom?.telefono && enlaceWhatsApp(dom.telefono, `Hola ${dom.nombre}, sobre el pedido ${pedido.numero ? 'N.º ' + pedido.numero : ''}.`)
  return (
    <div className="space-y-2 rounded-xl bg-slate-50 p-3">
      <p className="text-sm text-slate-600">Domiciliario: <b className="text-slate-800 break-words">{en ? (dom ? `${dom.nombre} (${VEH[dom.vehiculo] ?? dom.vehiculo})${estrellasTxt(dom)}` : 'en la red') : 'sin asignar'}</b></p>
      {en && <p className="text-xs text-slate-500">{PASO[en.estado]} · tarifa {dinero(en.tarifa)}{en.pago_estado === 'pagado' ? ' · pagado' : ''}</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}

      {en === null && pedido.seguimiento !== 'entregado' && (
        <>
          <label className="grid grid-cols-[1fr_8rem] gap-3 items-center text-sm text-slate-600">
            <span>Tarifa para el domiciliario</span>
            <input value={tarifaTxt} onChange={e => setTarifaTxt(e.target.value)} inputMode="numeric" className={`${claseInput} h-11 text-right`} />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <button disabled={ocupado} onClick={ofrecer} className="min-h-11 rounded-xl bg-champagne text-negro text-sm font-semibold active:opacity-90 disabled:opacity-50">Ofrecer a la red</button>
            <button disabled={ocupado} onClick={() => setAbrir(true)} className="min-h-11 rounded-xl bg-white ring-1 ring-slate-200 text-sm font-semibold active:bg-slate-100 disabled:opacity-50">Elegir uno</button>
          </div>
        </>
      )}
      {en && (en.estado === 'ofrecida' || en.estado === 'aceptada') && (
        <div className={`grid gap-2 ${dom ? 'grid-cols-3' : 'grid-cols-1'}`}>
          {dom && <a href={`tel:${dom.telefono}`} className="min-h-11 grid place-items-center rounded-xl bg-white ring-1 ring-slate-200 text-xs font-semibold">Llamar</a>}
          {dom && (wa ? <a href={wa} target="_blank" rel="noreferrer" className="min-h-11 grid place-items-center rounded-xl bg-white ring-1 ring-slate-200 text-xs font-semibold">WhatsApp</a> : <span />)}
          <button disabled={ocupado} onClick={quitar} className="min-h-11 rounded-xl bg-white ring-1 ring-slate-200 text-xs font-semibold text-slate-600 disabled:opacity-50">{en.estado === 'ofrecida' ? 'Cancelar oferta' : 'Quitar'}</button>
        </div>
      )}
      {en?.estado === 'recogida' && dom && (
        <div className="grid grid-cols-2 gap-2">
          <a href={`tel:${dom.telefono}`} className="min-h-11 grid place-items-center rounded-xl bg-white ring-1 ring-slate-200 text-xs font-semibold">Llamar</a>
          {wa ? <a href={wa} target="_blank" rel="noreferrer" className="min-h-11 grid place-items-center rounded-xl bg-white ring-1 ring-slate-200 text-xs font-semibold">WhatsApp</a> : <span />}
        </div>
      )}
      {en?.estado === 'entregada' && (
        en.calif_tienda ? <p className="text-sm text-slate-600">Tu calificación: {'★'.repeat(en.calif_tienda)}{en.calif_cliente ? ` · del cliente: ${'★'.repeat(en.calif_cliente)}` : ''}</p> : (
          <div className="space-y-2">
            <p className="text-sm text-slate-600">¿Cómo te fue con este domiciliario?</p>
            <Estrellas valor={estrellas} onElegir={setEstrellas} />
            <button disabled={ocupado || !estrellas} onClick={calificar} className="w-full min-h-11 rounded-xl bg-marca text-white text-sm font-semibold disabled:opacity-40">Calificar</button>
          </div>
        )
      )}
      {abrir && <Lista pedido={pedido} tarifa={tarifa} onCerrar={() => setAbrir(false)} onListo={() => { setAbrir(false); cargar(); onCambio?.() }} />}
    </div>
  )
}
