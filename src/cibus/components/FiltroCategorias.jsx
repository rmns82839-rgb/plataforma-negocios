// Categorías: en el celular 3 columnas iguales; en PC una fila de botones del mismo ancho.
import GrillaChips from './GrillaChips'

export default function FiltroCategorias({ items, activo, onElegir, etiqueta = (c) => c, minimo = 3, tema = 'ropa' }) {
  if (items.length < minimo) return null
  return (
    <>
      <div className="lg:hidden"><GrillaChips items={items} activo={activo} onElegir={onElegir} etiqueta={etiqueta} /></div>
      <div className="hidden lg:flex lg:flex-wrap gap-2">
        {items.map(c => (
          <button key={c} onClick={() => onElegir(c)}
            className={`h-10 w-32 rounded-full text-xs font-medium capitalize break-words px-3 transition ${
              activo === c ? (tema === 'tienda' ? 'bg-cibus text-white' : 'bg-negro text-champagne') : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:ring-oro'}`}>
            {etiqueta(c)}
          </button>
        ))}
      </div>
    </>
  )
}
