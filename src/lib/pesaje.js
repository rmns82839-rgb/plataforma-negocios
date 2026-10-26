// Productos que se venden por peso o medida (kilos, libras, litros…): la cantidad puede ser decimal.
const PESO = new Set(['kg', 'kilo', 'kilos', 'g', 'gr', 'gramo', 'gramos', 'lb', 'libra', 'libras', 'l', 'lt', 'litro', 'litros', 'ml', 'm', 'mt', 'metro', 'metros'])
const MENUDO = new Set(['g', 'gr', 'gramo', 'gramos', 'ml'])
const limpia = (u) => String(u ?? '').trim().toLowerCase().replace(/\./g, '')

export const esPeso = (unidad) => PESO.has(limpia(unidad))
// Gramos y mililitros se mueven de 100 en 100; lo demás, de cuarto en cuarto
export const pasoPeso = (unidad) => (MENUDO.has(limpia(unidad)) ? 100 : 0.25)
export const atajosPeso = (unidad) => (MENUDO.has(limpia(unidad)) ? [100, 250, 500, 1000] : [0.25, 0.5, 1, 2])

// "1,5" o "1.5" → 1.5 (hasta 3 decimales, entre 0 y 9999); null si no sirve
export function leerPeso(texto) {
  const t = String(texto ?? '').trim().replace(',', '.')
  if (!/^\d{1,4}(\.\d{1,3})?$/.test(t)) return null
  const n = Number(t)
  return n > 0 && n <= 9999 ? n : null
}
export const sumarPeso = (a, b) => Math.round((Number(a) + Number(b)) * 1000) / 1000
export const textoCantidad = (c) => Number(c).toLocaleString('es-CO', { maximumFractionDigits: 3 })
