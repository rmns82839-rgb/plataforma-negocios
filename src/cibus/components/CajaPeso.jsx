// Panel de pesaje de una línea: escribe lo que marca la balanza (0,57 kg), toca una fracción
// (¼ ½ ¾ 1) o dice cuánto dinero quiere el cliente ($3.000 de yuca) y el sistema saca el peso.
import { useState } from 'react'
import { dinero, numero, aNumero } from '../lib/formato'
import { claseInput } from '../lib/estilos'
import { precioDe, netoLinea } from '../lib/venta'
import { FRACCIONES, cantidadPorValor, textoCantidad, enGramos } from '../lib/pesaje'

export default function CajaPeso({ l, onEscribir, onCerrar }) {
  const [valor, setValor] = useState('')
  const p = l.producto
  const precio = precioDe(l)
  const g = enGramos(p.unidad, l.cantidad)

  const porPeso = (texto) => { setValor(''); onEscribir(p.id, texto) }
  const porValor = (texto) => { setValor(texto); onEscribir(p.id, textoCantidad(cantidadPorValor(aNumero(texto), precio))) }
  // Pasar de un campo al otro del panel no cierra la cantidad (si estuviera en 0 quitaría la línea)
  const salir = (e) => { if (!e.currentTarget.closest('[data-peso]')?.contains(e.relatedTarget)) onCerrar(p.id) }
  const fraccion = (c) => { setValor(''); onEscribir(p.id, textoCantidad(c)); onCerrar(p.id) }

  return (
    <div data-peso className="col-span-2 rounded-2xl bg-hueso p-3 lg:p-4 space-y-3 ring-1 ring-oro/20">
      <div className="grid grid-cols-2 gap-3">
        <label className="space-y-1">
          <span className="text-xs font-medium text-slate-500">Peso ({p.unidad})</span>
          <input value={l.txt ?? numero(l.cantidad)} inputMode="decimal" placeholder="0,57"
                 aria-label={`Peso de ${p.nombre}`}
                 onChange={e => porPeso(e.target.value)} onFocus={e => e.target.select()}
                 onBlur={salir} className={claseInput} />
        </label>
        <label className="space-y-1">
          <span className="text-xs font-medium text-slate-500">O por valor ($) · ej. $3.000 de yuca</span>
          <input value={valor} inputMode="numeric" placeholder="3.000" aria-label={`Valor de ${p.nombre}`}
                 onChange={e => porValor(e.target.value)} onFocus={e => e.target.select()}
                 onBlur={salir} className={claseInput} />
        </label>
      </div>
      <div className="grid grid-cols-4 gap-2">
        {FRACCIONES.map(f => (
          <button key={f.cantidad} onClick={() => fraccion(f.cantidad)}
            className={`h-10 rounded-xl text-sm font-semibold ring-1 ${
              l.cantidad === f.cantidad ? 'bg-negro text-champagne ring-negro' : 'bg-white text-slate-600 ring-slate-200 active:bg-slate-50'}`}>
            {f.texto}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-4 gap-2">
        {[1000, 2000, 3000, 5000].map(v => (
          <button key={v} onClick={() => { porValor(String(v)); onCerrar(p.id) }}
            className={`h-10 rounded-xl text-xs font-semibold ring-1 ${
              aNumero(valor) === v ? 'bg-negro text-champagne ring-negro' : 'bg-white text-slate-600 ring-slate-200 active:bg-slate-50'}`}>
            {dinero(v)}
          </button>
        ))}
      </div>
      <p className="text-sm text-slate-600 tabular-nums" aria-live="polite">
        {numero(l.cantidad)} {p.unidad}{g && ` (${g})`} × {dinero(precio)} = <b className="text-negro">{dinero(netoLinea(l))}</b>
      </p>
    </div>
  )
}
