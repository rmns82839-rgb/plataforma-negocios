// Llamadas a OpenRouteService. La clave vive SOLO en el servidor (variable ORS_API_KEY, sin prefijo VITE_).
const HOST = 'https://api.openrouteservice.org'

async function pedir(url, opciones, tiempoMs, fetchFn) {
  const ctl = new AbortController()
  const t = setTimeout(() => ctl.abort(), tiempoMs)
  try {
    const r = await fetchFn(url, { ...opciones, signal: ctl.signal })
    if (!r.ok) { const e = new Error('ORS ' + r.status); e.status = r.status; throw e }
    return await r.json()
  } finally { clearTimeout(t) }
}

// Busca direcciones en Colombia, cerca de la tienda. Devuelve hasta 4 candidatos.
export async function geocodificar(texto, foco, clave, fetchFn = fetch) {
  const u = new URL(HOST + '/geocode/search')
  u.searchParams.set('text', texto)
  u.searchParams.set('boundary.country', 'CO')
  u.searchParams.set('size', '6')
  if (foco && foco.lat != null && foco.lng != null) {
    u.searchParams.set('focus.point.lat', String(foco.lat))
    u.searchParams.set('focus.point.lon', String(foco.lng))
  }
  const j = await pedir(u.toString(), { headers: { Authorization: clave, Accept: 'application/json' } }, 8000, fetchFn)
  const vistos = new Set(), out = []
  for (const f of j.features || []) {
    const [lng, lat] = f.geometry?.coordinates || []
    const etiqueta = String(f.properties?.label || '').trim()
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || !etiqueta) continue
    if (vistos.has(etiqueta)) continue
    vistos.add(etiqueta)
    out.push({ etiqueta: etiqueta.slice(0, 160), lat: Number(lat.toFixed(6)), lng: Number(lng.toFixed(6)), confianza: Number(f.properties?.confidence ?? 0) })
    if (out.length >= 4) break
  }
  return out
}

// Distancia por carretera (km) entre dos puntos.
export async function rutaKm(origen, destino, clave, fetchFn = fetch) {
  const j = await pedir(HOST + '/v2/directions/driving-car', {
    method: 'POST',
    headers: { Authorization: clave, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ coordinates: [[origen.lng, origen.lat], [destino.lng, destino.lat]] }),
  }, 8000, fetchFn)
  const m = j.routes?.[0]?.summary?.distance
  if (!Number.isFinite(m) || m < 0) throw new Error('Respuesta de ruta sin distancia')
  return m / 1000
}
