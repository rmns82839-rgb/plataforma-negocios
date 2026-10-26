// Capa que pone el negocio en cada consulta, para poder traer las pantallas de Cibus casi sin cambios.
//   const db = dbDe(ctx.neg.negocio_id)
//   db.from('productos').select('*')            -> ... .eq('negocio_id', id)
//   db.from('productos').insert({ ... })        -> la fila lleva negocio_id
//   db.from('productos').update(v).eq('id', x)  -> ... .eq('negocio_id', id)
//   db.rpc('registrar_venta', { ... })          -> { p_negocio_id: id, ... }
// El aislamiento de verdad lo hace la base de datos (RLS); esto evita olvidos y deja el código igual al de Cibus.
import { supabase } from './supabase.js'

// Tablas que son de toda la plataforma (no tienen negocio_id)
export const TABLAS_GLOBALES = new Set(['planes', 'plan_modulos', 'modulos', 'plataforma_limites'])
// Funciones que no reciben p_negocio_id
export const RPC_SIN_NEGOCIO = new Set([
  'mis_negocios', 'negocio_publico', 'catalogo_tienda', 'catalogo_ropa', 'reclamar_invitaciones', 'crear_negocio',
  'registrar_visita', 'estado_pedido', 'verificar_aislamiento',
])

const conNegocio = (filas, id) => Array.isArray(filas) ? filas.map(f => ({ ...f, negocio_id: id })) : { ...filas, negocio_id: id }

export function dbDe(negocioId, cliente = supabase, opciones = {}) {
  if (!negocioId) throw new Error('dbDe: falta el negocio')
  const globales = opciones.globales ?? TABLAS_GLOBALES
  const sinNegocio = opciones.sinNegocio ?? RPC_SIN_NEGOCIO
  return {
    from(tabla) {
      const base = cliente.from(tabla)
      if (globales.has(tabla)) return base
      return {
        select: (...a) => base.select(...a).eq('negocio_id', negocioId),
        insert: (filas, ...a) => base.insert(conNegocio(filas, negocioId), ...a),
        upsert: (filas, ...a) => base.upsert(conNegocio(filas, negocioId), ...a),
        update: (valores, ...a) => base.update(valores, ...a).eq('negocio_id', negocioId),
        delete: (...a) => base.delete(...a).eq('negocio_id', negocioId),
      }
    },
    rpc(nombre, params = {}, ...resto) {
      const p = sinNegocio.has(nombre) ? params : { p_negocio_id: negocioId, ...params }
      return cliente.rpc(nombre, p, ...resto)
    },
    storage: cliente.storage,
    auth: cliente.auth,
    negocioId,
  }
}
