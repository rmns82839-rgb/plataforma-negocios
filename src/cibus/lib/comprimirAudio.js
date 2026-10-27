// Prepara una canción para subirla: si pesa de más la comprime a MP3 mono liviano (64 kbps) y, solo si aún
// así no cabe, la corta con un cierre suave. Todo ocurre en el celular. Archivo .js aparte (Fast Refresh).
const BITRATE = 64, HZ = 22050
export const MAX_SEG_MUSICA = 420       // 64 kbps ≈ 8 KB/s → 420 s ≈ 3,4 MB (cabe en 4 MB)

/** Devuelve { archivo, recortada, comprimida, segundos }. `maxBytes` es el límite de subida. */
export async function prepararMusica(original, maxBytes, enProgreso = () => {}) {
  const A = window.AudioContext || window.webkitAudioContext
  if (!A) throw new Error('Este navegador no puede preparar la canción.')
  if (original.size > 60 * 1048576) throw new Error('El archivo es demasiado grande (más de 60 MB). Elige otra canción.')
  const c = new A()
  let dec
  try { dec = await c.decodeAudioData(await original.arrayBuffer()) }
  catch { throw new Error('No se pudo leer esa canción. Prueba con otro archivo MP3 o M4A.') }
  finally { try { c.close() } catch { /* nada */ } }

  if (original.size <= maxBytes && dec.duration <= MAX_SEG_MUSICA) return { archivo: original, recortada: false, comprimida: false, segundos: dec.duration }

  enProgreso('Comprimiendo…')
  const seg = Math.min(dec.duration, MAX_SEG_MUSICA), recortada = dec.duration > MAX_SEG_MUSICA
  const o = new OfflineAudioContext(1, Math.ceil(seg * HZ), HZ)
  const f = o.createBufferSource(); f.buffer = dec
  const g = o.createGain()
  if (recortada) { g.gain.setValueAtTime(1, Math.max(0, seg - 3)); g.gain.linearRampToValueAtTime(0, seg) }
  f.connect(g); g.connect(o.destination); f.start(0)
  const pcm = (await o.startRendering()).getChannelData(0)
  const muestras = new Int16Array(pcm.length)
  for (let i = 0; i < pcm.length; i++) muestras[i] = Math.max(-1, Math.min(1, pcm[i])) * 0x7fff

  const { Mp3Encoder } = await import('@breezystack/lamejs')
  const enc = new Mp3Encoder(1, HZ, BITRATE), partes = []
  for (let i = 0; i < muestras.length; i += 1152 * 20) {
    const b = enc.encodeBuffer(muestras.subarray(i, i + 1152 * 20)); if (b.length) partes.push(b)
    if ((i / 1152 / 20) % 25 === 0) { enProgreso(`Comprimiendo… ${Math.round((i / muestras.length) * 100)} %`); await new Promise(r => setTimeout(r, 0)) }
  }
  const fin = enc.flush(); if (fin.length) partes.push(fin)
  const blob = new Blob(partes, { type: 'audio/mpeg' })
  if (blob.size > maxBytes) throw new Error('Aun comprimida no cabe. Elige una canción más corta.')
  const nombre = original.name.replace(/\.[^.]+$/, '') + '.mp3'
  return { archivo: new File([blob], nombre, { type: 'audio/mpeg' }), recortada, comprimida: true, segundos: seg }
}
