// Botones flotantes de los catálogos: pedido (con contador) y WhatsApp.
// Se arrastran con el dedo o el mouse y, al soltarlos, se pegan como imán al lado más cercano
// (izquierda, derecha, arriba o abajo). La posición se recuerda en este dispositivo.
import { useCallback, useEffect, useRef, useState } from 'react'

const TAM = 56, MARGEN = 12, SEPARA = 10
const clave = (id) => `matriz-flotante-${id}`

const leer = (id, defecto) => {
  try {
    const v = JSON.parse(localStorage.getItem(clave(id)) || 'null')
    if (v && ['left', 'right', 'top', 'bottom'].includes(v.lado) && Number.isFinite(v.t)) return v
  } catch { /* sin almacenamiento */ }
  return defecto
}
const guardar = (id, v) => { try { localStorage.setItem(clave(id), JSON.stringify(v)) } catch { /* no pasa nada */ } }

// El ancho útil NO incluye la barra de desplazamiento (así el botón no se corta en PC)
const limites = (reserva, tam = TAM) => {
  const w = document.documentElement.clientWidth, h = window.innerHeight
  return { minX: MARGEN, maxX: w - tam - MARGEN, minY: MARGEN + 56, maxY: h - tam - MARGEN - reserva }
}
const aPixeles = ({ lado, t }, reserva, tam = TAM) => {
  const { minX, maxX, minY, maxY } = limites(reserva, tam)
  const x = lado === 'left' ? minX : lado === 'right' ? maxX : minX + t * (maxX - minX)
  const y = lado === 'top' ? minY : lado === 'bottom' ? maxY : minY + t * (maxY - minY)
  return { x, y }
}
/** Pega el punto al borde más cercano (imán). */
const alImán = (x, y, reserva, tam = TAM) => {
  const { minX, maxX, minY, maxY } = limites(reserva, tam)
  const cx = Math.min(Math.max(x, minX), maxX), cy = Math.min(Math.max(y, minY), maxY)
  const d = { left: cx - minX, right: maxX - cx, top: cy - minY, bottom: maxY - cy }
  const lado = Object.keys(d).reduce((a, b) => (d[a] <= d[b] ? a : b))
  const t = lado === 'left' || lado === 'right' ? (cy - minY) / (maxY - minY) : (cx - minX) / (maxX - minX)
  return { lado, t: Math.min(Math.max(t, 0), 1) }
}
const choca = (a, b) => Math.abs(a.x - b.x) < TAM + SEPARA - 2 && Math.abs(a.y - b.y) < TAM + SEPARA - 2
/** Si b cae sobre a, lo corre a lo largo de su borde hasta que no se toquen. */
const separar = (a, b, pos, reserva) => {
  if (!choca(a, b)) return b
  const { minX, maxX, minY, maxY } = limites(reserva)
  const vertical = pos.lado === 'left' || pos.lado === 'right'
  const paso = TAM + SEPARA
  const prueba = vertical
    ? [{ ...b, y: a.y - paso }, { ...b, y: a.y + paso }]
    : [{ ...b, x: a.x - paso }, { ...b, x: a.x + paso }]
  const dentro = (p) => p.x >= minX && p.x <= maxX && p.y >= minY && p.y <= maxY
  return prueba.find(dentro) ?? prueba[0]
}

function Flotante({ id, tam = TAM, xy, etiqueta, onClick, onSuelta, reserva, className, children }) {
  const [arrastre, setArrastre] = useState(null)       // {x, y} mientras se mueve
  const ref = useRef(null)
  const inicio = useRef(null)

  const abajo = (e) => {
    if (e.button != null && e.button !== 0) return
    const r = ref.current.getBoundingClientRect()
    inicio.current = { dx: e.clientX - r.left, dy: e.clientY - r.top, x0: e.clientX, y0: e.clientY, movido: false }
    ref.current.setPointerCapture?.(e.pointerId)
  }
  const mover = (e) => {
    const s = inicio.current
    if (!s) return
    if (!s.movido && Math.hypot(e.clientX - s.x0, e.clientY - s.y0) < 6) return
    s.movido = true
    setArrastre({ x: e.clientX - s.dx, y: e.clientY - s.dy })
  }
  const arriba = (e) => {
    const s = inicio.current
    inicio.current = null
    if (!s) return
    if (s.movido) {
      const nuevo = alImán(e.clientX - s.dx, e.clientY - s.dy, reserva, tam)
      setArrastre(null); guardar(id, nuevo); onSuelta(nuevo)
    } else { e.preventDefault?.(); onClick?.() }
  }
  const cancelar = () => { inicio.current = null; setArrastre(null) }
  const teclado = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick?.() } }

  const { x, y } = arrastre ?? xy
  return (
    <div ref={ref} role="button" tabIndex={0} aria-label={etiqueta}
         onPointerDown={abajo} onPointerMove={mover} onPointerUp={arriba} onPointerCancel={cancelar} onKeyDown={teclado} onClickCapture={(e) => e.stopPropagation()}
         style={{ transform: `translate3d(${x}px, ${y}px, 0)`, width: tam, height: tam, touchAction: 'none' }}
         className={`fixed left-0 top-0 z-40 grid place-items-center rounded-full select-none cursor-grab shadow-xl
                     ${arrastre ? 'cursor-grabbing scale-110 transition-none' : 'transition-transform duration-300 ease-out'} ${className}`}>
      {children}
    </div>
  )
}

const Svg = ({ children, c = 'h-6 w-6' }) => (
  <svg viewBox="0 0 24 24" className={c} fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">{children}</svg>
)
// Carrito de compras (tienda)
const IconoCarrito = () => (
  <Svg><path d="M3 4h2.2l2.3 11.2a1 1 0 0 0 1 .8h8.6a1 1 0 0 0 1-.8L19.6 8H6.1" /><circle cx="9.5" cy="19.5" r="1.3" /><circle cx="16.5" cy="19.5" r="1.3" /></Svg>
)
// Bolsa de compras con camiseta (ropa)
const IconoRopa = () => (
  <Svg><path d="M6 8h12l1 12H5L6 8Z" /><path d="M9 8V7a3 3 0 0 1 6 0v1" /><path d="M9.2 12.2 11 11a1 1 0 0 0 2 0l1.8 1.2-.6 1.6-.9-.4V17h-2.6v-2.6l-.9.4-.6-1.6Z" /></Svg>
)
const IconoWa = () => (
  <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 20l1.3-4.2A8 8 0 1 1 8.300 18.800L4 20Z" />
    <path d="M9.300 8.800c.3 2.300 2.500 4.800 5.200 5.700l1.200-1.200-1.800-1-.9.700c-.9-.4-1.700-1.200-2.100-2.100l.7-.9-1-1.800-1.300 0Z" fill="currentColor" stroke="none" />
  </svg>
)

export default function BotonesFlotantes({ cantidad = 0, total = '', onPedido, whatsapp, mensaje = '', icono = 'carrito', tema = 'ropa', reserva = 0, lupa = null }) {
  const [posLupa, setPosLupa] = useState(() => leer('lupa', { lado: 'left', t: 1 }))
  const [posWa, setPosWa] = useState(() => leer('wa', { lado: 'right', t: 1 }))
  const [posPed, setPosPed] = useState(() => leer('pedido', { lado: 'right', t: 1 }))
  const [, setAncho] = useState(0)
  useEffect(() => {
    const f = () => setAncho(window.innerWidth + window.innerHeight)
    window.addEventListener('resize', f)
    return () => window.removeEventListener('resize', f)
  }, [])
  const abrirWa = useCallback(() => {
    window.open(`https://wa.me/${whatsapp}${mensaje ? `?text=${encodeURIComponent(mensaje)}` : ''}`, '_blank', 'noopener,noreferrer')
  }, [whatsapp, mensaje])

  const xyWa = aPixeles(posWa, reserva)
  let xyPed = aPixeles(posPed, reserva)
  if (whatsapp) xyPed = separar(xyWa, xyPed, posPed, reserva)    // el carrito nunca tapa a WhatsApp
  let xyLupa = aPixeles(posLupa, reserva, 44)
  if (whatsapp) xyLupa = separar(xyWa, xyLupa, posLupa, reserva)
  if (cantidad > 0) xyLupa = separar(xyPed, xyLupa, posLupa, reserva)
  const verde = tema === 'tienda'
  return (
    <>
      {lupa?.visible && (
        <Flotante id="lupa" tam={44} xy={xyLupa} reserva={reserva} onSuelta={setPosLupa} etiqueta="Buscar un producto" onClick={lupa.onClick}
                  className="bg-cibus-oscuro/90 text-champagne ring-1 ring-white/70 backdrop-blur">
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4.5 4.5" /></svg>
          {lupa.activo && <span className="absolute top-1 right-1 h-2.5 w-2.5 rounded-full bg-champagne ring-2 ring-cibus-oscuro" />}
        </Flotante>
      )}
      {whatsapp && (
        <Flotante id="wa" xy={xyWa} reserva={reserva} onSuelta={setPosWa} etiqueta="Escríbenos por WhatsApp" onClick={abrirWa}
                  className="bg-[#25D366] text-white ring-2 ring-white/70">
          <IconoWa />
        </Flotante>
      )}
      {cantidad > 0 && (
        <Flotante id="pedido" xy={xyPed} reserva={reserva} onSuelta={setPosPed} etiqueta={`Ver pedido: ${cantidad} ${cantidad === 1 ? 'producto' : 'productos'}, ${total}`}
                  onClick={onPedido} className={verde ? 'bg-cibus text-white ring-2 ring-white/80' : 'bg-negro text-champagne ring-2 ring-champagne/60'}>
          {icono === 'ropa' ? <IconoRopa /> : <IconoCarrito />}
          <span className={`absolute -top-1.5 -right-1 min-w-[1.4rem] h-[1.4rem] px-1 grid place-items-center rounded-full text-xs font-bold ${verde ? 'bg-champagne text-negro' : 'bg-champagne text-negro'}`}>{cantidad}</span>
        </Flotante>
      )}
    </>
  )
}
