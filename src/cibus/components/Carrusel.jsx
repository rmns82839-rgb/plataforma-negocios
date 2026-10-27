import { useEffect, useRef, useState } from 'react'
import SinFoto from './SinFoto'

// Carrusel con desplazamiento táctil (scroll-snap nativo), puntos animados,
// contador y flechas. Sin librerías.
export default function Carrusel({ imagenes, alt }) {
  const ref = useRef(null)
  const [actual, setActual] = useState(0)
  const n = imagenes.length

  // Cambio automático cada 3,5 s. Se pausa mientras el mouse está encima y
  // durante 6 s después de que la persona toca, desliza o usa flechas/puntos.
  const ultima = useRef(0)
  const encima = useRef(false)
  useEffect(() => {
    if (n < 2 || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const t = setInterval(() => {
      const el = ref.current
      if (!el || encima.current || Date.now() - ultima.current < 6000) return
      const sig = (Math.round(el.scrollLeft / el.clientWidth) + 1) % n
      el.scrollTo({ left: sig * el.clientWidth, behavior: 'smooth' })
    }, 3500)
    return () => clearInterval(t)
  }, [n])
  const marcar = () => { ultima.current = Date.now() }

  if (n === 0) return <div className="aspect-square rounded-2xl bg-slate-100" />

  const ir = (i) => {
    const el = ref.current
    if (el) el.scrollTo({ left: i * el.clientWidth, behavior: 'smooth' })
  }
  const alDesplazar = () => {
    const el = ref.current
    if (el) setActual(Math.round(el.scrollLeft / el.clientWidth))
  }

  if (n === 0) return <div className="relative aspect-square rounded-2xl overflow-hidden"><SinFoto /></div>

  return (
    <div
      className="relative"
      onPointerDown={marcar}
      onTouchStart={marcar}
      onWheel={marcar}
      onPointerEnter={(e) => { if (e.pointerType === 'mouse') encima.current = true }}
      onPointerLeave={() => { encima.current = false; marcar() }}
    >
      <div
        ref={ref}
        onScroll={alDesplazar}
        className="flex overflow-x-auto snap-x snap-mandatory aspect-square rounded-2xl bg-slate-100
                   [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {imagenes.map((src, i) => (
          <img key={src} src={src} alt={`${alt} ${i + 1}`} draggable={false}
               loading={i === 0 ? 'eager' : 'lazy'}
               className="w-full h-full shrink-0 snap-center object-contain bg-white" />
        ))}
      </div>

      {n > 1 && (
        <>
          <span className="absolute top-3 right-3 px-2.5 py-1 rounded-full bg-black/50 backdrop-blur
                           text-white text-xs font-medium">
            {actual + 1} / {n}
          </span>

          {actual > 0 && (
            <button onClick={() => ir(actual - 1)} aria-label="Foto anterior"
              className="absolute left-2 top-1/2 -translate-y-1/2 h-9 w-9 rounded-full bg-white/85
                         backdrop-blur shadow grid place-items-center text-slate-700 active:scale-95">
              ‹
            </button>
          )}
          {actual < n - 1 && (
            <button onClick={() => ir(actual + 1)} aria-label="Foto siguiente"
              className="absolute right-2 top-1/2 -translate-y-1/2 h-9 w-9 rounded-full bg-white/85
                         backdrop-blur shadow grid place-items-center text-slate-700 active:scale-95">
              ›
            </button>
          )}

          <div className="absolute bottom-3 inset-x-0 flex justify-center gap-1.5">
            {imagenes.map((_, i) => (
              <button key={i} onClick={() => ir(i)} aria-label={`Ir a la foto ${i + 1}`}
                className={`h-1.5 rounded-full transition-all duration-300 ${
                  i === actual ? 'w-5 bg-white' : 'w-1.5 bg-white/60'}`} />
            ))}
          </div>
        </>
      )}
    </div>
  )
}
