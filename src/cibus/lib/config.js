// Ajustes del negocio que usa toda la app: formas de pago, prefijo de factura,
// comisión del datáfono y margen mínimo. Se leen una vez al abrir el panel.
import { useSyncExternalStore } from 'react'
import { supabase } from './supabase'
import { fijarNombres, METODOS_VENTA } from './pagos'
import { fijarPrefijo } from './factura'

const TIPOS = { efectivo: 'efectivo', fiado: 'fiado', datafono: 'datafono' }
const BASE = METODOS_VENTA.map((m, i) => ({ id: m.id, nombre: m.texto, tipo: TIPOS[m.id] ?? 'digital', activa: true, orden: i + 1 }))

let estado = { formas: BASE, prefijo: '', comision: 0, margen: 0, mora: 0, mayorista: 0, bloqueoMora: true, listo: false, hayV8: false }
const oyentes = new Set()
const cambiar = (p) => { estado = { ...estado, ...p }; oyentes.forEach(f => f()) }

export async function cargarConfig() {
  const [f, n0] = await Promise.all([
    supabase.from('formas_pago').select('*').order('orden').order('nombre'),
    supabase.from('negocio').select('prefijo_factura, comision_datafono, margen_minimo, mora_mensual, descuento_mayorista, bloquear_credito_mora').eq('id', 1).maybeSingle(),
  ])
  // Si todavía no se ejecutó migracion-v9, se piden solo las columnas de la v8
  const n = n0.error
    ? await supabase.from('negocio').select('prefijo_factura, comision_datafono, margen_minimo').eq('id', 1).maybeSingle()
    : n0
  const formas = !f.error && Array.isArray(f.data) && f.data.length ? f.data : BASE
  fijarNombres(formas)
  fijarPrefijo(n.data?.prefijo_factura ?? '')
  cambiar({
    formas,
    prefijo: n.data?.prefijo_factura ?? '',
    comision: Number(n.data?.comision_datafono ?? 0),
    margen: Number(n.data?.margen_minimo ?? 0),
    mora: Number(n.data?.mora_mensual ?? 0),
    mayorista: Number(n.data?.descuento_mayorista ?? 0),
    bloqueoMora: n.data?.bloquear_credito_mora ?? true,
    listo: true,
    hayV8: !f.error,
  })
}

const suscribir = (f) => { oyentes.add(f); return () => oyentes.delete(f) }
export const useConfig = () => useSyncExternalStore(suscribir, () => estado)
