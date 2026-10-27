// Cola de cosas hechas sin internet y su subida automática cuando vuelve la conexión.
// Se sube en orden. Lo que la base rechaza (por ejemplo, sin stock) queda marcado para decidir qué hacer; lo demás sigue.
import { supabase } from './supabase'
import { agregarACola, listarCola, quitarDeCola, actualizarEnCola, alCambiarCola, idNuevo, esErrorDeRed } from './offline'

let subiendo = false
const estado = { subiendo: false, total: 0, hechos: 0, ultimo: null }
const oyentes = new Set()
export const alCambiarEstado = (fn) => { oyentes.add(fn); return () => oyentes.delete(fn) }
const emitir = () => oyentes.forEach(f => f({ ...estado }))
export { alCambiarCola, listarCola }

/** Guarda una venta para subirla luego. Devuelve el item de la cola. */
export async function encolarVenta(args, clave, fechaIso, pedidoId = null) {
  const item = { id: clave ?? idNuevo(), tipo: 'venta', creado: fechaIso ? new Date(fechaIso).getTime() : Date.now(), args, pedidoId, error: null }
  await agregarACola(item)
  return item
}
/** Guarda un registro simple (gasto, retiro de caja). La fila lleva su propio id: si se sube dos veces, la base lo detecta. */
export async function encolarInsert(tabla, fila, etiqueta) {
  const item = { id: idNuevo(), tipo: 'insert', creado: Date.now(), tabla, fila: { id: idNuevo(), ...fila }, etiqueta, error: null }
  await agregarACola(item)
  return item
}

/** Guarda un abono o préstamo rápido para subirlo luego. extra: { clienteId, monto, signo: -1 abono | +1 préstamo, etiqueta } */
export async function encolarAccion(rpc, args, extra, clave, fechaIso) {
  const item = { id: clave ?? idNuevo(), tipo: 'accion', creado: fechaIso ? new Date(fechaIso).getTime() : Date.now(), rpc, args, ...extra, error: null }
  await agregarACola(item)
  return item
}

const FALTA_FUNCION = /could not find the function|schema cache|PGRST202|does not exist/i

/** Registra una venta de forma segura ante cortes: con clave única, así reintentar no la duplica. Sin migración v33 usa la forma de siempre. */
export async function registrarVentaSegura(args, clave, fecha) {
  const r = await supabase.rpc('registrar_venta_offline', { p_clave: clave, p_fecha: fecha, ...args })
  if (r.error && FALTA_FUNCION.test(`${r.error.message} ${r.error.code}`)) return supabase.rpc('registrar_venta', args)
  return r
}

/** Abono o préstamo con clave única (si se repite la subida, no se duplica). Sin migración v34 usa la forma de siempre. */
export async function registrarAccionSegura(rpc, args, clave, fecha) {
  const r = await supabase.rpc('ejecutar_offline', { p_clave: clave, p_fecha: fecha, p_rpc: rpc, p_args: args })
  if (r.error && FALTA_FUNCION.test(`${r.error.message} ${r.error.code}`)) return supabase.rpc(rpc, args)
  return r
}

const subirItem = async (it) => {
  if (it.tipo === 'accion') {
    const r = await registrarAccionSegura(it.rpc, it.args, it.id, new Date(it.creado).toISOString())
    return r.error ? { error: r.error } : { ok: true }
  }
  if (it.tipo === 'venta') {
    const r = await registrarVentaSegura(it.args, it.id, new Date(it.creado).toISOString())
    if (r.error) return { error: r.error }
    if (it.pedidoId) {       // pedido de la tienda en línea que se cobró sin internet: queda atendido y ligado a su venta
      const u = await supabase.from('pedidos_tienda').update({ estado: 'atendido', venta_id: r.data }).eq('id', it.pedidoId)
      if (u.error) await supabase.from('pedidos_tienda').update({ estado: 'atendido' }).eq('id', it.pedidoId)
    }
    return { ok: true }
  }
  if (it.tipo === 'insert') {
    const r = await supabase.from(it.tabla).insert(it.fila)
    if (r.error && r.error.code === '23505') return { ok: true }          // ya estaba subido
    return r.error ? { error: r.error } : { ok: true }
  }
  return { error: { message: 'Tipo desconocido' } }
}

/** Sube lo pendiente. Se detiene si se cae el internet. */
export async function subirPendientes(forzar = false) {
  if (subiendo) return { subidos: 0, fallidos: 0 }
  subiendo = true
  let subidos = 0, fallidos = 0
  try {
    const lote = (await listarCola()).filter(x => forzar || !x.error)
    Object.assign(estado, { subiendo: true, total: lote.length, hechos: 0, ultimo: null }); emitir()
    for (const it of lote) {
      let r
      try { r = await subirItem(it) } catch (e) { r = { error: e } }
      if (r.ok) { await quitarDeCola(it.id); subidos++ }
      else if (esErrorDeRed(r.error)) break                    // sigue sin internet: se intenta luego
      else { await actualizarEnCola({ ...it, error: r.error?.message ?? 'No se pudo subir' }); fallidos++ }
      estado.hechos = subidos + fallidos; emitir()
    }
  } finally {
    subiendo = false
    Object.assign(estado, { subiendo: false, ultimo: { subidos, fallidos, en: Date.now() } }); emitir()
  }
  return { subidos, fallidos }
}

let activo = false
/** Arranca la subida automática: al volver internet, al abrir la app y cada 30 segundos si hay algo pendiente. */
export function iniciarSincronizacion() {
  if (activo) return () => {}
  activo = true
  const intentar = async () => {
    if (navigator.onLine === false) return
    const l = await listarCola()
    if (l.some(x => !x.error)) subirPendientes()
  }
  window.addEventListener('online', intentar)
  const t = setInterval(intentar, 30000)
  intentar()
  return () => { activo = false; window.removeEventListener('online', intentar); clearInterval(t) }
}
