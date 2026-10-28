// Avisos de pedido nuevo en el celular de quien atiende la tienda (dueño o cajero). Archivo .js aparte (Fast Refresh).
// Cada aparato se suscribe a UNA tienda; el servidor avisa cuando entra un pedido (api/avisar-pedido).
import { supabase as plataforma } from '../../lib/supabase'
import { negocioActual } from './supabase'

const LLAVE = import.meta.env.VITE_VAPID_PUBLICA || ''
const aBytes = (b64) => {
  const p = '='.repeat((4 - (b64.length % 4)) % 4)
  const s = atob((b64 + p).replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from([...s].map((c) => c.charCodeAt(0)))
}
const esIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent)
const instalada = () => window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true

/** 'activo' | 'inactivo' | 'bloqueado' | 'ios_instalar' | 'no_soportado' | 'sin_llave' */
export async function estadoAvisosEquipo() {
  if (!LLAVE) return 'sin_llave'
  if (esIOS() && !instalada()) return 'ios_instalar'
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return 'no_soportado'
  if (Notification.permission === 'denied') return 'bloqueado'
  try {
    const reg = await navigator.serviceWorker.ready
    const sub = await reg.pushManager.getSubscription()
    if (!sub || Notification.permission !== 'granted') return 'inactivo'
    return localStorage.getItem(clave()) === sub.endpoint ? 'activo' : 'inactivo'     // activo = ESTE aparato ya quedó guardado en ESTA tienda
  } catch { return 'no_soportado' }
}
const clave = () => `matriz-avisos-equipo:${negocioActual()}`

export async function activarAvisosEquipo() {
  const permiso = await Notification.requestPermission()
  if (permiso !== 'granted') throw new Error('No diste permiso para los avisos')
  const reg = await navigator.serviceWorker.ready
  const sub = (await reg.pushManager.getSubscription()) ?? await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: aBytes(LLAVE) })
  const j = sub.toJSON()
  const { error } = await plataforma.rpc('guardar_suscripcion_personal', { p_negocio_id: negocioActual(), p_endpoint: j.endpoint, p_p256dh: j.keys?.p256dh, p_auth: j.keys?.auth })
  if (error) throw new Error(/could not find the function|schema cache/i.test(error.message) ? 'Falta ejecutar el SQL 28 en Supabase' : error.message)
  try { localStorage.setItem(clave(), j.endpoint) } catch { /* sin almacenamiento */ }
}

export async function desactivarAvisosEquipo() {
  const reg = await navigator.serviceWorker.ready
  const sub = await reg.pushManager.getSubscription()
  try { localStorage.removeItem(clave()) } catch { /* sin almacenamiento */ }
  if (!sub) return
  await plataforma.rpc('borrar_suscripcion_personal', { p_negocio_id: negocioActual(), p_endpoint: sub.endpoint })
  // el aparato puede seguir en otras tiendas: solo se anula la suscripción del navegador si no queda ninguna guardada
  const otras = Object.keys(localStorage).some((k) => k.startsWith('matriz-avisos-equipo:'))
  if (!otras) await sub.unsubscribe().catch(() => {})
}
