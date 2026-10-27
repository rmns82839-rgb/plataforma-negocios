// Cálculos del pesaje: productos que se venden por kilo, libra, litro o metro.
// Van en .js aparte por el Fast Refresh de Vite.

const r3 = (n) => Math.round(n * 1000) / 1000

/** ¿Se vende por peso o medida (no por unidad)? */
export const esPesable = (p) => Boolean(p?.unidad && p.unidad !== 'und')

/** Cantidad que se lleva el cliente si pide "$3.000 de yuca" y el kilo vale $2.800. */
export const cantidadPorValor = (valor, precio) => {
  const v = Number(valor), p = Number(precio)
  if (!(v > 0) || !(p > 0)) return 0
  return r3(v / p)
}

/** Texto de cantidad para el campo (coma decimal, sin ceros de sobra). */
export const textoCantidad = (n) => String(r3(Number(n) || 0)).replace('.', ',')

/** Fracciones de uso común, de menor a mayor. */
export const FRACCIONES = [
  { cantidad: 0.25, texto: '¼' },
  { cantidad: 0.5,  texto: '½' },
  { cantidad: 0.75, texto: '¾' },
  { cantidad: 1,    texto: '1' },
]

/** Para kilos: "570 g". Para el resto no aplica. */
export const enGramos = (unidad, cantidad) =>
  unidad === 'kg' && cantidad > 0 && cantidad < 10 ? `${Math.round(cantidad * 1000)} g` : ''
