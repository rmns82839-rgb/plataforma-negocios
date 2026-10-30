// Ruta del servidor (Vercel): POST /api/avisar-estado  { aviso }
// La llama el panel de la tienda justo después de cambiar el estado de un pedido. Necesita en Vercel: SUPABASE_SERVICE_ROLE_KEY,
// VITE_VAPID_PUBLICA, VAPID_PRIVADA y (opcional) VAPID_CONTACTO (las mismas del aviso de pedido nuevo).
import { configSupabase } from './manifest.js'
import { avisarEstado } from './_estadoPush.js'

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store'); res.setHeader('Content-Type', 'application/json; charset=utf-8')
  if (req.method !== 'POST') return res.status(405).send(JSON.stringify({ error: 'Método no permitido' }))
  let cuerpo = {}
  try { cuerpo = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {}) } catch { return res.status(400).send(JSON.stringify({ error: 'Aviso no válido' })) }
  const { base } = configSupabase()
  const vapid = { pub: process.env.VITE_VAPID_PUBLICA || '', priv: process.env.VAPID_PRIVADA || '', contacto: process.env.VAPID_CONTACTO || 'mailto:soporte@matriz.app' }
  const webpush = (await import('web-push')).default
  if (vapid.pub && vapid.priv) webpush.setVapidDetails(vapid.contacto, vapid.pub, vapid.priv)
  const r = await avisarEstado({ cuerpo, base, servicio: process.env.SUPABASE_SERVICE_ROLE_KEY || '', vapid }, fetch, (s, c, o) => webpush.sendNotification(s, c, o))
  return res.status(r.http).send(JSON.stringify(r.cuerpo))
}
