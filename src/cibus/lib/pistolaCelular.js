// Celular como pistola de códigos (opcional): el celular escanea y manda el código al computador
// por un canal de Supabase Realtime (Broadcast). No se guarda nada en la base de datos.
// Doble barrera: el código de emparejamiento (largo, al azar, solo visible en el computador) y un canal
// privado: solo entra quien tenga sesión iniciada y sea del personal (ver supabase/migracion-v17.sql).
import { supabase } from './supabase'

const ALFABETO = 'abcdefghjkmnpqrstuvwxyz23456789'

export const nuevoCodigoPar = () => {
  const b = new Uint8Array(14)
  crypto.getRandomValues(b)
  return [...b].map(x => ALFABETO[x % ALFABETO.length]).join('')
}
export const codigoParValido = (c) => /^[a-z2-9]{14}$/.test(c ?? '')
export const urlCelular = (codigo) => `${window.location.origin}/pistola?c=${codigo}`

/** Canal compartido por el computador y el celular. `llave` distingue quién está presente. */
export const canalPar = (codigo, llave) => {
  // Si otra pantalla dejó un canal con el mismo nombre, se quita: supabase lo reutilizaría y no deja agregar escuchas
  for (const c of supabase.getChannels()) if (c.topic === `realtime:pistola-${codigo}`) supabase.removeChannel(c)
  return supabase.channel(`pistola-${codigo}`, { config: { private: true, broadcast: { self: false }, presence: { key: llave } } })
}
