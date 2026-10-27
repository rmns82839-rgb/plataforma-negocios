// Siluetas grises que se llenan mientras cargan los productos (en lugar de una pantalla vacía).
export default function EsqueletoProductos({ n = 8 }) {
  return (
    <div role="status" aria-label="Cargando productos" className="space-y-4">
      <div className="flex gap-3 overflow-hidden -mx-4 px-4">
        {[0, 1, 2].map(i => <div key={i} className="esqueleto shrink-0 w-[42%] aspect-[4/5] rounded-3xl" />)}
      </div>
      <ul className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 lg:gap-5">
        {Array.from({ length: n }).map((_, i) => (
          <li key={i} className="rounded-3xl bg-white/60 ring-1 ring-negro/5 overflow-hidden">
            <div className="esqueleto aspect-square" />
            <div className="p-3 space-y-2"><div className="esqueleto h-3 w-3/4 rounded-full" /><div className="esqueleto h-3 w-1/2 rounded-full" /><div className="esqueleto h-9 rounded-xl mt-2" /></div>
          </li>
        ))}
      </ul>
    </div>
  )
}
