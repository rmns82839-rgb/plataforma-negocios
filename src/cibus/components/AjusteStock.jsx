import { useState } from 'react'
import { usePersistido, borrarBorradores } from '../lib/usePersistido'
import { supabase } from '../lib/supabase'
import { aCantidad, numero } from '../lib/formato'
import { claseInput } from '../lib/estilos'
import Modal, { Campo } from './Modal'
import { confirmar } from '../lib/confirmar'

// Ajuste por conteo: el dueño dice cuánto hay REALMENTE y queda en el historial.
export default function AjusteStock({ producto, onGuardado, onCerrar }) {
  const base = `ajuste:${producto.id}:`          // lo escrito sobrevive a recargar la página
  const [real, setReal] = usePersistido(base + 'real', '')
  const [motivo, setMotivo] = usePersistido(base + 'motivo', '')
  const cerrar = () => { borrarBorradores(base); onCerrar?.() }
  const [error, setError] = useState('')
  const [guardando, setGuardando] = useState(false)

  const hay = Number(producto.stock)
  const dif = aCantidad(real) - hay

  const guardar = async () => {
    if (real.trim() === '') return setError('Escribe cuántas unidades hay realmente')
    if (dif < 0 && !(await confirmar({ titulo: `¿Descontar ${numero(-dif)} del inventario?`, texto: `${producto.nombre}: de ${numero(hay)} pasa a ${numero(aCantidad(real))}. Queda en el historial.`, si: 'Sí, ajustar' }))) return
    setGuardando(true); setError('')
    const { error: err } = await supabase.rpc('ajustar_stock', {
      p_producto_id: producto.id, p_stock_real: aCantidad(real), p_motivo: motivo,
    })
    setGuardando(false)
    if (err) return setError(err.message)
    borrarBorradores(base)
    onGuardado?.()
  }

  return (
    <Modal titulo="Ajustar inventario" onCerrar={cerrar}>
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl bg-slate-50 p-3">
          <p className="text-[11px] text-slate-400">{producto.nombre}</p>
          <p className="text-xs text-slate-400 mt-1">En el sistema</p>
          <p className="text-xl font-bold">{numero(hay)}</p>
        </div>
        <div className="rounded-xl bg-slate-50 p-3 grid content-end">
          <p className="text-xs text-slate-400">Diferencia</p>
          <p className={`text-xl font-bold ${
            real.trim() === '' || dif === 0 ? 'text-slate-300' : dif > 0 ? 'text-marca' : 'text-red-500'}`}>
            {real.trim() === '' ? '—' : `${dif > 0 ? '+' : ''}${numero(dif)}`}
          </p>
        </div>
      </div>
      <Campo etiqueta="Cantidad real (la que contaste)">
        <input autoFocus value={real} onChange={e => setReal(e.target.value)}
               inputMode="decimal" className={claseInput} />
      </Campo>
      <Campo etiqueta="Motivo (opcional)">
        <input value={motivo} onChange={e => setMotivo(e.target.value)}
               placeholder="Conteo, merma, daño…" className={claseInput} />
      </Campo>
      {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
      <button onClick={guardar} disabled={guardando}
        className="w-full h-12 rounded-xl bg-marca text-white font-semibold disabled:opacity-40 active:bg-marca-oscuro">
        {guardando ? 'Guardando…' : 'Guardar ajuste'}
      </button>
    </Modal>
  )
}
