// Avisos (notificaciones push) en el celular del cliente: te avisan cuando la tienda cambia el estado de tu pedido.
// Archivo .js aparte (Fast Refresh). Usa la misma llave pública VAPID de los avisos del equipo.
import { supabase } from './supabase'

const LLAVE = (import.meta.env || {}).VITE_VAPID_PUBLICA || ''
const aBytes = (b64) => {
  const p = '='.repeat((4 - (b64.length % 4)) % 4)
  const s = atob((b64 + p).replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from([...s].map((c) => c.charCodeAt(0)))
}
const esIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent)
const instalada = () => window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true

/** 'activo' | 'inactivo' | 'bloqueado' | 'ios_instalar' | 'no_soportado' | 'sin_llave' */
export async function estadoAvisosCliente() {
  if (!LLAVE) return 'sin_llave'
  if (esIOS() && !instalada()) return 'ios_instalar'
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return 'no_soportado'
  if (Notification.permission === 'denied') return 'bloqueado'
  try {
    const reg = await navigator.serviceWorker.ready
    return (await reg.pushManager.getSubscription()) && Notification.permission === 'granted' ? 'activo' : 'inactivo'
  } catch { return 'no_soportado' }
}

export async function activarAvisosCliente() {
  const permiso = await Notification.requestPermission()
  if (permiso !== 'granted') throw new Error('No diste permiso para los avisos')
  const reg = await navigator.serviceWorker.ready
  const sub = (await reg.pushManager.getSubscription()) ?? await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: aBytes(LLAVE) })
  const j = sub.toJSON()
  const { error } = await supabase.rpc('guardar_suscripcion_cliente', { p_endpoint: j.endpoint, p_p256dh: j.keys?.p256dh, p_auth: j.keys?.auth })
  if (error) { await sub.unsubscribe().catch(() => {}); throw new Error(error.message) }
}

export async function desactivarAvisosCliente() {
  const reg = await navigator.serviceWorker.ready
  const sub = await reg.pushManager.getSubscription()
  if (!sub) return
  await supabase.rpc('borrar_suscripcion_cliente', { p_endpoint: sub.endpoint }).catch(() => {})
  await sub.unsubscribe().catch(() => {})
}

/** La tienda cambió el estado de un pedido: pide el aviso y le pasa el número al servidor (que envía el push). No molesta si falla. */
export async function avisarCambioEstado(negocioId, pedidoId) {
  try {
    const { data } = await supabase.rpc('avisar_cambio_seguimiento', { p_negocio_id: negocioId, p_pedido_id: pedidoId })
    if (!data) return false
    const r = await fetch('/api/avisar-estado', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ aviso: data }) })
    return r.ok
  } catch { return false }
}
