// Canción de fondo del catálogo: suena bajito en bucle después de que la persona toca la pantalla (los navegadores no dejan antes).
// Siempre hay un botón para silenciarla y se recuerda la decisión en ese celular.
import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'

const CLAVE = 'cibus:musica'
const VOLUMEN = 0.15
const apagada = () => { try { return localStorage.getItem(CLAVE) === 'off' } catch { return false } }

export default function MusicaFondo() {
  const [url, setUrl] = useState(null)
  const [suena, setSuena] = useState(false)
  const [off, setOff] = useState(apagada)
  const a = useRef(null), offRef = useRef(off)
  offRef.current = off

  useEffect(() => { supabase.from('musica_fondo_publica').select('url').maybeSingle().then(({ data }) => setUrl(data?.url ?? null), () => {}) }, [])

  useEffect(() => {
    if (!url) return
    const el = new Audio(url); el.loop = true; el.volume = VOLUMEN; el.preload = 'none'
    el.onplay = () => setSuena(true); el.onpause = () => setSuena(false)
    a.current = el
    const arrancar = () => { if (!offRef.current) el.play().catch(() => {}) }
    window.addEventListener('pointerdown', arrancar, { once: true, passive: true })
    const ocultar = () => { if (document.hidden) el.pause(); else if (!offRef.current && el.currentTime > 0) el.play().catch(() => {}) }
    document.addEventListener('visibilitychange', ocultar)
    return () => { window.removeEventListener('pointerdown', arrancar); document.removeEventListener('visibilitychange', ocultar); el.pause(); a.current = null }
  }, [url])

  if (!url) return null
  const alternar = (e) => {
    e.stopPropagation()
    const nuevo = suena
    try { localStorage.setItem(CLAVE, nuevo ? 'off' : 'on') } catch { /* nada */ }
    setOff(nuevo)
    if (nuevo) a.current?.pause(); else a.current?.play().catch(() => {})
  }
  return (
    <button onClick={alternar} aria-label={suena ? 'Silenciar la música' : 'Poner la música'} aria-pressed={suena}
      className="h-9 w-9 shrink-0 rounded-full bg-cibus-profundo ring-1 ring-oro/40 text-sm grid place-items-center active:scale-95">{suena ? '🔊' : '🔇'}</button>
  )
}
