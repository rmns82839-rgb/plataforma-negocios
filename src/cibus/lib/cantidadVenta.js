// Cómo se escribe la cantidad vendida de una línea: exacta, con coma decimal y su unidad. Sin React ni Supabase.
import { textoCantidad, enGramos } from './pesaje.js'

/** { principal: '0,35 kg', extra: '350 g' } · por unidad: { principal: '2 und', extra: '' } */
export function cantidadTexto({ cantidad, unidad }) {
  const n = Number(cantidad) || 0
  const u = unidad && unidad !== 'und' ? unidad : 'und'
  return { principal: `${textoCantidad(n)} ${u}`, extra: enGramos(u, n) }
}
