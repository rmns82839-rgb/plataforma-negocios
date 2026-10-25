// Ruta del servidor (Vercel): /api/domicilio
// Variables de entorno (solo servidor, NUNCA con prefijo VITE_):
//   ORS_API_KEY                clave de OpenRouteService (proveedor por defecto; ver _proveedor.js para cambiarlo)
//   SUPABASE_SERVICE_ROLE_KEY  clave "service_role" del proyecto Supabase (para llamar las funciones domicilio_*)
//   VITE_SUPABASE_URL          ya existe (es pública); también sirve SUPABASE_URL
import { manejar } from './_domicilio.js'
import { crearProveedor } from './_proveedor.js'

const veces = new Map()   // freno simple por IP (mejor esfuerzo; el freno real son los cupos de la base)
function demasiado(ip) {
  const ahora = Date.now(), ventana = 60_000, max = 40
  const lista = (veces.get(ip) || []).filter(t => ahora - t < ventana)
  lista.push(ahora); veces.set(ip, lista)
  if (veces.size > 5000) veces.clear()
  return lista.length > max
}

function urlBase() {
  const u = String(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').trim().replace(/\/+$/, '').replace(/\/rest\/v1$/, '')
  return u
}

async function rpc(nombre, args) {
  const base = urlBase(), clave = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!base || !clave) throw new Error('Falta configurar Supabase en el servidor')
  const r = await fetch(`${base}/rest/v1/rpc/${nombre}`, {
    method: 'POST',
    headers: { apikey: clave, Authorization: `Bearer ${clave}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
  })
  if (!r.ok) throw new Error(`RPC ${nombre}: ${r.status}`)
  return r.json()
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store')
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).json({ estado: 'error', mensaje: 'Método no permitido' }) }
  const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'sin-ip'
  if (demasiado(ip)) return res.status(429).json({ estado: 'espera', mensaje: 'Estás probando muy rápido. Espera un momento e inténtalo de nuevo.' })
  let cuerpo = req.body
  if (typeof cuerpo === 'string') { try { cuerpo = JSON.parse(cuerpo) } catch { cuerpo = null } }
  if (!cuerpo || typeof cuerpo !== 'object' || JSON.stringify(cuerpo).length > 2000) return res.status(400).json({ estado: 'error', mensaje: 'Solicitud no válida' })

  let prov
  try { prov = crearProveedor() } catch { prov = { buscar: async () => { throw new Error('sin proveedor') }, ruta: async () => { throw new Error('sin proveedor') } } }
  const d = { rpc, buscar: prov.buscar, ruta: prov.ruta }
  const r = await manejar(cuerpo, d)
  return res.status(r.http).json(r.cuerpo)
}
