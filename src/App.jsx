import { configurado } from './lib/supabase'
import { useRuta } from './lib/ruta'
import { useSesion } from './lib/sesion'
import { Pagina, Tarjeta, Cargando } from './pages/Piezas'
import Login from './pages/Login'
import Inicio from './pages/Inicio'
import Tienda from './tienda/Tienda'
import Panel from './pages/Panel'

export default function App() {
  const { vista, slug } = useRuta()
  const sesion = useSesion()

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
  if (vista === 'publico') return <Tienda slug={slug} />
  if (vista === 'panel') return <Panel slug={slug} />
  if (sesion === undefined) return <Cargando />
  return sesion ? <Inicio /> : <Login />
}
