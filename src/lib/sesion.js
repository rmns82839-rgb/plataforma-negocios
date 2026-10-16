import { useEffect, useState } from 'react'
import { supabase } from './supabase'

// undefined = cargando · null = sin sesión · objeto = sesión activa
export function useSesion() {
  const [sesion, setSesion] = useState(undefined)
  useEffect(() => {
    if (!supabase) return
    supabase.auth.getSession().then(({ data }) => setSesion(data.session ?? null))
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSesion(s ?? null))
    return () => data.subscription.unsubscribe()
  }, [])
  return sesion
}
