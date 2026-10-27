// Canción de fondo del catálogo: un solo archivo, que el dueño sube y borra. Nunca se acumulan archivos.
import { supabase } from './supabase'
import { prepararMusica } from './comprimirAudio'

export const BUCKET_MUSICA = 'musica-fondo'
export const MAX_MUSICA_MB = 4
const EXT = { 'audio/mpeg': 'mp3', 'audio/mp3': 'mp3', 'audio/mp4': 'm4a', 'audio/x-m4a': 'm4a', 'audio/aac': 'aac', 'audio/ogg': 'ogg', 'audio/webm': 'webm', 'audio/wav': 'wav', 'audio/x-wav': 'wav' }

export const rutaDeMusica = (url) => {
  const m = String(url ?? '').match(new RegExp(`/${BUCKET_MUSICA}/([^?#]+)`))
  return m ? decodeURIComponent(m[1]) : null
}
export async function borrarMusica(url) {
  const ruta = rutaDeMusica(url)
  if (!ruta) return true
  const { error } = await supabase.storage.from(BUCKET_MUSICA).remove([ruta])
  return !error
}
/** Sube la canción nueva, la deja como la de fondo y borra la anterior. Devuelve { url } o { error }. */
export async function cambiarMusica(original, anterior, enProgreso) {
  let archivo = original, aviso = ''
  try {
    const r = await prepararMusica(original, MAX_MUSICA_MB * 1048576, enProgreso)
    archivo = r.archivo
    if (r.comprimida) aviso = r.recortada ? `Se comprimió y se cortó a ${Math.floor(r.segundos / 60)} min ${Math.round(r.segundos % 60)} s para que cupiera.` : 'Se comprimió automáticamente para que cupiera.'
  } catch (e) { return { error: e.message } }
  enProgreso?.('Subiendo…')
  const ext = EXT[archivo.type] || (/\.(mp3|m4a|aac|wav|ogg)$/i.exec(archivo.name)?.[1]?.toLowerCase())
  if (!ext) return { error: 'Ese archivo no es una canción compatible. Usa un MP3 o M4A.' }
  if (archivo.size > MAX_MUSICA_MB * 1048576) return { error: `La canción pesa ${(archivo.size / 1048576).toFixed(1)} MB y el máximo es ${MAX_MUSICA_MB} MB. Usa una más corta (1 a 3 minutos) o comprímela.` }
  const ruta = `${crypto.randomUUID()}.${ext}`
  const { error } = await supabase.storage.from(BUCKET_MUSICA).upload(ruta, archivo, { contentType: archivo.type || `audio/${ext}`, cacheControl: '3600' })
  if (error) return { error: /bucket|not found/i.test(error.message) ? 'Falta ejecutar migracion-v45.sql en Supabase.' : `No se pudo subir la canción: ${error.message}` }
  const url = supabase.storage.from(BUCKET_MUSICA).getPublicUrl(ruta).data.publicUrl
  const nombre = archivo.name.replace(/\.[^.]+$/, '').slice(0, 80) || 'Canción'
  const { error: e2 } = await supabase.rpc('fijar_musica_fondo', { p_url: url, p_nombre: nombre })
  if (e2) { await borrarMusica(url); return { error: /could not find the function|schema cache/i.test(e2.message) ? 'Falta ejecutar migracion-v45.sql en Supabase.' : e2.message } }
  if (anterior) await borrarMusica(anterior)
  return { url, nombre, aviso }
}
export async function quitarMusica(url) {
  const { error } = await supabase.rpc('quitar_musica_fondo')
  if (error) return { error: error.message }
  await borrarMusica(url)
  return {}
}
