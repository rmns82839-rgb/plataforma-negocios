// Detecta fotos que son «solo letras»: casi todo es fondo liso y lo demás es un poco de texto (tarjeta con el nombre).
// Se reduce la imagen a 48×48, se toma el color del borde como fondo y se mide cuánto se aparta de él.
// Solo SUGIERE: la persona revisa y confirma. Devuelve true / false, o null si la foto no se pudo leer.
export const analizarPixeles = (datos, lado = 48) => {
  const px = (x, y) => { const i = (y * lado + x) * 4; return [datos[i], datos[i + 1], datos[i + 2]] }
  const borde = []
  for (let k = 0; k < lado; k++) { borde.push(px(k, 0), px(k, lado - 1), px(0, k), px(lado - 1, k)) }
  const med = (c) => { const v = borde.map(p => p[c]).sort((a, b) => a - b); return v[v.length >> 1] }
  const fondo = [med(0), med(1), med(2)]
  const m = 4                                             // se ignora el marco fino que suelen traer estas tarjetas
  let fuera = 0, total = 0
  for (let y = m; y < lado - m; y++) for (let x = m; x < lado - m; x++) {
    const p = px(x, y); total++
    if (Math.abs(p[0] - fondo[0]) + Math.abs(p[1] - fondo[1]) + Math.abs(p[2] - fondo[2]) > 60) fuera++
  }
  return { fondo, fraccion: fuera / total }
}
export const parecenLetras = (datos, lado) => analizarPixeles(datos, lado).fraccion <= 0.07

export function esFotoDeTexto(url, esperaMs = 10000) {
  return new Promise((ok) => {
    const img = new Image(); img.crossOrigin = 'anonymous'
    const t = setTimeout(() => { img.src = ''; ok(null) }, esperaMs)
    img.onload = () => {
      clearTimeout(t)
      try {
        const c = document.createElement('canvas'); c.width = c.height = 48
        const x = c.getContext('2d', { willReadFrequently: true })
        x.fillStyle = '#fff'; x.fillRect(0, 0, 48, 48); x.drawImage(img, 0, 0, 48, 48)
        ok(parecenLetras(x.getImageData(0, 0, 48, 48).data, 48))
      } catch { ok(null) }
    }
    img.onerror = () => { clearTimeout(t); ok(null) }
    img.src = url
  })
}
