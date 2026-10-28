// Catálogo público de una tienda con el aspecto de Cibus (/t/{tienda}). Cada tienda se ve con su logo y su color.
// Si la tienda no tiene catálogo de productos (p. ej. solo ropa), o se abre con ?vieja=1, se usa la pantalla anterior.
import { lazy, Suspense, useEffect, useState } from 'react'
import { fijarSlug } from './lib/enlaces'
import { fijarPublico, cargarPublico } from './lib/publico'
import { aplicarMarca, quitarMarca } from '../lib/marca'
import TiendaPublica from './components/TiendaPublica'
import Legal from './components/Legal'

const TiendaAnterior = lazy(() => import('../tienda/Tienda'))

function usarTienda(slug) {
  const [estado, setEstado] = useState({ cargando: true, n: null })
  useEffect(() => {
    let vivo = true
    fijarSlug(slug); fijarPublico(slug)
    setEstado({ cargando: true, n: null })
    cargarPublico().then(({ n }) => { if (!vivo) return; if (n) aplicarMarca(n); setEstado({ cargando: false, n }) })
    return () => { vivo = false; fijarPublico(null); quitarMarca() }
  }, [slug])
  return estado
}

const Cargando = () => <p className="py-20 text-center text-xl text-slate-500">Cargando…</p>

export default function TiendaCibus({ slug }) {
  const { cargando, n } = usarTienda(slug)
  const vieja = new URLSearchParams(window.location.search).has('vieja')
  if (cargando) return <Cargando />
  if (vieja || !n || !(n.modulos || []).includes('productos') || !(n.modulos || []).includes('catalogo_publico')) {
    return <Suspense fallback={<Cargando />}><TiendaAnterior slug={slug} /></Suspense>
  }
  return (
    <>
      {n.vista_previa && <p className="bg-champagne px-4 py-3 text-center text-sm font-semibold text-negro">Vista previa: esta tienda todavía no está publicada. Solo la ve su equipo.</p>}
      <TiendaPublica />
    </>
  )
}

export function LegalCibus({ slug, tipo }) {
  const { cargando } = usarTienda(slug)
  return cargando ? <Cargando /> : <Legal tipo={tipo} />
}
