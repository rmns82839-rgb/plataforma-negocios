// Ayudas puras de la cuenta del cliente (sin pantallas): nombres, iniciales, validaciones y datos listos para guardar.
// Van en un archivo .js aparte para que Vite pueda refrescar las pantallas sin recargar todo.
import { numero } from './formato.js'
import { telefono10 } from './datosCliente.js'

export const primerNombre = (n) => String(n ?? '').trim().split(/\s+/)[0] || ''

export const iniciales = (n) => {
  const p = String(n ?? '').trim().split(/\s+/).filter(Boolean)
  if (!p.length) return '?'
  return ((p[0][0] ?? '') + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase()
}

/** Foto de la cuenta de Google (solo si es una dirección https). */
export const fotoDeGoogle = (sesion) => {
  const m = sesion?.user?.user_metadata ?? {}
  const u = m.avatar_url || m.picture
  return typeof u === 'string' && /^https:\/\//i.test(u) ? u : null
}

export const direccionLista = (perfil) => String(perfil?.direccion ?? '').trim().length >= 6
export const tieneUbicacion = (perfil) => Boolean(perfil) && perfil.lat != null && perfil.lng != null

/** ¿Con este perfil el pedido se arma sin pedirle nada más a la persona? Basta la dirección: el punto del mapa solo hace que el domicilio se calcule solo. */
export const perfilSirvePara = (perfil, { recoge }) => Boolean(perfil) && (recoge || direccionLista(perfil))

/** Todos los datos del perfil con los cambios encima, en la forma que guarda la base. */
export const payloadPerfil = (perfil, cambios = {}) => ({
  nombre: perfil.nombre, telefono: perfil.telefono, email: perfil.email ?? '',
  direccion: perfil.direccion ?? '', lat: perfil.lat ?? null, lng: perfil.lng ?? null,
  referencia: perfil.referencia ?? '', entrega_preferida: perfil.entrega_preferida ?? 'domicilio',
  acepta_promos: Boolean(perfil.acepta_promos), acepta_datos: true, ...cambios,
})

export function validarDatosRegistro({ nombre, telefono, acepta_datos }) {
  if (String(nombre ?? '').trim().length < 3) return 'Escribe tu nombre completo'
  if (!telefono10(telefono)) return 'Escribe tu celular de 10 dígitos'
  if (!acepta_datos) return 'Debes autorizar el tratamiento de tus datos para registrarte'
  return null
}

export function validarEntrega({ entrega, direccion, lat, lng }, { exigirPunto = true } = {}) {
  if (entrega === 'recoger') return null
  if (String(direccion ?? '').trim().length < 6) return 'Escribe tu dirección completa: calle, número y barrio'
  if (exigirPunto && (lat == null || lng == null)) return 'Marca tu puerta en el mapa para calcular el domicilio'
  return null
}

const FECHA = { day: 'numeric', month: 'short' }
export const fechaCorta = (iso) => { if (!iso) return ''; const d = new Date(iso); return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('es-CO', FECHA).replace('.', '') }
export const fechaLarga = (iso) => { if (!iso) return ''; const d = new Date(iso); return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' }) }

/** «Arroz ×2, Aceite, Panela ×3 y 2 más» */
export function resumenItems(items, max = 3) {
  const l = (items ?? []).map(i => `${i.nombre}${Number(i.cantidad) !== 1 ? ` ×${numero(i.cantidad)}` : ''}`)
  if (l.length <= max) return l.join(', ')
  return `${l.slice(0, max).join(', ')} y ${l.length - max} más`
}

/** Línea de la entrega para mostrar bajo el nombre. */
export function textoEntrega(perfil) {
  if (!perfil) return ''
  if (perfil.entrega_preferida === 'recoger') return 'Recoges en la tienda'
  return String(perfil.direccion ?? '').trim() || 'Aún sin dirección'
}
