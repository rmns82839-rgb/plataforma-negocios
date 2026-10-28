// Buscador inteligente (archivo .js aparte por el Fast Refresh de Vite).
// Encuentra aunque la persona escriba "como suena" o se equivoque:
// - Ignora mayúsculas, tildes y la ñ: "jose" encuentra "José", "pinon" encuentra "Piñón".
// - Escritura parecida: b/v, s/z/c, ll/y, k/c/qu, g/j, la h muda, letras dobles: "bino" encuentra "Vino", "arros" a "Arroz".
// - Una letra mal puesta, de más, de menos o dos letras cambiadas: "aroz", "arrroz", "arzoz", "dtergente" encuentran lo suyo.
// - Plurales: "galleta" encuentra "Galletas" y al revés.
// - Varias palabras en cualquier orden: "diana arroz" encuentra "Arroz Diana"; también sin espacio: "cocacola" encuentra "Coca Cola".
// - Los números encuentran documentos y teléfonos aunque tengan puntos o espacios: "1234567" encuentra "1.234.567".
import { traerTodo } from './traerTodo.js'

/** Minúsculas y sin tildes (la ñ queda como n). */
export const normalizar = (t) =>
  String(t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

/** Forma "fonética" para comparar: quita lo que en español se escribe distinto pero suena igual. */
export function plegar(t) {
  let s = normalizar(t).replace(/[^a-z0-9]+/g, ' ').trim()
  s = s.replace(/ch/g, 'ç').replace(/ll/g, 'y').replace(/qu/g, 'k').replace(/gu(?=[ei])/g, 'G')
    .replace(/g(?=[ei])/g, 'j').replace(/G/g, 'g').replace(/c(?=[ei])/g, 's').replace(/c/g, 'k')
    .replace(/z/g, 's').replace(/v/g, 'b').replace(/w/g, 'u').replace(/h/g, '').replace(/([a-zç])\1+/g, '$1')
  return s.split(' ').map(p => (p.length > 3 && p.endsWith('s') ? p.slice(0, -1) : p)).join(' ')
}

/** Distancia entre dos palabras: cada letra de más, de menos, cambiada o dos letras intercambiadas cuenta 1. */
function distancia(a, b, tope) {
  if (Math.abs(a.length - b.length) > tope) return tope + 1
  const f = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0))
  for (let i = 0; i <= a.length; i++) f[i][0] = i
  for (let j = 0; j <= b.length; j++) f[0][j] = j
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const c = a[i - 1] === b[j - 1] ? 0 : 1
      f[i][j] = Math.min(f[i - 1][j] + 1, f[i][j - 1] + 1, f[i - 1][j - 1] + c)
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) f[i][j] = Math.min(f[i][j], f[i - 2][j - 2] + 1)
    }
  }
  return f[a.length][b.length]
}
const permitidos = (n) => (n <= 3 ? 0 : n <= 6 ? 1 : 2)

/** Qué tan bien encaja UNA palabra buscada con el texto ya plegado: 0 empieza igual · 1 empieza una palabra · 2 está adentro · 3 se parece · null no está. */
function puntoPalabra(t, texto, palabras) {
  const i = texto.indexOf(t)
  if (i === 0) return 0
  if (i > 0) return texto[i - 1] === ' ' ? 1 : 2
  const tope = permitidos(t.length)
  if (tope === 0 || /\d/.test(t)) return null
  for (const w of palabras) {
    if (distancia(t, w, tope) <= tope) return 3
    if (w.length > t.length && distancia(t, w.slice(0, t.length), tope) <= tope) return 3      // a medio escribir y con error
  }
  return null
}

/** null si no encaja; si encaja, un número (menor = mejor). */
export function puntaje(campos, consulta) {
  const tokens = plegar(consulta).split(' ').filter(Boolean)
  if (tokens.length === 0) return 0
  const lista = campos.map(c => c ?? '')
  const textos = lista.map(plegar)
  const todo = textos.join(' | ')
  const digitos = lista.map(c => String(c).replace(/\D/g, '')).join(' | ')
  const palabras = todo.split(/[ |]+/).filter(Boolean)
  let total = 0
  for (const t of tokens) {
    let p = puntoPalabra(t, todo, palabras)
    if (p === null && /^\d+$/.test(t) && digitos.includes(t)) p = 2
    if (p === null) { total = null; break }
    total += p
  }
  if (total !== null) return total
  const junto = tokens.join('')                                                  // "cocacola" ↔ "coca cola"
  if (junto.length >= 4 && textos.some(x => x.replace(/ /g, '').includes(junto))) return 2
  return null
}

/** @param campos lista de textos donde buscar  @param consulta lo que escribió la persona */
export const coincide = (campos, consulta) => puntaje(campos, consulta) !== null

/** Los mejores primero (empieza igual, luego una palabra, luego adentro, luego parecidos) y a igual puntaje por nombre. */
export function ordenarPorInicio(filas, consulta, campo = 'nombre') {
  const q = normalizar(consulta).trim()
  const rango = (f) => (puntaje([f[campo]], consulta) ?? 9) + (normalizar(f[campo]).startsWith(q) ? 0 : normalizar(f[campo]).includes(q) ? 0.25 : 0.5)   // a igual puntaje, el que lo tiene escrito tal cual va antes
  return [...filas].map(f => [rango(f), f]).sort((a, b) => a[0] - b[0] || String(a[1][campo]).localeCompare(String(b[1][campo]), 'es')).map(x => x[1])
}

// ---------- Búsqueda en la base de datos ----------
// La base solo sabe buscar letra por letra (ilike), así que se baja una lista liviana (id + nombre) una vez, se guarda 45 s
// y se busca aquí con el buscador inteligente. Si algo falla, se usa la búsqueda simple de antes.
const indices = new Map()
const VIGENCIA = 45000
export const limpiarIndiceBusqueda = () => indices.clear()

async function indice(clave, armar, refrescar = false) {
  const hit = indices.get(clave)
  if (hit && !refrescar && Date.now() - hit.t < VIGENCIA) return hit.filas
  const { data, error } = await traerTodo(armar)
  if (error || !data) { indices.delete(clave); return null }
  indices.set(clave, { t: Date.now(), filas: data })
  return data
}

/** Busca en una lista liviana de una tabla. `armar()` devuelve una consulta NUEVA (con select, filtros y order). `campos(f)` = textos donde buscar. */
export async function buscarEnIndice(clave, armar, texto, { campos = (f) => [f.nombre], max = 5 } = {}) {
  const q = String(texto ?? '').trim()
  const buscar = (filas) => filas.map(f => [puntaje(campos(f), q), f]).filter(x => x[0] !== null)
    .sort((a, b) => a[0] - b[0] || String(a[1].nombre).localeCompare(String(b[1].nombre), 'es')).slice(0, max).map(x => x[1])
  let filas = await indice(clave, armar)
  if (!filas) return null
  let r = buscar(filas)
  const viejo = Date.now() - (indices.get(clave)?.t ?? 0) > 5000
  if (r.length === 0 && viejo) { filas = await indice(clave, armar, true); if (filas) r = buscar(filas) }      // por si se acaba de crear algo y la lista guardada no lo tiene
  return r
}

/** Busca productos por nombre o código (trayendo PRIMERO los que empiezan con lo escrito). Devuelve las filas completas y al día. */
export async function buscarProductosPorNombre(supabase, texto) {
  const q = String(texto).trim().replace(/[%,]/g, ' ')
  const mejores = await buscarEnIndice('productos', () => supabase.from('productos').select('id, nombre, codigo').eq('activo', true).order('nombre').order('id'), q,
    { campos: (f) => [f.nombre, f.codigo], max: 40 })
  if (mejores) {
    if (mejores.length === 0) return { data: [], error: null }
    const ids = mejores.map(f => f.id)
    const { data, error } = await supabase.from('productos').select('*').in('id', ids).eq('activo', true)
    if (error) return { data: null, error }
    const por = new Map((data ?? []).map(f => [f.id, f]))
    return { data: ids.map(i => por.get(i)).filter(Boolean), error: null }         // precio y stock de este momento, en el orden de mejor coincidencia
  }
  return buscarSimple(supabase, q)
}

async function buscarSimple(supabase, q) {
  const pedir = (patron, tope) => supabase.from('productos').select('*').eq('activo', true)
    .ilike('nombre', patron).order('nombre').limit(tope)
  const [a, b, c] = await Promise.all([pedir(`${q}%`, 30), pedir(`% ${q}%`, 20), pedir(`%${q}%`, 20)])
  const error = a.error || b.error || c.error
  const vistos = new Set()
  const data = [...(a.data ?? []), ...(b.data ?? []), ...(c.data ?? [])].filter(f => !vistos.has(f.id) && vistos.add(f.id))
  return { data, error }
}
