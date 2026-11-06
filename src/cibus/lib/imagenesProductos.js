// Fotos y unidad de los productos de un pedido o una venta (para mostrar las miniaturas). Sin React.
import { supabase } from './supabase'

/** { [producto_id]: { imagenes, unidad } }. Pide de a 100 para no pasarse del largo de la consulta. */
export async function imagenesDeProductos(ids) {
  const unicos = [...new Set((ids ?? []).filter(Boolean))]
  const mapa = {}
  for (let i = 0; i < unicos.length; i += 100) {
    const { data } = await supabase.from('productos').select('id, imagenes, unidad').in('id', unicos.slice(i, i + 100))
    for (const p of data ?? []) mapa[p.id] = { imagenes: p.imagenes ?? [], unidad: p.unidad ?? 'und' }
  }
  return mapa
}
