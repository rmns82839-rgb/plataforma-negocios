// Aviso que sale cuando se recuperó lo que se estaba escribiendo antes de recargar.
export default function AvisoBorrador({ onNuevo, texto = 'Recuperamos lo que estabas escribiendo.' }) {
  return (
    <div role="status" className="grid grid-cols-[1fr_auto] gap-2 items-center rounded-xl bg-champagne/25 ring-1 ring-champagne/50 px-3 py-2">
      <p className="text-xs text-slate-700">{texto}</p>
      <button type="button" onClick={onNuevo} className="h-8 px-3 rounded-lg bg-white text-xs font-medium text-slate-600 ring-1 ring-slate-200 active:bg-slate-100">
        Empezar de nuevo
      </button>
    </div>
  )
}
