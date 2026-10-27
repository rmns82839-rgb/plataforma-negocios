import { useSyncExternalStore } from 'react'

// true en pantallas de PC (≥ 960 px, el mismo corte "lg" de Tailwind)
const consulta = '(min-width: 960px)'
const suscribir = (f) => {
  const m = window.matchMedia(consulta)
  m.addEventListener('change', f)
  return () => m.removeEventListener('change', f)
}
export const useEsGrande = () => useSyncExternalStore(suscribir, () => window.matchMedia(consulta).matches, () => false)
