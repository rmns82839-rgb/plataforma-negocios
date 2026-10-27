import { useCallback, useEffect, useMemo, useState } from 'react'
import { usePersistido, TREINTA_MIN } from '../lib/usePersistido'
import { supabase } from '../lib/supabase'
import { dinero, fechaHora } from '../lib/formato'
import { coincide } from '../lib/buscar'
import { claseInput } from '../lib/estilos'
import { useDueno } from '../context/rol'
import { confirmar } from '../lib/confirmar'
import { MOTIVOS_RETIRO, textoMotivo, totalesCaja } from '../lib/cajaMov'
import RetiroCaja from './RetiroCaja'
import BarraFija from './BarraFija'

const FILTROS = [{ id: 'todos', texto: 'Todos' }, { id: 'retiro', texto: 'Retiros' }, { id: 'ingreso', texto: 'Ingresos' }]

// Lista de retiros e ingresos de caja del periodo, con filtro por tipo y por motivo.
export default function CajaMovimientos({ rango }) {
  const dueno = useDueno()
  const [filas, setFilas] = useState([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [texto, setTexto] = useState('')
  const [tipo, setTipo] = usePersistido('cajamov:tipo', 'todos', true, TREINTA_MIN)
  const [motivo, setMotivo] = usePersistido('cajamov:motivo', 'todos', true, TREINTA_MIN)
  const [nuevo, setNuevo] = usePersistido('cajamov:nuevo', false, true, TREINTA_MIN)

  const cargar = useCallback(async () => {
    setCargando(true); setError('')
    let q = supabase.from('caja_movimientos').select('*').gte('fecha', rango.desde)
    if (rango.hasta) q = q.lt('fecha', rango.hasta)
    const { data, error: err } = await q.order('fecha', { ascending: false }).range(0, 999)
    if (err) setError(/caja_movimientos|schema cache|does not exist/i.test(err.message) ? 'Falta correr migracion-v31.sql en Supabase.' : err.message)
    setFilas(data ?? [])
    setCargando(false)
  }, [rango])
  useEffect(() => { cargar() }, [cargar])

  const visibles = useMemo(() => filas.filter(f =>
    (tipo === 'todos' || f.tipo === tipo) && (motivo === 'todos' || f.motivo === motivo) &&
    coincide([textoMotivo(f.motivo), f.nota], texto)), [filas, tipo, motivo, texto])
  const { retiros, ingresos } = totalesCaja(visibles)

  const borrar = async (f) => {
    if (!(await confirmar({ titulo: '¿Borrar este movimiento?', texto: 'El cierre de caja dejará de contarlo. Queda anotado en la auditoría.', si: 'Sí, borrar' }))) return
    const { error: err } = await supabase.from('caja_movimientos').delete().eq('id', f.id)
    if (err) return setError(err.message)
    cargar()
  }

  return (
    <div className="space-y-4">
      <BarraFija nivel={3.75}>
        <div className="bg-white rounded-2xl shadow-sm p-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-xs text-slate-400">Retiros</p>
              <p className="text-2xl font-bold text-naranja-oscuro">{dinero(retiros)}</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-slate-400">Ingresos</p>
              <p className="text-2xl font-bold text-marca">{dinero(ingresos)}</p>
            </div>
          </div>
          <button onClick={() => setNuevo(true)}
            className="w-full h-11 rounded-xl bg-negro text-champagne text-sm font-semibold active:opacity-90">
            + Retiro o ingreso de caja
          </button>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {FILTROS.map(f => (
            <button key={f.id} onClick={() => setTipo(f.id)}
              className={`h-10 rounded-xl text-xs font-medium ${tipo === f.id ? 'bg-marca text-white' : 'bg-white text-slate-600 shadow-sm'}`}>{f.texto}</button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <select value={motivo} onChange={e => setMotivo(e.target.value)} className={claseInput} aria-label="Motivo">
            <option value="todos">Todos los motivos</option>
            {[...MOTIVOS_RETIRO, { id: 'base', texto: 'Base inicial del día' }].map(m => <option key={m.id} value={m.id}>{m.texto}</option>)}
          </select>
          <input value={texto} onChange={e => setTexto(e.target.value)} placeholder="Buscar en notas" className={claseInput} />
        </div>
      </BarraFija>

      {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}

      {cargando ? (
        <p className="text-center text-sm text-slate-400 py-8">Cargando…</p>
      ) : visibles.length === 0 ? (
        <p className="text-center text-sm text-slate-400 py-8">No hay movimientos de caja en este periodo</p>
      ) : (
        <ul className="bg-white rounded-2xl shadow-sm divide-y divide-slate-100">
          {visibles.map(f => (
            <li key={f.id} className="min-h-14 px-4 py-2 grid grid-cols-[1fr_auto] gap-3 items-center">
              <div className="min-w-0">
                <p className="text-sm font-medium break-words">{textoMotivo(f.motivo)}{f.nota ? ` · ${f.nota}` : ''}</p>
                <p className="text-xs text-slate-400">{fechaHora(f.fecha)}</p>
              </div>
              <div className="grid justify-items-end gap-1">
                <span className={`text-sm font-semibold ${f.tipo === 'retiro' ? 'text-naranja-oscuro' : 'text-marca'}`}>
                  {f.tipo === 'retiro' ? '−' : '+'}{dinero(f.monto)}
                </span>
                {dueno === true && (
                  <button onClick={() => borrar(f)} className="text-[11px] text-red-500 underline">Borrar</button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {nuevo && <RetiroCaja onCerrar={() => setNuevo(false)} onHecho={() => { setNuevo(false); cargar() }} />}
    </div>
  )
}
