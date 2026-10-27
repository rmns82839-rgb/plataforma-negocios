// Rol del usuario: ¿es el dueño? (archivo .js aparte por el Fast Refresh de Vite)
import { createContext, useContext } from 'react'

/** dueno: true | false | null (null = todavía consultando) */
export const RolContext = createContext({ dueno: null })
export const useDueno = () => useContext(RolContext).dueno
/** soporte: true = cuenta de solo lectura (desarrollador) */
export const useSoporte = () => useContext(RolContext).soporte === true
