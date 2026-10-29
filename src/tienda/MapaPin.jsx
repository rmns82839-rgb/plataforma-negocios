// Mapa con pin. Usa Google Maps si hay clave (VITE_GOOGLE_MAPS_KEY) y, si no hay o Google falla, OpenStreetMap. Mismas propiedades en ambos.
import { lazy, Suspense, useState } from 'react'
import { hayGoogle } from '../lib/googleMaps'

const OSM = lazy(() => import('./MapaPinOSM'))
const Google = lazy(() => import('./MapaPinGoogle'))

export default function MapaPin(props) {
  const [googleFallo, setGoogleFallo] = useState(false)
  const alto = props.alto || 320
  const cargando = <div style={{ height: alto }} className="w-full rounded-2xl border-2 border-black/10 bg-black/5" aria-busy="true" />
  return (
    <Suspense fallback={cargando}>
      {hayGoogle() && !googleFallo ? <Google {...props} onFallo={() => setGoogleFallo(true)} /> : <OSM {...props} />}
    </Suspense>
  )
}
