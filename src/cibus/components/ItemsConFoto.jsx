// Productos de un pedido o venta: foto grande, nombre completo y cantidad exacta (igual que «Reversar una venta»).
import Miniatura from './Miniatura'
import { dinero } from '../lib/formato'
import { cantidadTexto } from '../lib/cantidadVenta'

/** items: [{ id?, nombre, cantidad, unidad, precio, total, imagenes, nota?, descuento? }] */
export default function ItemsConFoto({ items }) {
  return (
    <ul className="space-y-2">
      {items.map((it, i) => {
        const c = cantidadTexto(it)
        return (
          <li key={it.id ?? i} className="grid grid-cols-[auto_1fr_auto] items-center gap-3">
            <Miniatura producto={{ nombre: it.nombre, imagenes: it.imagenes }} tam="h-12 w-12" />
            <div className="min-w-0">
              <p className="text-sm font-medium text-slate-800 break-words leading-snug">{it.nombre}</p>
              <p className="text-xs text-slate-500">
                <span className="font-semibold text-slate-700">{c.principal}</span>{c.extra ? ` · ${c.extra}` : ''} · a {dinero(it.precio)}
              </p>
              {it.nota ? <p className="text-xs text-oro-oscuro break-words">{it.nota}</p> : null}
              {Number(it.descuento) > 0 && <p className="text-xs text-marca">Descuento − {dinero(it.descuento)}</p>}
            </div>
            <p className="text-sm font-semibold tabular-nums text-slate-700">{dinero(it.total)}</p>
          </li>
        )
      })}
    </ul>
  )
}
