// Entrar con Google (Supabase Auth). La pantalla de Google la maneja Supabase; al volver, la persona regresa a esta misma página.
import { supabase } from './supabase'

export async function entrarConGoogle() {
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: window.location.origin + window.location.pathname, queryParams: { prompt: 'select_account' } },
  })
  return error ? 'No pudimos abrir Google. Revisa tu internet e intenta de nuevo.' : ''
}

// ---- Entrar con un código al correo (sirve para volver a entrar desde otro celular) ----
// Requiere que las plantillas de correo de Supabase ("Magic Link" y "Confirm signup") incluyan {{ .Token }} (ver README, C5b).
const traducir = (m = '') => {
  const t = m.toLowerCase()
  if (t.includes('rate limit') || t.includes('seconds')) return 'Pediste muchos códigos seguidos. Espera un minuto e intenta de nuevo.'
  if (t.includes('expired') || t.includes('invalid')) return 'El código no es correcto o ya venció. Pide uno nuevo.'
  if (t.includes('email')) return 'Revisa que el correo esté bien escrito.'
  return 'No pudimos hacerlo. Revisa tu internet e intenta de nuevo.'
}
export const correoValido = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(e || '').trim())

export async function pedirCodigoCorreo(correo) {
  if (!correoValido(correo)) return 'Revisa que el correo esté bien escrito.'
  const { error } = await supabase.auth.signInWithOtp({ email: correo.trim().toLowerCase(), options: { shouldCreateUser: true } })
  return error ? traducir(error.message) : ''
}

export async function confirmarCodigoCorreo(correo, codigo) {
  const token = String(codigo || '').replace(/\D/g, '')
  if (token.length < 6) return 'Escribe el código completo que te llegó al correo.'
  const { error } = await supabase.auth.verifyOtp({ email: correo.trim().toLowerCase(), token, type: 'email' })
  return error ? traducir(error.message) : ''
}
