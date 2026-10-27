// Reglas y mensajes para cambiar la contraseña (archivo .js aparte por el Fast Refresh de Vite).
// Deben ir de la mano con lo configurado en Supabase: mínimo 12 caracteres, letras y números.
export const MIN_CLAVE = 12

/** Lista de requisitos de la contraseña nueva, para mostrarlos en vivo. */
export const requisitosClave = (nueva) => [
  { ok: nueva.length >= MIN_CLAVE, texto: `Mínimo ${MIN_CLAVE} caracteres` },
  { ok: /[A-Za-z]/.test(nueva) && /\d/.test(nueva), texto: 'Letras y números' },
]

/** Devuelve el motivo por el que NO se puede enviar, o '' si todo está bien. */
export function errorClaveNueva(actual, nueva, repetir) {
  if (!actual) return 'Escribe tu contraseña actual'
  if (requisitosClave(nueva).some(r => !r.ok)) return `La nueva contraseña necesita mínimo ${MIN_CLAVE} caracteres, con letras y números`
  if (nueva === actual) return 'La nueva contraseña debe ser distinta a la actual'
  if (nueva !== repetir) return 'Las dos contraseñas nuevas no coinciden'
  return ''
}

/** Traduce los errores de Supabase Auth a mensajes claros. */
export function mensajeErrorAuth(err) {
  const c = err?.code || ''
  if (c === 'invalid_credentials') return 'La contraseña actual no es correcta'
  if (c === 'same_password') return 'La nueva contraseña debe ser distinta a la actual'
  if (c === 'weak_password') return 'Esa contraseña es muy débil. Usa más caracteres y mezcla mayúsculas, números y símbolos'
  if (c === 'reauthentication_needed' || c === 'reauthentication_not_valid')
    return 'Por seguridad, cierra sesión, vuelve a entrar y repite el cambio'
  if (c === 'over_request_rate_limit' || err?.status === 429) return 'Demasiados intentos. Espera unos minutos'
  return err?.message || 'No se pudo cambiar la contraseña'
}
