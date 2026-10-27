// Cruza los ingredientes de un menú con los productos que la tienda SÍ tiene (solo disponibles).
import { normalizar } from './buscar'

export function productoPara(ing, productos) {
  const k = normalizar(ing.k)
  const hallados = productos.filter(p => p.disponible && normalizar(p.nombre).split(/[^a-z0-9ñ]+/).some(w => w.startsWith(k) || (k.length > 4 && w === k + 's')))
  if (!hallados.length) return null
  // el más corto suele ser el más básico ("Arroz" antes que "Arroz con coco precocido")
  return hallados.sort((a, b) => a.nombre.length - b.nombre.length)[0]
}

export function cruzar(ingredientes, productos) {
  const hay = [], faltan = [], usados = new Set()
  for (const ing of ingredientes ?? []) {
    const p = productoPara(ing, productos)
    if (p && !usados.has(p.id)) { usados.add(p.id); hay.push({ ing, producto: p }) } else if (!p) faltan.push(ing)
  }
  return { hay, faltan }
}
