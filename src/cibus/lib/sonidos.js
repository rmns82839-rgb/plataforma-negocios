// Sonidos de los avisos de la caja (pedido nuevo, opinión nueva). Se generan con el propio navegador:
// no hay archivos que descargar y funcionan sin internet. Cada persona elige su sonido en este equipo.
import { leerPropio } from './audioLocal'

const CLAVE = 'matriz:sonidos'
const PREDETERMINADO = { activo: true, pedido: 'campana', opinion: 'marimba', volumen: 0.8 }

export const SONIDOS = [
  { id: 'campana', texto: 'Campana', nota: 'Dos tañidos claros' },
  { id: 'timbre', texto: 'Timbre', nota: 'Ding-dong de puerta' },
  { id: 'moneda', texto: 'Moneda', nota: 'Como una caja registradora' },
  { id: 'marimba', texto: 'Marimba', nota: 'Tres notas suaves' },
  { id: 'fanfarria', texto: 'Fanfarria', nota: 'Sube alegre, se oye de lejos' },
  { id: 'alerta', texto: 'Alerta', nota: 'Tres pitidos fuertes' },
]

export function leerPreferencias() {
  try { return { ...PREDETERMINADO, ...(JSON.parse(localStorage.getItem(CLAVE) ?? 'null') ?? {}) } } catch { return { ...PREDETERMINADO } }
}
export function guardarPreferencias(p) {
  try { localStorage.setItem(CLAVE, JSON.stringify({ ...leerPreferencias(), ...p })) } catch { /* sin almacenamiento */ }
}

let ctx = null
const audio = () => {
  if (ctx) return ctx
  const A = window.AudioContext || window.webkitAudioContext
  if (!A) return null
  try { ctx = new A() } catch { ctx = null }
  return ctx
}
// El contexto de audio solo se crea cuando suena un aviso y se SUSPENDE enseguida: así no se queda ocupando el audio del
// teléfono (antes, tenerlo abierto podía cortar el micrófono durante una llamada). Chrome deja sonar después de que la persona
// toca la pantalla una vez; en iPhone se desbloquea con el primer toque.
let suspender = null
const liberar = (ms) => {
  clearTimeout(suspender)
  suspender = setTimeout(() => { try { ctx?.suspend() } catch { /* nada */ } }, ms + 400)
}
if (typeof window !== 'undefined' && /iPhone|iPad|iPod/i.test(navigator.userAgent)) {
  window.addEventListener('pointerdown', () => { const c = audio(); if (c?.state === 'suspended') c.resume().then(() => liberar(0)).catch(() => {}) }, { once: true, passive: true })
}

// una nota: frecuencia, inicio (s), duración (s), forma de onda, volumen
const nota = (c, salida, f, t, d, onda = 'sine', v = 1) => {
  const o = c.createOscillator(), g = c.createGain()
  o.type = onda; o.frequency.setValueAtTime(f, t)
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(v, t + 0.012)
  g.gain.exponentialRampToValueAtTime(0.0001, t + d)
  o.connect(g); g.connect(salida); o.start(t); o.stop(t + d + 0.05)
}
const FORMAS = {
  campana: (c, s, t) => { for (const k of [0, 0.7]) { nota(c, s, 880, t + k, 1.2, 'sine', 0.8); nota(c, s, 1760, t + k, 0.8, 'sine', 0.35); nota(c, s, 2637, t + k, 0.4, 'sine', 0.15) } },
  timbre: (c, s, t) => { nota(c, s, 659, t, 0.9, 'sine', 0.9); nota(c, s, 523, t + 0.45, 1.2, 'sine', 0.9) },
  moneda: (c, s, t) => { nota(c, s, 988, t, 0.12, 'triangle', 0.8); nota(c, s, 1319, t + 0.1, 0.7, 'triangle', 0.8) },
  marimba: (c, s, t) => { [523, 659, 784].forEach((f, i) => nota(c, s, f, t + i * 0.16, 0.45, 'triangle', 0.9)) },
  fanfarria: (c, s, t) => { [523, 659, 784, 1047].forEach((f, i) => nota(c, s, f, t + i * 0.13, i === 3 ? 0.9 : 0.3, 'square', 0.28)) },
  alerta: (c, s, t) => { for (let i = 0; i < 3; i++) nota(c, s, 880, t + i * 0.28, 0.2, 'square', 0.3) },
}

// Reactiva el audio (si estaba suspendido) y ejecuta el sonido. Devuelve false si el navegador no deja sonar todavía.
function cuando(c, f) {
  if (c.state === 'running') { f(); return true }
  if (c.state === 'closed') return false
  c.resume().then(() => { if (c.state === 'running') f() }).catch(() => {})
  return true
}

// Canciones propias (valor 'propio'): se guardan solo en este celular. Se cargan una vez y quedan listas en memoria.
const propios = {}
export async function cargarPropio(tipo) {
  const c = audio()
  const datos = await leerPropio(tipo)
  if (!c || !datos) { delete propios[tipo]; return false }
  try { propios[tipo] = await c.decodeAudioData(datos.slice(0)); return true } catch { delete propios[tipo]; return false }
}
export const hayPropio = (tipo) => Boolean(propios[tipo])
if (typeof window !== 'undefined') { const p0 = leerPreferencias(); for (const t of ['pedido', 'opinion']) if (p0[t] === 'propio') cargarPropio(t) }
function reproducirPropio(tipo, volumen) {
  const c = audio(), buf = propios[tipo]
  if (!c || !buf) return false
  return cuando(c, () => {
    const s = c.createBufferSource(), g = c.createGain()
    s.buffer = buf; g.gain.value = Math.min(1, Math.max(0, volumen)); s.connect(g); g.connect(c.destination); s.start()
    liberar(buf.duration * 1000)
  })
}
export const probarPropio = (tipo, volumen = leerPreferencias().volumen) => reproducirPropio(tipo, volumen)

/** Hace sonar un sonido (por su id). Devuelve false si el navegador no lo deja o está en silencio. */
export function reproducir(id, volumen = leerPreferencias().volumen) {
  const c = audio()
  if (!c || !FORMAS[id]) return false
  return cuando(c, () => {
    const sal = c.createGain(); sal.gain.value = Math.min(1, Math.max(0, volumen)); sal.connect(c.destination)
    FORMAS[id](c, sal, c.currentTime + 0.02)
    liberar(2500)
  })
}

/** Aviso real: respeta el interruptor general y el sonido elegido para ese tipo de aviso. */
export function sonar(tipo) {
  const p = leerPreferencias()
  if (!p.activo) return false
  if (p[tipo] === 'propio') return reproducirPropio(tipo, p.volumen) || reproducir('campana', p.volumen)
  return reproducir(p[tipo] ?? p.pedido, p.volumen)
}
