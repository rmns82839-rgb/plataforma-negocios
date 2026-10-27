// Manifest de la app instalable de CADA tienda (lo sirve /api/manifest?slug=...).
// Lógica pura: sin red ni Supabase, así se prueba sola. El archivo empieza por «_» para que Vercel no lo publique como ruta.
const HEX = /^#[0-9A-Fa-f]{6}$/
export const slugValido = (s) => typeof s === 'string' && /^[a-z0-9](?:[a-z0-9-]{0,48}[a-z0-9])?$/.test(s)

// El nombre corto es el que queda bajo el ícono del celular: cabe poco, se corta en una palabra entera si se puede.
export function nombreCorto(nombre, max = 12) {
  const n = String(nombre || '').trim().replace(/\s+/g, ' ')
  if (n.length <= max) return n || 'Tienda'
  const palabras = n.split(' ')
  let r = ''
  for (const p of palabras) { if ((r ? r + ' ' + p : p).length > max) break; r = r ? r + ' ' + p : p }
  return r || n.slice(0, max)
}

export function armarManifest(n, { panel = false } = {}) {
  const slug = n.slug
  const principal = HEX.test(n.color_principal || '') ? n.color_principal : '#0B0B0C'
  const inicio = panel ? `/t/${slug}/panel` : `/t/${slug}`
  const nombre = String(n.nombre || 'Tienda').slice(0, 45)
  const ico = (size, purpose) => ({ src: `/api/icono?slug=${slug}&size=${size}${purpose === 'maskable' ? '&mascara=1' : ''}`, sizes: `${size}x${size}`, type: 'image/png', purpose })
  return {
    id: inicio,
    name: panel ? `Panel · ${nombre}` : nombre,
    short_name: panel ? nombreCorto(`Panel ${nombre}`) : nombreCorto(nombre),
    description: n.eslogan || `Pedidos y catálogo de ${nombre}`,
    lang: 'es-CO',
    start_url: inicio,
    scope: `/t/${slug}/`,
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#F7F4EC',
    theme_color: principal,
    icons: [ico(192, 'any'), ico(512, 'any'), ico(512, 'maskable')],
  }
}
