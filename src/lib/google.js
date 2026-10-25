// Entrar con Google (Supabase Auth). La pantalla de Google la maneja Supabase; al volver, la persona regresa a esta misma página.
import { supabase } from './supabase'

export async function entrarConGoogle() {
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: window.location.origin + window.location.pathname, queryParams: { prompt: 'select_account' } },
  })
  return error ? 'No pudimos abrir Google. Revisa tu internet e intenta de nuevo.' : ''
}
