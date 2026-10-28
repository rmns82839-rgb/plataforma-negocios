// Cuenta del cliente en el catálogo: entra con Google y su nombre, celular, dirección y referencia quedan guardados.
// Es opcional: sin cuenta se compra igual. Cada cliente solo puede ver y cambiar SU perfil (lo exige la base de datos).
import { useCallback, useEffect, useState } from 'react'
import { supabase } from './supabase'

const VOLVER = 'matriz-volver-al-pedido'

export function useCuentaCliente() {
  const [sesion, setSesion] = useState(null)
  const [perfil, setPerfil] = useState(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [googleActivo, setGoogleActivo] = useState(null)   // null = averiguando · true/false

  // Antes de ofrecer "Continuar con Google" se pregunta a Supabase si ese ingreso está activado:
  // así nadie ve un botón que lleva a una pantalla de error.
  useEffect(() => {
    let vivo = true
    const base = String(import.meta.env.VITE_SUPABASE_URL || '').replace(/\/+$/, '')
    fetch(`${base}/auth/v1/settings`, { headers: { apikey: import.meta.env.VITE_SUPABASE_ANON_KEY } })
      .then(r => (r.ok ? r.json() : null))
      .then(j => { if (vivo) setGoogleActivo(Boolean(j?.external?.google)) })
      .catch(() => { if (vivo) setGoogleActivo(false) })
    return () => { vivo = false }
  }, [])

  const cargarPerfil = useCallback(async (ses) => {
    if (!ses) { setPerfil(null); setCargando(false); return }
    const { data, error: err } = await supabase.rpc('mi_perfil')
    setPerfil(!err && data ? data : null)            // sin migracion-v38: no hay perfil y se compra como siempre
    setCargando(false)
  }, [])

  useEffect(() => {
    let vivo = true
    supabase.auth.getSession().then(({ data }) => { if (vivo) { setSesion(data?.session ?? null); cargarPerfil(data?.session ?? null) } })
    const { data: sub } = supabase.auth.onAuthStateChange((_e, ses) => { if (vivo) { setSesion(ses ?? null); cargarPerfil(ses ?? null) } })
    return () => { vivo = false; sub?.subscription?.unsubscribe?.() }
  }, [cargarPerfil])

  const entrarConGoogle = async () => {
    setError('')
    if (googleActivo === false) { setError('El ingreso con Google todavía no está disponible. Puedes comprar sin cuenta.'); return }
    const noDisponible = 'El ingreso con Google todavía no está activado en la tienda. Puedes comprar sin cuenta.'
    try { sessionStorage.setItem(VOLVER, '1') } catch { /* sin almacenamiento */ }
    // Se pide la dirección de Google SIN salir todavía: si Supabase la rechaza, se avisa aquí en vez de mostrar una pantalla técnica
    const { data, error: err } = await supabase.auth.signInWithOAuth({
      provider: 'google', options: { redirectTo: window.location.href.split('#')[0], queryParams: { prompt: 'select_account' }, skipBrowserRedirect: true } })
    if (err || !data?.url) { setError(/provider.*not enabled|unsupported provider/i.test(err?.message ?? '') ? noDisponible : (err?.message || noDisponible)); return }
    try {
      const r = await fetch(data.url, { redirect: 'manual' })
      if (r.type !== 'opaqueredirect' && r.status >= 400) { setError(noDisponible); return }
    } catch { /* sin permiso de lectura (CORS): se intenta entrar igual */ }
    window.location.assign(data.url)
  }
  const salir = async () => { await supabase.auth.signOut(); setPerfil(null) }

  const guardar = async (datos) => {
    const { data, error: err } = await supabase.rpc('guardar_mi_perfil', { p_datos: datos })
    if (err) { setError(err.message); return null }
    setError(''); setPerfil(data); return data
  }
  const borrar = async () => {
    const { error: err } = await supabase.rpc('borrar_mi_perfil')
    if (err) { setError(err.message); return false }
    setPerfil(null); return true
  }
  return { sesion, perfil, cargando, error, googleActivo, setError, entrarConGoogle, salir, guardar, borrar }
}

/** ¿Venía de iniciar sesión con Google para terminar un pedido? (se consulta una sola vez) */
export const volvioDeIngreso = () => {
  try { const v = sessionStorage.getItem(VOLVER) === '1'; if (v) sessionStorage.removeItem(VOLVER); return v } catch { return false }
}

/** Datos del perfil con la forma de los datos del pedido. */
export const datosDePerfil = (perfil, base = {}) => ({
  ...base, nombre: perfil.nombre, telefono: perfil.telefono, direccion: perfil.direccion ?? '', email: perfil.email ?? '',
  nota: base.nota || perfil.referencia || '', acepta_datos: true, acepta_promos: Boolean(perfil.acepta_promos),
})
