// Tarjeta que se ve al pegar un enlace en WhatsApp, Telegram, Facebook, etc. (etiquetas Open Graph).
// Lógica pura: sin red ni Supabase, así se prueba sola. Empieza por «_» para que Vercel no la publique como ruta.
import { slugValido } from './_manifest.js'

export const MATRIZ = {
  nombre: 'Matriz',
  eslogan: 'El origen de lo bueno',
  descripcion: 'Matriz · El origen de lo bueno. Caja, inventario, fiados y catálogo en línea para tu negocio.',
}
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
const corto = (s, max) => { const t = String(s ?? '').trim().replace(/\s+/g, ' '); return t.length <= max ? t : `${t.slice(0, max - 1).trimEnd()}…` }

// Dirección del sitio (https://dominio) a partir de lo que manda Vercel; si algo raro llega, no se usa.
export function origenDe(headers = {}) {
  const host = String(headers['x-forwarded-host'] || headers.host || '').split(',')[0].trim()
  if (!/^[a-z0-9.-]+(?::\d{1,5})?$/i.test(host)) return ''
  const proto = String(headers['x-forwarded-proto'] || 'https').split(',')[0].trim()
  return `${proto === 'http' && /^localhost/.test(host) ? 'http' : 'https'}://${host}`
}

// n = lo que devuelve negocio_publico (o null si la tienda no existe / no está pública)
export function datosTarjeta(n, slug, base) {
  const hayLogo = Boolean(n && (n.icono || n.logo))
  if (!n || !slugValido(slug)) return { titulo: MATRIZ.nombre + ' · ' + MATRIZ.eslogan, descripcion: MATRIZ.descripcion, url: `${base}/`, imagen: `${base}/compartir-matriz.jpg`, propia: false, nombre: MATRIZ.nombre }
  const nombre = corto(n.nombre || 'Tienda', 60)
  return {
    nombre,
    titulo: nombre,
    descripcion: corto(n.eslogan || `Mira el catálogo de ${nombre} y haz tu pedido en línea.`, 200),
    url: `${base}/t/${slug}`,
    imagen: hayLogo ? `${base}/api/tarjeta?slug=${slug}` : `${base}/compartir-matriz.jpg`,
    propia: hayLogo,
  }
}

export function armarCompartir(d) {
  const t = esc(d.titulo), de = esc(d.descripcion), u = esc(d.url), im = esc(d.imagen)
  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8" />
<title>${t}</title>
<meta name="description" content="${de}" />
<link rel="canonical" href="${u}" />
<meta property="og:type" content="website" />
<meta property="og:site_name" content="${esc(d.nombre)}" />
<meta property="og:locale" content="es_CO" />
<meta property="og:title" content="${t}" />
<meta property="og:description" content="${de}" />
<meta property="og:url" content="${u}" />
<meta property="og:image" content="${im}" />
<meta property="og:image:width" content="1200" />
<meta property="og:image:height" content="630" />
<meta property="og:image:alt" content="${t}" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${t}" />
<meta name="twitter:description" content="${de}" />
<meta name="twitter:image" content="${im}" />
</head><body><h1>${t}</h1><p>${de}</p><p><a href="${u}">Abrir</a></p></body></html>`
}
