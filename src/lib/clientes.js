// Datos de los clientes: documento, celulares y lo que hace falta para poder fiar. Sin pantallas ni base de datos.
export const TIPOS_DOC = [['CC', 'Cédula de ciudadanía'], ['CE', 'Cédula de extranjería'], ['NIT', 'NIT'], ['TI', 'Tarjeta de identidad'], ['PP', 'Pasaporte'], ['OTRO', 'Otro documento']]
export const POLITICA_VERSION = 'v1'
const soloDig = (t) => String(t ?? '').replace(/\D/g, '')

export const nombreTipoDoc = (t) => TIPOS_DOC.find(([k]) => k === t)?.[1] || ''

// Deja el número como se guarda: sin puntos, espacios ni guiones (los pasaportes y «otro» llevan letras)
export function limpiarDocumento(tipo, texto) {
  const t = String(texto ?? '').trim()
  if (tipo === 'PP' || tipo === 'OTRO') return t.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 20)
  return soloDig(t).slice(0, 15)
}
// '' si está bien; si no, la frase para quien escribe
export function validarDocumento(tipo, numero) {
  if (!tipo && !numero) return ''
  if (!tipo) return 'Elige el tipo de documento'
  const n = limpiarDocumento(tipo, numero)
  if (!n) return 'Escribe el número de documento'
  if (tipo === 'PP' || tipo === 'OTRO') return n.length >= 4 ? '' : 'El documento es muy corto'
  if (tipo === 'NIT') return n.length >= 8 && n.length <= 11 ? '' : 'El NIT debe tener entre 8 y 11 números (con el dígito de verificación)'
  return n.length >= 5 && n.length <= 11 ? '' : 'El documento debe tener entre 5 y 11 números'
}

// Celular colombiano: 10 dígitos que empiezan por 3 (acepta el +57)
export function limpiarCelular(t) {
  let d = soloDig(t)
  if (d.length === 12 && d.startsWith('57')) d = d.slice(2)
  return d
}
export const validarCelular = (t, { obligatorio = false } = {}) => {
  const d = limpiarCelular(t)
  if (!d) return obligatorio ? 'Escribe el celular' : ''
  return d.length === 10 && d.startsWith('3') ? '' : 'El celular debe tener 10 números y empezar por 3'
}

// Lo que le falta a un cliente para poder fiarle o prestarle (lo mismo que exige la base de datos)
export function datosFaltantes(c) {
  const f = []
  if (!String(c?.documento ?? '').trim()) f.push('documento')
  if (!String(c?.telefono ?? '').trim()) f.push('teléfono')
  if (!String(c?.direccion ?? '').trim()) f.push('dirección')
  return f
}

// Fila lista para guardar, o { error } si algo no está bien
export function filaCliente(f, { esDueno = false, acepta = false } = {}) {
  const nombre = String(f.nombre ?? '').trim().replace(/\s+/g, ' ')
  if (nombre.length < 3) return { error: 'Escribe el nombre completo' }
  const eDoc = validarDocumento(f.tipo_documento, f.documento)
  if (eDoc) return { error: eDoc }
  const eTel = validarCelular(f.telefono)
  if (eTel) return { error: eTel }
  const eTel2 = validarCelular(f.contacto2_telefono)
  if (eTel2) return { error: `Segundo contacto: ${eTel2.charAt(0).toLowerCase()}${eTel2.slice(1)}` }
  const c2n = String(f.contacto2_nombre ?? '').trim(), c2t = limpiarCelular(f.contacto2_telefono)
  if (c2t && !c2n) return { error: 'Escribe el nombre del segundo contacto' }
  const dir = String(f.direccion ?? '').trim()
  if (dir && dir.length < 6) return { error: 'Escribe la dirección completa (calle, número y barrio)' }
  const email = String(f.email ?? '').trim()
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return { error: 'El correo no parece válido' }
  const personal = !!(f.documento || f.telefono || dir || c2t || email)
  if (personal && !acepta) return { error: 'Marca que el cliente autorizó el uso de sus datos' }
  const fila = {
    nombre, tipo_documento: f.documento ? f.tipo_documento : null, documento: f.documento ? limpiarDocumento(f.tipo_documento, f.documento) : null,
    telefono: limpiarCelular(f.telefono) || null, direccion: dir || null, email: email || null,
    contacto2_nombre: c2t ? c2n.slice(0, 60) : null, contacto2_telefono: c2t || null,
  }
  if (esDueno) {
    fila.cupo_credito = Math.max(0, Number(soloDig(f.cupo_credito)) || 0)
    fila.dias_credito = Math.min(Number(soloDig(f.dias_credito)) || 0, 365)
    if (f.tipo_cliente) fila.tipo_cliente = f.tipo_cliente === 'mayorista' ? 'mayorista' : 'normal'
  }
  return { fila }
}

// Quién recibe el recordatorio de cobro: el cliente y, si hay, su segundo contacto
export function destinatariosCobro(c) {
  const lista = []
  if (limpiarCelular(c?.telefono)) lista.push({ nombre: c.nombre, telefono: limpiarCelular(c.telefono), principal: true })
  if (limpiarCelular(c?.contacto2_telefono)) lista.push({ nombre: c.contacto2_nombre || 'Contacto', telefono: limpiarCelular(c.contacto2_telefono), principal: false })
  return lista
}
const pesos = (n) => `$${Math.round(n).toLocaleString('es-CO')}`
const primero = (n) => String(n || '').trim().split(/\s+/)[0] || ''
export function mensajeCobroA(dest, cliente, saldo, tienda) {
  if (dest.principal) return `Hola ${primero(dest.nombre)}, te escribimos de ${tienda}. Te recordamos con mucho gusto que tienes un saldo pendiente de ${pesos(saldo)}. Cuando puedas, pásanos a pagar. ¡Gracias!`
  return `Hola ${primero(dest.nombre)}, te escribimos de ${tienda}. ${primero(cliente.nombre)} tiene un saldo pendiente de ${pesos(saldo)} y nos dejó tu número como contacto. ¿Nos ayudas a recordárselo? ¡Gracias!`
}
