// Trae una foto desde un enlace de internet para que quien administra la tienda la revise y la guarde. Lógica pura: la red y el DNS se inyectan, así se prueba sola.
// Se hace desde el servidor porque el navegador no puede leer imágenes de otras páginas (CORS). No guarda nada: devuelve la imagen tal cual.
// Solo la pide una persona del equipo DE ESA tienda (se mira con su propia sesión). Nunca abre direcciones internas o privadas.
import net from 'node:net'

export const MAX_BYTES = 4 * 1024 * 1024          // Vercel limita la respuesta a ~4,5 MB
const TIPOS = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif'])
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export const esPrivada = (ip) => {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number)
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224
  }
  const x = ip.toLowerCase()
  return x === '::1' || x === '::' || x.startsWith('fc') || x.startsWith('fd') || x.startsWith('fe80') || x.startsWith('::ffff:')
}

export async function urlSegura(texto, resolver) {
  let u
  try { u = new URL(texto) } catch { throw new Error('El enlace no es válido') }
  if (!/^https?:$/.test(u.protocol)) throw new Error('Solo se aceptan enlaces http o https')
  if (u.username || u.password) throw new Error('El enlace no es válido')
  const host = u.hostname.replace(/^\[|\]$/g, '')
  const ips = net.isIP(host) ? [host] : await resolver(host)
  if (!ips.length || ips.some(esPrivada)) throw new Error('Ese enlace no se puede abrir')
  return u
}

/** → { http, cuerpo } (error o aviso) o { http: 200, tipo, datos } con la imagen. */
export async function traerFoto({ cuerpo, token, base, anon, resolver }, f = fetch) {
  const fin = (http, c) => ({ http, cuerpo: c })
  if (!base || !anon) return fin(500, { error: 'Faltan las variables de Supabase en Vercel' })
  if (!token) return fin(401, { error: 'Sesión no válida' })
  const negocio = String(cuerpo?.negocio_id || '')
  if (!UUID.test(negocio)) return fin(400, { error: 'Falta la tienda' })
  const personal = await f(`${base}/rest/v1/rpc/es_personal`, {
    method: 'POST', headers: { apikey: anon, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ p_negocio_id: negocio }),
  }).then((r) => (r.ok ? r.json() : false)).catch(() => false)
  if (personal !== true) return fin(403, { error: 'Sin acceso' })

  try {
    let u = await urlSegura(String(cuerpo?.url || '').trim(), resolver)
    let r
    for (let salto = 0; salto < 4; salto++) {          // las redirecciones se siguen a mano, revisando cada destino
      r = await f(u, { redirect: 'manual', signal: AbortSignal.timeout(9000), headers: { 'User-Agent': 'Mozilla/5.0 (compatible; MatrizFotos/1.0)', Accept: 'image/*' } })
      if (r.status >= 300 && r.status < 400 && r.headers.get('location')) { u = await urlSegura(new URL(r.headers.get('location'), u).href, resolver); continue }
      break
    }
    if (!r.ok) return fin(422, { error: `La página respondió ${r.status}` })
    const tipo = String(r.headers.get('content-type') || '').split(';')[0].trim().toLowerCase()
    if (!TIPOS.has(tipo)) return fin(422, { error: 'El enlace no es una foto (jpg, png o webp)' })
    if (Number(r.headers.get('content-length') || 0) > MAX_BYTES) return fin(422, { error: 'La foto pesa demasiado (máx. 4 MB)' })
    const datos = Buffer.from(await r.arrayBuffer())
    if (datos.length > MAX_BYTES) return fin(422, { error: 'La foto pesa demasiado (máx. 4 MB)' })
    return { http: 200, tipo, datos }
  } catch (e) {
    return fin(422, { error: e?.name === 'TimeoutError' ? 'La página tardó demasiado' : (e?.message || 'No se pudo traer la foto') })
  }
}
