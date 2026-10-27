// Ventana de publicidad que ve el cliente al entrar al catálogo (la administra el dueño).
// Sale una vez por visita (o una vez al día, según lo elija el dueño) y espera a que se cierre la ventana de ofertas.
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '../lib/supabase'
import AnuncioTarjeta from './AnuncioTarjeta'

const hoy = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date())
const clave = (a) => `anuncio-visto-${a.id}`

const yaVisto = (a) => {
  try {
    return a.frecuencia === 'dia' ? localStorage.getItem(clave(a)) === hoy() : sessionStorage.getItem(clave(a)) === '1'
  } catch { return false }
}
const marcarVisto = (a) => {
  try {
    if (a.frecuencia === 'dia') localStorage.setItem(clave(a), hoy())
    else sessionStorage.setItem(clave(a), '1')
  } catch { /* sin almacenamiento: puede volver a salir */ }
}

export default function AnuncioPublico({ catalogo, whatsapp, bloqueado = false }) {
  const [anuncio, setAnuncio] = useState(null)
  const [abierto, setAbierto] = useState(false)

  useEffect(() => {
    let vivo = true
    supabase.from('anuncios_vigentes').select('*').in('catalogo', [catalogo, 'ambos'])
      .order('creado_en', { ascending: false }).limit(1)
      .then(({ data, error }) => { if (vivo && !error && Array.isArray(data) && data[0]) setAnuncio(data[0]) })
    return () => { vivo = false }
  }, [catalogo])

  useEffect(() => {
    if (!anuncio || bloqueado || abierto || yaVisto(anuncio)) return undefined
    const t = setTimeout(() => { setAbierto(true); marcarVisto(anuncio) }, 4000)
    return () => clearTimeout(t)
  }, [anuncio, bloqueado, abierto])

  if (!anuncio || !abierto) return null
  return createPortal(
    <div className="fixed inset-0 z-[75] grid place-items-center p-5 bg-black/60 backdrop-blur-[2px] anuncio-fondo" onClick={() => setAbierto(false)}>
      <div onClick={e => e.stopPropagation()} className="w-full grid place-items-center">
        <AnuncioTarjeta anuncio={anuncio} whatsapp={whatsapp} cierreAuto onCerrar={() => setAbierto(false)} />
      </div>
    </div>,
    document.body
  )
}
