// ZIP mínimo sin dependencias (método "stored", sin comprimir): suficiente para una copia de seguridad.
const TABLA = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()

export const crc32 = (datos) => {
  let c = 0xffffffff
  for (let i = 0; i < datos.length; i++) c = TABLA[(c ^ datos[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

/** @param {{ nombre: string, datos: string | Uint8Array }[]} archivos  @returns {Blob} */
export function crearZip(archivos, fecha = new Date()) {
  const enc = new TextEncoder()
  const dosHora = (fecha.getHours() << 11) | (fecha.getMinutes() << 5) | (fecha.getSeconds() >> 1)
  const dosFecha = ((fecha.getFullYear() - 1980) << 9) | ((fecha.getMonth() + 1) << 5) | fecha.getDate()
  const partes = []
  const central = []
  let desplazamiento = 0
  for (const a of archivos) {
    const nombre = enc.encode(a.nombre)
    const datos = typeof a.datos === 'string' ? enc.encode(a.datos) : a.datos
    const crc = crc32(datos)
    const local = new DataView(new ArrayBuffer(30))
    local.setUint32(0, 0x04034b50, true); local.setUint16(4, 20, true); local.setUint16(6, 0x0800, true)  // 0x0800 = nombres en UTF-8
    local.setUint16(8, 0, true); local.setUint16(10, dosHora, true); local.setUint16(12, dosFecha, true)
    local.setUint32(14, crc, true); local.setUint32(18, datos.length, true); local.setUint32(22, datos.length, true)
    local.setUint16(26, nombre.length, true); local.setUint16(28, 0, true)
    partes.push(local.buffer, nombre, datos)

    const c = new DataView(new ArrayBuffer(46))
    c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true)
    c.setUint16(10, 0, true); c.setUint16(12, dosHora, true); c.setUint16(14, dosFecha, true)
    c.setUint32(16, crc, true); c.setUint32(20, datos.length, true); c.setUint32(24, datos.length, true)
    c.setUint16(28, nombre.length, true); c.setUint32(42, desplazamiento, true)
    central.push(c.buffer, nombre)
    desplazamiento += 30 + nombre.length + datos.length
  }
  const tamCentral = central.reduce((s, p) => s + (p.byteLength ?? p.length), 0)
  const fin = new DataView(new ArrayBuffer(22))
  fin.setUint32(0, 0x06054b50, true); fin.setUint16(8, archivos.length, true); fin.setUint16(10, archivos.length, true)
  fin.setUint32(12, tamCentral, true); fin.setUint32(16, desplazamiento, true)
  return new Blob([...partes, ...central, fin.buffer], { type: 'application/zip' })
}
