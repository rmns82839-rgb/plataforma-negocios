// En qué va el pedido, explicado para el cliente. El estado interno de la tienda no cambia:
// pendiente → atendido → (en camino) → (entregado), o cancelado.
export const PASOS_DOMICILIO = ['Recibido', 'Preparando', 'En camino', 'Entregado']
export const PASOS_RECOGER = ['Recibido', 'Preparando', 'Entregado']

/** { paso: 0..n-1, pasos: [...], cancelado, texto, ayuda } */
export function etapaDe(p) {
  const recoge = p.entrega === 'recoger'
  const pasos = recoge ? PASOS_RECOGER : PASOS_DOMICILIO
  if (p.estado === 'cancelado') return { paso: -1, pasos, cancelado: true, texto: 'Cancelado', ayuda: 'La tienda canceló este pedido. Escríbenos si tienes dudas.' }
  let paso = 0
  if (p.estado === 'atendido') paso = 1
  if (p.seguimiento === 'en_camino' && !recoge) paso = 2
  if (p.seguimiento === 'entregado') paso = pasos.length - 1
  const ayudas = recoge
    ? ['Recibimos tu pedido. Te confirmamos por WhatsApp.', 'Estamos alistando tu pedido. Ya puedes pasar a recogerlo.', 'Pedido entregado. ¡Gracias por tu compra!']
    : ['Recibimos tu pedido. Te confirmamos por WhatsApp.', 'Estamos alistando tu pedido.', 'Tu pedido va en camino a tu dirección.', 'Pedido entregado. ¡Gracias por tu compra!']
  return { paso, pasos, cancelado: false, texto: pasos[paso], ayuda: ayudas[paso], activo: paso < pasos.length - 1 }
}
