// Estado de instalación de la PWA.
// Chrome/Edge/Android avisan que la app es instalable (beforeinstallprompt)
// apenas carga la página, antes de que React termine de montar. Por eso el
// evento se captura aquí, al arrancar, y los componentes se suscriben después.

import { registrarApp } from './instalaciones'

const enModoApp = () =>
  window.matchMedia?.('(display-mode: standalone)').matches ||
  window.navigator.standalone === true

export const esIOS = () =>
  /iphone|ipad|ipod/i.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)

let estado = { evento: null, instalada: enModoApp() }
const oyentes = new Set()

const cambiar = (parcial) => {
  estado = { ...estado, ...parcial }   // objeto nuevo: así React detecta el cambio
  oyentes.forEach(f => f())
}

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault()                   // evita la mini-barra automática; usamos nuestro modal
  cambiar({ evento: e })
})
window.addEventListener('appinstalled', () => { cambiar({ evento: null, instalada: true }); registrarApp('instalada') })

export const suscribir = (f) => {
  oyentes.add(f)
  return () => oyentes.delete(f)
}
export const obtenerEstado = () => estado

/** Abre el diálogo nativo de instalación. Devuelve true si la persona aceptó. */
export async function instalar() {
  const { evento } = estado
  if (!evento) return false
  evento.prompt()
  const { outcome } = await evento.userChoice
  cambiar({ evento: null, instalada: outcome === 'accepted' })  // el evento solo sirve una vez
  return outcome === 'accepted'
}
