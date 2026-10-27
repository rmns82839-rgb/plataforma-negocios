// Canciones propias para los avisos de la caja. Se recortan a 10 segundos y se guardan SOLO en este celular
// (IndexedDB): no se sube nada a Supabase ni ocupa espacio allá. Archivo .js aparte (Fast Refresh).
export const MAX_SEG_AVISO = 10
export const MAX_ORIGINAL_MB = 15
const BD = 'matriz-sonidos', TABLA = 'propios'

const abrir = () => new Promise((res, rej) => {
  const r = indexedDB.open(BD, 1)
  r.onupgradeneeded = () => r.result.createObjectStore(TABLA)
  r.onsuccess = () => res(r.result)
  r.onerror = () => rej(r.error)
})
const op = async (modo, f) => {
  const db = await abrir()
  return new Promise((res, rej) => {
    const t = db.transaction(TABLA, modo), r = f(t.objectStore(TABLA))
    t.oncomplete = () => { db.close(); res(r.result) }
    t.onerror = () => { db.close(); rej(t.error) }
  })
}
export const guardarPropio = (clave, buffer) => op('readwrite', s => s.put(buffer, clave))
export const leerPropio = (clave) => op('readonly', s => s.get(clave)).catch(() => null)
export const borrarPropio = (clave) => op('readwrite', s => s.delete(clave))

const aWav = (canal, hz) => {
  const n = canal.length, b = new ArrayBuffer(44 + n * 2), v = new DataView(b)
  const t = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)) }
  t(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); t(8, 'WAVE'); t(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true)
  v.setUint16(22, 1, true); v.setUint32(24, hz, true); v.setUint32(28, hz * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true)
  t(36, 'data'); v.setUint32(40, n * 2, true)
  for (let i = 0; i < n; i++) v.setInt16(44 + i * 2, Math.max(-1, Math.min(1, canal[i])) * 0x7fff, true)
  return b
}

/** Lee el archivo y devuelve { duracion, decodificado }. Lanza Error con mensaje claro si no se puede. */
export async function leerCancion(archivo) {
  if (!archivo.type.startsWith('audio/') && !/\.(mp3|m4a|aac|wav|ogg|opus)$/i.test(archivo.name)) throw new Error('Ese archivo no es una canción. Usa un MP3 o M4A.')
  if (archivo.size > MAX_ORIGINAL_MB * 1048576) throw new Error(`La canción pesa ${(archivo.size / 1048576).toFixed(1)} MB y el máximo es ${MAX_ORIGINAL_MB} MB.`)
  const A = window.AudioContext || window.webkitAudioContext
  if (!A) throw new Error('Este navegador no puede preparar el sonido.')
  const c = new A()
  try {
    const decodificado = await c.decodeAudioData(await archivo.arrayBuffer())
    return { duracion: decodificado.duration, decodificado }
  } catch { throw new Error('No se pudo leer esa canción. Prueba con otro archivo MP3 o M4A.') }
  finally { try { c.close() } catch { /* nada */ } }
}

/** Recorta MAX_SEG_AVISO segundos desde `inicio`, en mono a 22 kHz, con un cierre suave. Devuelve ArrayBuffer WAV (~440 KB). */
export async function recortarAviso(decodificado, inicio = 0) {
  const hz = 22050, seg = Math.min(MAX_SEG_AVISO, Math.max(1, decodificado.duration - inicio))
  const o = new OfflineAudioContext(1, Math.ceil(seg * hz), hz)
  const f = o.createBufferSource(); f.buffer = decodificado
  const g = o.createGain(); g.gain.setValueAtTime(1, 0); g.gain.setValueAtTime(1, Math.max(0, seg - 0.6)); g.gain.linearRampToValueAtTime(0, seg)
  f.connect(g); g.connect(o.destination); f.start(0, inicio, seg)
  const r = await o.startRendering()
  return aWav(r.getChannelData(0), hz)
}
