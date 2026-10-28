// Horario de atención de una tienda: {"0":[["08:00","14:00"]], "1":[["07:00","12:00"],["14:00","20:00"]], …}
// llave = día (0 domingo … 6 sábado); día sin llave o con [] = cerrado. Hora de Colombia (UTC−5 todo el año).
// La base de datos (estado_horario) y este archivo calculan lo mismo; aquí también sirve para la vista previa del panel.

export const DIAS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']
export const DIAS_CORTO = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']
export const ORDEN_SEMANA = [1, 2, 3, 4, 5, 6, 0]   // la semana empieza el lunes

const HORA = /^([01][0-9]|2[0-3]):[0-5][0-9]$/

/** '20:00' → '8:00 p. m.'  ·  '00:00' → '12:00 a. m.' */
export function hora12(h) {
  if (!HORA.test(String(h ?? ''))) return ''
  const [hh, mm] = h.split(':').map(Number)
  return `${hh % 12 === 0 ? 12 : hh % 12}:${String(mm).padStart(2, '0')} ${hh < 12 ? 'a. m.' : 'p. m.'}`
}

/** Franjas válidas de un día (hasta 2, ordenadas, sin montarse). */
export const franjasDe = (semana, dia) => {
  const f = semana?.[String(dia)]
  return Array.isArray(f) ? f.filter((x) => Array.isArray(x) && HORA.test(x[0]) && HORA.test(x[1]) && x[0] < x[1]).slice(0, 2) : []
}

/** Mensaje de error en español si el horario no sirve (null = está bien). */
export function validarSemana(semana) {
  if (semana == null) return null
  for (const d of ORDEN_SEMANA) {
    const f = semana[String(d)] ?? []
    if (f.length > 2) return `${DIAS[d]}: máximo dos franjas`
    for (const [a, c] of f) {
      if (!HORA.test(a) || !HORA.test(c)) return `${DIAS[d]}: revisa las horas`
      if (a >= c) return `${DIAS[d]}: la hora de cierre debe ser después de la de apertura`
    }
    if (f.length === 2 && f[0][1] > f[1][0]) return `${DIAS[d]}: las dos franjas no pueden cruzarse`
  }
  return null
}

/** Ahora en Colombia: { dow, hora:'HH:MM' } (se puede pasar una fecha para probar). */
export function ahoraBogota(fecha = new Date()) {
  const b = new Date(fecha.getTime() - 5 * 3600 * 1000)
  return { dow: b.getUTCDay(), hora: `${String(b.getUTCHours()).padStart(2, '0')}:${String(b.getUTCMinutes()).padStart(2, '0')}` }
}

/** Lo mismo que la función estado_horario de la base de datos. abierto: true | false | null (sin horario cargado). */
export function estadoHorario(semana, cerradoHasta = null, fecha = new Date()) {
  if (!semana) return { abierto: null }
  if (cerradoHasta && new Date(cerradoHasta) > fecha) return { abierto: false, temporal: true }
  const { dow, hora } = ahoraBogota(fecha)
  for (const [a, c] of franjasDe(semana, dow)) if (hora >= a && hora < c) return { abierto: true, cierra: c }
  for (let d = 0; d <= 7; d++) {
    for (const [a] of franjasDe(semana, (dow + d) % 7)) if (d > 0 || a > hora) return { abierto: false, abre_dia: (dow + d) % 7, abre_hora: a, abre_hoy: d === 0 }
  }
  return { abierto: false }
}

/** Texto corto para la insignia. { abierto, texto } o null si no hay horario. */
export function textoEstado(e, fecha = new Date()) {
  if (!e || e.abierto == null) return null
  if (e.abierto) return { abierto: true, texto: e.cierra ? `Abierto ahora · cierra ${hora12(e.cierra)}` : 'Abierto ahora' }
  if (e.temporal) return { abierto: false, texto: 'Cerrado por hoy' }
  if (e.abre_hora == null) return { abierto: false, texto: 'Cerrado' }
  const { dow } = ahoraBogota(fecha)
  const cuando = e.abre_hoy ? 'hoy' : e.abre_dia === (dow + 1) % 7 ? 'mañana' : `el ${DIAS[e.abre_dia].toLowerCase()}`
  return { abierto: false, texto: `Cerrado · abre ${cuando} ${hora12(e.abre_hora)}` }
}

const mismo = (a, b) => JSON.stringify(a) === JSON.stringify(b)

/** Resumen legible para facturas y para quien no tiene el horario por día: "Lun a sáb 7:00 a. m. – 8:00 p. m. · Dom 8:00 a. m. – 2:00 p. m." */
export function resumenHorario(semana) {
  if (!semana) return ''
  const filas = ORDEN_SEMANA.map((d) => ({ d, f: franjasDe(semana, d) })).filter((x) => x.f.length)
  if (!filas.length) return 'Cerrado'
  const grupos = []
  for (const x of filas) {
    const g = grupos[grupos.length - 1]
    const consecutivo = g && ORDEN_SEMANA.indexOf(x.d) === ORDEN_SEMANA.indexOf(g.dias[g.dias.length - 1]) + 1
    if (g && consecutivo && mismo(g.f, x.f)) g.dias.push(x.d); else grupos.push({ dias: [x.d], f: x.f })
  }
  return grupos.map((g) => {
    const dias = g.dias.length === 1 ? DIAS_CORTO[g.dias[0]] : g.dias.length === 7 ? 'Todos los días' : `${DIAS_CORTO[g.dias[0]]} a ${DIAS_CORTO[g.dias[g.dias.length - 1]].toLowerCase()}`
    return `${dias} ${g.f.map(([a, c]) => `${hora12(a)} – ${hora12(c)}`).join(' y ')}`
  }).join(' · ')
}

/** Hoy a las 12 de la noche (hora de Colombia) como texto ISO: para «hoy no abro». */
export function finDeHoy(fecha = new Date()) {
  const b = new Date(fecha.getTime() - 5 * 3600 * 1000)
  return new Date(Date.UTC(b.getUTCFullYear(), b.getUTCMonth(), b.getUTCDate() + 1, 5, 0, 0)).toISOString()
}

/** Opciones de hora para las listas del panel (cada 30 minutos, de 4:00 a. m. a 11:30 p. m., y 11:59 p. m.). */
export const OPCIONES_HORA = [...Array.from({ length: 40 }, (_, i) => { const m = 4 * 60 + i * 30; return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}` }), '23:59']

/** Distancia legible: 0,4 km → "a 400 m"; 7,2 → "a 7,2 km". */
export const textoDistancia = (km) => (km == null ? '' : Number(km) < 1 ? `a ${Math.round(Number(km) * 1000 / 50) * 50 || 50} m` : `a ${Number(km).toFixed(1).replace('.', ',')} km`)
