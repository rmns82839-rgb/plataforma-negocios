// ¿Hay una versión más nueva de la app publicada? Se compara el identificador de esta versión
// (metido al compilar) con /version.json, que siempre se pide fresco a internet.
/* global __ID_VERSION__ */
export const MI_VERSION = typeof __ID_VERSION__ === 'string' ? __ID_VERSION__ : 'dev'
import { supabase } from './supabase'
const INTENTO = 'matriz:recarga-auto'

export async function hayVersionNueva() {
  if (MI_VERSION === 'dev') return false
  try {
    const r = await fetch(`/version.json?t=${Date.now()}`, { cache: 'no-store' })
    if (!r.ok) return false
    const j = await r.json()
    return typeof j?.v === 'string' && j.v !== MI_VERSION
  } catch { return false }               // sin internet o respuesta rara: no molestar
}

/** Pide al navegador la versión nueva de los archivos y recarga la página.
 *  Antes de recargar deja la sesión asentada: espera cualquier renovación del acceso que esté en curso y la detiene,
 *  para que la recarga no corte el cambio de llave a la mitad y saque a la persona de su cuenta.
 *  alPaso(0-100) permite mostrar una barrita de progreso. */
export async function actualizarAhora(alPaso = () => {}) {
  alPaso(10)
  try {
    await supabase.auth.getSession()            // espera (y completa) una renovación en curso; guarda la sesión al día
    supabase.auth.stopAutoRefresh()             // nadie renueva la llave mientras la página se recarga
  } catch { /* si falla, igual se recarga: la sesión guardada sigue ahí */ }
  alPaso(35)
  try {
    const reg = await navigator.serviceWorker?.getRegistration()
    if (reg) {
      const cambio = new Promise(res => { navigator.serviceWorker.addEventListener('controllerchange', res, { once: true }); setTimeout(res, 5000) })
      alPaso(55)
      await reg.update()
      alPaso(75)
      await cambio
    }
  } catch { /* si falla, igual se recarga */ }
  alPaso(100)
  await new Promise(r => setTimeout(r, 250))
  window.location.reload()
}

/** Recarga sola, una única vez por versión, para no caer en un ciclo si algo falla. */
export const yaIntentoRecargar = (v) => { try { return sessionStorage.getItem(INTENTO) === v } catch { return true } }
export const marcarRecarga = (v) => { try { sessionStorage.setItem(INTENTO, v) } catch { /* sin almacenamiento */ } }
