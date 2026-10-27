// Lógica pura de la vitrina (opiniones, menú del día, música y seguimiento del pedido). Sin React ni Supabase: se prueba sola.
export const MAX_AUDIO = 4 * 1024 * 1024
export const TIPOS_AUDIO = ['audio/mpeg', 'audio/mp4', 'audio/aac', 'audio/ogg', 'audio/webm']

export const estrellasTexto = (n) => { const k = Math.max(0, Math.min(5, Math.round(Number(n) || 0))); return '★'.repeat(k) + '☆'.repeat(5 - k) }

const clave = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

// "Arroz\nPapa criolla" → [{n:'Arroz',k:'arroz'},{n:'Papa criolla',k:'papa-criolla'}]  (sin repetidos, máximo 20)
export function ingredientesDeTexto(t) {
  const visto = new Set(), r = []
  for (const linea of String(t || '').split(/[\n,]+/)) {
    const n = linea.trim().slice(0, 40), k = clave(n)
    if (!n || !k || visto.has(k)) continue
    visto.add(k); r.push({ n, k })
    if (r.length >= 20) break
  }
  return r
}
export const ingredientesATexto = (a) => (Array.isArray(a) ? a : []).map((x) => x.n).join('\n')

// '' si el archivo sirve; si no, la frase que se le muestra a la persona
export function validarAudio(a) {
  if (!a) return 'Elige un archivo de música'
  if (!TIPOS_AUDIO.includes(a.type)) return 'Ese archivo no es de música. Usa un MP3 o un M4A.'
  if (a.size > MAX_AUDIO) return 'La canción pesa más de 4 MB. Elige una más corta o comprímela.'
  return ''
}
export const extensionAudio = (tipo) => ({ 'audio/mpeg': 'mp3', 'audio/mp4': 'm4a', 'audio/aac': 'aac', 'audio/ogg': 'ogg', 'audio/webm': 'webm' }[tipo] || 'mp3')
export const rutaMusica = (negocioId, tipo, sello = Date.now()) => `${negocioId}/fondo-${sello.toString(36)}.${extensionAudio(tipo)}`

// Lo que ve el cliente de su pedido
export function textoSeguimiento(p) {
  if (!p) return null
  if (p.estado === 'cancelado') return { icono: '✖', titulo: 'Pedido cancelado', detalle: 'Si fue un error, escríbele a la tienda.' }
  if (p.seguimiento === 'entregado') return { icono: '✓', titulo: 'Entregado', detalle: '¡Gracias por tu compra!' }
  if (p.seguimiento === 'en_camino') return { icono: '🛵', titulo: 'Va en camino', detalle: 'Tu pedido ya salió de la tienda.' }
  if (p.seguimiento === 'preparando') return { icono: '👩‍🍳', titulo: 'Lo están preparando', detalle: 'En un momento sale.' }
  return { icono: '🧾', titulo: 'Pedido recibido', detalle: 'La tienda lo va a confirmar contigo.' }
}
export const soloDigitos = (t) => String(t || '').replace(/\D/g, '')
