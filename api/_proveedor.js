// Proveedor de mapa del servidor (búsqueda de direcciones + distancia por carretera).
// Para pasar a Google Maps más adelante: crear aquí un proveedor 'google' con las mismas dos funciones
//   buscar(texto, foco)  → [{ etiqueta, lat, lng, confianza }]
//   ruta(origen, destino) → km por carretera
// y poner la variable MAPA_PROVEEDOR=google en Vercel (con su clave). Nada más del sistema cambia.
import { geocodificar, rutaKm } from './_ors.js'

export function crearProveedor(env = process.env) {
  const nombre = String(env.MAPA_PROVEEDOR || 'ors').toLowerCase()
  if (nombre === 'ors') {
    const clave = env.ORS_API_KEY
    return {
      nombre,
      buscar: (texto, foco) => { if (!clave) throw new Error('Sin clave del mapa'); return geocodificar(texto, foco, clave) },
      ruta: (o, d) => { if (!clave) throw new Error('Sin clave del mapa'); return rutaKm(o, d, clave) },
    }
  }
  throw new Error(`Proveedor de mapa no disponible: ${nombre}`)
}
