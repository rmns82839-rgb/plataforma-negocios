// Tarjeta pública "Hoy cocina…": el menú del día y un botón para agregar los ingredientes que la tienda sí vende.
import { useMemo } from 'react'
import { TarjetaPlato } from './MenuDelDia'
import { cruzar } from '../lib/menuIngredientes'

export default function MenuHoyTienda({ menu, productos, onAgregarTodos }) {
  const { hay, faltan } = useMemo(() => cruzar(menu.ingredientes, productos), [menu, productos])
  return (
    <section className="max-w-2xl mx-auto w-full rounded-2xl overflow-hidden bg-white shadow-sm ring-1 ring-oro/40">
      <TarjetaPlato menu={menu} className="h-40" />
      <div className="p-4 space-y-2">
        <p className="text-xs font-bold tracking-wide text-cibus">HOY COCINA…</p>
        <h2 className="text-xl font-bold text-cibus-oscuro leading-snug">{menu.nombre}</h2>
        {menu.descripcion && <p className="text-base text-slate-600">{menu.descripcion}</p>}
        {hay.length > 0 && (
          <>
            <p className="text-sm text-slate-500">Lo tenemos: {hay.map(x => x.ing.n.toLowerCase()).join(', ')}.{faltan.length > 0 && ` (Aparte: ${faltan.map(x => x.n.toLowerCase()).join(', ')}.)`}</p>
            <button onClick={() => onAgregarTodos(hay.map(x => x.producto))} className="w-full min-h-14 rounded-xl bg-cibus text-white text-lg font-bold active:opacity-80">Agregar los ingredientes ({hay.length})</button>
          </>
        )}
      </div>
    </section>
  )
}
