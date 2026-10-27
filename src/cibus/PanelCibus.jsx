// Panel de la plataforma: las mismas pantallas de Cibus (caja, productos, fiados…), para la tienda abierta.
import { useState } from 'react'
import { PlataformaContext } from './context/plataforma'
import { AuthProvider } from './context/AuthContext'
import { fijarNegocio } from './lib/supabase'
import Panel from './Panel'
import ErrorPantalla from './components/ErrorPantalla'

export default function PanelCibus({ ctx }) {
  // El negocio se fija ANTES de que se pinte cualquier pantalla (una tienda por página)
  const [negocio] = useState(() => { fijarNegocio(ctx.neg.negocio_id); return ctx.neg.negocio_id })
  return <PlataformaContext.Provider value={{ ctx, neg: ctx.neg, modulos: ctx.modulos, marca: ctx.marca, userId: ctx.userId }}>
      <div className="bg-fondo text-slate-800" style={{ minHeight: '100vh' }}><ErrorPantalla key={negocio}><AuthProvider><Panel ctx={ctx} /></AuthProvider></ErrorPantalla></div>
    </PlataformaContext.Provider>
}
