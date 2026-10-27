// Confirmación propia para acciones que borran o quitan algo: `if (!(await confirmar({ ... }))) return`.
// La ventana la dibuja DialogoConfirmar (montada una vez en el panel). Si no estuviera montada, usa la del navegador.
let escuchar = null

export const registrarConfirmar = (fn) => {
  escuchar = fn
  return () => { if (escuchar === fn) escuchar = null }
}

/** @param op { titulo, texto?, si?: 'Sí, quitar', no?: 'Cancelar' }  → Promise<boolean> */
export const confirmar = (op) => new Promise((resolver) => {
  if (!escuchar) return resolver(window.confirm(op.texto ? `${op.titulo}\n${op.texto}` : op.titulo))
  escuchar({ ...op, resolver })
})
