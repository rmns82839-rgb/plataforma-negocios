// Cuenta, sin datos personales, cuántos celulares instalan la app y cuántos la abren como app.
// Cada celular tiene un código al azar guardado en él. Si el navegador no deja guardarlo, simplemente no cuenta.
import { supabase } from './supabase'

const CLAVE = 'cibus:dispositivo'
const codigo = () => {
  try {
    let c = localStorage.getItem(CLAVE)
    if (!c) {
      const b = new Uint8Array(16); crypto.getRandomValues(b)
      c = Array.from(b, x => x.toString(16).padStart(2, '0')).join('')
      localStorage.setItem(CLAVE, c)
    }
    return c
  } catch { return null }
}
export const plataforma = () => {
  const ua = navigator.userAgent
  if (/iphone|ipad|ipod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) return 'ios'
  if (/android/i.test(ua)) return 'android'
  return /windows|macintosh|linux|cros/i.test(ua) ? 'escritorio' : 'otro'
}
export const enModoApp = () => window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true

export function registrarApp(evento) {
  const d = codigo()
  if (!d) return
  supabase.rpc('registrar_app_instalada', { p_dispositivo: d, p_plataforma: plataforma(), p_evento: evento }).then(() => {}, () => {})
}
// Al abrir el catálogo: si ya está corriendo como app instalada, se cuenta la apertura
export const contarAperturaApp = () => { if (enModoApp()) registrarApp('abierta') }
