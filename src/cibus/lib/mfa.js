// Verificación en dos pasos (TOTP): ayudas y mensajes (archivo .js aparte por el Fast Refresh de Vite).
import { supabase } from './supabase'

/** ¿Hay que pedir el código? (la cuenta tiene 2FA activo y esta sesión todavía no lo pasó). */
export async function necesitaCodigo() {
  try {
    const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
    if (error || !data) return false        // si no se puede saber, la base de datos igual no entrega nada sin aal2
    return data.nextLevel === 'aal2' && data.currentLevel !== 'aal2'
  } catch {
    return false                            // una sesión ilegible nunca debe dejar la pantalla en "Cargando…"
  }
}

/** Factor TOTP ya verificado de esta cuenta, o null. */
export async function factorActivo() {
  try {
    const { data } = await supabase.auth.mfa.listFactors()
    return data?.totp?.[0] ?? null
  } catch {
    return null
  }
}

/** Empieza la activación: borra intentos viejos sin terminar y pide el QR y la clave. */
export async function empezarActivacion() {
  const { data: lista } = await supabase.auth.mfa.listFactors()
  for (const f of lista?.all ?? []) {
    if (f.factor_type === 'totp' && f.status === 'unverified') {
      await supabase.auth.mfa.unenroll({ factorId: f.id })
    }
  }
  return supabase.auth.mfa.enroll({ factorType: 'totp', issuer: 'Matriz', friendlyName: `Matriz ${Date.now()}` })
}

/** Comprueba el código de 6 dígitos contra un factor. */
export const verificarCodigo = (factorId, code) => supabase.auth.mfa.challengeAndVerify({ factorId, code })

/** Solo dígitos, máximo 6 (para el campo del código). */
export const soloDigitos = (t) => String(t ?? '').replace(/\D/g, '').slice(0, 6)

/**
 * El QR llega como "data:image/svg+xml;utf-8,<svg …>" sin codificar. Algunos navegadores no lo dibujan
 * (por ejemplo si el SVG trae un "#"). Se vuelve a armar con la codificación correcta.
 */
export function qrComoImagen(qr) {
  const s = String(qr ?? '')
  if (!/^data:image\/svg\+xml/i.test(s)) return s
  const crudo = s.slice(s.indexOf(',') + 1)
  let svg = crudo
  if (/^%3C/i.test(crudo)) { try { svg = decodeURIComponent(crudo) } catch { svg = crudo } }
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg)
}

/** La clave manual en grupos de 4 para leerla mejor. */
export const clavePorGrupos = (s) => String(s ?? '').replace(/\s/g, '').replace(/(.{4})/g, '$1 ').trim()

export function mensajeMfa(err) {
  const c = err?.code || ''
  if (c === 'mfa_verification_failed' || c === 'mfa_verification_rejected')
    return 'Código incorrecto. Revisa que sea el más reciente de tu app (cambia cada 30 segundos) y que la hora del celular esté en automático'
  if (c === 'mfa_challenge_expired') return 'El código venció. Escribe el nuevo que muestra tu app'
  if (c === 'over_request_rate_limit' || err?.status === 429) return 'Demasiados intentos. Espera unos minutos'
  if (c === 'too_many_enrolled_mfa_factors' || c === 'mfa_verified_factor_exists') return 'Esta cuenta ya tiene la verificación activada'
  if (c === 'mfa_totp_enroll_not_enabled' || c === 'mfa_totp_verify_not_enabled')
    return 'La verificación en dos pasos no está habilitada en Supabase (Authentication → Multi-Factor → TOTP: Enabled)'
  if (c === 'insufficient_aal') return 'Vuelve a escribir un código de tu app para continuar'
  return err?.message || 'No se pudo completar la verificación'
}
