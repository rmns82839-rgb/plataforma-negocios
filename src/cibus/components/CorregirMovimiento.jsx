import { useState } from 'react'
import { usePersistido, borrarBorradores } from '../lib/usePersistido'
import { supabase } from '../lib/supabase'
import { dinero, aNumero, fechaSolo } from '../lib/formato'
import { claseInput } from '../lib/estilos'
import { confirmar } from '../lib/confirmar'
import Modal, { Campo } from './Modal'

const aTexto = (iso) => (iso ? String(iso).slice(0, 10) : '')

// Solo el dueño: corregir un saldo anterior, préstamo rápido o abono digitado con un valor equivocado.
export default function CorregirMovimiento({ mov, titulo, onCerrar, onHecho }) {
  const base = `corregir:${mov.id}:`           // lo escrito sobrevive a recargar la página
  const [valor, setValor] = usePersistido(base + 'valor', String(Math.round(Number(mov.monto))))
  const [fecha, setFecha] = usePersistido(base + 'fecha', '')
  const [nota, setNota] = usePersistido(base + 'nota', mov.concepto === 'prestamo' && mov.nota !== 'Préstamo rápido' ? (mov.nota ?? '') : '')
  const [limite, setLimite] = usePersistido(base + 'limite', aTexto(mov.fecha_limite))
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')
  const monto = Math.round(aNumero(valor))
  const cambio = monto !== Math.round(Number(mov.monto))
  const esPrestamo = mov.concepto === 'prestamo'
  const cerrar = () => { borrarBorradores(base); onCerrar?.() }

  const guardar = async () => {
    if (monto <= 0) return setError('Escribe el valor correcto')
    setGuardando(true); setError('')
    const { error: err } = await supabase.rpc('corregir_movimiento_fiado', {
      p_id: mov.id, p_monto: monto, p_fecha: fecha || null,
      p_nota: esPrestamo ? (nota.trim() || 'Préstamo rápido') : null,
      p_fecha_limite: mov.tipo === 'cargo' ? (limite || null) : null,
    })
    setGuardando(false)
    if (err) {
      return setError(/corregir_movimiento_fiado|schema cache/i.test(err.message) ? 'Falta correr migracion-v32.sql en Supabase.' : err.message)
    }
    borrarBorradores(base); onHecho?.()
  }

  const borrar = async () => {
    if (!(await confirmar({ titulo: '¿Borrar este movimiento?', texto: 'Se quita de la cuenta del cliente. Queda anotado en la auditoría. No se puede deshacer.', si: 'Sí, borrar' }))) return
    setGuardando(true); setError('')
    const { error: err } = await supabase.from('fiado_movimientos').delete().eq('id', mov.id)
    setGuardando(false)
    if (err) return setError(err.message)
    borrarBorradores(base); onHecho?.()
  }

  return (
    <Modal titulo={`Corregir · ${titulo}`} onCerrar={cerrar}>
      <p className="text-xs text-slate-400">
        Hoy dice {dinero(mov.monto)} del {fechaSolo(mov.fecha)}. La corrección queda en la Auditoría con el valor anterior.
      </p>
      <Campo etiqueta="Valor correcto">
        <input value={valor} onChange={e => setValor(e.target.value.replace(/[^\d]/g, ''))} autoFocus
               inputMode="numeric" className={claseInput} />
      </Campo>
      {cambio && monto > 0 && (
        <p className="text-sm rounded-lg px-3 py-2 bg-champagne/30 text-negro">
          {dinero(mov.monto)} → <b>{dinero(monto)}</b> ({monto > Number(mov.monto) ? 'sube' : 'baja'} {dinero(Math.abs(monto - Number(mov.monto)))})
        </p>
      )}
      <div className="grid grid-cols-2 gap-3">
        <Campo etiqueta="Fecha (si estaba mal)">
          <input type="date" value={fecha} onChange={e => setFecha(e.target.value)} className={claseInput} />
        </Campo>
        {mov.tipo === 'cargo' && (
          <Campo etiqueta="Fecha límite">
            <input type="date" value={limite} onChange={e => setLimite(e.target.value)} className={claseInput} />
          </Campo>
        )}
      </div>
      {esPrestamo && (
        <Campo etiqueta="Nota">
          <input value={nota} onChange={e => setNota(e.target.value)} maxLength={120} className={claseInput} />
        </Campo>
      )}
      {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
      <div className="grid grid-cols-2 gap-3">
        <button onClick={cerrar}
          className="h-12 rounded-xl bg-slate-100 text-slate-600 font-medium active:bg-slate-200">Volver</button>
        <button onClick={guardar} disabled={guardando || monto <= 0}
          className="h-12 rounded-xl bg-marca text-white font-semibold disabled:opacity-40 active:bg-marca-oscuro">
          {guardando ? 'Guardando…' : 'Guardar corrección'}
        </button>
      </div>
      <button onClick={borrar} disabled={guardando}
        className="w-full h-10 rounded-xl text-red-600 text-sm font-medium disabled:opacity-40 active:bg-red-50">
        Borrar este movimiento
      </button>
    </Modal>
  )
}
