// Datos públicos del negocio (vista negocio_publico): pie de página y textos legales.
import { useEffect, useState } from 'react'
import { supabase } from './supabase'

export function useNegocioPublico() {
  const [n, setN] = useState(null)
  useEffect(() => {
    let vivo = true
    supabase.from('negocio_publico').select('*').maybeSingle()
      .then(({ data, error }) => { if (vivo && !error && data) setN(data) })   // sin migración v12: se usa lo básico
    return () => { vivo = false }
  }, [])
  return n
}

export const urlRed = (red, v) => {
  const t = String(v ?? '').trim()
  if (!t) return null
  if (/^https?:\/\//i.test(t)) return t
  const u = t.replace(/^@/, '')
  return red === 'instagram' ? `https://instagram.com/${u}` : red === 'facebook' ? `https://facebook.com/${u}` : `https://tiktok.com/@${u}`
}
