// Vista de celular o de computador, elegida por la persona (para el celular que abrió el navegador en «modo computador»).
// «celular»: si el navegador está en modo computador (página de ~1000 px en un celular), la app se muestra dentro de un marco del ancho
//            del celular, ampliado para llenar la pantalla; así las pantallas se ven como en el celular.
// «computador»: la página se arma con ancho de computador (más información a la vez) aunque sea un celular.
// Sin elección (lo normal) no cambia nada.
const CLAVE = 'matriz-vista'

export const preferenciaVista = () => { try { const v = localStorage.getItem(CLAVE); return v === 'celular' || v === 'computador' ? v : null } catch { return null } }
export const guardarVista = (v) => { try { if (v) localStorage.setItem(CLAVE, v); else localStorage.removeItem(CLAVE) } catch { /* sin almacenamiento */ } }

/** ¿Es un celular (pantalla chica y táctil)? En computadores y tabletas el selector no aparece. */
export const esCelular = () => typeof window !== 'undefined' && Math.min(window.screen?.width || 9999, window.screen?.height || 9999) <= 600 && (navigator.maxTouchPoints || 0) > 0
/** Celular con el navegador en «modo computador»: la página mide cerca de 1000 px en una pantalla de ~400. */
export const modoComputadorEnCelular = () => esCelular() && window.innerWidth >= 900 && window.innerWidth >= (window.screen?.width || 0) * 1.5

/** Lo que se ve ahora: 'celular' | 'computador'. */
export const vistaActual = () => preferenciaVista() ?? (window.innerWidth >= 900 ? 'computador' : 'celular')

/** Ajusta el ancho de la página según la elección. Se llama una vez al abrir la app. */
export function aplicarVista() {
  if (typeof document === 'undefined' || !esCelular()) return
  const meta = document.querySelector('meta[name="viewport"]')
  if (!meta) return
  if (preferenciaVista() === 'computador' && window.self === window.top) meta.setAttribute('content', 'width=1100, initial-scale=1.0, viewport-fit=cover')
}

/** ¿Hay que mostrar la app dentro del marco de celular? (solo en la ventana principal, no dentro del propio marco) */
export const hacenFaltaMarco = () => preferenciaVista() === 'celular' && window.self === window.top && modoComputadorEnCelular()

/** Cambia la vista y vuelve a abrir la app. */
export function cambiarVista(v) {
  guardarVista(v)
  try { (window.top || window).location.reload() } catch { window.location.reload() }
}
