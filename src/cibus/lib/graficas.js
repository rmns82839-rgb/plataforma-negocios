// Ayudas para las gráficas del tablero (sin pantalla): colores, cálculo de mosaico (treemap) y metas.
// Paleta categórica validada (claridad, croma y contraste sobre blanco); se asigna siempre en este orden.
export const PALETA = ['#A8803A', '#2F6FB5', '#0E8A6B', '#D2573B', '#7E57C2']
export const COLOR_OTROS = '#A8A29E'
export const colorDe = (i, esOtros = false) => (esOtros ? COLOR_OTROS : PALETA[i % PALETA.length])

/** Deja las 5 mayores y junta el resto en "Otros". filas: [{ nombre, valor }] */
export function conOtros(filas, max = 5) {
  const ord = [...filas].filter(f => f.valor > 0).sort((a, b) => b.valor - a.valor)
  if (ord.length <= max) return ord.map((f, i) => ({ ...f, color: colorDe(i) }))
  const cab = ord.slice(0, max - 1)
  const resto = ord.slice(max - 1)
  return [...cab.map((f, i) => ({ ...f, color: colorDe(i) })),
    { nombre: 'Otros', valor: resto.reduce((s, f) => s + f.valor, 0), color: COLOR_OTROS }]
}

/** Mosaico (treemap) "squarified". items: [{valor,...}] ya ordenados de mayor a menor. Devuelve cada item con x,y,w,h (0–100). */
export function mosaico(items, W = 100, H = 100) {
  const total = items.reduce((s, i) => s + i.valor, 0)
  if (total <= 0) return []
  const escala = (W * H) / total
  const nodos = items.map(i => ({ ...i, area: i.valor * escala }))
  const salida = []
  let x = 0, y = 0, w = W, h = H
  let fila = []
  const peor = (f, lado) => {
    const s = f.reduce((a, n) => a + n.area, 0)
    const mx = Math.max(...f.map(n => n.area)), mn = Math.min(...f.map(n => n.area))
    return Math.max((lado * lado * mx) / (s * s), (s * s) / (lado * lado * mn))
  }
  const colocar = (f) => {
    const s = f.reduce((a, n) => a + n.area, 0)
    if (w >= h) {                        // columna a la izquierda
      const ancho = s / h; let yy = y
      for (const n of f) { const alto = n.area / ancho; salida.push({ ...n, x, y: yy, w: ancho, h: alto }); yy += alto }
      x += ancho; w -= ancho
    } else {                             // fila arriba
      const alto = s / w; let xx = x
      for (const n of f) { const ancho = n.area / alto; salida.push({ ...n, x: xx, y, w: ancho, h: alto }); xx += ancho }
      y += alto; h -= alto
    }
  }
  for (const n of nodos) {
    const lado = Math.min(w, h)
    if (fila.length === 0 || peor([...fila, n], lado) <= peor(fila, lado)) fila.push(n)
    else { colocar(fila); fila = [n] }
  }
  if (fila.length) colocar(fila)
  return salida
}

/** Cascada del dinero: vendido → costo → datáfono → ganancia → gastos → ganancia neta. */
export function cascada(d) {
  const vendido = Number(d.vendido) || 0
  const ganancia = Number(d.ganancia) || 0
  const comis = Number(d.comisiones) || 0
  const gastos = Number(d.gastos) || 0
  const costo = Math.max(0, vendido - ganancia - comis)
  return [
    { nombre: 'Vendido', desde: 0, hasta: vendido, tipo: 'total' },
    { nombre: 'Costo de lo vendido', desde: vendido - costo, hasta: vendido, tipo: 'baja', valor: costo },
    { nombre: 'Comisión datáfono', desde: ganancia, hasta: ganancia + comis, tipo: 'baja', valor: comis },
    { nombre: 'Ganancia de las ventas', desde: 0, hasta: ganancia, tipo: 'total' },
    { nombre: 'Gastos', desde: ganancia - gastos, hasta: ganancia, tipo: 'baja', valor: gastos },
    { nombre: 'Ganancia neta', desde: Math.min(0, ganancia - gastos), hasta: Math.max(0, ganancia - gastos), tipo: 'total', negativo: ganancia - gastos < 0 },
  ]
}

/** Acumulado de una serie de días [{vendido}] */
export const acumulado = (serie) => { let s = 0; return serie.map(x => ({ ...x, acum: (s += x.vendido) })) }

const CLAVE = (k) => `matriz-meta-${k}`
export const leerMeta = (k) => { try { const v = Number(localStorage.getItem(CLAVE(k))); return v > 0 ? v : 0 } catch { return 0 } }
export const guardarMeta = (k, v) => { try { if (v > 0) localStorage.setItem(CLAVE(k), String(Math.round(v))); else localStorage.removeItem(CLAVE(k)) } catch { /* sin almacenamiento */ } }

/** Punto en el círculo (grados desde las 12 en punto, sentido horario) */
export const polar = (cx, cy, r, grados) => {
  const a = ((grados - 90) * Math.PI) / 180
  return [cx + r * Math.cos(a), cy + r * Math.sin(a)]
}
