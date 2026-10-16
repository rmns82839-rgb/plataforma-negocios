import { useEffect, useState } from 'react'
import { supabase, urlImagen } from '../lib/supabase'
import { aplicarMarca, quitarMarca } from '../lib/marca'
import { ir } from '../lib/ruta'
import { Pagina, Tarjeta, Boton, Mensaje, Cargando } from './Piezas'

// Página pública de un negocio: solo usa datos que entrega negocio_publico(slug)
export default function Publico({ slug }) {
  const [n, setN] = useState(undefined)

  useEffect(() => {
    let vivo = true
    supabase.rpc('negocio_publico', { p_slug: slug }).then(({ data }) => {
      if (!vivo) return
      setN(data ?? null)
      if (data) aplicarMarca(data)
    })
    return () => { vivo = false; quitarMarca() }
  }, [slug])

  if (n === undefined) return <Cargando />
  if (n === null) return <Pagina><Mensaje>No encontramos este negocio.</Mensaje></Pagina>

  const datos = [
    ['Dirección', [n.direccion, n.ciudad].filter(Boolean).join(', ')],
    ['Teléfono', n.telefono], ['WhatsApp', n.whatsapp], ['Horario', n.horario], ['Correo', n.email],
  ].filter(([, v]) => v)

  return (
    <Pagina>
      <header className="mb-8 flex flex-col items-center gap-3 text-center">
        {n.logo && <img src={urlImagen(n.logo)} alt={n.nombre} className="h-20 w-auto object-contain" />}
        <h1 className="text-3xl font-semibold text-principal">{n.nombre}</h1>
        {n.eslogan && <p className="text-tinta/70">{n.eslogan}</p>}
        <div className="h-0.5 w-16 rounded bg-secundario" />
      </header>
      {datos.length > 0 && (
        <Tarjeta className="mb-6">
          <dl className="grid gap-3 sm:grid-cols-2">
            {datos.map(([k, v]) => (
              <div key={k}><dt className="text-xs uppercase tracking-wide text-tinta/50">{k}</dt><dd className="text-sm">{v}</dd></div>
            ))}
          </dl>
        </Tarjeta>
      )}
      <div className="flex justify-center">
        <Boton variante="suave" onClick={() => ir(`/n/${n.slug}/panel`)}>Acceso del personal</Boton>
      </div>
    </Pagina>
  )
}
