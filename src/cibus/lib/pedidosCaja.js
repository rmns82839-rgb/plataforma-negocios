// Pedidos de la tienda en línea que ya pasaron a la Caja. Sin React.
import { supabase } from './supabase'
import { etapaDe } from './etapaPedido'

/** Marca (o suelta) un pedido como «en caja»: deja de salir como pedido nuevo. Si falta el SQL de la columna, no hace nada. */
export async function marcarEnCaja(id, valor) {
  if (!id) return false
  const { error } = await supabase.from('pedidos_tienda').update({ en_caja: valor }).eq('id', id)
  return !error
}

/** Un renglón de pedido → lo que muestra ItemsConFoto. */
export const lineaDePedido = (it) => {
  const descuento = Number(it.descuento ?? 0)
  return {
    id: it.id, nombre: it.nombre, cantidad: it.cantidad, unidad: it.unidad, precio: it.precio_unitario,
    total: Math.round(Number(it.precio_unitario) * Number(it.cantidad)) - descuento,
    imagenes: it.imagenes, nota: it.promo, descuento,
  }
}

/** En qué va un pedido de «En proceso»: en caja, preparando, en camino… */
export const etapaProceso = (p) => (p.estado === 'pendiente' ? 'En caja' : etapaDe(p).texto)
export const claseEtapa = (p) => {
  if (p.estado === 'pendiente') return 'bg-amber-100 text-amber-800'
  return p.seguimiento === 'en_camino' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'
}
/** «1 en caja · 2 en camino» */
export function resumenProceso(lista) {
  const c = {}
  for (const p of lista) { const e = etapaProceso(p).toLowerCase(); c[e] = (c[e] ?? 0) + 1 }
  return Object.entries(c).map(([e, n]) => `${n} ${e}`).join(' · ')
}
