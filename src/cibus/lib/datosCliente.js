// Datos que se piden en todo pedido de los catálogos públicos (ropa y tienda).
// Las mismas reglas las valida el servidor (cliente_desde_pedido); aquí se avisa antes.
const CLAVE = 'matriz-datos-cliente'

export const soloDigitos = (t) => String(t ?? '').replace(/\D/g, '')

/** Teléfono colombiano: 10 dígitos (se acepta con +57). Devuelve los 10 dígitos o ''. */
export const telefono10 = (t) => {
  let d = soloDigitos(t)
  if (d.length === 12 && d.startsWith('57')) d = d.slice(2)
  return d.length === 10 ? d : ''
}

export const DATOS_VACIOS = {
  nombre: '', telefono: '', direccion: '', email: '', nota: '', acepta_datos: false, acepta_promos: false,
}

/** Devuelve un texto de error o '' si todo está bien. */
export function validarDatos(d, recoge = false) {
  if (String(d.nombre ?? '').trim().length < 3) return 'Escribe tu nombre completo'
  if (!telefono10(d.telefono)) return 'Escribe tu celular de 10 dígitos (ej. 300 123 4567)'
  if (!recoge && String(d.direccion ?? '').trim().length < 6) return 'Escribe tu dirección completa (calle, número, barrio)'
  const e = String(d.email ?? '').trim()
  if (e && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e)) return 'El correo no parece válido (o déjalo vacío)'
  if (!d.acepta_datos) return 'Debes aceptar la política de tratamiento de datos para enviar el pedido'
  return ''
}

/** Lo que se manda al servidor. */
export const datosParaServidor = (d, recoge = false) => ({
  nombre: d.nombre.trim(), telefono: telefono10(d.telefono), direccion: recoge ? '' : d.direccion.trim(), entrega: recoge ? 'recoger' : 'domicilio',
  email: String(d.email ?? '').trim(), nota: String(d.nota ?? '').trim(),
  acepta_datos: Boolean(d.acepta_datos), acepta_promos: Boolean(d.acepta_promos),
})

/** Para no volver a escribir todo en el siguiente pedido (solo en este dispositivo). */
export const recordarDatos = (d) => {
  try {
    localStorage.setItem(CLAVE, JSON.stringify({
      nombre: d.nombre, telefono: d.telefono, direccion: d.direccion, email: d.email,   // el consentimiento nunca se recuerda: se da en cada pedido
    }))
  } catch { /* sin almacenamiento: se escribe de nuevo */ }
}
export const datosGuardados = () => {
  try { return { ...DATOS_VACIOS, ...JSON.parse(localStorage.getItem(CLAVE) || '{}'), acepta_datos: false, acepta_promos: false } }
  catch { return { ...DATOS_VACIOS } }
}

export const lineaDatos = (d, recoge = false) =>
  `Nombre: ${d.nombre.trim()}\nCelular: ${telefono10(d.telefono)}\n${recoge ? 'Entrega: recojo en la tienda' : `Dirección: ${d.direccion.trim()}`}` +
  (String(d.email ?? '').trim() ? `\nCorreo: ${d.email.trim()}` : '') +
  (String(d.nota ?? '').trim() ? `\nNota: ${d.nota.trim()}` : '')

/** Enlace de WhatsApp a un cliente (el dueño le escribe desde su propio WhatsApp). */
export const enlaceWhatsApp = (telefono, texto = '') => {
  const t = telefono10(telefono)
  return t ? `https://wa.me/57${t}${texto ? `?text=${encodeURIComponent(texto)}` : ''}` : null
}
