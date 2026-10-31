// Descargar la foto de un producto, o varias a la vez en un .zip (sin compresión: las fotos ya vienen comprimidas).
import { fotosDe } from './fotos'

const TABLA = (() => { const t = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0 } return t })()
const crc32 = (u8) => { let c = 0xFFFFFFFF; for (let i = 0; i < u8.length; i++) c = TABLA[(c ^ u8[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0 }

/** Arma un .zip simple (método «almacenado») con nombres UTF-8. archivos: [{ nombre, datos: Uint8Array }] */
export function armarZip(archivos) {
  const enc = new TextEncoder()
  const partes = [], central = []
  let pos = 0
  const d = new Date()
  const hora = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1)
  const fecha = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()
  for (const a of archivos) {
    const nom = enc.encode(a.nombre), crc = crc32(a.datos), n = a.datos.length
    const lh = new DataView(new ArrayBuffer(30))
    lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true); lh.setUint16(8, 0, true)
    lh.setUint16(10, hora, true); lh.setUint16(12, fecha, true); lh.setUint32(14, crc, true); lh.setUint32(18, n, true); lh.setUint32(22, n, true)
    lh.setUint16(26, nom.length, true); lh.setUint16(28, 0, true)
    partes.push(new Uint8Array(lh.buffer), nom, a.datos)
    const ch = new DataView(new ArrayBuffer(46))
    ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true); ch.setUint16(10, 0, true)
    ch.setUint16(12, hora, true); ch.setUint16(14, fecha, true); ch.setUint32(16, crc, true); ch.setUint32(20, n, true); ch.setUint32(24, n, true)
    ch.setUint16(28, nom.length, true); ch.setUint32(42, pos, true)
    central.push(new Uint8Array(ch.buffer), nom)
    pos += 30 + nom.length + n
  }
  const tam = central.reduce((s, x) => s + x.length, 0)
  const fin = new DataView(new ArrayBuffer(22))
  fin.setUint32(0, 0x06054b50, true); fin.setUint16(8, archivos.length, true); fin.setUint16(10, archivos.length, true)
  fin.setUint32(12, tam, true); fin.setUint32(16, pos, true)
  return new Blob([...partes, ...central, new Uint8Array(fin.buffer)], { type: 'application/zip' })
}

const limpio = (s) => String(s || 'producto').replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80) || 'producto'
const extDe = (url, tipo) => (/\.(webp|jpe?g|png|gif|avif)(\?|$)/i.exec(url)?.[1] ?? (tipo?.split('/')[1] || 'jpg')).toLowerCase().replace('jpeg', 'jpg')

function guardar(blob, nombre) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a'); a.href = url; a.download = nombre; document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 4000)
}

/** Baja las fotos de uno o varios productos. Uno con una sola foto: el archivo directo. Lo demás: un .zip. */
export async function descargarFotos(productos, alAvanzar) {
  const lista = []
  for (const p of productos) fotosDe(p).forEach((url, i, todas) => lista.push({ p, url, i, varias: todas.length > 1 }))
  if (lista.length === 0) return { bajadas: 0, fallidas: 0 }
  const archivos = [], usados = new Set()
  let fallidas = 0
  for (const [k, f] of lista.entries()) {
    try {
      const r = await fetch(f.url)
      if (!r.ok) throw new Error(String(r.status))
      const b = await r.blob()
      const base = limpio(f.p.nombre) + (f.varias ? ` ${f.i + 1}` : '')
      let nombre = `${base}.${extDe(f.url, b.type)}`, c = 2
      while (usados.has(nombre)) nombre = `${base} (${c++}).${extDe(f.url, b.type)}`
      usados.add(nombre)
      archivos.push({ nombre, datos: new Uint8Array(await b.arrayBuffer()), blob: b })
    } catch { fallidas++ }
    alAvanzar?.(k + 1, lista.length)
  }
  if (archivos.length === 0) return { bajadas: 0, fallidas }
  if (archivos.length === 1) guardar(archivos[0].blob, archivos[0].nombre)
  else guardar(armarZip(archivos), `fotos-productos-${new Date().toISOString().slice(0, 10)}.zip`)
  return { bajadas: archivos.length, fallidas }
}
