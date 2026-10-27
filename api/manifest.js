// Ruta del servidor (Vercel): /api/manifest?slug=mi-tienda[&panel=1]
// Usa solo la clave PÚBLICA (anon) de Supabase: lo que devuelve es lo mismo que ya ve cualquier visitante de la tienda.
import { armarManifest, slugValido } from './_manifest.js'

export function configSupabase(env = process.env) {
  const base = String(env.SUPABASE_URL || env.VITE_SUPABASE_URL || '').trim().replace(/\/+$/, '').replace(/\/rest\/v1$/, '')
  const clave = String(env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY || '').trim()
  return { base, clave }
}

export async function traerNegocio(slug, { base, clave }, f = fetch) {
  const r = await f(`${base}/rest/v1/rpc/negocio_publico`, {
    method: 'POST', headers: { apikey: clave, Authorization: `Bearer ${clave}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ p_slug: slug }),
  })
  if (!r.ok) throw new Error(`negocio_publico ${r.status}`)
  return r.json()
}

export default async function handler(req, res) {
  const slug = String(req.query?.slug || '').toLowerCase()
  if (!slugValido(slug)) return res.status(400).json({ error: 'Tienda no válida' })
  const cfg = configSupabase()
  if (!cfg.base || !cfg.clave) return res.status(500).json({ error: 'Falta configurar Supabase en el servidor' })
  try {
    const n = await traerNegocio(slug, cfg)
    if (!n) { res.setHeader('Cache-Control', 'public, max-age=60'); return res.status(404).json({ error: 'Tienda no disponible' }) }
    res.setHeader('Content-Type', 'application/manifest+json; charset=utf-8')
    res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=600, stale-while-revalidate=86400')
    return res.status(200).send(JSON.stringify(armarManifest(n, { panel: req.query?.panel === '1' })))
  } catch {
    return res.status(502).json({ error: 'No pudimos leer la tienda' })
  }
}
