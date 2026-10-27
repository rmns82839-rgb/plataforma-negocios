// Modo práctica: sirve para enseñar cómo se usa la app SIN guardar nada.
// Mientras está encendido, todo lo que intente escribir (ventas, fiados, productos, pagos…) se simula:
// la pantalla responde como si hubiera funcionado, pero la base de datos no recibe nada. Las lecturas siguen siendo reales.
// Es por dispositivo y se apaga solo a las 3 horas.
import { useSyncExternalStore } from 'react'

const CLAVE = 'modo-practica'
const DURACION = 3 * 60 * 60 * 1000

const leer = () => { try { const n = Number(localStorage.getItem(CLAVE)); return Number.isFinite(n) && n > Date.now() ? n : 0 } catch { return 0 } }
let hasta = leer()
let acciones = 0
let temporizador = null
let version = 0
const oyentes = new Set()
const avisar = () => { version += 1; oyentes.forEach(f => f()) }

const programar = () => {
  clearTimeout(temporizador)
  if (hasta > Date.now()) temporizador = setTimeout(() => { hasta = 0; avisar() }, Math.min(hasta - Date.now(), 2 ** 31 - 1))
}
programar()

// Saldo prepago de práctica: las recargas simuladas se recuerdan mientras dure la práctica, para poder probar el cobro con saldo.
let prepagoSim = {}
export const prepagoSimulado = (clienteId) => prepagoSim[clienteId] ?? 0
export const moverPrepagoSimulado = (clienteId, delta) => { prepagoSim = { ...prepagoSim, [clienteId]: (prepagoSim[clienteId] ?? 0) + delta }; avisar() }

export const practicaActiva = () => hasta > Date.now()
export const activarPractica = () => {
  hasta = Date.now() + DURACION; acciones = 0; prepagoSim = {}
  try { localStorage.setItem(CLAVE, String(hasta)) } catch { /* sin almacenamiento */ }
  programar(); avisar()
}
export const desactivarPractica = () => {
  hasta = 0; prepagoSim = {}
  try { localStorage.removeItem(CLAVE) } catch { /* sin almacenamiento */ }
  programar(); avisar()
}
/** Cuenta una acción que se simuló (para mostrarla en la franja). */
export const contarSimulada = () => { acciones += 1; avisar() }

const suscribir = (f) => { oyentes.add(f); return () => oyentes.delete(f) }
/** { activa, acciones } — se actualiza solo. */
export function usePractica() {
  useSyncExternalStore(suscribir, () => version)
  return { activa: practicaActiva(), acciones }
}
