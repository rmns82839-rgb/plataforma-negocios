// App instalable (PWA). Lógica pura aparte de lo que toca el navegador, para poder probarla.
export const esIOS = (ua = '', maxTouch = 0) => /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && maxTouch > 1)
export const esSafari = (ua = '') => /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS|Chrome|Android/.test(ua)
export const urlManifest = (slug, panel = false) => `/api/manifest?slug=${encodeURIComponent(slug)}${panel ? '&panel=1' : ''}`
export const urlIconoApple = (slug) => `/api/icono?slug=${encodeURIComponent(slug)}&size=180`

// Qué se le muestra a la persona según su celular y navegador
export function guiaInstalacion({ instalada, tienePrompt, ua = '', maxTouch = 0 }) {
  if (instalada) return { tipo: 'ninguna' }
  if (tienePrompt) return { tipo: 'boton' }
  if (esIOS(ua, maxTouch)) return { tipo: esSafari(ua) ? 'ios' : 'ios-otro-navegador' }
  return { tipo: 'menu' }   // Android/escritorio sin aviso automático: se explica el menú del navegador
}

// ---------- Lo que sigue usa el navegador ----------
let aviso = null
const oyentes = new Set()
const avisar = () => oyentes.forEach((f) => f())

export function estaInstalada() {
  try { return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true } catch { return false }
}

export function iniciarPwa(registrar = () => {}) {
  if (typeof window === 'undefined') return
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); aviso = e; avisar() })
  window.addEventListener('appinstalled', () => { aviso = null; avisar(); registrar() })
  if ('serviceWorker' in navigator && import.meta.env?.PROD) {
    window.addEventListener('load', () => { navigator.serviceWorker.register('/sw.js').catch(() => {}) })
  }
}

export const suscribirPwa = (f) => { oyentes.add(f); return () => oyentes.delete(f) }
export const hayAviso = () => aviso !== null
export async function pedirInstalacion() {
  if (!aviso) return 'no'
  const a = aviso; aviso = null; avisar()
  await a.prompt()
  const { outcome } = await a.userChoice
  return outcome === 'accepted' ? 'si' : 'no'
}
