// Carga la tienda (marca y módulos) y muestra Mis pedidos
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { aplicarMarca, quitarMarca } from '../lib/marca'
import { useSesion } from '../lib/sesion'
import MisPedidos from './MisPedidos'

export default function PaginaMisPedidos({ slug }) {
  const sesion = useSesion()
  const [n, setN] = useState(undefined)
  useEffect(() => {
    let vivo = true
    supabase.rpc('negocio_publico', { p_slug: slug }).then(({ data }) => { if (!vivo) return; setN(data ?? null); if (data) aplicarMarca(data) })
    return () => { vivo = false; quitarMarca() }
  }, [slug])
  return <MisPedidos slug={slug} n={n} sesion={sesion} />
}
