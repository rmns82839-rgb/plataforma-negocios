// Hace que una sección aparezca suavemente la primera vez que se ve en pantalla.
import { useEffect, useRef, useState } from 'react'

export default function Revelar({ children, className = '', retraso = 0 }) {
  const ref = useRef(null)
  const [visto, setVisto] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el || typeof IntersectionObserver === 'undefined') { setVisto(true); return undefined }
    const o = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setVisto(true); o.disconnect() } }, { threshold: 0.08 })
    o.observe(el)
    return () => o.disconnect()
  }, [])
  return <div ref={ref} style={retraso ? { transitionDelay: `${retraso}ms` } : undefined} className={`revela ${visto ? 'visto' : ''} ${className}`}>{children}</div>
}
