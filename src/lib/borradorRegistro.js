// Lo que la persona ya escribió en el registro de su negocio: sobrevive a ir a leer la política de datos o los términos
// (y a recargar la página). Solo vive en este equipo, dura 12 horas y se borra al enviar la solicitud.
const CLAVE = 'matriz:registro'
const DOCE_HORAS = 12 * 60 * 60 * 1000
const CAMPOS = ['tipo', 'plan', 'nombre_negocio', 'ciudad', 'nombre_contacto', 'email', 'telefono', 'mensaje', 'acepta']

export function leerRegistro(ahora = Date.now(), almacen = globalThis.localStorage) {
  try {
    const o = JSON.parse(almacen.getItem(CLAVE) || 'null')
    if (!o || typeof o.t !== 'number' || ahora - o.t > DOCE_HORAS || !o.v || typeof o.v !== 'object') { almacen.removeItem(CLAVE); return null }
    const v = {}
    for (const k of CAMPOS) if (k in o.v) v[k] = k === 'acepta' ? o.v[k] === true : String(o.v[k] ?? '')
    return { f: v, paso: ['tipo', 'datos', 'revisar'].includes(o.paso) ? o.paso : 'tipo' }
  } catch { return null }
}

export function guardarRegistro(f, paso, ahora = Date.now(), almacen = globalThis.localStorage) {
  try {
    const v = {}
    for (const k of CAMPOS) v[k] = f[k]
    const vacio = CAMPOS.every((k) => !v[k])
    if (vacio) almacen.removeItem(CLAVE); else almacen.setItem(CLAVE, JSON.stringify({ t: ahora, paso, v }))
  } catch { /* sin almacenamiento (modo privado): simplemente no se guarda */ }
}

export const borrarRegistro = (almacen = globalThis.localStorage) => { try { almacen.removeItem(CLAVE) } catch { /* nada */ } }
export const hayRegistroEnCurso = (ahora = Date.now(), almacen = globalThis.localStorage) => {
  const r = leerRegistro(ahora, almacen)
  return Boolean(r && (r.f.tipo || r.f.nombre_negocio || r.f.email || r.f.telefono || r.f.nombre_contacto))
}
