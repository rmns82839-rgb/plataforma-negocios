// Cálculos de cartera (fiados). Archivo .js aparte por el Fast Refresh de Vite.
import { fechaATexto, hoyTexto } from './periodo'

const DIA = 24 * 60 * 60 * 1000

export const diasDesde = (iso) => Math.floor((Date.now() - new Date(iso).getTime()) / DIA)

/** ¿Ya pasó esa fecha límite ("2026-09-30")? Acepta null. */
export const yaVencio = (limite) => Boolean(limite) && String(limite).slice(0, 10) < hoyTexto()

/** ¿Este cliente tiene deuda vencida? vence_el viene de la vista clientes_saldo. */
export const estaVencido = (c) => Number(c.saldo) > 0 && yaVencio(c.vence_el)

/** De lo que debe un cliente: cuánto es fiado de ventas y cuánto préstamos rápidos. Solo hay desglose si tiene de los dos o préstamos. */
export function desgloseDeuda(c) {
  const saldo = Math.max(Number(c?.saldo) || 0, 0)
  const prestamo = Math.min(Math.max(Number(c?.prestamo_pendiente) || 0, 0), saldo)
  return { saldo, prestamo, fiado: saldo - prestamo, hay: prestamo > 0 }
}

/** Fecha límite de un cargo: la que se eligió al fiar, o fecha + días de crédito del cliente. */
export const limiteDe = (mov, diasCredito) => {
  if (mov.fecha_limite) return String(mov.fecha_limite).slice(0, 10)
  if (Number(diasCredito) > 0) return fechaATexto(new Date(new Date(mov.fecha).getTime() + Number(diasCredito) * DIA))
  return null
}

/**
 * Facturas (cargos) que aún se deben. Primero se descuentan los abonos dirigidos a una factura (aplica_a);
 * los abonos generales se aplican a lo más viejo, igual que la vista fiado_pendiente.
 * @returns [{ id, fecha, limite, monto, pendiente, venta_id, nota, concepto }] de la más vieja a la más nueva
 */
export function facturasPendientes(movs, diasCredito = 0) {
  const orden = [...movs].sort((a, b) => new Date(a.fecha) - new Date(b.fecha))
  const abonos = orden.filter(m => m.tipo === 'abono')
  let general = abonos.filter(m => !m.aplica_a).reduce((s, m) => s + Number(m.monto), 0)
  const dirigido = new Map()
  for (const a of abonos.filter(m => m.aplica_a)) dirigido.set(a.aplica_a, (dirigido.get(a.aplica_a) ?? 0) + Number(a.monto))
  const pendientes = []
  for (const m of orden.filter(x => x.tipo === 'cargo')) {
    const monto = Number(m.monto)
    const residual = Math.max(monto - (dirigido.get(m.id) ?? 0), 0)
    const pagadoGeneral = Math.min(general, residual)
    general -= pagadoGeneral
    const pendiente = residual - pagadoGeneral
    if (pendiente > 0) {
      pendientes.push({
        id: m.id, fecha: m.fecha, limite: limiteDe(m, diasCredito), monto, pendiente,
        venta_id: m.venta_id ?? null, nota: m.nota ?? null, concepto: m.concepto ?? null,
      })
    }
  }
  return pendientes
}

/**
 * A qué factura fue cada abono y cuánto quedó debiendo de ella (mismas reglas que facturasPendientes).
 * @returns Map(abonoId → [{ cargoId, aplicado, restante }]); restante 0 = quedó pagada completa
 */
export function repartoAbonos(movs) {
  const orden = [...movs].sort((a, b) => new Date(a.fecha) - new Date(b.fecha))
  const cargos = orden.filter(m => m.tipo === 'cargo')
  const abonos = orden.filter(m => m.tipo === 'abono')
  const resto = new Map(cargos.map(c => [c.id, Number(c.monto)]))   // lo que falta de cada cargo
  const reparto = new Map()
  const dirigidos = abonos.filter(a => a.aplica_a && resto.has(a.aplica_a))
  for (const a of dirigidos) {
    const antes = resto.get(a.aplica_a)
    const aplicado = Math.min(Number(a.monto), antes)
    resto.set(a.aplica_a, antes - aplicado)
    reparto.set(a.id, [{ cargoId: a.aplica_a, aplicado, restante: antes - aplicado }])
  }
  for (const a of abonos.filter(x => !dirigidos.includes(x))) {
    let queda = Number(a.monto)
    const partes = []
    for (const c of cargos) {
      if (queda <= 0) break
      const falta = resto.get(c.id)
      if (!(falta > 0)) continue
      const aplicado = Math.min(queda, falta)
      queda -= aplicado
      resto.set(c.id, falta - aplicado)
      partes.push({ cargoId: c.id, aplicado, restante: falta - aplicado })
    }
    reparto.set(a.id, partes)
  }
  return reparto
}

/** Resumen de la actividad del cliente en la tienda: "12 compras · última hace 3 días · $240.000". Vacío si no hay compras. */
export function actividadCliente(c, dinero) {
  const n = Number(c?.compras) || 0
  if (!n || !c.ultima_compra) return ''
  const d = diasDesde(c.ultima_compra)
  const cuando = d <= 0 ? 'hoy' : d === 1 ? 'ayer' : `hace ${d} días`
  return `${n} ${n === 1 ? 'compra' : 'compras'} · última ${cuando} · ${dinero(Number(c.total_comprado) || 0)}`
}
