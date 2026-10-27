import { createContext, useContext, useEffect, useState } from 'react'
import { borrarBorradores } from '../lib/usePersistido'
import { supabase } from '../lib/supabase'
import { borrarCache } from '../lib/offline'

const AuthContext = createContext(null)

/** La sesión que supabase dejó guardada en el equipo (sirve para seguir trabajando sin internet). */
function sesionGuardada() {
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (/^sb-.*-auth-token$/.test(k)) {
        const s = JSON.parse(localStorage.getItem(k))
        if (s?.user && s?.access_token) return s
      }
    }
  } catch { /* sin acceso al almacenamiento */ }
  return null
}
const MINUTOS_INACTIVIDAD = 60

export function AuthProvider({ children }) {
  const [sesion, setSesion] = useState(null)
  const [cargando, setCargando] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      // Sin internet y con la sesión vencida no se puede renovar: se usa la guardada en el equipo para no sacar a nadie de la caja
      setSesion(data.session ?? (navigator.onLine === false ? sesionGuardada() : null))
      setCargando(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSesion(prev => (s ?? (navigator.onLine === false && prev ? prev : null))))
    // Al volver internet se confirma la sesión de verdad (se renueva, o pide entrar de nuevo)
    const alVolver = () => supabase.auth.getSession().then(({ data }) => setSesion(data.session))
    window.addEventListener('online', alVolver)
    return () => { sub.subscription.unsubscribe(); window.removeEventListener('online', alVolver) }
  }, [])

  const salir = async () => { borrarBorradores('panel:'); borrarCache(); await supabase.auth.signOut(); setSesion(null) }   // la pantalla abierta no pasa a otra persona

  // Seguridad: si nadie toca la pantalla durante 60 min, se cierra la sesión
  // (por si el celular o la tablet queda olvidado en el mostrador).
  const conSesion = Boolean(sesion)
  useEffect(() => {
    if (!conSesion) return
    let t
    const reiniciar = () => { clearTimeout(t); t = setTimeout(() => { supabase.auth.signOut().finally(() => setSesion(null)) }, MINUTOS_INACTIVIDAD * 60000) }
    const eventos = ['pointerdown', 'keydown', 'touchstart', 'scroll']
    eventos.forEach(e => window.addEventListener(e, reiniciar, { passive: true }))
    reiniciar()
    return () => { clearTimeout(t); eventos.forEach(e => window.removeEventListener(e, reiniciar)) }
  }, [conSesion])

  return (
    <AuthContext.Provider value={{ sesion, cargando, salir }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
