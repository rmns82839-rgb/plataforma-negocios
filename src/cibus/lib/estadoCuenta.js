// Estado de la cuenta de un cliente para las listas de Fiados (y préstamos): color, texto y orden. Sin React ni Supabase.
// «act» viene de la vista clientes_actividad_fiado: { ultimo_movimiento, ultimo_abono, ultimo_abono_monto, abonado_total, cargado_total }.
const DIA = 24 * 60 * 60 * 1000
const dias = (iso) => Math.max(Math.floor((Date.now() - new Date(iso).getTime()) / DIA), 0)
export const hace = (iso) => { const d = dias(iso); return d === 0 ? 'hoy' : d === 1 ? 'ayer' : `hace ${d} días` }

/**
 * @returns { tipo, barra, etiqueta, detalle }
 *   tipo: 'vencido' | 'abonando' | 'pagado' | 'debe' | 'libre'
 *   barra: clase de color de la franja izquierda; etiqueta: texto corto de la píldora (o ''); detalle: línea sutil bajo el nombre (o '')
 */
export function estadoCuenta({ saldo, vencido = false }, act, dinero) {
  const debe = Number(saldo) > 0
  const abonado = Number(act?.abonado_total) || 0
  const tuvoCredito = (Number(act?.cargado_total) || 0) > 0
  const abono = act?.ultimo_abono ? `Último abono ${dinero(act.ultimo_abono_monto)} · ${hace(act.ultimo_abono)}` : ''
  if (debe && vencido) return { tipo: 'vencido', barra: 'border-red-400', etiqueta: abonado > 0 ? 'Vencido · abonó' : 'Vencido', detalle: abono }
  if (debe && abonado > 0) return { tipo: 'abonando', barra: 'border-amber-400', etiqueta: 'Abonó', detalle: abono }
  if (debe) return { tipo: 'debe', barra: 'border-transparent', etiqueta: '', detalle: '' }
  if (tuvoCredito) return { tipo: 'pagado', barra: 'border-emerald-500', etiqueta: 'Pagado', detalle: abono || (act?.ultimo_movimiento ? `Saldó ${hace(act.ultimo_movimiento)}` : '') }
  return { tipo: 'libre', barra: 'border-transparent', etiqueta: '', detalle: '' }
}

export const ORDENES = [['recientes', 'Recientes'], ['nombre', 'Nombre'], ['deuda', 'Mayor deuda']]

/** Ordena una copia: recientes = última actividad primero (los que no tienen movimientos, al final y por nombre). */
export function ordenarClientes(lista, actividad, orden) {
  const nombre = (a, b) => String(a.nombre).localeCompare(String(b.nombre), 'es')
  const t = (c) => { const m = actividad.get(c.id)?.ultimo_movimiento; return m ? new Date(m).getTime() : 0 }
  const copia = [...lista]
  if (orden === 'nombre') return copia.sort(nombre)
  if (orden === 'deuda') return copia.sort((a, b) => (Number(b.saldo) || 0) - (Number(a.saldo) || 0) || nombre(a, b))
  return copia.sort((a, b) => t(b) - t(a) || nombre(a, b))
}
