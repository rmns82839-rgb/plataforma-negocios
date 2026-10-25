// Lógica del cálculo de domicilio por km. Sin dependencias del servidor: recibe lo que necesita (d) para poder probarse.
//   d.rpc(nombre, args)          → llama una función de la base (solo service_role)
//   d.buscar(texto, foco)        → candidatos de dirección      (OpenRouteService)
//   d.ruta(origen, destino)      → km por carretera             (OpenRouteService)
// REGLA DE ORO: nunca se bloquea una venta. Si algo falla, se responde con respaldo=true y un calculo_id de respaldo (tarifa fija).

export const SLUG = /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/

export function distanciaLineaKm(a, b) {
  const R = 6371, rad = x => (x * Math.PI) / 180
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

const limpiar = t => String(t ?? '').replace(/[<>]/g, '').replace(/[\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 160)
const num = v => (v === null || v === undefined || v === '' ? NaN : Number(v))
const coordOk = (lat, lng) => Number.isFinite(lat) && Number.isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180

export const MENSAJES = {
  sin_cupo: 'Hoy el mapa no está disponible. No te preocupes: tu pedido sigue y se cobra la tarifa fija de domicilio.',
  mapa_fallo: 'No pudimos medir la distancia con el mapa. No te preocupes: tu pedido sigue y se cobra la tarifa fija de domicilio.',
  no_encontrada: 'No encontramos esa dirección en el mapa. Puedes marcar tu ubicación o escribirla y seguir con la tarifa fija de domicilio.',
  manual: 'Listo, usaremos la dirección que escribiste con la tarifa fija de domicilio.',
}

async function respaldo(ctx, motivo, direccion, d) {
  const id = await d.rpc('domicilio_guardar', { p_negocio_id: ctx.negocio_id, p_km: null, p_direccion: direccion || null, p_lat: null, p_lng: null, p_motivo: motivo })
  return { estado: motivo, respaldo: true, calculo_id: id, tarifa_fija: Number(ctx.tarifa_respaldo) || 0, mensaje: MENSAJES[motivo] }
}

async function contexto(slug, para, d) {
  const ctx = await d.rpc('domicilio_contexto', { p_slug: slug, p_para: para })
  return ctx && ctx.ok ? ctx : null
}

export async function manejar(c, d) {
  const slug = String(c?.slug ?? '').toLowerCase()
  if (!SLUG.test(slug)) return { http: 400, cuerpo: { estado: 'error', mensaje: 'Tienda no válida' } }
  try {
    if (c.accion === 'buscar') return { http: 200, cuerpo: await buscar(slug, c, d) }
    if (c.accion === 'calcular') return { http: 200, cuerpo: await calcular(slug, c, d) }
    if (c.accion === 'respaldo') return { http: 200, cuerpo: await respaldoManual(slug, c, d) }
    return { http: 400, cuerpo: { estado: 'error', mensaje: 'Acción no válida' } }
  } catch (e) {
    // La base no respondió: el navegador seguirá con "sin_calculo" (tarifa fija); aquí solo avisamos con claridad.
    return { http: 200, cuerpo: { estado: 'mapa_fallo', respaldo: true, sin_id: true, mensaje: MENSAJES.mapa_fallo } }
  }
}

async function buscar(slug, c, d) {
  const texto = limpiar(c.texto)
  if (texto.length < 5) return { estado: 'texto_corto', mensaje: 'Escribe tu dirección completa: calle, número y barrio.' }
  const ctx = await contexto(slug, 'buscar', d)
  if (!ctx) return { estado: 'no_disponible', mensaje: 'El cálculo por kilómetros no está disponible en esta tienda.' }
  const cupo = await d.rpc('domicilio_consumir', { p_negocio_id: ctx.negocio_id, p_tipo: 'buscar' })
  if (cupo === false) return { estado: 'sin_cupo', respaldo: true, mensaje: MENSAJES.sin_cupo }
  const foco = ctx.lat != null && ctx.lng != null ? { lat: Number(ctx.lat), lng: Number(ctx.lng) } : null
  const conCiudad = ctx.ciudad && !texto.toLowerCase().includes(String(ctx.ciudad).toLowerCase()) ? `${texto}, ${ctx.ciudad}` : texto
  let cand
  try { cand = await d.buscar(conCiudad, foco) } catch { return { estado: 'mapa_fallo', respaldo: true, mensaje: MENSAJES.mapa_fallo } }
  if (!cand.length) return { estado: 'no_encontrada', mensaje: MENSAJES.no_encontrada }
  return { estado: 'ok', candidatos: cand.map(x => ({ etiqueta: x.etiqueta, lat: x.lat, lng: x.lng, dudosa: !(x.confianza >= 0.6) })) }
}

async function calcular(slug, c, d) {
  const ctx = await contexto(slug, 'calcular', d)
  if (!ctx) return { estado: 'no_disponible', mensaje: 'El cálculo por kilómetros no está disponible en esta tienda.' }
  const lat = num(c.lat), lng = num(c.lng)
  const etiqueta = limpiar(c.etiqueta)
  if (!coordOk(lat, lng)) return respaldo(ctx, 'no_encontrada', etiqueta, d)
  const destino = { lat, lng }
  if (ctx.lat == null || ctx.lng == null) return respaldo(ctx, 'mapa_fallo', etiqueta, d)   // la tienda aún no está ubicada
  const origen = { lat: Number(ctx.lat), lng: Number(ctx.lng) }
  const max = ctx.radio_max_km == null ? null : Number(ctx.radio_max_km)
  const linea = distanciaLineaKm(origen, destino)
  // La línea recta nunca es mayor que la ruta: si ya pasa el radio, no hace falta gastar cupo del mapa.
  if ((max != null && linea > max) || linea > 200) return { estado: 'fuera_de_zona', maximo_km: max, mensaje: mensajeFuera(max) }
  const cupo = await d.rpc('domicilio_consumir', { p_negocio_id: ctx.negocio_id, p_tipo: 'calcular' })
  if (cupo === false) return respaldo(ctx, 'sin_cupo', etiqueta, d)
  let km
  try { km = await d.ruta(origen, destino) } catch { return respaldo(ctx, 'mapa_fallo', etiqueta, d) }
  if (!Number.isFinite(km) || km < 0 || km > 200) return respaldo(ctx, 'mapa_fallo', etiqueta, d)
  km = Math.round(km * 100) / 100
  if (max != null && km > max) return { estado: 'fuera_de_zona', maximo_km: max, km, mensaje: mensajeFuera(max) }
  const id = await d.rpc('domicilio_guardar', { p_negocio_id: ctx.negocio_id, p_km: km, p_direccion: etiqueta || null, p_lat: lat, p_lng: lng, p_motivo: 'ok' })
  return { estado: 'ok', calculo_id: id, km, direccion: etiqueta }
}

// El cliente eligió "no se ubica bien / escribirla": se registra y sigue con la tarifa fija
async function respaldoManual(slug, c, d) {
  const ctx = await contexto(slug, 'calcular', d)
  if (!ctx) return { estado: 'no_disponible', mensaje: 'El cálculo por kilómetros no está disponible en esta tienda.' }
  const motivo = c.motivo === 'no_encontrada' ? 'no_encontrada' : 'manual'
  return respaldo(ctx, motivo, limpiar(c.etiqueta), d)
}

function mensajeFuera(max) {
  return `Tu dirección queda fuera de nuestra zona de entrega${max != null ? ` (llegamos hasta ${String(max).replace('.', ',')} km)` : ''}. Puedes escribirnos por WhatsApp para coordinar o elegir recoger en la tienda.`
}
