// Ruta del servidor (Vercel): /api/icono?slug=mi-tienda&size=192[&mascara=1]
import { slugValido } from './_manifest.js'
import { configSupabase, traerNegocio } from './manifest.js'
import { dibujarIcono, TAMANOS } from './_icono.js'

const RUTA_LOGO = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/marca\/[\w.-]{1,120}$/

export default async function handler(req, res) {
  const slug = String(req.query?.slug || '').toLowerCase()
  const size = Number(req.query?.size)
  if (!slugValido(slug) || !TAMANOS.includes(size)) return res.status(400).json({ error: 'Pedido no válido' })
  const cfg = configSupabase()
  if (!cfg.base || !cfg.clave) return res.status(500).json({ error: 'Falta configurar Supabase en el servidor' })
  try {
    const n = await traerNegocio(slug, cfg)
    if (!n) return res.status(404).json({ error: 'Tienda no disponible' })
    let logo = null
    const ruta = n.icono || n.logo
    if (ruta && RUTA_LOGO.test(ruta)) {   // la ruta sale de la base y solo puede ser una imagen de marca de una tienda: el servidor nunca pide otra cosa
      const r = await fetch(`${cfg.base}/storage/v1/object/public/negocios/${ruta}`)
      if (r.ok && Number(r.headers.get('content-length') || 0) < 4_000_000) logo = Buffer.from(await r.arrayBuffer())
    }
    const png = await dibujarIcono({ logo, color: n.color_principal, size, mascara: req.query?.mascara === '1' })
    res.setHeader('Content-Type', 'image/png')
    res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800')
    return res.status(200).send(png)
  } catch {
    return res.status(502).json({ error: 'No pudimos dibujar el ícono' })
  }
}
