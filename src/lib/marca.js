import { urlImagen } from './supabase'

const HEX = /^#[0-9A-Fa-f]{6}$/
const triple = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(' ')

// Aplica la marca de un negocio a toda la página: colores, título e ícono.
export function aplicarMarca(m) {
  const raiz = document.documentElement.style
  if (HEX.test(m?.color_principal || '')) raiz.setProperty('--c-principal', triple(m.color_principal))
  if (HEX.test(m?.color_secundario || '')) raiz.setProperty('--c-secundario', triple(m.color_secundario))
  if (HEX.test(m?.color_acento || '')) raiz.setProperty('--c-acento', triple(m.color_acento))
  document.title = m?.nombre ? (m.eslogan ? `${m.nombre} · ${m.eslogan}` : m.nombre) : 'Matriz'
  const icono = urlImagen(m?.icono)
  let link = document.querySelector('link[rel="icon"]')
  if (icono) {
    if (!link) { link = document.createElement('link'); link.rel = 'icon'; document.head.appendChild(link) }
    link.href = icono
  } else if (link) link.href = '/favicon.svg'
}

export function quitarMarca() {
  const raiz = document.documentElement.style
  ;['--c-principal', '--c-secundario', '--c-acento'].forEach((v) => raiz.removeProperty(v))
  document.title = 'Matriz'
}
