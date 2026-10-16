import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY

export const configurado = Boolean(url && anon)
export const supabase = configurado
  ? createClient(url, anon, { auth: { persistSession: true, autoRefreshToken: true } })
  : null

// Las imágenes se guardan como RUTA ({negocio_id}/{carpeta}/archivo); aquí se arma la URL pública.
export function urlImagen(ruta) {
  return ruta && url ? `${url}/storage/v1/object/public/negocios/${ruta}` : null
}
