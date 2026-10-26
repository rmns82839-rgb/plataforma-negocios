import { createClient } from '@supabase/supabase-js'

// Limpia errores comunes al pegar la URL en Vercel: espacios, barra final o "/rest/v1" de más
const url = ((import.meta.env || {}).VITE_SUPABASE_URL || '').trim().replace(/\/rest\/v1\/?$/, '').replace(/\/+$/, '')
const anon = ((import.meta.env || {}).VITE_SUPABASE_ANON_KEY || '').trim()

export const configurado = Boolean(url && anon)
export const supabase = configurado
  ? createClient(url, anon, { auth: { persistSession: true, autoRefreshToken: true } })
  : null

// Las imágenes se guardan como RUTA ({negocio_id}/{carpeta}/archivo); aquí se arma la URL pública.
export function urlImagen(ruta) {
  return ruta && url ? `${url}/storage/v1/object/public/negocios/${ruta}` : null
}
