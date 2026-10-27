// "Más vendidos": hasta 4 productos en cuadrícula pareja (2 columnas en celular, 4 en pantallas grandes).
import { dinero } from '../lib/formato'
import SinFoto from './SinFoto'
import TituloSeccion from './TituloSeccion'

export default function MasVendidos({ productos, onVer }) {
  if (productos.length < 3) return null
  return (
    <section aria-label="Más vendidos" className="space-y-3">
      <TituloSeccion>Más vendidos</TituloSeccion>
      <ul className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {productos.map((p, i) => (
          <li key={p.id}>
            <button onClick={() => onVer(p)} className="w-full h-full text-left bg-white rounded-2xl shadow-sm ring-1 ring-oro/40 overflow-hidden active:opacity-80">
              <div className="aspect-[4/3] relative bg-slate-100">
                {p.imagenes?.[0] ? <img src={p.imagenes[0]} alt={p.nombre} loading="lazy" className="w-full h-full object-contain bg-white" /> : <SinFoto />}
                <span className="absolute top-2 left-2 h-6 min-w-6 px-1.5 grid place-items-center rounded-full bg-champagne text-negro text-xs font-bold">{i + 1}</span>
              </div>
              <div className="p-2.5 space-y-0.5">
                <p className="text-sm font-medium leading-tight line-clamp-2 min-h-[2.25rem]">{p.nombre}</p>
                <p className="text-sm font-semibold text-oro-oscuro">{dinero(p.precio_venta)}</p>
              </div>
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}
