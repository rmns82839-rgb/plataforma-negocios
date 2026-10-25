// Llamadas a OpenRouteService. La clave vive SOLO en el servidor (variable ORS_API_KEY, sin prefijo VITE_).
// Direcciones nuevas del servicio (las de api.openrouteservice.org se apagan en noviembre de 2026)
export const HOST_RUTAS = 'https://api.heigit.org/openrouteservice'
export const HOST_DIRECCIONES = 'https://api.heigit.org/pelias/v1'
const CAPAS_UTILES = new Set(['address', 'street', 'venue', 'neighbourhood'])   // municipio, departamento o país NO sirven: medirían 0 km

async function pedir(url, opciones, tiempoMs, fetchFn) {
  const ctl = new AbortController()
  const t = setTimeout(() => ctl.abort(), tiempoMs)
  try {
    const r = await fetchFn(url, { ...opciones, signal: ctl.signal })
    if (!r.ok) { const e = new Error('ORS ' + r.status); e.status = r.status; throw e }
    return await r.json()
  } finally { clearTimeout(t) }
}

// Busca direcciones en Colombia, SOLO cerca de la tienda (radioKm) y solo resultados útiles. Devuelve hasta 4 candidatos.
export async function geocodificar(texto, foco, clave, fetchFn = fetch, opciones = {}) {
  const u = new URL(HOST_DIRECCIONES + '/search')
  u.searchParams.set('text', texto)
  u.searchParams.set('boundary.country', 'CO')
  u.searchParams.set('layers', [...CAPAS_UTILES].join(','))
  u.searchParams.set('size', '8')
  if (foco && foco.lat != null && foco.lng != null) {
    u.searchParams.set('focus.point.lat', String(foco.lat))
    u.searchParams.set('focus.point.lon', String(foco.lng))
    if (opciones.radioKm) {   // sin este límite, "calle 10 # 5-20" se ubicaba en otra ciudad a 700 km
      u.searchParams.set('boundary.circle.lat', String(foco.lat))
      u.searchParams.set('boundary.circle.lon', String(foco.lng))
      u.searchParams.set('boundary.circle.radius', String(opciones.radioKm))
    }
  }
  let j
  try { j = await pedir(u.toString(), { headers: { Authorization: clave, Accept: 'application/json' } }, 8000, fetchFn) }
  catch (e) {
    if (e.status !== 401 && e.status !== 403) throw e
    u.searchParams.set('api_key', clave)      // por si el servicio de direcciones pide la clave en la consulta (solo viaja del servidor al servicio)
    j = await pedir(u.toString(), { headers: { Accept: 'application/json' } }, 8000, fetchFn)
  }
  const vistos = new Set(), out = []
  for (const f of j.features || []) {
    const [lng, lat] = f.geometry?.coordinates || []
    const etiqueta = String(f.properties?.label || '').trim()
    const capa = String(f.properties?.layer || '')
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || !etiqueta) continue
    if (capa && !CAPAS_UTILES.has(capa)) continue
    if (vistos.has(etiqueta)) continue
    vistos.add(etiqueta)
    out.push({ etiqueta: etiqueta.slice(0, 160), lat: Number(lat.toFixed(6)), lng: Number(lng.toFixed(6)), confianza: Number(f.properties?.confidence ?? 0), aproximada: capa === 'neighbourhood' })
    if (out.length >= 4) break
  }
  return out
}

// Distancia por carretera (km) entre dos puntos.
export async function rutaKm(origen, destino, clave, fetchFn = fetch) {
  const j = await pedir(HOST_RUTAS + '/v2/directions/driving-car', {
    method: 'POST',
    headers: { Authorization: clave, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ coordinates: [[origen.lng, origen.lat], [destino.lng, destino.lat]] }),
  }, 8000, fetchFn)
  const m = j.routes?.[0]?.summary?.distance
  if (!Number.isFinite(m) || m < 0) throw new Error('Respuesta de ruta sin distancia')
  return m / 1000
}
