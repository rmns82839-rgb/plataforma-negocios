import { useState } from 'react'
import { usePersistido, borrarBorradores } from '../lib/usePersistido'
import { supabase } from '../lib/supabase'
import { dinero, aNumero } from '../lib/formato'
import { claseInput } from '../lib/estilos'
import { MOTIVOS_RETIRO, MOTIVOS_INGRESO } from '../lib/cajaMov'
import Modal, { Campo } from './Modal'
import { encolarInsert } from '../lib/sincronizar'
import { esErrorDeRed } from '../lib/offline'

const RAPIDOS = [20000, 50000, 100000, 200000, 500000, 1000000]
const BASE = 'retiro-caja:'

// Retiro o ingreso de efectivo de la caja (no es venta ni gasto). Lo escrito sobrevive a recargar la página.
export default function RetiroCaja({ onCerrar, onHecho }) {
  const [tipo, setTipo] = usePersistido(BASE + 'tipo', 'retiro')
  const [motivo, setMotivo] = usePersistido(BASE + 'motivo', 'dueno')
  const [valor, setValor] = usePersistido(BASE + 'valor', '')
  const [nota, setNota] = usePersistido(BASE + 'nota', '')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')
  const monto = Math.round(aNumero(valor))
  const motivos = tipo === 'retiro' ? MOTIVOS_RETIRO : MOTIVOS_INGRESO

  const cambiarTipo = (t) => { setTipo(t); setMotivo(t === 'retiro' ? 'dueno' : 'base') }
  const cerrar = () => { borrarBorradores(BASE); onCerrar?.() }

  const guardar = async () => {
    if (monto <= 0) return setError('Escribe cuánto es')
    setGuardando(true); setError('')
    const fila = { tipo, motivo, monto, nota: nota.trim() || null }
    let { error: err } = await supabase.from('caja_movimientos').insert(fila)
    let pendiente = false
    if (err && esErrorDeRed(err)) {       // sin internet: queda guardado en este equipo y se sube solo
      await encolarInsert('caja_movimientos', { ...fila, fecha: new Date().toISOString() }, `${tipo === 'retiro' ? 'Retiro' : 'Ingreso'} de caja ${dinero(monto)}`)
      err = null; pendiente = true
    }
    setGuardando(false)
    if (err) {
      return setError(/caja_movimientos|schema cache|does not exist/i.test(err.message)
        ? 'Falta correr migracion-v31.sql en Supabase para registrar retiros de caja.' : err.message)
    }
    borrarBorradores(BASE)
    onHecho?.({ tipo, motivo, monto, pendiente })
  }

  return (
    <Modal titulo="Retiro de caja" onCerrar={cerrar}>
      <p className="text-xs text-slate-400">Efectivo que sale o entra a la caja sin ser una venta. No cuenta como gasto: solo cuadra el cierre.</p>

      <div className="grid grid-cols-2 gap-2">
        {[['retiro', 'Sale plata'], ['ingreso', 'Entra plata']].map(([id, t]) => (
          <button key={id} onClick={() => cambiarTipo(id)} aria-pressed={tipo === id}
            className={`h-11 rounded-xl text-sm font-semibold ${tipo === id ? 'bg-negro text-champagne' : 'bg-slate-100 text-slate-600'}`}>{t}</button>
        ))}
      </div>

      <Campo etiqueta="Motivo">
        <select value={motivo} onChange={e => setMotivo(e.target.value)} className={claseInput}>
          {motivos.map(m => <option key={m.id} value={m.id}>{m.texto}</option>)}
        </select>
      </Campo>

      <div className="space-y-2">
        <p className="text-xs font-medium text-slate-500">¿Cuánto?</p>
        <div className="grid grid-cols-3 gap-2">
          {RAPIDOS.map(v => (
            <button key={v} onClick={() => setValor(String(v))}
              className={`h-11 rounded-xl text-sm font-medium ${monto === v ? 'bg-negro text-champagne' : 'bg-slate-100 text-slate-600'}`}>
              {dinero(v)}
            </button>
          ))}
        </div>
        <input value={valor} onChange={e => setValor(e.target.value.replace(/[^\d]/g, ''))}
               inputMode="numeric" placeholder="Otro valor" className={claseInput} />
      </div>

      <Campo etiqueta="Nota (opcional)">
        <input value={nota} onChange={e => setNota(e.target.value)} maxLength={160}
               placeholder="Ej. consignación Bancolombia" className={claseInput} />
      </Campo>

      {monto > 0 && (
        <p className="text-xs text-slate-500 bg-slate-50 rounded-lg px-3 py-2">
          {tipo === 'retiro' ? `Sale ${dinero(monto)} de la caja` : `Entran ${dinero(monto)} a la caja`}: el cierre de caja lo tendrá en cuenta.
        </p>
      )}
      {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}

      <div className="grid grid-cols-2 gap-3">
        <button onClick={cerrar}
          className="h-12 rounded-xl bg-slate-100 text-slate-600 font-medium active:bg-slate-200">Volver</button>
        <button onClick={guardar} disabled={guardando || monto <= 0}
          className="h-12 rounded-xl bg-marca text-white font-semibold disabled:opacity-40 active:bg-marca-oscuro">
          {guardando ? 'Guardando…' : tipo === 'retiro' ? 'Registrar retiro' : 'Registrar ingreso'}
        </button>
      </div>
    </Modal>
  )
}
