import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { RolContext } from './rol'

// Pregunta a la base de datos si quien entró es el dueño (función es_dueno()).
// Mientras no se registre ningún dueño en la tabla perfiles, todos cuentan como dueño.
export default function RolProvider({ children }) {
  const [dueno, setDueno] = useState(null)
  const [soporte, setSoporte] = useState(false)

  useEffect(() => {
    let vivo = true
    supabase.rpc('es_dueno').then(({ data, error }) => {
      // Si la migración v2 aún no se corrió, no bloquear nada
      if (vivo) setDueno(error ? true : data === true)
    })
    supabase.rpc('es_soporte').then(({ data, error }) => { if (vivo) setSoporte(!error && data === true) })
    return () => { vivo = false }
  }, [])

  return <RolContext.Provider value={{ dueno, soporte }}>{children}</RolContext.Provider>
}
