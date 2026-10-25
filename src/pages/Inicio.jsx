import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { ir } from '../lib/ruta'
import { Pagina, Tarjeta, Boton, Mensaje, Cargando } from './Piezas'

const ROL = { dueno: 'Dueño', cajero: 'Cajero', soporte: 'Soporte (solo lectura)' }

export default function Inicio() {
  const [negocios, setNegocios] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    supabase.rpc('mis_negocios').then(({ data, error }) => {
      if (error) setError('No se pudieron cargar tus negocios'); else setNegocios(data)
    })
  }, [])

  return (
    <Pagina>
      <div className="mb-6 flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Mis negocios</h1>
        <Boton variante="suave" onClick={() => supabase.auth.signOut()}>Salir</Boton>
      </div>
      {error && <Mensaje tipo="error">{error}</Mensaje>}
      {!negocios && !error && <Cargando />}
      {negocios?.length === 0 && (
        <Mensaje>Tu usuario todavía no está asociado a ningún negocio. Pídele al administrador que te agregue.</Mensaje>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        {negocios?.map((n) => (
          <Tarjeta key={n.negocio_id} className="flex flex-col justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold">{n.nombre_comercial}</h2>
              <p className="text-sm text-tinta/60">{ROL[n.rol] || n.rol}</p>
            </div>
            <Boton onClick={() => ir(`/t/${n.slug}/panel`)}>Abrir panel</Boton>
          </Tarjeta>
        ))}
      </div>
    </Pagina>
  )
}
