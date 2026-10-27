// Borrador de lo que se está armando (venta, pedido): sobrevive a recargar la página, a una
// actualización de la app o a que el navegador cierre la pestaña. Solo vive en este dispositivo.
// Se guardan ids y cantidades, nunca precios: al recuperarlo se vuelven a leer los datos de hoy.

import { negocioActual } from './supabase'

// Lo que se guarda en este equipo es de UNA tienda: la misma persona puede tener varias
const de = (clave) => `${clave}@${negocioActual()}`

export const DOCE_HORAS = 12 * 60 * 60 * 1000
export const TRES_DIAS = 3 * 24 * 60 * 60 * 1000

export const leerBorrador = (clave0, caducaMs) => {
  try {
    const clave = de(clave0)
    const o = JSON.parse(localStorage.getItem(clave) || 'null')
    if (!o || typeof o.t !== 'number' || Date.now() - o.t > caducaMs) { localStorage.removeItem(clave); return null }
    return o.v ?? null
  } catch { return null }
}

/** valor null = borrar el borrador */
export const guardarBorrador = (clave0, valor) => {
  try {
    const clave = de(clave0)
    if (valor === null || valor === undefined) localStorage.removeItem(clave)
    else localStorage.setItem(clave, JSON.stringify({ t: Date.now(), v: valor }))
  } catch { /* sin almacenamiento (modo privado): simplemente no se guarda */ }
}
