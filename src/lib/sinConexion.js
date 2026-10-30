// Copia local del catálogo de cada tienda para verlo sin internet. Archivo .js aparte (Fast Refresh).
// Se guarda la última versión que se pudo cargar; sin internet se muestra esa, con un aviso. Pedir sí necesita conexión.
const CLAVE = (slug) => `catalogo-copia:${slug}`
const MAX_BYTES = 1_500_000      // una copia más grande no se guarda (el almacenamiento del navegador es limitado)
const MAX_TIENDAS = 5            // se conservan las copias de las últimas tiendas vistas

export function guardarCopia(slug, negocio, catalogo, ahora = Date.now()) {
  try {
    const texto = JSON.stringify({ ts: ahora, n: negocio, c: catalogo })
    if (texto.length > MAX_BYTES) return false
    localStorage.setItem(CLAVE(slug), texto)
    podar(slug)
    return true
  } catch { return false }   // sin espacio o sin almacenamiento: la tienda funciona igual
}

export function leerCopia(slug) {
  try {
    const t = localStorage.getItem(CLAVE(slug))
    if (!t) return null
    const d = JSON.parse(t)
    return d && d.n && d.c && d.ts ? d : null
  } catch { return null }
}

// Deja solo las copias de las últimas tiendas vistas (la actual siempre queda)
function podar(actual) {
  try {
    const copias = []
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (k && k.startsWith('catalogo-copia:')) { let ts = 0; try { ts = JSON.parse(localStorage.getItem(k)).ts || 0 } catch { /* copia dañada: se borra */ } copias.push([k, ts]) }
    }
    copias.sort((a, b) => b[1] - a[1])
    for (const [k] of copias.slice(MAX_TIENDAS)) if (k !== CLAVE(actual)) localStorage.removeItem(k)
  } catch { /* nada */ }
}

export const fechaCopia = (ts) => new Date(ts).toLocaleString('es-CO', { timeZone: 'America/Bogota', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })
