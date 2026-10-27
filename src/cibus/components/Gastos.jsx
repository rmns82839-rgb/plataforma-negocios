import { useCallback, useEffect, useState } from 'react'
import Cifra from './Cifra'
import { usePersistido, borrarBorradores, TREINTA_MIN } from '../lib/usePersistido'
import { supabase } from '../lib/supabase'
import { dinero, aNumero, fechaHora } from '../lib/formato'
import { claseInput } from '../lib/estilos'
import { coincide } from '../lib/buscar'
import { useDueno } from '../context/rol'
import Modal, { Campo } from './Modal'
import BarraFija from './BarraFija'
import { useBorradorForm } from '../lib/useBorradorForm'
import AvisoBorrador from './AvisoBorrador'
import { confirmar } from '../lib/confirmar'
import { encolarInsert } from '../lib/sincronizar'
import { esErrorDeRed } from '../lib/offline'

const TIPOS = ['Arriendo', 'Servicios', 'Nómina', 'Transporte', 'Mercancía', 'Otros']

export default function Gastos({ rango }) {
  const dueno = useDueno()
  const [gastos, setGastos] = useState([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [texto, setTexto] = useState('')
  const [nuevo, setNuevo] = usePersistido('gastos:nuevo', false, true, TREINTA_MIN)
  const [abierto, setAbierto] = usePersistido('gastos:abierto', null, true, TREINTA_MIN)
  const [fg, setFg, bor] = useBorradorForm('borrador-gasto', { tipo: TIPOS[0], descripcion: '', monto: '' })
  const { tipo, descripcion, monto } = fg
  const setTipo = (v) => setFg(p => ({ ...p, tipo: v }))
  const setDescripcion = (v) => setFg(p => ({ ...p, descripcion: v }))
  const setMonto = (v) => setFg(p => ({ ...p, monto: v }))
  const [errorForm, setErrorForm] = useState('')
  const [guardando, setGuardando] = useState(false)

  const cargar = useCallback(async () => {
    setCargando(true); setError('')
    let q = supabase.from('gastos').select('*').gte('fecha', rango.desde)
    if (rango.hasta) q = q.lt('fecha', rango.hasta)
    const { data, error: err } = await q.order('fecha', { ascending: false }).range(0, 999)
    if (err) setError(err.message)
    setGastos(data ?? [])
    setCargando(false)
  }, [rango])
  useEffect(() => { cargar() }, [cargar])

  const visibles = gastos.filter(g => coincide([g.tipo, g.descripcion], texto))
  const total = visibles.reduce((s, g) => s + Number(g.monto), 0)

  const abrirNuevo = () => { setErrorForm(''); setNuevo(true) }

  const guardar = async () => {
    const valor = aNumero(monto)
    if (valor <= 0) return setErrorForm('Escribe el valor del gasto')
    setGuardando(true); setErrorForm('')
    const fila = { tipo, descripcion: descripcion.trim() || null, monto: valor }
    let { error: err } = await supabase.from('gastos').insert(fila)
    if (err && esErrorDeRed(err)) {       // sin internet: queda guardado en este equipo y se sube solo
      await encolarInsert('gastos', { ...fila, fecha: new Date().toISOString() }, `Gasto ${tipo} ${dinero(valor)}`)
      err = null
    }
    setGuardando(false)
    if (err) return setErrorForm(err.message)
    bor.empezarDeNuevo(); setNuevo(false); cargar()
  }

  const borrar = async () => {
    if (!(await confirmar({ titulo: '¿Borrar este gasto?', texto: 'Dejará de contar en los reportes. No se puede deshacer.', si: 'Sí, borrar' }))) return
    const { error: err } = await supabase.from('gastos').delete().eq('id', abierto.id)
    if (err) return setError(err.message)
    setAbierto(null); cargar()
  }

  return (
    <div className="space-y-4">
      <BarraFija nivel={3.75}>
      <div className="bg-white rounded-2xl shadow-sm p-4 grid grid-cols-2 gap-3 items-center">
        <div>
          <p className="text-xs text-slate-400">Gastos del periodo</p>
          <Cifra className="text-2xl font-bold text-naranja-oscuro">{dinero(total)}</Cifra>
        </div>
        <button onClick={abrirNuevo}
          className="h-11 rounded-xl bg-marca text-white text-sm font-semibold active:bg-marca-oscuro">
          + Gasto
        </button>
      </div>

      <input value={texto} onChange={e => setTexto(e.target.value)}
             placeholder="Buscar por tipo o descripción" className={claseInput} />
      </BarraFija>

      {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}

      {cargando ? (
        <p className="text-center text-sm text-slate-400 py-8">Cargando…</p>
      ) : visibles.length === 0 ? (
        <p className="text-center text-sm text-slate-400 py-8">No hay gastos en este periodo</p>
      ) : (
        <ul className="bg-white rounded-2xl shadow-sm divide-y divide-slate-100">
          {visibles.map(g => (
            <li key={g.id}>
              <button onClick={() => setAbierto(g)}
                className="w-full min-h-14 px-4 py-2 grid grid-cols-[1fr_auto] gap-3 items-center text-left active:bg-slate-50">
                <div className="min-w-0">
                  <p className="text-sm font-medium break-words">{g.tipo}{g.descripcion ? ` · ${g.descripcion}` : ''}</p>
                  <p className="text-xs text-slate-400">{fechaHora(g.fecha)}</p>
                </div>
                <span className="text-sm font-semibold text-naranja-oscuro">{dinero(g.monto)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {nuevo && (
        <Modal titulo="Nuevo gasto" onCerrar={() => setNuevo(false)}>
          {bor.recuperado && <AvisoBorrador onNuevo={bor.empezarDeNuevo} />}
          <Campo etiqueta="Tipo de gasto">
            <select value={tipo} onChange={e => setTipo(e.target.value)} className={claseInput}>
              {TIPOS.map(t => <option key={t}>{t}</option>)}
            </select>
          </Campo>
          <Campo etiqueta="Descripción (opcional)">
            <input value={descripcion} onChange={e => setDescripcion(e.target.value)} className={claseInput} />
          </Campo>
          <Campo etiqueta="Valor">
            <input autoFocus value={monto} onChange={e => setMonto(e.target.value)}
                   inputMode="numeric" placeholder="0" className={claseInput} />
          </Campo>
          {errorForm && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{errorForm}</p>}
          <button onClick={guardar} disabled={guardando}
            className="w-full h-12 rounded-xl bg-marca text-white font-semibold disabled:opacity-40 active:bg-marca-oscuro">
            {guardando ? 'Guardando…' : 'Guardar gasto'}
          </button>
        </Modal>
      )}

      {abierto && (
        <Modal titulo="Gasto" onCerrar={() => setAbierto(null)}>
          <div className="grid grid-cols-2 gap-3 items-end">
            <div>
              <p className="text-xs text-slate-400">{fechaHora(abierto.fecha)}</p>
              <p className="text-sm font-medium">{abierto.tipo}</p>
              {abierto.descripcion && <p className="text-sm text-slate-500">{abierto.descripcion}</p>}
            </div>
            <p className="text-2xl font-bold text-naranja-oscuro text-right">{dinero(abierto.monto)}</p>
          </div>
          {dueno ? (
            <button onClick={borrar}
              className="w-full h-12 rounded-xl bg-red-50 text-red-600 font-semibold active:bg-red-100">
              Borrar gasto
            </button>
          ) : (
            <p className="text-xs text-slate-400 text-center">Solo el dueño puede borrar gastos.</p>
          )}
        </Modal>
      )}
    </div>
  )
}
