// Domiciliarios aprobados de la ciudad del negocio y, para el dueño, lo que se les debe. Módulo «domiciliarios».
// El celular de un domiciliario solo aparece cuando se le asigna un pedido. El dinero se paga fuera de la plataforma: aquí se lleva la cuenta.
import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useDueno } from '../context/rol'
import { dinero } from '../lib/formato'
import { confirmar } from '../lib/confirmar'

const VEH = { moto: 'Moto', bicicleta: 'Bicicleta', carro: 'Carro', a_pie: 'A pie' }

export function useDomiciliarios() {
  const [lista, setLista] = useState(null)
  const [error, setError] = useState('')
  useEffect(() => {
    let vivo = true
    supabase.rpc('domiciliarios_de_mi_ciudad').then(({ data, error: e }) => {
      if (!vivo) return
      if (e) { setError(e.message); setLista([]) } else setLista(data ?? [])
    })
    return () => { vivo = false }
  }, [])
  return { lista, error }
}

function Pagos() {
  const [lista, setLista] = useState(null)
  const [error, setError] = useState('')
  const cargar = useCallback(async () => {
    const { data, error: e } = await supabase.rpc('pagos_domiciliarios')
    if (e) setError(e.message)
    setLista(data ?? [])
  }, [])
  useEffect(() => { cargar() }, [cargar])
  const pagar = async (d) => {
    if (!(await confirmar({ titulo: `¿Ya le pagaste ${dinero(d.total)} a ${d.nombre}?`, texto: `${d.entregas} ${d.entregas === 1 ? 'entrega' : 'entregas'}. El pago se hace fuera de la plataforma (efectivo, Nequi…): aquí solo queda marcado.`, si: 'Sí, ya le pagué' }))) return
    const { error: e } = await supabase.rpc('pagar_domiciliario', { p_domiciliario_id: d.domiciliario_id })
    if (e) return setError(e.message)
    setError(''); cargar()
  }
  const total = (lista ?? []).reduce((s, d) => s + Number(d.total), 0)
  return (
    <div className="space-y-3">
      <div className="bg-white rounded-2xl shadow-sm p-4 grid grid-cols-[1fr_auto] gap-3 items-center">
        <p className="text-xs text-slate-400">Pendiente de pago a domiciliarios</p>
        <p className="text-2xl font-bold">{dinero(total)}</p>
      </div>
      {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
      {!lista && <p className="text-center text-sm text-slate-400 py-6">Cargando…</p>}
      {lista?.length === 0 && <p className="text-center text-sm text-slate-400 py-6">No debes nada por ahora.</p>}
      {lista?.length > 0 && (
        <ul className="bg-white rounded-2xl shadow-sm divide-y divide-slate-100">
          {lista.map(d => (
            <li key={d.domiciliario_id} className="px-4 py-3 grid grid-cols-[1fr_auto] gap-3 items-center">
              <div className="min-w-0">
                <p className="text-sm font-medium break-words">{d.nombre}</p>
                <p className="text-xs text-slate-400">{d.entregas} {d.entregas === 1 ? 'entrega' : 'entregas'} · {dinero(d.total)}</p>
              </div>
              <button onClick={() => pagar(d)} className="min-h-10 px-3 rounded-xl bg-marca text-white text-xs font-semibold active:bg-marca-oscuro">Marcar pagado</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export default function DomiciliariosRed() {
  const dueno = useDueno()
  const [vista, setVista] = useState('lista')
  const { lista, error } = useDomiciliarios()
  return (
    <div className="space-y-4">
      {dueno === true && (
        <div className="grid grid-cols-2 gap-2">
          {[['lista', 'Domiciliarios'], ['pagos', 'Pagos']].map(([id, t]) => (
            <button key={id} onClick={() => setVista(id)} className={`h-11 rounded-xl text-sm font-semibold ${vista === id ? 'bg-marca text-white' : 'bg-white text-slate-500 shadow-sm'}`}>{t}</button>
          ))}
        </div>
      )}
      {vista === 'pagos' && dueno === true ? <Pagos /> : (<>
        <p className="text-sm text-slate-500">Repartidores aprobados por la plataforma en tu ciudad. Para usar uno, abre un pedido a domicilio en «Pedidos de la tienda» y ofrécelo a la red o elige uno.</p>
        {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
        {!lista && !error && <p className="text-center text-sm text-slate-400 py-8">Cargando…</p>}
        {lista?.length === 0 && !error && <p className="text-center text-sm text-slate-400 py-8">Todavía no hay domiciliarios aprobados en tu ciudad.</p>}
        {lista?.length > 0 && (
          <ul className="bg-white rounded-2xl shadow-sm divide-y divide-slate-100">
            {lista.map(d => (
              <li key={d.id} className="px-4 py-3 grid grid-cols-[1fr_auto] gap-3 items-center">
                <div className="min-w-0">
                  <p className="text-sm font-medium break-words">{d.nombre}</p>
                  <p className="text-xs text-slate-400 break-words">{VEH[d.vehiculo] ?? d.vehiculo}{d.calificacion ? ` · ★ ${Number(d.calificacion).toFixed(1)} (${d.calificaciones})` : ''}{d.presentacion ? ` · ${d.presentacion}` : ''}</p>
                </div>
                <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${d.disponible ? 'bg-lima/25 text-marca' : 'bg-slate-100 text-slate-500'}`}>{d.disponible ? 'Disponible' : 'No disponible'}</span>
              </li>
            ))}
          </ul>
        )}
        <p className="text-xs text-slate-400 text-center">¿Conoces a alguien que haga domicilios? Que se registre en {window.location.origin}/domiciliarios</p>
      </>)}
    </div>
  )
}
