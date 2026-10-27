// Buscador inteligente (archivo .js aparte por el Fast Refresh de Vite).
// - Ignora mayúsculas y tildes: "jose" encuentra "José".
// - Varias palabras: todas deben aparecer ("jose viz" encuentra "Jose Vizcaino").
// - Los números encuentran documentos y teléfonos aunque tengan puntos o espacios:
//   "1234567" encuentra "1.234.567".

export const normalizar = (t) =>
  String(t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

/** @param campos lista de textos donde buscar  @param consulta lo que escribió la persona */
export function coincide(campos, consulta) {
  const tokens = normalizar(consulta).split(/\s+/).filter(Boolean)
  if (tokens.length === 0) return true
  const texto = campos.map(normalizar).join(' | ')
  const digitos = campos.map(c => String(c ?? '').replace(/\D/g, '')).join(' | ')
  return tokens.every(t => texto.includes(t) || (/^\d+$/.test(t) && digitos.includes(t)))
}

/** Los que empiezan con lo escrito primero, luego los que tienen una palabra que empieza así, luego el resto (por nombre). */
export function ordenarPorInicio(filas, consulta, campo = 'nombre') {
  const q = normalizar(consulta).trim()
  const rango = (f) => {
    const n = normalizar(f[campo])
    return n.startsWith(q) ? 0 : n.split(/\s+/).some(w => w.startsWith(q)) ? 1 : 2
  }
  return [...filas].sort((a, b) => rango(a) - rango(b) || String(a[campo]).localeCompare(String(b[campo]), 'es'))
}

/** Busca productos por nombre trayendo PRIMERO los que empiezan con lo escrito (antes el tope de 40 por orden alfabético dejaba afuera, p. ej., "Limón" al escribir "li"). */
export async function buscarProductosPorNombre(supabase, texto) {
  const q = String(texto).trim().replace(/[%,]/g, ' ')
  const pedir = (patron, tope) => supabase.from('productos').select('*').eq('activo', true)
    .ilike('nombre', patron).order('nombre').limit(tope)
  const [a, b, c] = await Promise.all([pedir(`${q}%`, 30), pedir(`% ${q}%`, 20), pedir(`%${q}%`, 20)])
  const error = a.error || b.error || c.error
  const vistos = new Set()
  const data = [...(a.data ?? []), ...(b.data ?? []), ...(c.data ?? [])].filter(f => !vistos.has(f.id) && vistos.add(f.id))
  return { data, error }
}
