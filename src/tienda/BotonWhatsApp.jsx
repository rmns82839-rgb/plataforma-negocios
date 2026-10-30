// Botón flotante de WhatsApp con «imán»: en computador se acerca suavemente al puntero cuando este se aproxima;
// en celular late despacio para llamar la atención. Queda por encima de la barra inferior.
import { useEffect, useRef, useState } from 'react'
import { enlaceWhatsApp } from '../lib/contacto'

export default function BotonWhatsApp({ texto = 'Hola, quiero información sobre Matriz', abajo = 84 }) {
  const el = useRef(null)
  const [globo, setGlobo] = useState(false)

  useEffect(() => {
    const f = (e) => {
      const b = el.current; if (!b || e.pointerType === 'touch') return
      const r = b.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2
      const dx = e.clientX - cx, dy = e.clientY - cy, d = Math.hypot(dx, dy)
      if (d < 150) { const k = Math.min(1, (150 - d) / 150) * 0.35; b.style.transform = `translate(${dx * k}px, ${dy * k}px) scale(${1 + 0.1 * k * 2})` }
      else b.style.transform = ''
    }
    window.addEventListener('pointermove', f)
    const t = setTimeout(() => setGlobo(true), 5000), t2 = setTimeout(() => setGlobo(false), 13000)
    return () => { window.removeEventListener('pointermove', f); clearTimeout(t); clearTimeout(t2) }
  }, [])

  return (
    <div style={{ position: 'fixed', right: 16, bottom: `calc(${abajo}px + env(safe-area-inset-bottom))`, zIndex: 40 }}>
      <style>{`@keyframes wa-latido{0%{box-shadow:0 0 0 0 rgba(18,140,74,.55)}70%{box-shadow:0 0 0 16px rgba(18,140,74,0)}100%{box-shadow:0 0 0 0 rgba(18,140,74,0)}}`}</style>
      {globo && <div className="absolute bottom-16 right-0 w-48 rounded-2xl rounded-br-sm bg-white px-3 py-2 text-sm font-semibold leading-snug text-tinta shadow-lg">¿Te ayudamos? Escríbenos por WhatsApp</div>}
      <a ref={el} href={enlaceWhatsApp(texto)} target="_blank" rel="noopener noreferrer" aria-label="Escríbenos por WhatsApp"
        style={{ animation: 'wa-latido 2.4s infinite', transition: 'transform .18s ease-out' }}
        className="flex h-14 w-14 items-center justify-center rounded-full bg-[#128C4A] text-white shadow-xl">
        <svg viewBox="0 0 32 32" width="30" height="30" fill="currentColor" aria-hidden="true"><path d="M16.04 3C8.84 3 3 8.83 3 16.02c0 2.3.6 4.54 1.74 6.5L3 29l6.65-1.7a13 13 0 0 0 6.39 1.64h.01C23.23 28.94 29 23.1 29 15.92 29 8.83 23.23 3 16.04 3Zm0 23.7h-.01a10.7 10.7 0 0 1-5.45-1.5l-.39-.23-3.95 1.01 1.05-3.85-.25-.4a10.6 10.6 0 0 1-1.63-5.7c0-5.9 4.8-10.7 10.7-10.7 2.86 0 5.54 1.1 7.56 3.13a10.6 10.6 0 0 1 3.13 7.57c0 5.9-4.8 10.67-10.76 10.67Zm5.87-8c-.32-.16-1.9-.94-2.2-1.05-.3-.1-.51-.16-.73.17-.21.32-.84 1.05-1.03 1.27-.19.21-.38.24-.7.08-.32-.16-1.36-.5-2.59-1.6-.96-.85-1.6-1.9-1.8-2.22-.18-.32-.02-.5.14-.66.15-.14.32-.38.48-.57.16-.19.21-.32.32-.54.1-.21.05-.4-.03-.56-.08-.16-.73-1.76-1-2.4-.26-.63-.53-.54-.73-.55h-.62c-.21 0-.56.08-.85.4-.3.32-1.12 1.1-1.12 2.68 0 1.58 1.15 3.1 1.31 3.32.16.21 2.27 3.46 5.5 4.85.77.33 1.37.53 1.84.68.77.25 1.47.21 2.03.13.62-.09 1.9-.78 2.17-1.53.27-.75.27-1.4.19-1.53-.08-.13-.3-.21-.62-.37Z"/></svg>
      </a>
    </div>
  )
}
