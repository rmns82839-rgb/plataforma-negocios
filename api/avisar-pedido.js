// Ruta del servidor (Vercel): POST /api/avisar-pedido  { slug, tipo, numero, telefono }
// La llama el catálogo público justo después de crear un pedido. Necesita en Vercel: SUPABASE_SERVICE_ROLE_KEY,
// VITE_VAPID_PUBLICA, VAPID_PRIVADA y (opcional) VAPID_CONTACTO.
import { configSupabase } from './manifest.js'
import { avisarPedido } from './_pedidoPush.js'

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store'); res.setHeader('Content-Type', 'application/json; charset=utf-8')
  if (req.method !== 'POST') return res.status(405).send(JSON.stringify({ error: 'Método no permitido' }))
  let cuerpo = {}
  try { cuerpo = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {}) } catch { return res.status(400).send(JSON.stringify({ error: 'Pedido no válido' })) }
  const { base } = configSupabase()
  const vapid = { pub: process.env.VITE_VAPID_PUBLICA || '', priv: process.env.VAPID_PRIVADA || '', contacto: process.env.VAPID_CONTACTO || 'mailto:soporte@matriz.app' }
  const webpush = (await import('web-push')).default
  if (vapid.pub && vapid.priv) webpush.setVapidDetails(vapid.contacto, vapid.pub, vapid.priv)
  const r = await avisarPedido({ cuerpo, base, servicio: process.env.SUPABASE_SERVICE_ROLE_KEY || '', vapid }, fetch, (s, c, o) => webpush.sendNotification(s, c, o))
  return res.status(r.http).send(JSON.stringify(r.cuerpo))
}
