// Formas de pago (van en .js aparte por el Fast Refresh de Vite)

/** Formas de pago de arranque. El dueño las cambia en Más → Formas de pago (se leen de la base). */
export const METODOS_VENTA = [
  { id: 'efectivo',      texto: 'Efectivo' },
  { id: 'transferencia', texto: 'Transferencia' },
  { id: 'nequi',         texto: 'Nequi' },
  { id: 'daviplata',     texto: 'Daviplata' },
  { id: 'datafono',      texto: 'Datáfono' },
  { id: 'fiado',         texto: 'Fiado' },
]

/** Para recibir un abono: todo menos fiado. */
export const METODOS_ABONO = METODOS_VENTA.filter(m => m.id !== 'fiado')

// Nombres que el dueño les puso a las formas de pago (se llenan al abrir la app)
let nombres = {}
export const fijarNombres = (lista) => {
  nombres = Object.fromEntries((lista ?? []).map(f => [f.id, f.nombre]))
}

export const textoMetodo = (id) =>
  nombres[id] ?? METODOS_VENTA.find(m => m.id === id)?.texto ?? (id === 'mixto' ? 'Pago mixto' : id)
