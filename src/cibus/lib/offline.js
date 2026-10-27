// Modo sin conexión: guarda en el equipo (IndexedDB) las últimas consultas y una cola de cosas por subir.
// Archivo .js aparte por el Fast Refresh de Vite.
import { negocioActual } from './supabase'

const BD = () => `matriz-offline-${negocioActual()}`      // una base por tienda en este equipo
const VERSION = 1
let abierta = null

const abrir = () => {
  if (abierta) return abierta
  abierta = new Promise((ok, mal) => {
    if (typeof indexedDB === 'undefined') return mal(new Error('Sin IndexedDB'))
    const r = indexedDB.open(BD(), VERSION)
    r.onupgradeneeded = () => {
      const db = r.result
      if (!db.objectStoreNames.contains('cache')) db.createObjectStore('cache')
      if (!db.objectStoreNames.contains('cola')) db.createObjectStore('cola', { keyPath: 'id' })
      if (!db.objectStoreNames.contains('catalogo')) db.createObjectStore('catalogo')
    }
    r.onsuccess = () => ok(r.result)
    r.onerror = () => { abierta = null; mal(r.error) }
  })
  return abierta
}

const pedir = async (tienda, modo, fn) => {
  try {
    const db = await abrir()
    return await new Promise((ok, mal) => {
      const tx = db.transaction(tienda, modo)
      const req = fn(tx.objectStore(tienda))
      tx.oncomplete = () => ok(req?.result)
      tx.onerror = () => mal(tx.error)
      tx.onabort = () => mal(tx.error)
    })
  } catch { return undefined }      // si el navegador no deja guardar, todo sigue funcionando como siempre (solo sin modo offline)
}

// ---------- Últimas consultas (para mostrarlas si no hay internet) ----------
export const guardarCache = (clave, valor) => pedir('cache', 'readwrite', s => s.put(valor, clave))
export const leerCache = (clave) => pedir('cache', 'readonly', s => s.get(clave))

// ---------- Catálogo de productos completo (la caja sigue escaneando sin internet) ----------
export const guardarCatalogo = (lista) => pedir('catalogo', 'readwrite', s => s.put({ lista, en: Date.now() }, 'productos'))
export const leerCatalogo = () => pedir('catalogo', 'readonly', s => s.get('productos'))

// ---------- Cola de cosas por subir ----------
const oyentes = new Set()
export const alCambiarCola = (fn) => { oyentes.add(fn); return () => oyentes.delete(fn) }
const avisar = () => { listarCola().then(l => oyentes.forEach(f => f(l))) }

export const listarCola = async () => ((await pedir('cola', 'readonly', s => s.getAll())) ?? []).sort((a, b) => a.creado - b.creado)
export const agregarACola = async (item) => { await pedir('cola', 'readwrite', s => s.put(item)); avisar() }
export const quitarDeCola = async (id) => { await pedir('cola', 'readwrite', s => s.delete(id)); avisar() }
export const actualizarEnCola = async (item) => { await pedir('cola', 'readwrite', s => s.put(item)); avisar() }

/** Al cerrar sesión se borra lo guardado (el equipo puede pasar a otra persona). Lo pendiente por subir NO se borra. */
export const borrarCache = async () => { await pedir('cache', 'readwrite', s => s.clear()); await pedir('catalogo', 'readwrite', s => s.clear()) }

export const idNuevo = () => globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`

/** ¿El error es de falta de internet (y no de la base de datos)? */
export const esErrorDeRed = (e) => {
  const t = `${e?.message ?? e ?? ''} ${e?.details ?? ''} ${e?.name ?? ''}`
  return /failed to fetch|networkerror|network request failed|load failed|fetch failed|err_internet|offline/i.test(t)
}
