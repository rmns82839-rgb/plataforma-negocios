import { urlImagen } from './supabase'
import { urlManifest, urlIconoApple } from './pwa'

const HEX = /^#[0-9A-Fa-f]{6}$/
const triple = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(' ')

// Aplica la marca de un negocio a toda la página: colores, título e ícono.
export function aplicarMarca(m) {
  const raiz = document.documentElement.style
  if (HEX.test(m?.color_principal || '')) raiz.setProperty('--c-principal', triple(m.color_principal))
  if (HEX.test(m?.color_secundario || '')) raiz.setProperty('--c-secundario', triple(m.color_secundario))
  if (HEX.test(m?.color_acento || '')) raiz.setProperty('--c-acento', triple(m.color_acento))
  if (m?.slug) ponerManifest(m.slug, { color: m.color_principal })
  document.title = m?.nombre ? (m.eslogan ? `${m.nombre} · ${m.eslogan}` : m.nombre) : 'Matriz'
  const icono = urlImagen(m?.icono)
  let link = document.querySelector('link[rel="icon"]')
  if (icono) {
    if (!link) { link = document.createElement('link'); link.rel = 'icon'; document.head.appendChild(link) }
    link.href = icono
  } else if (link) link.href = '/favicon.svg'
}

// <link>/<meta> del <head> que se crean si no existen y se reemplazan si ya están
function poner(selector, crear, valor) {
  let el = document.head.querySelector(selector)
  if (!el) { el = crear(); document.head.appendChild(el) }
  return Object.assign(el, valor)
}

// Cada tienda se instala con SU nombre, SU ícono y SUS colores (los sirve /api/manifest). panel = la app del personal.
export function ponerManifest(slug, { panel = false, color } = {}) {
  if (!slug) return
  poner('link[rel="manifest"]', () => Object.assign(document.createElement('link'), { rel: 'manifest' }), { href: urlManifest(slug, panel) })
  poner('link[rel="apple-touch-icon"]', () => Object.assign(document.createElement('link'), { rel: 'apple-touch-icon' }), { href: urlIconoApple(slug) })
  if (HEX.test(color || '')) poner('meta[name="theme-color"]', () => Object.assign(document.createElement('meta'), { name: 'theme-color' }), { content: color })
}

export function quitarManifest() {
  document.head.querySelector('link[rel="manifest"]')?.remove()
  document.head.querySelector('link[rel="apple-touch-icon"]')?.remove()
  const t = document.head.querySelector('meta[name="theme-color"]'); if (t) t.content = '#F7F4EC'
}

export function quitarMarca() {
  quitarManifest()
  const raiz = document.documentElement.style
  ;['--c-principal', '--c-secundario', '--c-acento'].forEach((v) => raiz.removeProperty(v))
  document.title = 'Matriz'
}
