import { lazy, Suspense, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { quitarMarca, ponerManifest } from '../lib/marca'
import { ir } from '../lib/ruta'
import { useSesion } from '../lib/sesion'
import { Btn, Volver, Aviso } from '../tienda/ui'
import Login from '../pages/Login'

// El panel es el de Cibus (menú oscuro dorado, caja con escáner…), cargado aparte: quien abre la tienda pública no lo descarga.
const PanelCibus = lazy(() => import('../cibus/PanelCibus'))

export default function PanelApp({ slug }) {
  const sesion = useSesion()
  const [ctx, setCtx] = useState(undefined)

  useEffect(() => {
    if (!sesion) return
    let vivo = true
    ;(async () => {
      const { data: mios } = await supabase.rpc('mis_negocios')
      const m = (mios || []).find((x) => x.slug === slug)
      if (!m) { if (vivo) setCtx(null); return }
      const { data: marca } = await supabase.rpc('negocio_publico', { p_slug: slug })
      if (!vivo) return
      setCtx({ userId: sesion?.user?.id ?? '', neg: m, rol: m.rol, esDueno: m.rol === 'dueno', soloLectura: m.rol === 'soporte', modulos: marca?.modulos || [], marca })
      ponerManifest(slug, { panel: true })   // desde aquí se instala la app del PERSONAL (abre directo el panel)
    })()
    return () => { vivo = false; quitarMarca() }
  }, [sesion, slug])

  if (sesion === undefined) return <p className="py-24 text-center text-xl text-tinta/60">Cargando…</p>
  if (!sesion) return <Login titulo="Acceso del personal" />
  if (ctx === undefined) return <p className="py-24 text-center text-xl text-tinta/60">Cargando tu panel…</p>
  if (ctx === null) {
    return (
      <main className="mx-auto max-w-xl px-4 py-10 text-lg">
        <Volver onClick={() => ir('/')} texto="Mis negocios" />
        <Aviso>No tienes acceso a este negocio con esta cuenta.</Aviso>
        <div className="mt-4"><Btn variante="suave" onClick={() => supabase.auth.signOut()}>Salir</Btn></div>
      </main>
    )
  }
  return (
    <Suspense fallback={<p className="py-24 text-center text-xl text-tinta/60">Cargando tu panel…</p>}>
      <PanelCibus ctx={ctx} />
    </Suspense>
  )
}
