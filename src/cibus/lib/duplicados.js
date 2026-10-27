// Detecta productos y categorías repetidos aunque estén escritos distinto
// (mayúsculas, tildes, "g"/"gr"/"gramos", plural, orden de las palabras).
// OJO: la misma regla está en SQL (supabase/migracion-v51-sin-repetidos.sql, función clave_nombre). Si cambias una, cambia la otra.

const SIN_TILDE = { á: 'a', é: 'e', í: 'i', ó: 'o', ú: 'u', ü: 'u', ñ: 'n' }
const PALABRAS_VACIAS = /\b(de|del|la|el|y|con|und|unds|unidad|unidades|un)\b/g

/** Palabras "limpias" de un nombre, sin repetir y en orden alfabético. */
export function palabrasClave(texto) {
  let t = String(texto ?? '').toLowerCase().replace(/[áéíóúüñ]/g, c => SIN_TILDE[c])
  t = t.replace(/(\d+)\s*(gramos|grs|gr|g)\b/g, '$1g')
       .replace(/(\d+)\s*(mililitros|ml)\b/g, '$1ml')
       .replace(/(\d+)\s*(kilos|kilo|kg)\b/g, '$1kg')
       .replace(/(\d+)\s*(litros|litro|lts|lt|l)\b/g, '$1l')
  t = t.replace(/[^a-z0-9 ]/g, ' ').replace(PALABRAS_VACIAS, ' ')
  t = t.replace(/([a-z]{3})s\b/g, '$1')
  return [...new Set(t.split(/\s+/).filter(Boolean))].sort()
}

export const claveNombre = (nombre) => palabrasClave(nombre).join(' ')
export const claveCategoria = claveNombre

const numeros = (ps) => ps.filter(p => /\d/.test(p)).join(' ')

/** Productos de `lista` que son el mismo (igual) o se parecen mucho (parecido). Ignora el producto `idActual`. */
export function buscarRepetidos(nombre, lista, idActual = null) {
  const ps = palabrasClave(nombre)
  const clave = ps.join(' ')
  const igual = [], parecido = []
  if (!clave) return { igual, parecido }
  for (const p of lista) {
    if (idActual != null && p.id === idActual) continue
    const qs = palabrasClave(p.nombre)
    if (qs.join(' ') === clave) { igual.push(p); continue }
    if (numeros(qs) !== numeros(ps)) continue          // otro tamaño o cantidad: es otro producto
    const comunes = ps.filter(x => qs.includes(x)).length
    const union = new Set([...ps, ...qs]).size
    if (union > 0 && comunes / union >= 0.75) parecido.push(p)
  }
  return { igual, parecido }
}

/** Si la categoría escrita ya existe con otra escritura, devuelve la que ya existe; si no, null. */
export function categoriaExistente(texto, categorias) {
  const k = claveCategoria(texto)
  if (!k) return null
  return categorias.find(c => claveCategoria(c) === k) ?? null
}
