// Domiciliarios aprobados de la ciudad del negocio. Módulo «domiciliarios». El celular solo aparece cuando se les asigna un pedido.
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

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

export default function DomiciliariosRed() {
  const { lista, error } = useDomiciliarios()
  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-500">Repartidores aprobados por la plataforma en tu ciudad. Para asignar uno, abre un pedido a domicilio en «Pedidos de la tienda».</p>
      {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
      {!lista && !error && <p className="text-center text-sm text-slate-400 py-8">Cargando…</p>}
      {lista?.length === 0 && !error && <p className="text-center text-sm text-slate-400 py-8">Todavía no hay domiciliarios aprobados en tu ciudad.</p>}
      {lista?.length > 0 && (
        <ul className="bg-white rounded-2xl shadow-sm divide-y divide-slate-100">
          {lista.map(d => (
            <li key={d.id} className="px-4 py-3 grid grid-cols-[1fr_auto] gap-3 items-center">
              <div className="min-w-0">
                <p className="text-sm font-medium break-words">{d.nombre}</p>
                <p className="text-xs text-slate-400 break-words">{VEH[d.vehiculo] ?? d.vehiculo}{d.presentacion ? ` · ${d.presentacion}` : ''}</p>
              </div>
              <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${d.disponible ? 'bg-lima/25 text-marca' : 'bg-slate-100 text-slate-500'}`}>{d.disponible ? 'Disponible' : 'No disponible'}</span>
            </li>
          ))}
        </ul>
      )}
      <p className="text-xs text-slate-400 text-center">¿Conoces a alguien que haga domicilios? Que se registre en {window.location.origin}/domiciliarios</p>
    </div>
  )
}
