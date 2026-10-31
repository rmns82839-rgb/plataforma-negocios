// Ciudades que se eligen de una lista. Empezamos por el Atlántico; «Otra ciudad» permite escribir cualquiera.
export const CIUDADES = [
  'Barranquilla', 'Baranoa', 'Campo de la Cruz', 'Candelaria', 'Galapa', 'Juan de Acosta', 'Luruaco', 'Malambo', 'Manatí',
  'Palmar de Varela', 'Piojó', 'Polonuevo', 'Ponedera', 'Puerto Colombia', 'Repelón', 'Sabanagrande', 'Sabanalarga',
  'Santa Lucía', 'Santo Tomás', 'Soledad', 'Suan', 'Tubará', 'Usiacurí',
]
const clave = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
/** Si el texto es una ciudad de la lista (sin importar tildes o mayúsculas), devuelve su nombre oficial; si no, null. */
export const ciudadDeLista = (texto) => CIUDADES.find((c) => clave(c) === clave(texto)) || null
