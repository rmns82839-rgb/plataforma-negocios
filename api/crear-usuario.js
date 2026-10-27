// Ruta del servidor (Vercel): POST /api/crear-usuario  { negocio_id, email, password, rol }
// Necesita SUPABASE_SERVICE_ROLE_KEY en Vercel (Supabase > Project Settings > API > service_role). Nunca va en el frontend.
import { configSupabase } from './manifest.js'
import { crearUsuario } from './_usuario.js'

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store'); res.setHeader('Content-Type', 'application/json; charset=utf-8')
  if (req.method !== 'POST') return res.status(405).send(JSON.stringify({ error: 'Método no permitido' }))
  let cuerpo = {}
  try { cuerpo = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {}) } catch { return res.status(400).send(JSON.stringify({ error: 'Pedido no válido' })) }
  const { base, clave } = configSupabase()
  const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '')
  const r = await crearUsuario({ cuerpo, token, base, anon: clave, servicio: process.env.SUPABASE_SERVICE_ROLE_KEY || '' })
  return res.status(r.http).send(JSON.stringify(r.cuerpo))
}
