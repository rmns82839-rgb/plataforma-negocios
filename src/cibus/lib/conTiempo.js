// Espera una operación (guardar, consultar…) pero no para siempre: si pasa el tiempo, devuelve un error legible en vez de dejar
// la pantalla «Guardando…» para siempre. La operación puede seguir en el servidor; por eso el mensaje pide revisar antes de repetir.
export const ESPERA_GUARDAR = 25000

export function conTiempo(operacion, ms = ESPERA_GUARDAR, texto = 'Esto tardó demasiado y no sabemos si se guardó. Revisa tu internet, recarga la página y mira si quedó; si no, intenta de nuevo.') {
  let reloj
  const limite = new Promise((resolve) => { reloj = setTimeout(() => resolve({ data: null, error: { message: texto, tiempo: true } }), ms) })
  return Promise.race([Promise.resolve(operacion), limite]).finally(() => clearTimeout(reloj))
}
