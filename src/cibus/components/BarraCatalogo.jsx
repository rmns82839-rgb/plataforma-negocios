// Barra fija inferior de los catálogos públicos: Inicio, Categorías, Ofertas y Contacto.
// Incluye también el aviso "agregado" (seguir viendo / ver pedido) y la fila de sugeridos.
import { useState } from 'react'
import Modal from './Modal'
import { dinero } from '../lib/formato'
import SinFoto from './SinFoto'

const Svg = ({ children }) => (
  <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">{children}</svg>
)
const ICONOS = {
  inicio: <Svg><path d="M4 11 12 4l8 7" /><path d="M6 10v9h12v-9" /><path d="M10 19v-5h4v5" /></Svg>,
  categorias: <Svg><rect x="4" y="4" width="6.5" height="6.5" rx="1.5" /><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.5" /><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.5" /><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.5" /></Svg>,
  ofertas: <Svg><path d="M3.5 12.5 12 4h7.5v7.5L11 20Z" /><circle cx="15.5" cy="8.5" r="1.2" /></Svg>,
  opiniones: <Svg><path d="M12 4.5l2.4 4.9 5.4.8-3.9 3.8.9 5.4L12 16.9l-4.8 2.5.9-5.4-3.9-3.8 5.4-.8Z" /></Svg>,
  contacto: <Svg><path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11Z" /><circle cx="12" cy="10" r="2.3" /></Svg>,
}

/**
 * secciones: [{ titulo, items, activo, onElegir, etiqueta?, minimo? }]  (lo que se puede filtrar)
 * tema: 'ropa' (negro y oro) | 'tienda' (morado Cibus)
 */
export default function BarraCatalogo({ tema = 'ropa', secciones = [], ofertas = 0, filtrando = false, onInicio, onOfertas, onContacto, onOpiniones }) {
  const [abierta, setAbierta] = useState(false)
  const verde = tema === 'tienda'
  const items = [
    { id: 'inicio', texto: 'Inicio', on: onInicio },
    { id: 'categorias', texto: 'Categorías', on: () => setAbierta(true), marca: filtrando },
    { id: 'ofertas', texto: 'Ofertas', on: onOfertas, n: ofertas },
    ...(onOpiniones ? [{ id: 'opiniones', texto: 'Opiniones', on: onOpiniones }] : []),
    { id: 'contacto', texto: 'Contacto', on: onContacto },
  ]
  return (
    <>
      <nav aria-label="Navegación del catálogo" className="fixed inset-x-0 bottom-0 z-40 px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pointer-events-none flex justify-center">
        <div className={`pointer-events-auto grid ${items.length === 5 ? 'grid-cols-5' : 'grid-cols-4'} w-full max-w-md rounded-2xl shadow-2xl ring-1 ${verde ? 'bg-[#2A0B47] ring-white/15' : 'bg-negro ring-champagne/25'}`}>
          {items.map(it => (
            <button key={it.id} onClick={it.on} className="relative h-16 grid place-items-center content-center gap-0.5 text-champagne active:opacity-70">
              <span className="relative">
                {ICONOS[it.id]}
                {it.n > 0 && <span className="absolute -top-1.5 -right-2.5 min-w-[1.1rem] h-[1.1rem] px-1 grid place-items-center rounded-full bg-champagne text-negro text-[10px] font-bold">{it.n}</span>}
                {it.marca && <span className="absolute -top-0.5 -right-1 h-2 w-2 rounded-full bg-champagne ring-2 ring-[#2A0B47]" />}
              </span>
              <span className="text-[10px] tracking-wide">{it.texto}</span>
            </button>
          ))}
        </div>
      </nav>

      {abierta && (
        <Modal titulo="Explorar" onCerrar={() => setAbierta(false)}>
          {secciones.filter(s => s.items.length >= (s.minimo ?? 2)).map(s => (
            <div key={s.titulo} className="space-y-2">
              <p className="text-xs font-medium text-slate-500">{s.titulo}</p>
              <div className="grid grid-cols-2 gap-2">
                {s.items.map((c, i) => (
                  <button key={c} onClick={() => { s.onElegir(c); setAbierta(false); window.scrollTo({ top: 0, behavior: 'smooth' }) }}
                    style={i === s.items.length - 1 && s.items.length % 2 === 1 ? { gridColumn: 'span 2' } : undefined}
                    className={`h-12 rounded-xl text-sm font-medium capitalize truncate px-3 ${
                      s.activo === c ? (verde ? 'bg-cibus text-white' : 'bg-negro text-champagne') : 'bg-slate-100 text-slate-700 active:bg-slate-200'}`}>
                    {(s.etiqueta ?? ((x) => x))(c)}
                  </button>
                ))}
              </div>
            </div>
          ))}
          <button onClick={() => setAbierta(false)} className="w-full h-12 rounded-xl bg-slate-100 text-slate-600 font-medium">← Volver</button>
        </Modal>
      )}
    </>
  )
}

/** Aviso al agregar al pedido: invita a seguir mirando. */
export function AvisoAgregado({ aviso, tema, onSeguir, onVer }) {
  if (!aviso) return null
  const verde = tema === 'tienda'
  return (
    <div className="fixed inset-x-0 bottom-[calc(5.75rem+env(safe-area-inset-bottom))] z-40 px-3 flex justify-center pointer-events-none">
      <div role="status" className={`pointer-events-auto w-full max-w-md rounded-2xl px-4 py-3 shadow-2xl ring-1 grid grid-cols-[1fr_auto_auto] gap-2 items-center ${verde ? 'bg-cibus ring-white/20 text-white' : 'bg-negro ring-champagne/30 text-hueso'}`}>
        <span className="min-w-0 text-sm"><span className="block font-semibold truncate">✓ {aviso} agregado</span><span className="block text-xs opacity-70">¿Quieres seguir mirando?</span></span>
        <button onClick={onSeguir} className="h-10 px-3 rounded-xl bg-white/10 text-xs font-medium">Seguir</button>
        <button onClick={onVer} className="h-10 px-3 rounded-xl bg-champagne text-negro text-xs font-semibold">Ver pedido</button>
      </div>
    </div>
  )
}

/** "Sigue mirando": productos parecidos dentro del detalle. items: [{ id, nombre, imagen, precio }] (cantidad par: 2 o 4) */
export function Sugeridos({ items, onVer }) {
  const n = items.length >= 4 ? 4 : items.length >= 2 ? 2 : 0
  if (n === 0) return null
  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-slate-500">Sigue mirando</p>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {items.slice(0, n).map(p => (
          <button key={p.id} onClick={() => onVer(p.id)} className="text-left rounded-xl bg-slate-50 overflow-hidden active:opacity-80">
            <div className="aspect-square bg-slate-100 relative">{p.imagen ? <img src={p.imagen} alt="" loading="lazy" className="w-full h-full object-cover" /> : <SinFoto />}</div>
            <div className="p-2"><p className="text-xs font-medium truncate">{p.nombre}</p><p className="text-xs text-oro-oscuro font-semibold">{dinero(p.precio)}</p></div>
          </button>
        ))}
      </div>
    </div>
  )
}
