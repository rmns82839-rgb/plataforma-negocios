// Proveedor de mapa del servidor (búsqueda de direcciones + distancia por carretera).
// Para pasar a Google Maps más adelante: crear aquí un proveedor 'google' con las mismas dos funciones
//   buscar(texto, foco)  → [{ etiqueta, lat, lng, confianza }]
//   ruta(origen, destino) → km por carretera
// y poner la variable MAPA_PROVEEDOR=google en Vercel (con su clave). Nada más del sistema cambia.
import { geocodificar, rutaKm } from './_ors.js'
import { geocodificar as geocodificarGoogle, rutaKm as rutaKmGoogle } from './_google.js'

// Tope de llamadas al servicio por minuto (la cuenta permite 40; dejamos margen). Si se pasa, el pedido sigue con tarifa fija.
const ventana = []
export function permitirLlamada(ahora = Date.now(), maxPorMinuto = 36) {
  while (ventana.length && ahora - ventana[0] > 60_000) ventana.shift()
  if (ventana.length >= maxPorMinuto) return false
  ventana.push(ahora); return true
}

export function crearProveedor(env = process.env) {
  const nombre = String(env.MAPA_PROVEEDOR || 'ors').toLowerCase()
  if (nombre === 'ors') {
    const clave = env.ORS_API_KEY
    return {
      nombre,
      buscar: (texto, foco, opc) => { if (!clave) throw new Error('Sin clave del mapa'); if (!permitirLlamada()) throw new Error('Tope por minuto'); return geocodificar(texto, foco, clave, fetch, opc) },
      ruta: (o, d) => { if (!clave) throw new Error('Sin clave del mapa'); if (!permitirLlamada()) throw new Error('Tope por minuto'); return rutaKm(o, d, clave) },
    }
  }
  if (nombre === 'google') {
    // Clave SOLO del servidor (GOOGLE_MAPS_SERVER_KEY). Tope por minuto más alto: Google no tiene el límite de 40/min de ORS.
    const clave = env.GOOGLE_MAPS_SERVER_KEY
    const tope = Number(env.GOOGLE_MAPS_TOPE_MIN) > 0 ? Number(env.GOOGLE_MAPS_TOPE_MIN) : 120
    const guardia = () => { if (!clave) throw new Error('Sin clave del mapa'); if (!permitirLlamada(Date.now(), tope)) throw new Error('Tope por minuto') }
    return {
      nombre,
      buscar: (texto, foco, opc) => { guardia(); return geocodificarGoogle(texto, foco, clave, fetch, opc) },
      ruta: (o, d) => { guardia(); return rutaKmGoogle(o, d, clave) },
    }
  }
  throw new Error(`Proveedor de mapa no disponible: ${nombre}`)
}
