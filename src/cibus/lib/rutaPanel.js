// Dirección secreta del panel de administración. Se puede cambiar con la variable
// VITE_RUTA_PANEL en Vercel (solo letras, números y guiones). Si no existe, usa esta.
const limpia = (v) => String(v || '').toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 40)
export const SEGMENTO_PANEL = limpia(import.meta.env.VITE_RUTA_PANEL) || 'ingreso-matriz-4k7x'
export const RUTA_PANEL = `/${SEGMENTO_PANEL}`
