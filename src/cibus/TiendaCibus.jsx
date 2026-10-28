// Catálogo público de una tienda con el aspecto de Cibus (/t/{tienda}). Cada tienda se ve con su logo y su color.
// Cada tienda muestra el catálogo de su tipo: productos (tienda, verduras, repuestos…) o prendas (ropa). Si tiene los dos, el cliente elige.
// Si no tiene ninguno, o se abre con ?vieja=1, se usa la pantalla anterior.
import { lazy, Suspense, useEffect, useState } from 'react'
import { fijarSlug } from './lib/enlaces'
import { fijarPublico, cargarPublico, fijarVista } from './lib/publico'
import { aplicarMarca, quitarMarca } from '../lib/marca'
import TiendaPublica from './components/TiendaPublica'
import CatalogoPublico from './components/CatalogoPublico'
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
  const [elegida, setElegida] = useState(null)
  const vieja = new URLSearchParams(window.location.search).has('vieja')
  if (cargando) return <Cargando />
  const mods = n?.modulos || []
  const hayProductos = mods.includes('productos') && mods.includes('catalogo_publico')
  const hayRopa = mods.includes('ropa') && mods.includes('catalogo_publico')
  if (vieja || !n || (!hayProductos && !hayRopa)) {
    return <Suspense fallback={<Cargando />}><TiendaAnterior slug={slug} /></Suspense>
  }
  const pideRopa = /\/t\/[^/]+\/r\//.test(window.location.pathname) || new URLSearchParams(window.location.search).get('catalogo') === 'ropa'
  const vista = elegida ?? (hayProductos && hayRopa ? (pideRopa ? 'ropa' : 'tienda') : hayRopa ? 'ropa' : 'tienda')
  fijarVista(vista)
  return (
    <>
      {n.vista_previa && <p className="bg-champagne px-4 py-3 text-center text-sm font-semibold text-negro">Vista previa: esta tienda todavía no está publicada. Solo la ve su equipo.</p>}
      {hayProductos && hayRopa && (
        <div role="tablist" aria-label="Qué quieres ver" className="grid grid-cols-2 gap-2 bg-cibus-profundo px-4 py-3">
          {[['tienda', 'Productos'], ['ropa', 'Ropa']].map(([k, t]) => (
            <button key={k} role="tab" aria-selected={vista === k} onClick={() => setElegida(k)}
              className={`h-12 rounded-xl text-lg font-semibold ${vista === k ? 'bg-champagne text-negro' : 'bg-white/10 text-white active:bg-white/20'}`}>{t}</button>
          ))}
        </div>
      )}
      {vista === 'ropa' ? <CatalogoPublico key="ropa" /> : <TiendaPublica key="tienda" />}
    </>
  )
}

export function LegalCibus({ slug, tipo }) {
  const { cargando } = usarTienda(slug)
  return cargando ? <Cargando /> : <Legal tipo={tipo} />
}
