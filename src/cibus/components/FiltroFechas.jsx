import { useMemo, useState } from 'react'
import { claseInput } from '../lib/estilos'
import BarraFija from './BarraFija'
import { PERIODOS, rangoDe, hoyTexto } from '../lib/periodo'

// Selector de fechas (Hoy / 7 días / 30 días / Rango). Entrega el rango a sus hijos:
// <FiltroFechas>{(rango) => <Lista rango={rango} />}</FiltroFechas>
export default function FiltroFechas({ inicial = 'hoy', children }) {
  const [periodo, setPeriodo] = useState(inicial)
  const [desdeTxt, setDesdeTxt] = useState(hoyTexto())
  const [hastaTxt, setHastaTxt] = useState(hoyTexto())
  const rango = useMemo(() => rangoDe(periodo, desdeTxt, hastaTxt), [periodo, desdeTxt, hastaTxt])

  return (
    <div className="space-y-2">
      <BarraFija>
      <div className="grid grid-cols-4 gap-2">
        {PERIODOS.map(p => (
          <button key={p.id} onClick={() => setPeriodo(p.id)}
            className={`h-10 rounded-xl text-xs font-medium ${
              periodo === p.id ? 'bg-marca text-white' : 'bg-white text-slate-600 shadow-sm'}`}>
            {p.texto}
          </button>
        ))}
      </div>

      </BarraFija>

      {periodo === 'rango' && (
        <div className="grid grid-cols-2 gap-3">
          <label className="space-y-1">
            <span className="text-[11px] text-slate-400">Desde</span>
            <input type="date" value={desdeTxt} max={hastaTxt}
                   onChange={e => setDesdeTxt(e.target.value)} className={claseInput} />
          </label>
          <label className="space-y-1">
            <span className="text-[11px] text-slate-400">Hasta</span>
            <input type="date" value={hastaTxt} min={desdeTxt}
                   onChange={e => setHastaTxt(e.target.value)} className={claseInput} />
          </label>
        </div>
      )}

      {children(rango)}
    </div>
  )
}
