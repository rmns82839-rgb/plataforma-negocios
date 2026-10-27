// Ruta del servidor (Vercel): la usan SOLO los programas que arman la vista previa de un enlace (WhatsApp, Telegram, Facebook…)
// vía vercel.json; las personas siguen recibiendo la app normal. /api/compartir?slug=mi-tienda  ·  sin slug = tarjeta de Matriz.
import { slugValido } from './_manifest.js'
import { configSupabase, traerNegocio } from './manifest.js'
import { origenDe, datosTarjeta, armarCompartir } from './_compartir.js'

export default async function handler(req, res) {
  const slug = String(req.query?.slug || '').toLowerCase()
  const base = origenDe(req.headers)
  let n = null
  if (slugValido(slug)) {
    const cfg = configSupabase()
    if (cfg.base && cfg.clave) { try { n = await traerNegocio(slug, cfg) } catch { n = null } }
  }
  res.setHeader('Content-Type', 'text/html; charset=utf-8')
  res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=600, stale-while-revalidate=86400')
  return res.status(200).send(armarCompartir(datosTarjeta(n, slug, base)))
}
