// "Pídelo otra vez": los 3 productos que más repite el cliente, con un toque para agregarlos.
import { dinero } from '../lib/formato'
import SinFoto from './SinFoto'
import TituloSeccion from './TituloSeccion'

export default function PideloOtraVez({ productos, lineas, onAgregar, onCambiar, onVer, porPeso }) {
  if (!productos.length) return null
  return (
    <section aria-label="Pídelo otra vez" className="space-y-3">
      <TituloSeccion>Pídelo otra vez</TituloSeccion>
      <ul className="grid grid-cols-3 gap-2.5">
        {productos.map(p => {
          const l = lineas.get(p.id)
          return (
            <li key={p.id} className="flex flex-col rounded-2xl bg-white shadow-sm ring-1 ring-oro/40 overflow-hidden">
              <button onClick={() => onVer(p)} className="text-left active:opacity-80">
                <div className="aspect-square bg-white">{p.imagenes?.[0] ? <img src={p.imagenes[0]} alt={p.nombre} loading="lazy" className="w-full h-full object-contain" /> : <SinFoto />}</div>
                <div className="p-2 space-y-0.5">
                  <p className="text-xs font-medium leading-tight min-h-[2rem]">{p.nombre}</p>
                  <p className="text-xs font-semibold text-oro-oscuro">{dinero(p.precio_venta)}</p>
                </div>
              </button>
              <div className="p-1.5 pt-0 mt-auto">
                {l ? (
                  <div className="grid grid-cols-[2rem_1fr_2rem] items-center h-9 rounded-lg bg-cibus/10 ring-1 ring-cibus/30">
                    <button onClick={() => onCambiar(p.id, -1)} aria-label="Quitar uno" className="h-9 text-lg text-cibus">−</button>
                    <span key={l.cantidad} className="pop-cantidad text-center text-xs font-bold text-cibus-oscuro">{l.cantidad}</span>
                    <button onClick={() => onCambiar(p.id, 1)} aria-label="Agregar uno más" className="h-9 text-lg text-cibus">+</button>
                  </div>
                ) : (
                  <button onClick={() => (porPeso(p) ? onVer(p) : onAgregar(p))} className="w-full h-9 rounded-lg bg-cibus text-white text-xs font-semibold active:opacity-80">+ Agregar</button>
                )}
              </div>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
