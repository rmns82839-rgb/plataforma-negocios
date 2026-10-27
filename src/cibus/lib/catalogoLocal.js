// Copia de los productos activos en el equipo: así la caja sigue escaneando y buscando sin internet.
import { supabase } from './supabase'
import { traerTodo } from './traerTodo'
import { guardarCatalogo, leerCatalogo, esErrorDeRed } from './offline'
import { normalizar, ordenarPorInicio } from './buscar'

let memoria = null

/** Baja la lista completa de productos activos y la guarda. Si no hay internet no hace nada. */
export async function actualizarCatalogo() {
  const { data, error } = await traerTodo(() => supabase.from('productos').select('*').eq('activo', true).order('id'))
  if (error || !data) return false
  memoria = data
  await guardarCatalogo(data)
  return true
}

const lista = async () => {
  if (memoria) return memoria
  const g = await leerCatalogo()
  memoria = g?.lista ?? []
  return memoria
}

export const hayCatalogoLocal = async () => (await lista()).length > 0
export const productoPorCodigo = async (codigo) => (await lista()).find(p => p.codigo === codigo) ?? null
export const productosPorIds = async (ids) => { const s = new Set(ids); return (await lista()).filter(p => s.has(p.id)) }
export async function buscarPorNombre(q, max = 40) {
  const n = normalizar(q)
  return ordenarPorInicio((await lista()).filter(p => normalizar(p.nombre).includes(n)), q).slice(0, max)
}

/** Un producto creado sin internet: queda en la copia para poder escanearlo y venderlo ya. */
export async function agregarProductoLocal(p) {
  const l = await lista()
  const i = l.findIndex(x => x.id === p.id)
  if (i >= 0) l[i] = p; else l.push(p)
  await guardarCatalogo(l)
}

/** Después de una venta guardada sin internet, el stock local baja para no vender de más. */
export async function descontarStockLocal(lineas) {
  const l = await lista()
  for (const { producto, cantidad } of lineas) {
    const p = l.find(x => x.id === producto.id)
    if (p && !p.es_kit) p.stock = Number(p.stock) - Number(cantidad)
  }
  await guardarCatalogo(l)
}

export { esErrorDeRed }
