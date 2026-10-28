import { useEffect } from 'react'
import { configurado, supabase } from './lib/supabase'
import { useRuta } from './lib/ruta'
import { useSesion } from './lib/sesion'
import { Pagina, Tarjeta, Cargando } from './pages/Piezas'
import Login from './pages/Login'
import Inicio from './pages/Inicio'
import PanelApp from './panel/PanelApp'
import PaginaMisPedidos from './tienda/PaginaMisPedidos'
import Directorio from './tienda/Directorio'
import TiendaCibus, { LegalCibus } from './cibus/TiendaCibus'
import { lazy, Suspense } from 'react'
const PistolaPagina = lazy(() => import('./cibus/PistolaPagina'))

export default function App() {
  const { vista, slug, legal } = useRuta()
  const sesion = useSesion()

  // Quien entra con un correo que tiene una invitación pendiente (cajero, p. ej.) queda agregado a esa tienda
  useEffect(() => {
    if (!sesion || !supabase) return
    supabase.rpc('reclamar_invitaciones').then(({ data }) => { if (Number(data) > 0) window.location.reload() }, () => {})
  }, [sesion?.user?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!configurado) {
    return (
      <Pagina ancho="max-w-xl">
        <Tarjeta>
          <h1 className="mb-2 text-xl font-semibold">Falta conectar Supabase</h1>
          <p className="text-sm text-tinta/70">
            Crea el archivo <code>.env</code> a partir de <code>.env.example</code> con la URL y la anon key de tu proyecto Supabase nuevo.
          </p>
        </Tarjeta>
      </Pagina>
    )
  }
  if (vista === 'directorio') return <Directorio />
  if (vista === 'legal') return <LegalCibus slug={slug} tipo={legal} />
  if (vista === 'publico') return <TiendaCibus slug={slug} />
  if (vista === 'panel') return <PanelApp slug={slug} />
  if (vista === 'pistola') return <Suspense fallback={<Cargando />}><PistolaPagina slug={slug} /></Suspense>
  if (vista === 'mis-pedidos') return <PaginaMisPedidos slug={slug} />
  if (sesion === undefined) return <Cargando />
  return sesion ? <Inicio /> : <Login />
}
