// Direcciones públicas de LA TIENDA ABIERTA. En Cibus eran fijas (/tienda, /ropa, /pistola); en la plataforma cada tienda
// vive en /t/{su-nombre}, así que cada tienda comparte y escanea SU enlace, nunca el de otra.
let slug = null
export function fijarSlug(s) { slug = s }
export const slugActual = () => slug
const base = () => `${window.location.origin}/t/${slug}`
export const enlaceTienda = () => base()
export const enlacePistola = (codigo) => `${base()}/pistola?c=${codigo}`
