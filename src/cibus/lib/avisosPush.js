// Avisos (notificaciones push) en el aparato del cliente. Archivo .js aparte (Fast Refresh).
import { supabase } from './supabase'

const LLAVE = import.meta.env.VITE_VAPID_PUBLICA || ''
const aBytes = (b64) => {
  const p = '='.repeat((4 - (b64.length % 4)) % 4)
  const s = atob((b64 + p).replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from([...s].map(c => c.charCodeAt(0)))
}
const esIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent)
const instalada = () => window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true

/** 'activo' | 'inactivo' | 'bloqueado' | 'ios_instalar' | 'no_soportado' | 'sin_llave' */
export async function estadoAvisos() {
  if (!LLAVE) return 'sin_llave'
  if (esIOS() && !instalada()) return 'ios_instalar'
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return 'no_soportado'
  if (Notification.permission === 'denied') return 'bloqueado'
  try {
    const reg = await navigator.serviceWorker.ready
    return (await reg.pushManager.getSubscription()) && Notification.permission === 'granted' ? 'activo' : 'inactivo'
  } catch { return 'no_soportado' }
}

export async function activarAvisos() {
  const permiso = await Notification.requestPermission()
  if (permiso !== 'granted') throw new Error('No diste permiso para los avisos')
  const reg = await navigator.serviceWorker.ready
  const sub = (await reg.pushManager.getSubscription()) ?? await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: aBytes(LLAVE) })
  const j = sub.toJSON()
  const { error } = await supabase.rpc('guardar_suscripcion_push', { p_endpoint: j.endpoint, p_p256dh: j.keys?.p256dh, p_auth: j.keys?.auth })
  if (error) {
    await sub.unsubscribe().catch(() => {})
    throw new Error(/could not find the function|schema cache/i.test(error.message) ? 'Falta ejecutar migracion-v44.sql en Supabase' : error.message)
  }
}

export async function desactivarAvisos() {
  const reg = await navigator.serviceWorker.ready
  const sub = await reg.pushManager.getSubscription()
  if (!sub) return
  await supabase.rpc('borrar_mi_suscripcion_push', { p_endpoint: sub.endpoint }).catch(() => {})
  await sub.unsubscribe().catch(() => {})
}

/** Solo el dueño: envía un aviso a todos (o a un cliente si se pasa `usuario`). */
export async function enviarAviso({ titulo, cuerpo, url = '/tienda', usuario = null, tag }) {
  const { data } = await supabase.auth.getSession()
  const jwt = data?.session?.access_token
  if (!jwt) throw new Error('Sesión vencida: vuelve a entrar')
  const r = await fetch('/api/enviar-push', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jwt}` }, body: JSON.stringify({ titulo, cuerpo, url, usuario, tag }) })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(j.error || 'No se pudo enviar el aviso')
  return j
}
