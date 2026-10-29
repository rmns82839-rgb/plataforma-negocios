// Carga única del script de Google Maps (solo si hay clave del navegador). Si falla (sin internet, clave mal puesta, cupo), devuelve null y el mapa usa OpenStreetMap.
// VITE_GOOGLE_MAPS_KEY es una clave de NAVEGADOR: va restringida por dominio en Google Cloud (no es secreta, pero sin restricción cualquiera podría gastar tu cupo).
export const CLAVE_GOOGLE = (import.meta.env.VITE_GOOGLE_MAPS_KEY || '').trim()
export const hayGoogle = () => CLAVE_GOOGLE.length > 20

let promesa = null
export function cargarGoogleMaps() {
  if (!hayGoogle() || typeof window === 'undefined') return Promise.resolve(null)
  if (window.google?.maps?.Map) return Promise.resolve(window.google.maps)
  if (promesa) return promesa
  promesa = new Promise((resolve) => {
    const fin = (v) => { clearTimeout(t); resolve(v) }
    const t = setTimeout(() => { promesa = null; fin(null) }, 12000)
    window.__gmapsListo = () => fin(window.google?.maps?.Map ? window.google.maps : null)
    window.gm_authFailure = () => { promesa = Promise.resolve(null); fin(null) }   // clave rechazada: se queda con OpenStreetMap
    const s = document.createElement('script')
    s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(CLAVE_GOOGLE)}&callback=__gmapsListo&loading=async&language=es&region=CO&v=weekly`
    s.async = true
    s.onerror = () => { promesa = null; fin(null) }
    document.head.appendChild(s)
  })
  return promesa
}
