// Configuración del mapa visual (único lugar a tocar para cambiar de proveedor, p. ej. a Google Maps más adelante).
// Hoy: Leaflet + mosaicos de OpenStreetMap (gratis, sin clave). Si el tráfico crece, cambiar a un proveedor de mosaicos con plan propio.
export const MAPA = {
  proveedor: 'osm',
  mosaicos: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
  atribucion: '© colaboradores de <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a>',
  zoomMax: 19,
  centroPorDefecto: { lat: 4.711, lng: -74.0721 },   // Bogotá, si no hay otro punto
  zoomPorDefecto: 12,
  zoomPin: 17,
}
