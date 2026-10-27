// Ruta del servidor (Vercel): /api/tarjeta?slug=mi-tienda → imagen 1200×630 con el logo de la tienda (para la vista previa del enlace).
// Si la tienda no tiene logo, se manda a la tarjeta de Matriz.
import { slugValido } from './_manifest.js'
import { configSupabase, traerNegocio } from './manifest.js'
import { dibujarTarjeta } from './_icono.js'

const RUTA_LOGO = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/marca\/[\w.-]{1,120}$/

export default async function handler(req, res) {
  const slug = String(req.query?.slug || '').toLowerCase()
  const sinLogo = () => { res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=600'); res.statusCode = 302; res.setHeader('Location', '/compartir-matriz.jpg'); return res.end() }
  if (!slugValido(slug)) return sinLogo()
  const cfg = configSupabase()
  if (!cfg.base || !cfg.clave) return sinLogo()
  try {
    const n = await traerNegocio(slug, cfg)
    const ruta = n && (n.logo || n.icono)
    if (!ruta || !RUTA_LOGO.test(ruta)) return sinLogo()
    const r = await fetch(`${cfg.base}/storage/v1/object/public/negocios/${ruta}`)
    if (!r.ok || Number(r.headers.get('content-length') || 0) > 4_000_000) return sinLogo()
    const jpg = await dibujarTarjeta({ logo: Buffer.from(await r.arrayBuffer()) })
    res.setHeader('Content-Type', 'image/jpeg')
    res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800')
    return res.status(200).send(jpg)
  } catch { return sinLogo() }
}
