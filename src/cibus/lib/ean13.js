// Dibujo de códigos de barras EAN-13 en SVG (sin librerías). Los códigos internos de la plataforma
// (20… del catálogo y 21… de cada tienda) son EAN-13 válidos: los lee cualquier escáner o cámara.
const L = ['0001101', '0011001', '0010011', '0111101', '0100011', '0110001', '0101111', '0111011', '0110111', '0001011']
const G = ['0100111', '0110011', '0011011', '0100001', '0011101', '0111001', '0000101', '0010001', '0001001', '0010111']
const R = ['1110010', '1100110', '1101100', '1000010', '1011100', '1001110', '1010000', '1000100', '1001000', '1110100']
const PARIDAD = ['LLLLLL', 'LLGLGG', 'LLGGLG', 'LLGGGL', 'LGLLGG', 'LGGLLG', 'LGGGLL', 'LGLGLG', 'LGLGGL', 'LGGLGL']

export function ean13Valido(c) {
  if (!/^\d{13}$/.test(String(c))) return false
  const d = String(c).split('').map(Number)
  const k = d.pop()
  const s = d.reduce((t, n, i) => t + n * (i % 2 === 0 ? 1 : 3), 0)
  return (10 - (s % 10)) % 10 === k
}

/** Los 95 módulos (1 = barra, 0 = espacio) del código, o null si no es un EAN-13 válido. */
export function ean13Modulos(c) {
  c = String(c)
  if (!ean13Valido(c)) return null
  const d = c.split('').map(Number)
  const par = PARIDAD[d[0]]
  let m = '101'
  for (let i = 0; i < 6; i++) m += (par[i] === 'L' ? L : G)[d[i + 1]]
  m += '01010'
  for (let i = 0; i < 6; i++) m += R[d[i + 7]]
  return m + '101'
}

/** SVG del código de barras (con zonas en blanco a los lados). null si el código no es EAN-13 válido. */
export function ean13Svg(c, { alto = 60, modulo = 2 } = {}) {
  const m = ean13Modulos(c)
  if (!m) return null
  const margen = 9 * modulo
  const ancho = m.length * modulo + margen * 2
  let rects = ''
  for (let i = 0; i < m.length;) {
    if (m[i] === '1') { let j = i; while (j < m.length && m[j] === '1') j++; rects += `<rect x="${margen + i * modulo}" y="0" width="${(j - i) * modulo}" height="${alto}"/>`; i = j } else i++
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${ancho} ${alto}" width="100%" preserveAspectRatio="xMidYMid meet" fill="#000" shape-rendering="crispEdges" role="img" aria-label="Código de barras ${c}">${rects}</svg>`
}
