// Carpeta fija para las copias de seguridad (solo Chrome y Edge en computador).
// El dueño elige UNA carpeta una vez; la app recuerda ese permiso en este equipo y guarda ahí cada copia.
// No se puede crear ni escribir en una carpeta sin que el dueño la elija: es una regla del navegador.

const BD = 'matriz-respaldo', ALMACEN = 'carpeta', LLAVE = 'copias'

export const hayCarpetas = () => typeof window !== 'undefined' && typeof window.showDirectoryPicker === 'function'

const abrirBd = () => new Promise((ok, mal) => {
  const r = indexedDB.open(BD, 1)
  r.onupgradeneeded = () => r.result.createObjectStore(ALMACEN)
  r.onsuccess = () => ok(r.result)
  r.onerror = () => mal(r.error)
})
const pedir = async (modo, valor) => {
  const bd = await abrirBd()
  return new Promise((ok, mal) => {
    const t = bd.transaction(ALMACEN, modo)
    const q = modo === 'readonly' ? t.objectStore(ALMACEN).get(LLAVE) : valor === null ? t.objectStore(ALMACEN).delete(LLAVE) : t.objectStore(ALMACEN).put(valor, LLAVE)
    q.onsuccess = () => ok(q.result)
    q.onerror = () => mal(q.error)
  })
}

/** La carpeta guardada (o null). */
export const carpetaGuardada = async () => { try { return hayCarpetas() ? ((await pedir('readonly')) ?? null) : null } catch { return null } }

/** Abre el selector del navegador y recuerda la carpeta elegida. Devuelve su nombre o null si canceló. */
export async function elegirCarpeta() {
  const h = await window.showDirectoryPicker({ id: 'matriz-copias', mode: 'readwrite' })
  await pedir('readwrite', h)
  return h
}
export const olvidarCarpeta = async () => { try { await pedir('readwrite', null) } catch { /* nada que olvidar */ } }

/** Hay que llamarla justo al tocar el botón (el navegador exige un gesto del usuario para dar el permiso). */
export async function permisoCarpeta(h) {
  if (!h) return false
  try {
    if ((await h.queryPermission({ mode: 'readwrite' })) === 'granted') return true
    return (await h.requestPermission({ mode: 'readwrite' })) === 'granted'
  } catch { return false }
}

/** Guarda el archivo en la carpeta. Devuelve el nombre de la carpeta, o null si no se pudo (entonces se descarga normal). */
export async function guardarEnCarpeta(h, blob, nombre) {
  if (!h) return null
  try {
    const f = await h.getFileHandle(nombre, { create: true })
    const w = await f.createWritable()
    await w.write(blob); await w.close()
    return h.name
  } catch { return null }
}
