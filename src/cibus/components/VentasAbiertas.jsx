// Varias ventas a la vez: mientras un cliente decide o paga, el vendedor atiende a otro.
// La venta de la pantalla es la "actual"; las demás quedan en espera y se retoman con un toque.
import { dinero } from '../lib/formato'

export const MAX_VENTAS = 6

const Info = ({ v }) => (
  <>
    <span className="block text-sm font-semibold leading-tight break-words">{v.label}</span>
    <span className="block text-xs opacity-70 leading-tight">{v.productos === 0 ? 'Vacía' : `${v.productos} prod. · ${dinero(v.total)}`}</span>
  </>
)

export default function VentasAbiertas({ actual, espera, puedeNueva, onNueva, onRetomar, onDescartar }) {
  const total = espera.length + 1
  return (
    <section aria-label="Ventas abiertas" className="rounded-2xl bg-white shadow-sm p-3 space-y-3">
      <div className="grid grid-cols-[1fr_auto] gap-3 items-center">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Ventas abiertas ({total})</p>
        <p className="text-[11px] text-slate-400">Toca una para atenderla</p>
      </div>
      <div className="grid grid-cols-2 gap-2 [&>*:last-child:nth-child(odd)]:col-span-2">
        <div className="min-h-14 rounded-xl bg-negro text-champagne px-3 py-2 grid content-center ring-1 ring-champagne/40" aria-current="true">
          <Info v={actual} />
        </div>
        {espera.map(v => (
          <div key={v.id} className="min-h-14 rounded-xl bg-slate-100 grid grid-cols-[1fr_auto] items-stretch overflow-hidden">
            <button onClick={() => onRetomar(v.id)} className="px-3 py-2 text-left grid content-center min-w-0 text-slate-700 active:bg-slate-200">
              <Info v={v} />
            </button>
            <button onClick={() => onDescartar(v.id)} aria-label={`Descartar ${v.label}`} className="w-10 text-slate-400 active:bg-red-50 active:text-red-500">✕</button>
          </div>
        ))}
      </div>
      <button onClick={onNueva} disabled={!puedeNueva}
        className="w-full h-11 rounded-xl bg-champagne/40 ring-1 ring-oro/40 text-sm font-semibold text-negro active:opacity-80 disabled:opacity-40">
        {total >= MAX_VENTAS ? `Máximo ${MAX_VENTAS} ventas a la vez` : '＋ Atender a otro cliente'}
      </button>
    </section>
  )
}
