// Botones de filtro en 3 columnas iguales; la última fila se reparte completa
// (así nunca queda un hueco ni un botón suelto).
export default function GrillaChips({ items, activo, onElegir, etiqueta = (c) => c }) {
  const n = items.length
  const resto = n % 3
  return (
    <div className="grid grid-cols-3 gap-2">
      {items.map((c, i) => {
        const ultima = i === n - 1
        const span = ultima && resto !== 0 ? 4 - resto : 1
        return (
          <button key={c} onClick={() => onElegir(c)} style={span > 1 ? { gridColumn: `span ${span}` } : undefined}
            className={`h-10 rounded-xl text-xs font-medium capitalize break-words px-2 ${
              activo === c ? 'bg-marca text-white' : 'bg-white text-slate-600 shadow-sm'}`}>
            {etiqueta(c)}
          </button>
        )
      })}
    </div>
  )
}
