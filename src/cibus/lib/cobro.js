// Recordatorio de cobro por WhatsApp (archivo .js aparte por el Fast Refresh de Vite).
// Cada cliente puede tener un segundo contacto (esposo/a, familiar): el aviso sale a los dos números.
import { dinero } from './formato'
import { telefono10 } from './datosCliente'

const primerNombre = (t) => String(t ?? '').trim().split(/\s+/)[0] || ''

const enlace = (tel, texto) => {
  const d = telefono10(tel) || String(tel ?? '').replace(/\D/g, '')
  return d ? `https://wa.me/${d.length === 10 ? '57' + d : d}?text=${encodeURIComponent(texto)}` : null
}

/**
 * Los destinatarios del cobro: [{ clave, etiqueta, tel, href }] (uno o dos).
 * `cliente` trae nombre, telefono, contacto2 y telefono2.
 */
export function destinatariosCobro(cliente) {
  const saldo = dinero(cliente.saldo)
  const lista = []
  if (cliente.telefono) {
    lista.push({
      clave: 'uno', etiqueta: primerNombre(cliente.nombre) || 'Cliente', tel: cliente.telefono,
      href: enlace(cliente.telefono, `Hola ${cliente.nombre}, te recordamos tu saldo pendiente de ${saldo}. ¡Gracias!`),
    })
  }
  if (cliente.telefono2) {
    const nombre2 = String(cliente.contacto2 ?? '').trim()
    lista.push({
      clave: 'dos', etiqueta: primerNombre(nombre2) || 'Segundo contacto', tel: cliente.telefono2,
      href: enlace(cliente.telefono2, `Hola${nombre2 ? ' ' + nombre2 : ''}, te recordamos el saldo pendiente de ${cliente.nombre}: ${saldo}. ¡Gracias!`),
    })
  }
  return lista.filter(d => d.href)
}
