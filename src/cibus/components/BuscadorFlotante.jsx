// Barra de búsqueda sutil que se abre desde la lupa flotante (la lupa vive en BotonesFlotantes).
// Vigila si el buscador principal salió de la pantalla.
import { useEffect, useRef } from 'react'

export default function BuscadorFlotante({ objetivo, texto, setTexto, fuera, setFuera, abierto, setAbierto, etiqueta = 'Buscar un producto' }) {
  const entrada = useRef(null)
  useEffect(() => {
    const el = objetivo.current
    if (!el || typeof IntersectionObserver === 'undefined') return undefined
    const o = new IntersectionObserver(([e]) => setFuera(!e.isIntersecting), { threshold: 0 })
    o.observe(el)
    return () => o.disconnect()
  }, [objetivo, setFuera])
  useEffect(() => { if (abierto) entrada.current?.focus() }, [abierto])
  useEffect(() => { if (!fuera) setAbierto(false) }, [fuera, setAbierto])

  if (!abierto) return null
  return (
    <div className="fixed top-2 inset-x-0 z-50 px-4 barra-baja pointer-events-none">
      <div className="pointer-events-auto max-w-sm mx-auto grid grid-cols-[1fr_auto] items-center rounded-full bg-white/95 backdrop-blur shadow-lg ring-1 ring-negro/10 pl-4 pr-1">
        <input ref={entrada} value={texto} onChange={e => setTexto(e.target.value)} placeholder={etiqueta}
               aria-label={etiqueta} enterKeyHint="search"
               onKeyDown={e => { if (e.key === 'Enter') setAbierto(false) }}
               className="w-full h-10 bg-transparent text-base outline-none" />
        <button onClick={() => setAbierto(false)} aria-label="Cerrar búsqueda" className="h-8 w-8 grid place-items-center rounded-full text-slate-500 active:bg-slate-100">✕</button>
      </div>
    </div>
  )
}
