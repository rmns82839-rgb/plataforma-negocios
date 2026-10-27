// Más > Ofertas: dos pestañas de igual tamaño, Ofertas y Publicidad.
import { useState } from 'react'
import OfertasAdmin from './OfertasAdmin'
import AnunciosAdmin from './AnunciosAdmin'

export default function OfertasPublicidad() {
  const [tab, setTab] = useState('ofertas')
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2">
        {[['ofertas', 'Ofertas'], ['publicidad', 'Publicidad']].map(([id, t]) => (
          <button key={id} onClick={() => setTab(id)} className={`h-11 rounded-xl text-sm font-medium ${tab === id ? 'bg-marca text-white' : 'bg-white text-slate-600 shadow-sm'}`}>{t}</button>
        ))}
      </div>
      {tab === 'ofertas' ? <OfertasAdmin /> : <AnunciosAdmin />}
    </div>
  )
}
