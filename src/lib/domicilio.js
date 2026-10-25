// Cliente de la ruta del servidor /api/domicilio. Nunca lanza: si algo falla, devuelve un resultado de respaldo
// (el pedido sigue con la tarifa fija; jamás se bloquea una venta).
export const MENSAJE_RESPALDO = 'No pudimos medir la distancia con el mapa. No te preocupes: tu pedido sigue y se cobra la tarifa fija de domicilio.'

export async function llamarDomicilio(cuerpo, fetchFn = fetch) {
  const ctl = new AbortController()
  const t = setTimeout(() => ctl.abort(), 20000)
  try {
    const r = await fetchFn('/api/domicilio', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo), signal: ctl.signal,
    })
    const j = await r.json().catch(() => null)
    if (j && typeof j.estado === 'string') return j
    return { estado: 'mapa_fallo', respaldo: true, sin_id: true, mensaje: MENSAJE_RESPALDO }
  } catch {
    return { estado: 'mapa_fallo', respaldo: true, sin_id: true, mensaje: MENSAJE_RESPALDO }
  } finally { clearTimeout(t) }
}
