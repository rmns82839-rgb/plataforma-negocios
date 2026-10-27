// Datos de la tienda abierta en el panel (los pone PanelCibus): negocio, rol, módulos y marca.
import { createContext, useContext } from 'react'
export const PlataformaContext = createContext({ ctx: null, neg: null, modulos: [], marca: null, userId: '' })
export const usePlataforma = () => useContext(PlataformaContext)
