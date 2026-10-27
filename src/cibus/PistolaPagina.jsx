// Página del CELULAR para usarlo como pistola de la caja: /t/{tienda}/pistola?c=…
// Entra con su cuenta (la del personal de esa tienda); el canal con el computador lleva el nombre de ESA tienda.
import { useEffect, useState } from 'react'
import { supabase as plataforma } from '../lib/supabase'
import { fijarNegocio } from './lib/supabase'
import { fijarSlug } from './lib/enlaces'
import PistolaCelular from './components/PistolaCelular'

export default function PistolaPagina({ slug }) {
  const [estado, setEstado] = useState('cargando')   // cargando | sinSesion | listo | sinAcceso

  useEffect(() => {
    let vivo = true
    const resolver = async (sesion) => {
      if (!sesion) { if (vivo) setEstado('sinSesion'); return }
      const { data } = await plataforma.rpc('mis_negocios')
      const n = (data ?? []).find(x => x.slug === slug)
      if (!vivo) return
      if (!n) return setEstado('sinAcceso')
      fijarNegocio(n.negocio_id); fijarSlug(n.slug); setEstado('listo')
    }
    plataforma.auth.getSession().then(({ data }) => resolver(data.session))
    const { data: sub } = plataforma.auth.onAuthStateChange((_e, s) => resolver(s))
    return () => { vivo = false; sub.subscription.unsubscribe() }
  }, [slug])

  if (estado === 'cargando') return null
  if (estado === 'sinAcceso') {
    return (
      <main className="min-h-screen grid place-items-center p-6 text-center bg-negro text-hueso">
        <p className="max-w-xs text-base">Tu cuenta no es del personal de esta tienda. Entra con la cuenta que usas en la caja.</p>
      </main>
    )
  }
  return <div className="bg-fondo text-slate-800" style={{ minHeight: '100vh' }}><PistolaCelular key={estado} /></div>
}
