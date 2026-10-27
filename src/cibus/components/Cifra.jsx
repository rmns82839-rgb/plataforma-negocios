// Una cifra (dinero o cantidad) que NUNCA se parte ni se corta: si no cabe en su tarjeta, baja de tamaño hasta caber.
import { useLayoutEffect, useRef } from 'react'

export default function Cifra({ children, className = '', min = 12, ...resto }) {
  const ref = useRef(null)
  useLayoutEffect(() => {
    const el = ref.current
    const caja = el?.parentElement
    if (!el || !caja) return undefined
    const ajustar = () => {
      el.style.fontSize = ''
      const cs = getComputedStyle(caja)
      const disponible = caja.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)
      let tam = parseFloat(getComputedStyle(el).fontSize)
      while (el.scrollWidth > disponible + 0.5 && tam > min) { tam -= 1; el.style.fontSize = `${tam}px` }
    }
    ajustar()
    const o = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(ajustar) : null
    o?.observe(caja)
    return () => o?.disconnect()
  }, [children, min])
  return <p ref={ref} className={`whitespace-nowrap ${className}`} {...resto}>{children}</p>
}
