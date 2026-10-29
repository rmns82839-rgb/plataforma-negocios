// Llamadas a Google Maps Platform desde el servidor: buscar direcciones (Geocoding API) y medir la ruta (Routes API).
// La clave vive SOLO en el servidor (variable GOOGLE_MAPS_SERVER_KEY, sin prefijo VITE_). El navegador usa OTRA clave (VITE_GOOGLE_MAPS_KEY) solo para dibujar el mapa.
// Misma forma que _ors.js: buscar → [{ etiqueta, lat, lng, confianza, aproximada }] · ruta → km por carretera.
export const HOST_DIRECCIONES = 'https://maps.googleapis.com/maps/api/geocode/json'
export const HOST_RUTAS = 'https://routes.googleapis.com/directions/v2:computeRoutes'

// Un municipio, departamento o país NO sirven para medir un domicilio (daría 0 km o un punto cualquiera)
const TIPOS_NO_UTILES = new Set(['locality', 'administrative_area_level_1', 'administrative_area_level_2', 'administrative_area_level_3', 'country', 'political'])
const PRECISION = { ROOFTOP: 1, RANGE_INTERPOLATED: 0.85, GEOMETRIC_CENTER: 0.5, APPROXIMATE: 0.3 }

async function pedir(url, opciones, tiempoMs, fetchFn) {
  const ctl = new AbortController()
  const t = setTimeout(() => ctl.abort(), tiempoMs)
  try {
    const r = await fetchFn(url, { ...opciones, signal: ctl.signal })
    if (!r.ok) { const e = new Error('Google ' + r.status); e.status = r.status; throw e }
    return await r.json()
  } finally { clearTimeout(t) }
}

const distanciaKm = (a, b) => {
  const R = 6371, rad = (x) => (x * Math.PI) / 180
  const h = Math.sin(rad(b.lat - a.lat) / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

/** Busca direcciones en Colombia, solo cerca de la tienda (radioKm) y solo resultados útiles. Hasta 4 candidatos. */
export async function geocodificar(texto, foco, clave, fetchFn = fetch, opciones = {}) {
  const u = new URL(HOST_DIRECCIONES)
  u.searchParams.set('address', texto)
  u.searchParams.set('components', 'country:CO')
  u.searchParams.set('region', 'co')
  u.searchParams.set('language', 'es')
  if (foco && foco.lat != null && foco.lng != null && opciones.radioKm) {
    // «bounds» solo inclina la búsqueda hacia la tienda; el filtro de distancia de abajo es el que manda
    const dLat = opciones.radioKm / 111, dLng = opciones.radioKm / (111 * Math.max(0.2, Math.cos((foco.lat * Math.PI) / 180)))
    u.searchParams.set('bounds', `${foco.lat - dLat},${foco.lng - dLng}|${foco.lat + dLat},${foco.lng + dLng}`)
  }
  u.searchParams.set('key', clave)
  const j = await pedir(u.toString(), { headers: { Accept: 'application/json' } }, 8000, fetchFn)
  if (j.status === 'ZERO_RESULTS') return []
  if (j.status === 'OVER_QUERY_LIMIT' || j.status === 'OVER_DAILY_LIMIT') { const e = new Error('Google cupo'); e.status = 429; throw e }
  if (j.status === 'REQUEST_DENIED') { const e = new Error('Google clave'); e.status = 403; throw e }
  if (j.status !== 'OK') throw new Error('Google ' + j.status)
  const vistos = new Set(), out = []
  for (const r of j.results || []) {
    const lat = Number(r.geometry?.location?.lat), lng = Number(r.geometry?.location?.lng)
    const etiqueta = String(r.formatted_address || '').trim()
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || !etiqueta) continue
    const tipos = r.types || []
    if (tipos.length && tipos.every((t) => TIPOS_NO_UTILES.has(t))) continue
    if (foco && opciones.radioKm && distanciaKm(foco, { lat, lng }) > opciones.radioKm) continue
    if (vistos.has(etiqueta)) continue
    vistos.add(etiqueta)
    const tipoPunto = r.geometry?.location_type || 'APPROXIMATE'
    let confianza = PRECISION[tipoPunto] ?? 0.3
    if (r.partial_match) confianza = Math.min(confianza, 0.55)
    const ciudad = (r.address_components || []).find((c) => (c.types || []).includes('locality'))?.long_name || ''
    out.push({ etiqueta: etiqueta.slice(0, 160), lat: Number(lat.toFixed(6)), lng: Number(lng.toFixed(6)), confianza, aproximada: tipoPunto === 'APPROXIMATE' || tipoPunto === 'GEOMETRIC_CENTER' || tipos.includes('neighborhood'), ciudad })
    if (out.length >= 4) break
  }
  return out
}

/** Distancia por carretera (km) entre dos puntos. Sin tráfico en vivo (más barato y suficiente para cobrar por kilómetros). */
export async function rutaKm(origen, destino, clave, fetchFn = fetch) {
  const j = await pedir(HOST_RUTAS, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': clave, 'X-Goog-FieldMask': 'routes.distanceMeters' },
    body: JSON.stringify({
      origin: { location: { latLng: { latitude: origen.lat, longitude: origen.lng } } },
      destination: { location: { latLng: { latitude: destino.lat, longitude: destino.lng } } },
      travelMode: 'DRIVE', routingPreference: 'TRAFFIC_UNAWARE', units: 'METRIC',
    }),
  }, 8000, fetchFn)
  const m = j.routes?.[0]?.distanceMeters
  if (!Number.isFinite(m) || m < 0) throw new Error('Respuesta de ruta sin distancia')
  return m / 1000
}
