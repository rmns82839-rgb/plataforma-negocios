// Direcciones guardadas del cliente (C5b: pedido en un toque).
// Cada dirección = nombre (Casa, Trabajo…), texto exacto, seña opcional y el PUNTO exacto del mapa (lat/lng).
//  · Con cuenta (Google o código al correo): se guardan en la base (tabla direcciones_cliente, solo las ve su dueño).
//  · Sin cuenta: se guardan solo en este celular (localStorage) y nunca salen de él hasta que se hace un pedido.
// Todo está pensado para que, si algo falla, el pedido siga: ninguna función lanza, devuelven listas vacías o un texto de error.
const CLAVE = 'direcciones'
export const MAX_DIRECCIONES = 5
export const ETIQUETAS = ['Casa', 'Trabajo', 'Otra']

function almacen() { try { return globalThis.localStorage || null } catch { return null } }
function limpiarTexto(t, max) { return String(t ?? '').replace(/[<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, max) }
// Las direcciones del celular llevan l- al inicio para no confundirlas con las de la cuenta
const nuevoId = () => `l-${globalThis.crypto?.randomUUID?.() || `${Date.now()}${Math.floor(Math.random() * 1e6)}`}`
export const esLocal = (id) => String(id).startsWith('l-')

export function leerLocal(alm = almacen()) {
  try {
    const l = JSON.parse(alm?.getItem(CLAVE) || '[]')
    return Array.isArray(l) ? l.filter(d => d && d.id && Number.isFinite(Number(d.lat)) && Number.isFinite(Number(d.lng))) : []
  } catch { return [] }
}
function escribirLocal(lista, alm = almacen()) { try { alm?.setItem(CLAVE, JSON.stringify(lista)) } catch { /* sin almacenamiento: se usa solo en este pedido */ } }
const ordenar = l => [...l].sort((a, b) => String(b.ultimo_uso || '').localeCompare(String(a.ultimo_uso || '')))

// Texto que viaja en el pedido: dirección + seña
export function textoDireccion(d) {
  const base = limpiarTexto(d.direccion, 160)
  const sena = limpiarTexto(d.sena, 120)
  return sena ? `${base} · Seña: ${sena}`.slice(0, 160) : base
}

export function validarDireccion(d) {
  const e = {}
  if (limpiarTexto(d.direccion, 160).length < 6) e.direccion = 'Escribe tu dirección completa (calle, número y barrio)'
  const vacio = (v) => v === null || v === undefined || v === ''
  const lat = vacio(d.lat) ? NaN : Number(d.lat), lng = vacio(d.lng) ? NaN : Number(d.lng)
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) e.punto = 'Marca tu puerta en el mapa'
  return e
}

// sesion = objeto de sesión de Supabase o null; rpc = supabase.rpc (se inyecta para poder probar)
export async function listar(sesion, rpc, alm) {
  if (sesion && rpc) {
    try {
      const { data, error } = await rpc('mis_direcciones')
      if (!error && Array.isArray(data) && data.length) return { lista: ordenar(data), cuenta: true }
      if (!error) return { lista: ordenar(leerLocal(alm)), cuenta: true }   // cuenta sin direcciones: se ofrecen las del celular
    } catch { /* cae al celular */ }
  }
  return { lista: ordenar(leerLocal(alm)), cuenta: false }
}

// Guarda (o corrige si trae id). acepta = aceptó guardar en su cuenta. Devuelve { dir } o { error }
export async function guardar(sesion, rpc, dir, acepta, alm) {
  const e = validarDireccion(dir)
  if (Object.keys(e).length) return { error: Object.values(e)[0] }
  const limpia = {
    etiqueta: limpiarTexto(dir.etiqueta, 30) || 'Casa', direccion: limpiarTexto(dir.direccion, 160),
    sena: limpiarTexto(dir.sena, 120) || null, lat: Number(Number(dir.lat).toFixed(6)), lng: Number(Number(dir.lng).toFixed(6)),
  }
  if (sesion && rpc && acepta) {
    try {
      const { data, error } = await rpc('guardar_direccion', { p_datos: { ...limpia, id: dir.id && !esLocal(dir.id) ? dir.id : null, acepta_datos: true } })
      if (error) return { error: error.message || 'No pudimos guardar tu dirección' }
      return { dir: data }
    } catch { return { error: 'No pudimos guardar tu dirección. Intenta de nuevo.' } }
  }
  if (sesion && !acepta) return { dir: null }   // con cuenta no se guarda sin su aceptación
  const lista = leerLocal(alm)
  const ahora = new Date().toISOString()
  const i = dir.id ? lista.findIndex(x => x.id === dir.id) : -1
  if (i < 0 && lista.length >= MAX_DIRECCIONES) return { error: `Ya tienes ${MAX_DIRECCIONES} direcciones guardadas. Borra una para guardar otra` }
  const fila = { ...limpia, id: i >= 0 ? lista[i].id : nuevoId(), ultimo_uso: ahora }
  if (i >= 0) lista[i] = fila; else lista.push(fila)
  escribirLocal(lista, alm)
  return { dir: fila }
}

export async function marcarUso(sesion, rpc, id, alm) {
  try {
    if (sesion && rpc && !esLocal(id)) { await rpc('usar_direccion', { p_id: id }); return }
    const lista = leerLocal(alm); const i = lista.findIndex(x => x.id === id)
    if (i >= 0) { lista[i].ultimo_uso = new Date().toISOString(); escribirLocal(lista, alm) }
  } catch { /* no es grave */ }
}

export async function borrar(sesion, rpc, id, alm) {
  try {
    if (sesion && rpc && !esLocal(id)) { const { error } = await rpc('borrar_direccion', { p_id: id }); if (error) return false; return true }
    escribirLocal(leerLocal(alm).filter(x => x.id !== id), alm)
    return true
  } catch { return false }
}
