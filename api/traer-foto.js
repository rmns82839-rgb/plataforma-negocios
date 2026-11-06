// Ruta del servidor (Vercel): POST /api/traer-foto  { url, negocio_id }  → la imagen (o { error })
// No necesita variables nuevas: usa las de Supabase que ya existen (VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY).
import { lookup } from 'node:dns/promises'
import { traerFoto } from './_traerFoto.js'

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store')
  const json = (http, c) => res.status(http).setHeader('Content-Type', 'application/json; charset=utf-8').send(JSON.stringify(c))
  if (req.method !== 'POST') return json(405, { error: 'Método no permitido' })
  let cuerpo = {}
  try { cuerpo = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {}) } catch { return json(400, { error: 'Pedido no válido' }) }
  const base = (process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '').trim().replace(/\/rest\/v1\/?$/, '').replace(/\/+$/, '')
  const anon = (process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '').trim()
  const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '')
  const r = await traerFoto({ cuerpo, token, base, anon, resolver: async (h) => (await lookup(h, { all: true })).map((x) => x.address) })
  if (r.datos) return res.status(200).setHeader('Content-Type', r.tipo).send(r.datos)
  return json(r.http, r.cuerpo)
}
