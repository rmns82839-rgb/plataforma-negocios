// Videos cortos de la publicidad: temporales. Se suben a Supabase y se borran de allí cuando ya no hacen falta.
import { supabase } from './supabase'

export const BUCKET_VIDEO = 'anuncios-video'
export const MAX_VIDEO_MB = 8
export const MAX_VIDEO_SEG = 15
export const MAX_DIAS_VIDEO = 30
const TIPOS = ['video/mp4', 'video/webm', 'video/quicktime']

const hoy = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date())
export const fechaMasDias = (n) => { const d = new Date(`${hoy()}T12:00:00`); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10) }
export const yaVencio = (hasta) => Boolean(hasta) && hasta < hoy()

/** Ruta del archivo dentro del espacio de videos, sacada del enlace público. */
export const rutaDeVideo = (url) => {
  const m = String(url ?? '').match(new RegExp(`/${BUCKET_VIDEO}/([^?#]+)`))
  return m ? decodeURIComponent(m[1]) : null
}

/** Borra el archivo de Supabase. Devuelve true si ya no está (o nunca estuvo). */
export async function borrarVideo(url) {
  const ruta = rutaDeVideo(url)
  if (!ruta) return true
  const { error } = await supabase.storage.from(BUCKET_VIDEO).remove([ruta])
  return !error
}

const duracionDe = (archivo) => new Promise((res) => {
  const v = document.createElement('video'), u = URL.createObjectURL(archivo)
  v.preload = 'metadata'
  v.onloadedmetadata = () => { const d = v.duration; URL.revokeObjectURL(u); res(Number.isFinite(d) ? d : null) }
  v.onerror = () => { URL.revokeObjectURL(u); res(null) }
  v.src = u
})

/** Revisa el archivo y lo sube. Devuelve { url } o { error } con un mensaje claro. */
export async function subirVideo(archivo) {
  if (!TIPOS.includes(archivo.type)) return { error: 'Ese archivo no es un video compatible. Usa un video MP4.' }
  if (archivo.size > MAX_VIDEO_MB * 1024 * 1024) return { error: `El video pesa ${(archivo.size / 1048576).toFixed(1)} MB y el máximo es ${MAX_VIDEO_MB} MB. Mándalo por WhatsApp a ti mismo y descárgalo: WhatsApp lo comprime.` }
  const seg = await duracionDe(archivo)
  if (seg && seg > MAX_VIDEO_SEG + 0.5) return { error: `El video dura ${Math.round(seg)} segundos y el máximo es ${MAX_VIDEO_SEG}.` }
  const ext = archivo.type === 'video/webm' ? 'webm' : archivo.type === 'video/quicktime' ? 'mov' : 'mp4'
  const ruta = `${crypto.randomUUID()}.${ext}`
  const { error } = await supabase.storage.from(BUCKET_VIDEO).upload(ruta, archivo, { contentType: archivo.type, cacheControl: '3600' })
  if (error) return { error: /bucket|not found/i.test(error.message) ? 'Falta ejecutar migracion-v40.sql en Supabase.' : `No se pudo subir el video: ${error.message}` }
  return { url: supabase.storage.from(BUCKET_VIDEO).getPublicUrl(ruta).data.publicUrl, seg }
}

/** Limpieza: borra los videos de los anuncios cuya fecha final ya pasó y los quita del anuncio. Devuelve cuántos borró. */
export async function limpiarVideosVencidos() {
  const { data, error } = await supabase.from('anuncios').select('id, video, hasta').not('video', 'is', null)
  if (error || !Array.isArray(data)) return 0
  let n = 0
  for (const a of data) {
    if (!yaVencio(a.hasta)) continue
    if (!(await borrarVideo(a.video))) continue       // si no se pudo borrar el archivo, se deja el enlace para reintentar
    const { error: err } = await supabase.from('anuncios').update({ video: null }).eq('id', a.id)
    if (!err) n += 1
  }
  return n
}
