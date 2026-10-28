import { slugActual } from './enlaces'
// Direcciones públicas del catálogo (archivo .js aparte por el Fast Refresh de Vite).
// Cada producto tiene su propia página: /tienda/<id>/<nombre-en-minusculas>
// (el nombre solo adorna el enlace; lo que cuenta es el id).
export const slug = (texto) =>
  String(texto ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60)

export const rutaProducto = (p) => `/t/${slugActual()}/p/${p.id}/${slug(p.nombre)}`
export const rutaPrenda = (p) => `/t/${slugActual()}/r/${p.id}/${slug(p.nombre)}`

/** Id que viene en la dirección: /tienda/<id>/... o /ropa/<id>/... (o el viejo /ropa?p=<id>). */
export function idDeLaDireccion(base) {
  const partes = window.location.pathname.split('/').filter(Boolean)     // /t/{tienda}/p/{id}/{nombre}  (p = producto, r = prenda)
  if (partes[0] === 't' && partes[2] === (base === 'ropa' ? 'r' : 'p') && partes[3]) return partes[3]
  return new URLSearchParams(window.location.search).get('p')
}
