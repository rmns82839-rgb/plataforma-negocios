// Agotados y reversos: lectura del aviso de la base y permiso del dueño.
import { supabase } from './supabase'

/** La base responde «AGOTADO|nombre|quedan|pides» cuando un producto no alcanza. */
export function leerAgotado(msg) {
  const m = /AGOTADO\|([^|]*)\|([^|]*)\|([^|\n]*)/.exec(String(msg ?? ''))
  if (!m) return null
  const num = (s) => Number(String(s).replace(',', '.')) || 0
  return { nombre: m[1].trim(), quedan: num(m[2]), pides: num(m[3]) }
}

/** Pide un permiso de un solo uso. El dueño lo obtiene con su sesión; el cajero con la clave del dueño. */
export async function pedirPermiso(pin) {
  const { data, error } = await supabase.rpc('autorizar_stock', pin ? { p_pin: String(pin) } : {})
  if (error) return { ok: false, error: error.message }
  if (!data?.ok) return { ok: false, error: data?.error ?? 'No se pudo autorizar' }
  return { ok: true, autorizacion: data.autorizacion }
}

/** Devuelve los productos de una venta reversada como líneas de la caja. */
export async function lineasDeReverso(items) {
  const ids = (items ?? []).map(i => i.producto_id).filter(Boolean)
  if (ids.length === 0) return { lineas: [], faltan: items?.length ?? 0 }
  const { data } = await supabase.from('productos').select('*').in('id', ids).eq('activo', true)
  const por = new Map((data ?? []).map(p => [p.id, p]))
  const lineas = []
  let faltan = 0
  for (const i of items) {
    const p = por.get(i.producto_id)
    if (!p) { faltan++; continue }
    const d = Number(i.descuento) || 0
    lineas.push({ producto: p, cantidad: Number(i.cantidad), ...(d > 0 && !i.promo ? { descuento: d } : {}) })
  }
  return { lineas, faltan }
}
