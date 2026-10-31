// Cinco estrellas para calificar (1 a 5). Cuadrícula pareja, objetivos grandes para el celular.
export default function Estrellas({ valor, onElegir, deshabilitado = false }) {
  return (
    <div role="radiogroup" aria-label="Calificación" className="grid grid-cols-5 gap-1">
      {[1, 2, 3, 4, 5].map(n => (
        <button key={n} type="button" role="radio" aria-checked={valor === n} disabled={deshabilitado} onClick={() => onElegir(n)}
          className={`min-h-12 rounded-xl text-2xl ${n <= (valor ?? 0) ? 'bg-champagne text-negro' : 'bg-slate-100 text-slate-400'} disabled:opacity-50`}>★</button>
      ))}
    </div>
  )
}
