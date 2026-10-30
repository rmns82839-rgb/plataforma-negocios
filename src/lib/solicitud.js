// Solicitud de un negocio nuevo (página /registro y bandeja del administrador). Lógica pura: se prueba sola.

export const TIPOS_NEGOCIO = [
  { clave: 'tienda', nombre: 'Tienda o abarrotes', ejemplos: 'Víveres, verduras, droguería, licores…', icono: '🛒' },
  { clave: 'miscelanea', nombre: 'Miscelánea', ejemplos: 'De todo un poco: aseo, dulces, recargas, regalos', icono: '🧺' },
  { clave: 'tecnologia', nombre: 'Celulares y tecnología', ejemplos: 'Celulares, accesorios, fundas, cargadores, computadores', icono: '📱' },
  { clave: 'ferreteria', nombre: 'Ferretería', ejemplos: 'Herramientas, tornillería, pinturas, eléctricos, plomería', icono: '🔨' },
  { clave: 'papeleria', nombre: 'Papelería', ejemplos: 'Útiles, fotocopias, impresiones, regalos, oficina', icono: '✏️' },
  { clave: 'veterinaria', nombre: 'Veterinaria y mascotas', ejemplos: 'Alimento, medicinas, accesorios, peluquería', icono: '🐾' },
  { clave: 'ropa', nombre: 'Ropa y calzado', ejemplos: 'Boutique, moda, zapatos, accesorios', icono: '👗' },
  { clave: 'repuestos', nombre: 'Repuestos', ejemplos: 'Motos, carros, autopartes', icono: '🔧' },
  { clave: 'mixto', nombre: 'Productos y ropa', ejemplos: 'Vendes de los dos tipos', icono: '🏬' },
]
export const NOMBRE_TIPO = Object.fromEntries(TIPOS_NEGOCIO.map((t) => [t.clave, t.nombre]))

const CORREO = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

/** Deja el celular en 10 dígitos (quita el 57 y los espacios); si no se puede, devuelve lo que haya. */
export function soloCelular(v) {
  let d = String(v ?? '').replace(/\D/g, '')
  if (d.length === 12 && d.startsWith('57')) d = d.slice(2)
  return d
}

const limpio = (v) => String(v ?? '').replace(/\s+/g, ' ').trim()

/** Errores por campo del paso indicado ('tipo' | 'plan' | 'datos' | 'revisar' = todo). Vacío = todo bien. */
export function validarSolicitud(f, paso) {
  const e = {}
  const todo = paso === 'revisar'
  if (todo || paso === 'tipo') if (!TIPOS_NEGOCIO.some((t) => t.clave === f.tipo)) e.tipo = 'Elige qué vendes'
  if (todo || paso === 'plan') if (!f.plan) e.plan = 'Elige un plan'
  if (todo || paso === 'datos') {
    const n = limpio(f.nombre_negocio), c = limpio(f.ciudad), p = limpio(f.nombre_contacto)
    if (n.length < 2) e.nombre_negocio = 'Escribe el nombre de tu negocio'
    if (c.length < 2) e.ciudad = 'Escribe la ciudad'
    if (p.length < 3) e.nombre_contacto = 'Escribe tu nombre completo'
    if (soloCelular(f.telefono).length !== 10) e.telefono = 'Escribe tu celular de 10 dígitos'
    if (!CORREO.test(String(f.email ?? '').trim())) e.email = 'Escribe un correo válido, como nombre@correo.com'
    if (String(f.mensaje ?? '').length > 300) e.mensaje = 'El mensaje es muy largo (máximo 300 letras)'
  }
  if (todo && !f.acepta) e.acepta = 'Debes aceptar para poder enviar la solicitud'
  return e
}

const dinero = (n) => `$${Math.round(Number(n)).toLocaleString('es-CO')}`

/** Cómo se muestra el precio de un plan: { principal, detalle }. */
export function precioTexto(p) {
  const mensual = Number(p?.precio_mensual ?? 0)
  if (!mensual) return { principal: 'Gratis', detalle: '' }
  const fundador = p.precio_fundador == null ? null : Number(p.precio_fundador)
  if (fundador != null && fundador < mensual) {
    const meses = Number(p.meses_fundador ?? 0)
    return {
      principal: `${dinero(fundador)}/mes`,
      detalle: meses > 0 ? `Precio de lanzamiento los primeros ${meses} meses; después ${dinero(mensual)}/mes` : `Después ${dinero(mensual)}/mes`,
    }
  }
  return { principal: `${dinero(mensual)}/mes`, detalle: '' }
}

/** Dirección web sugerida a partir del nombre: «Moda Luna & Cía» → «moda-luna-cia». */
export function slugSugerido(nombre) {
  const s = String(nombre ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 38).replace(/-+$/g, '')
  return s.length >= 3 ? s : ''
}

export const slugValido = (s) => /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/.test(String(s ?? ''))

/** Enlace de WhatsApp al solicitante cuando su tienda quedó creada (o con la razón si no). */
export function enlaceAviso({ telefono, nombre_contacto, nombre_negocio, email }, { aprobada, slug, base, nota }) {
  const nombre = limpio(nombre_contacto).split(' ')[0] || ''
  const texto = aprobada
    ? `Hola ${nombre}, ¡ya está creada tu tienda "${nombre_negocio}" en Matriz! Entra con el correo ${email} (con Google) en ${base}/ y la verás en "Mis tiendas". Tu dirección será ${base}/t/${slug}. Cualquier duda, aquí estamos.`
    : `Hola ${nombre}, revisamos la solicitud de "${nombre_negocio}" en Matriz y por ahora no pudimos aprobarla.${nota ? ` Motivo: ${nota}.` : ''} Escríbenos si quieres que lo revisemos de nuevo.`
  return `https://wa.me/57${soloCelular(telefono)}?text=${encodeURIComponent(texto)}`
}
