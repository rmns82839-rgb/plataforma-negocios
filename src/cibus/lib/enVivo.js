// Tiempo real del negocio (archivo .js aparte por el Fast Refresh de Vite):
//  · visitantes de los catálogos públicos (anónimos: solo un número al azar y el catálogo)
//  · personal conectado al panel (canal privado: solo entra quien tiene sesión y es del personal)
//  · aviso al dueño cuando entra la cuenta de soporte
// Todo es opcional: si el canal falla (o no se corrió migracion-v28.sql) la app sigue normal.
import { useEffect, useState, useSyncExternalStore } from 'react'
import { supabase, negocioActual } from './supabase'
import { slugActual } from './enlaces'
import { modoPublico } from './publico'

// Cada tienda tiene sus propios canales: visitas:{tienda} (las visitas del catálogo, sin datos personales)
// y envivo:{tienda}:personal (privado: la base solo deja entrar al personal de ESA tienda).
const canalVisitas = (negocioId) => `visitas:${negocioId}`
const canalPersonalDe = () => `envivo:${negocioActual()}:personal`

const idAzar = () => globalThis.crypto?.randomUUID?.() ?? `v-${Date.now()}-${Math.random().toString(36).slice(2)}`

// Si quedó un canal con el mismo nombre, se quita: supabase lo reutilizaría y no deja agregar escuchas
const limpiar = (nombre) => {
  try { for (const c of supabase.getChannels()) if (c.topic === `realtime:${nombre}`) supabase.removeChannel(c) } catch { /* sin canales */ }
}

/** Todas las personas presentes en un canal, sin importar la llave de cada conexión. */
const presentes = (canal) => Object.values(canal.presenceState()).flat()

// ---------- Historial de visitas (una por equipo y por día, sin datos personales) ----------
const esRobot = () => /bot|crawl|spider|slurp|headless|lighthouse|preview/i.test(navigator.userAgent || '') || navigator.webdriver === true
const diaLocal = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' })
const idVisitante = () => {
  try {
    let id = localStorage.getItem('visitante-id')
    if (!id) { id = idAzar().replace(/-/g, ''); localStorage.setItem('visitante-id', id) }
    return id
  } catch { return null }
}
/** Guarda que este equipo entró hoy al catálogo (solo una vez por día). Si falla, no pasa nada. */
const contarVisita = (catalogo) => {
  try {
    if (esRobot()) return
    const clave = `visita-${catalogo}-${diaLocal()}`
    if (localStorage.getItem(clave)) return
    const id = idVisitante()
    if (!id) return
    localStorage.setItem(clave, '1')
    supabase.rpc('registrar_visita', { p_slug: slugActual(), p_catalogo: catalogo, p_visitante: id }).then(() => {}, () => {})
  } catch { /* sin almacenamiento */ }
}

// ---------- Catálogos públicos: "hay alguien mirando" ----------
export function useVisitante(catalogo, negocioId = negocioActual()) {
  useEffect(() => {
    let canal = null
    let vivo = true
    let visible = true
    const marcar = () => { try { canal?.track({ c: catalogo, t: Date.now() }) } catch { /* sin canal */ } }
    const soltar = () => { try { canal?.untrack() } catch { /* sin canal */ } }
    const alCambiar = () => { if (!canal) return; visible = !document.hidden; if (visible) marcar(); else soltar() }

    ;(async () => {
      // el personal que revisa su propio catálogo no cuenta como visitante
      try { const { data } = await supabase.auth.getSession(); if (data?.session) return } catch { /* sigue como visitante */ }
      if (!vivo) return
      contarVisita(catalogo)
      if (modoPublico()) return      // el público no abre el canal de «quién está mirando» (solo cuenta la visita)
      try {
        limpiar(canalVisitas(negocioId))
        canal = supabase.channel(canalVisitas(negocioId), { config: { presence: { key: idAzar() } } })
        canal.subscribe((estado) => { if (estado === 'SUBSCRIBED' && vivo && !document.hidden) marcar() })
        document.addEventListener('visibilitychange', alCambiar)
      } catch { canal = null }
    })()

    return () => {
      vivo = false
      document.removeEventListener('visibilitychange', alCambiar)
      if (canal) { try { supabase.removeChannel(canal) } catch { /* ya cerrado */ } }
    }
  }, [catalogo, negocioId])
}

/** Panel del dueño: cuántos visitantes hay ahora en cada catálogo. estado: 'conectando' | 'ok' | 'error' */
export function useVisitasEnVivo(activo = true) {
  const [datos, setDatos] = useState({ tienda: 0, estado: 'conectando' })
  useEffect(() => {
    if (!activo) return undefined
    let canal = null
    try {
      limpiar(canalVisitas(negocioActual()))
      canal = supabase.channel(canalVisitas(negocioActual()), { config: { presence: { key: `panel-${idAzar()}` } } })
      canal.on('presence', { event: 'sync' }, () => {
        const lista = presentes(canal).filter(p => p.c)
        setDatos({ tienda: lista.length, estado: 'ok' })
      })
      canal.subscribe((estado) => {
        if (estado === 'CHANNEL_ERROR' || estado === 'TIMED_OUT') setDatos(d => ({ ...d, estado: 'error' }))
      })
    } catch { setDatos(d => ({ ...d, estado: 'error' })) }
    return () => { if (canal) { try { supabase.removeChannel(canal) } catch { /* ya cerrado */ } } }
  }, [activo])
  return datos
}

// ---------- Personal conectado al panel ----------
// El panel mantiene un solo canal; la pantalla "En vivo" solo lee la lista (mini almacén externo).
let personal = []
const oyentes = new Set()
const avisar = () => oyentes.forEach(f => f())
const suscribir = (f) => { oyentes.add(f); return () => oyentes.delete(f) }
const leer = () => personal
let canalPersonal = null
let miDato = null

/** Arranca la presencia del panel. `yo` = { id, correo, rol, pantalla }. Devuelve la función que la detiene. */
export function iniciarPresenciaPersonal(yo) {
  miDato = { ...yo, desde: Date.now() }
  try {
    limpiar(canalPersonalDe())
    canalPersonal = supabase.channel(canalPersonalDe(), { config: { private: true, presence: { key: `${yo.id}-${idAzar().slice(0, 8)}` } } })
    canalPersonal.on('presence', { event: 'sync' }, () => {
      personal = presentes(canalPersonal).filter(p => p.correo)
      avisar()
    })
    canalPersonal.subscribe((estado) => { if (estado === 'SUBSCRIBED') { try { canalPersonal.track(miDato) } catch { /* sin canal */ } } })
  } catch { canalPersonal = null }
  return () => {
    if (canalPersonal) { try { supabase.removeChannel(canalPersonal) } catch { /* ya cerrado */ } }
    canalPersonal = null; personal = []; avisar()
  }
}

/** Cambia la pantalla que se muestra de esta persona ("en Caja", "en Productos"…). */
export function cambiarPantallaPresencia(pantalla) {
  if (!miDato || miDato.pantalla === pantalla) return
  miDato = { ...miDato, pantalla }
  try { canalPersonal?.track(miDato) } catch { /* sin canal */ }
}

export const usePersonalConectado = () => useSyncExternalStore(suscribir, leer, leer)

// ---------- Aviso de que entró soporte ----------
const CLAVE_VISTO = 'soporte-visto'
const leerVisto = () => { try { return localStorage.getItem(CLAVE_VISTO) || '' } catch { return '' } }

/** Para el dueño: último ingreso de la cuenta de soporte que todavía no ha visto. */
export function useAvisoSoporte(activo) {
  const [ultimo, setUltimo] = useState(null)
  useEffect(() => {
    if (!activo) return undefined
    let vivo = true
    const revisar = async () => {
      const desde = leerVisto() || new Date(Date.now() - 24 * 3600 * 1000).toISOString()
      const { data, error } = await supabase.from('accesos').select('id, fecha, correo')
        .eq('rol', 'soporte').gt('fecha', desde).order('fecha', { ascending: false }).range(0, 0)
      if (vivo && !error) setUltimo(data?.[0] ?? null)
    }
    revisar()
    const t = setInterval(() => { if (!document.hidden) revisar() }, 120000)
    return () => { vivo = false; clearInterval(t) }
  }, [activo])
  const descartar = () => {
    try { localStorage.setItem(CLAVE_VISTO, new Date().toISOString()) } catch { /* sin almacenamiento */ }
    setUltimo(null)
  }
  return { ultimo, descartar }
}
