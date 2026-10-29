// Pago por Nequi, Llave y Daviplata (el dinero va al número del negocio; el dueño confirma que llegó).
import { supabase } from './supabase'

export const MEDIOS_DIGITALES = [
  { id: 'nequi', texto: 'Nequi' },
  { id: 'llave', texto: 'Llave' },
  { id: 'daviplata', texto: 'Daviplata' },
]
export const textoMedio = (id) => MEDIOS_DIGITALES.find(m => m.id === id)?.texto ?? ''

/** 3005008432 → 300 500 8432 */
export const numeroBonito = (n) => String(n ?? '').replace(/\D/g, '').replace(/^(\d{3})(\d{3})(\d{4})$/, '$1 $2 $3')

/** Texto del estado del pago para el panel y para el cliente */
export const ESTADO_PAGO = {
  por_pagar: { texto: 'Pago por Nequi/Llave/Daviplata: aún sin avisar', clase: 'bg-slate-100 text-slate-700' },
  avisado: { texto: 'Dice que ya pagó: confirma que te llegó', clase: 'bg-amber-100 text-amber-800' },
  confirmado: { texto: 'Pago recibido', clase: 'bg-green-100 text-green-800' },
  no_recibido: { texto: 'El pago no llegó', clase: 'bg-red-100 text-red-700' },
}

/** { numero, medios, titular } o null si la tienda no recibe pagos digitales (o falta migracion-v53) */
export async function cargarPagoDigital() {
  const { data, error } = await supabase.rpc('datos_pago_digital')
  return error || !data ? null : data
}

/** aviso = false: eligió el medio · aviso = true: ya pagó */
export async function registrarPago(id, medio, aviso = false, referencia = '') {
  const { data, error } = await supabase.rpc('registrar_pago_digital', { p_id: id, p_medio: medio, p_aviso: aviso, p_referencia: referencia || null })
  return { ok: !error && data?.ok === true, error: error?.message ?? '' }
}

export async function confirmarPago(id, recibido) {
  const { error } = await supabase.rpc('confirmar_pago_pedido', { p_id: id, p_recibido: recibido })
  return error ? (/confirmar_pago_pedido|schema cache/i.test(error.message) ? 'Falta ejecutar 31-pago-digital.sql en Supabase.' : error.message) : ''
}
