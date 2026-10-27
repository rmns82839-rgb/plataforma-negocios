// Categorías con imagen: tarjetas altas con la foto de fondo y el nombre sobre un degradado de la marca.
// Fila deslizable (flechas en PC) que avanza sola despacio y se detiene apenas el cliente la toca.
// "Ver todas" las muestra en cuadrícula.
import { useEffect, useMemo, useRef, useState } from 'react'
import SinFoto from './SinFoto'
import TituloSeccion from './TituloSeccion'

function Casilla({ c, onElegir, className = '', ratio = 'aspect-[4/5]' }) {
  return (
    <button onClick={() => onElegir(c.nombre)}
      className={`group relative text-left rounded-3xl overflow-hidden ring-1 ring-oro/50 shadow-md bg-cibus-profundo active:scale-[0.98] transition hover:shadow-xl hover:-translate-y-0.5 ${ratio} ${className}`}>
      {c.imagen
        ? <img src={c.imagen} alt="" loading="lazy" className="absolute inset-0 w-full h-full object-cover transition duration-500 group-hover:scale-110" />
        : <SinFoto />}
      <span aria-hidden="true" className="absolute inset-0 bg-gradient-to-t from-cibus-profundo via-cibus-profundo/30 to-transparent" />
      <span aria-hidden="true" className="absolute top-2.5 right-2.5 h-7 w-7 rounded-full bg-white/20 backdrop-blur-sm text-white grid place-items-center text-sm transition group-hover:bg-champagne group-hover:text-negro">›</span>
      <span className="absolute inset-x-0 bottom-0 p-3 space-y-0.5">
        <span className="block text-sm font-semibold leading-tight text-white capitalize line-clamp-2">{c.nombre}</span>
        <span className="block text-[11px] text-champagne/90">{c.n} {c.n === 1 ? 'producto' : 'productos'}</span>
      </span>
    </button>
  )
}

export default function CategoriasImagen({ productos, onElegir }) {
  const [todas, setTodas] = useState(false)
  const fila = useRef(null)
  const quieta = useRef(false)          // el cliente la está tocando: se detiene y vuelve a moverse sola unos segundos después
  const espera = useRef(null)
  const [avance, setAvance] = useState(0)   // 0 a 1: qué tanto se ha recorrido (barra fina bajo la fila)
  const cats = useMemo(() => {
    const m = new Map()
    for (const p of productos) {
      if (!p.categoria) continue
      const c = m.get(p.categoria) ?? { nombre: p.categoria, imagen: null, n: 0 }
      c.n += 1
      if (!c.imagen && p.imagenes?.[0]) c.imagen = p.imagenes[0]
      m.set(p.categoria, c)
    }
    return [...m.values()]
  }, [productos])

  const mover = (dir) => {
    const el = fila.current
    if (!el) return
    const paso = el.firstElementChild ? (el.firstElementChild.getBoundingClientRect().width + 12) * 2 : 300
    el.scrollBy({ left: dir * paso, behavior: 'smooth' })
  }

  useEffect(() => {
    if (todas || cats.length < 4) return
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
    const id = setInterval(() => {
      const el = fila.current
      if (!el || quieta.current || document.hidden) return
      const paso = el.firstElementChild ? el.firstElementChild.getBoundingClientRect().width + 12 : 120
      if (el.scrollLeft + el.clientWidth >= el.scrollWidth - 4) el.scrollTo({ left: 0, behavior: 'smooth' })
      else el.scrollBy({ left: paso, behavior: 'smooth' })
    }, 3500)
    return () => clearInterval(id)
  }, [todas, cats.length])

  const parar = () => { quieta.current = true; clearTimeout(espera.current); espera.current = setTimeout(() => { quieta.current = false }, 7000) }
  const alMover = () => { const el = fila.current; if (el) setAvance(el.scrollWidth > el.clientWidth ? el.scrollLeft / (el.scrollWidth - el.clientWidth) : 0) }
  if (cats.length < 2) return null
  const huecos = (3 - (cats.length % 3)) % 3
  return (
    <section aria-label="Categorías" className="space-y-3">
      <div className="grid grid-cols-[1fr_auto] gap-3 items-center">
        <TituloSeccion className="justify-self-start">Compra por categoría</TituloSeccion>
        <button onClick={() => setTodas(v => !v)} className="h-8 px-3 rounded-full bg-white text-xs font-semibold text-cibus shadow-sm ring-1 ring-oro/40 active:bg-slate-50">
          {todas ? 'Ver en fila' : `Ver todas (${cats.length})`}
        </button>
      </div>
      {todas ? (
        <ul className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-3">
          {cats.map(c => <li key={c.nombre}><Casilla c={c} onElegir={onElegir} className="w-full" ratio="aspect-square" /></li>)}
          {Array.from({ length: huecos }).map((_, i) => <li key={`h${i}`} aria-hidden="true" />)}
        </ul>
      ) : (
        <div className="relative">
          <div ref={fila} onPointerDown={parar} onWheel={parar} onFocus={parar} onTouchStart={parar} onScroll={alMover}
            className="flex gap-3 overflow-x-auto snap-x snap-mandatory pb-2 -mx-4 px-4 lg:mx-0 lg:px-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {cats.map(c => (
              <Casilla key={c.nombre} c={c} onElegir={onElegir}
                className="snap-start shrink-0 w-[42%] sm:w-[28%] lg:w-[calc((100%-3rem)/5.3)]" />
            ))}
          </div>
          <div aria-hidden="true" className="mx-auto mt-1 h-1 w-24 rounded-full bg-oro/25 overflow-hidden"><div className="h-full w-8 rounded-full bg-oro transition-transform duration-200" style={{ transform: `translateX(${avance * 64}px)` }} /></div>
          {cats.length > 5 && (
            <>
              <button onClick={() => { parar(); mover(-1) }} aria-label="Anteriores"
                className="hidden lg:grid absolute -left-4 top-1/2 -translate-y-1/2 h-10 w-10 place-items-center rounded-full bg-white text-cibus text-xl shadow-lg ring-1 ring-oro/50 hover:bg-champagne active:scale-95 transition">‹</button>
              <button onClick={() => { parar(); mover(1) }} aria-label="Siguientes"
                className="hidden lg:grid absolute -right-4 top-1/2 -translate-y-1/2 h-10 w-10 place-items-center rounded-full bg-white text-cibus text-xl shadow-lg ring-1 ring-oro/50 hover:bg-champagne active:scale-95 transition">›</button>
            </>
          )}
        </div>
      )}
    </section>
  )
}
