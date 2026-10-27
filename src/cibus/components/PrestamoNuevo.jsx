import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { dinero, aNumero, aCantidad, fechaSolo } from '../lib/formato'
import { claseInput } from '../lib/estilos'
import { coincide } from '../lib/buscar'
import { hoyTexto } from '../lib/periodo'
import { FRECUENCIAS, simularPrestamo } from '../lib/prestamos'
import Modal, { Campo } from './Modal'
import ClienteForm from './ClienteForm'
import { useBorradorForm } from '../lib/useBorradorForm'
import AvisoBorrador from './AvisoBorrador'

const EXIGIR = ['documento', 'telefono', 'direccion']
const completo = (c) => Boolean(c?.documento && c?.telefono && c?.direccion)

// Nuevo préstamo: cliente (con todos sus datos), cuánto, a qué tasa y a cuánto plazo.
export default function PrestamoNuevo({ cliente: inicial = null, onCerrar, onCreado }) {
  const [clientes, setClientes] = useState([])
  const [cliente, setCliente] = useState(inicial)
  const [texto, setTexto] = useState('')
  const [formCliente, setFormCliente] = useState(null)   // {} nuevo, o el cliente a completar
  const [fp, setFp, bor] = useBorradorForm('borrador-prestamo', { monto: '', tasa: '', frecuencia: 'mensual', cuotas: '', inicio: hoyTexto(), nota: '' })
  const { monto, tasa, frecuencia, cuotas, inicio, nota } = fp
  const campo = (k) => (v) => setFp(p => ({ ...p, [k]: v }))
  const [setMonto, setTasa, setFrecuencia, setCuotas, setInicio, setNota] = ['monto', 'tasa', 'frecuencia', 'cuotas', 'inicio', 'nota'].map(campo)
  const [error, setError] = useState('')
  const [guardando, setGuardando] = useState(false)

  useEffect(() => {
    supabase.from('clientes').select('*').order('nombre').range(0, 4999)
      .then(({ data }) => setClientes(data ?? []))
  }, [])

  const sugeridos = useMemo(
    () => (texto.trim()
      ? clientes.filter(c => coincide([c.nombre, c.documento, c.telefono], texto)).slice(0, 5)
      : []),
    [clientes, texto])

  const sim = useMemo(() => simularPrestamo({
    monto: aNumero(monto), tasaMensual: aCantidad(tasa),
    frecuencia, cuotas: aNumero(cuotas), inicio,
  }), [monto, tasa, frecuencia, cuotas, inicio])

  const tasaNum = aCantidad(tasa)
  const efectivoAnual = tasaNum > 0 ? (Math.pow(1 + tasaNum / 100, 12) - 1) * 100 : 0

  const guardar = async () => {
    if (!cliente) return setError('Elige el cliente')
    if (!completo(cliente)) return setError('Completa documento, teléfono y dirección del cliente')
    if (!sim) return setError('Escribe el monto, la tasa y el número de cuotas')
    if (aNumero(cuotas) > 120) return setError('Máximo 120 cuotas')
    setGuardando(true); setError('')
    const { error: err } = await supabase.rpc('crear_prestamo', {
      p_cliente_id: cliente.id, p_monto: aNumero(monto), p_tasa_mensual: tasaNum,
      p_frecuencia: frecuencia, p_num_cuotas: Math.round(aNumero(cuotas)),
      p_fecha_inicio: inicio, p_nota: nota.trim() || null,
    })
    setGuardando(false)
    if (err) return setError(err.message)
    bor.limpiar()
    onCreado?.()
  }

  if (formCliente) {
    return (
      <ClienteForm
        cliente={formCliente.id ? formCliente : undefined}
        exigir={EXIGIR}
        onCerrar={() => setFormCliente(null)}
        onGuardado={(c) => { setClientes(l => [c, ...l.filter(x => x.id !== c.id)]); setCliente(c); setFormCliente(null) }}
      />
    )
  }

  return (
    <Modal titulo="Nuevo préstamo" onCerrar={() => { bor.limpiar(); onCerrar?.() }}>
      {bor.recuperado && <AvisoBorrador onNuevo={bor.empezarDeNuevo} />}
      {cliente ? (
        <div className="rounded-2xl bg-slate-50 p-3 grid grid-cols-[1fr_auto] gap-3 items-center">
          <div className="min-w-0">
            <p className="text-sm font-semibold break-words">{cliente.nombre}</p>
            <p className="text-xs text-slate-500 break-words">
              {[cliente.documento && `${cliente.tipo_documento ?? ''} ${cliente.documento}`.trim(),
                cliente.telefono, cliente.direccion].filter(Boolean).join(' · ') || 'Sin datos'}
            </p>
            {!completo(cliente) && (
              <p className="text-xs font-medium text-red-500">Faltan documento, teléfono o dirección</p>
            )}
          </div>
          <div className="grid gap-1">
            {!completo(cliente) && (
              <button onClick={() => setFormCliente(cliente)}
                className="h-8 px-3 rounded-lg bg-naranja/15 text-naranja-oscuro text-xs font-semibold">Completar</button>
            )}
            {!inicial && (
              <button onClick={() => setCliente(null)}
                className="h-8 px-3 rounded-lg bg-white text-slate-500 text-xs shadow-sm">Cambiar</button>
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="grid grid-cols-[1fr_auto] gap-2">
            <input value={texto} onChange={e => setTexto(e.target.value)} autoFocus
                   placeholder="Buscar cliente por nombre o documento" className={claseInput} />
            <button onClick={() => setFormCliente({})}
              className="h-12 px-4 rounded-xl bg-marca text-white text-sm font-semibold">+ Nuevo</button>
          </div>
          {sugeridos.length > 0 && (
            <ul className="rounded-2xl bg-slate-50 divide-y divide-slate-100">
              {sugeridos.map(c => (
                <li key={c.id}>
                  <button onClick={() => { setCliente(c); setTexto('') }}
                    className="w-full px-3 py-2 text-left active:bg-slate-100">
                    <p className="text-sm font-medium break-words">{c.nombre}</p>
                    <p className="text-xs text-slate-400 break-words">{[c.documento, c.telefono].filter(Boolean).join(' · ') || 'Sin documento'}</p>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {texto.trim() && sugeridos.length === 0 && (
            <p className="text-xs text-slate-400 text-center">Nadie coincide. Crea el cliente con “+ Nuevo”.</p>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <Campo etiqueta="¿Cuánto va a prestar? *">
          <input value={monto} onChange={e => setMonto(e.target.value)} inputMode="numeric"
                 placeholder="$" className={claseInput} />
        </Campo>
        <Campo etiqueta="Interés mensual (%) *">
          <input value={tasa} onChange={e => setTasa(e.target.value)} inputMode="decimal"
                 placeholder="Ej: 2,5" className={claseInput} />
        </Campo>
        <Campo etiqueta="Pagos cada">
          <select value={frecuencia} onChange={e => setFrecuencia(e.target.value)} className={claseInput}>
            {FRECUENCIAS.map(f => <option key={f.id} value={f.id}>{f.texto}</option>)}
          </select>
        </Campo>
        <Campo etiqueta="Número de cuotas *">
          <input value={cuotas} onChange={e => setCuotas(e.target.value)} inputMode="numeric"
                 placeholder="Plazo" className={claseInput} />
        </Campo>
        <Campo etiqueta="Fecha del préstamo">
          <input type="date" value={inicio} onChange={e => setInicio(e.target.value || hoyTexto())} className={claseInput} />
        </Campo>
        <Campo etiqueta="Nota (opcional)">
          <input value={nota} onChange={e => setNota(e.target.value)} className={claseInput} />
        </Campo>
      </div>

      {tasaNum > 0 && (
        <p className="text-xs text-slate-400">
          {tasaNum.toLocaleString('es-CO')}% mensual ≈ {efectivoAnual.toLocaleString('es-CO', { maximumFractionDigits: 1 })}% efectivo anual. En Colombia no se puede cobrar más
          que la tasa de usura (la publica la Superfinanciera cada mes): revísala antes de prestar.
        </p>
      )}

      {sim && (
        <div className="rounded-2xl bg-lima/10 p-3 space-y-2">
          <div className="grid grid-cols-3 gap-2 text-center">
            <div><p className="text-xs text-slate-500">Interés</p><p className="text-sm font-bold">{dinero(sim.interes)}</p></div>
            <div><p className="text-xs text-slate-500">Cuota</p><p className="text-sm font-bold">{dinero(sim.cuotas[0].valor)}</p></div>
            <div><p className="text-xs text-slate-500">Total a pagar</p><p className="text-sm font-bold text-marca">{dinero(sim.total)}</p></div>
          </div>
          <ul className="max-h-36 overflow-y-auto divide-y divide-white text-xs">
            {sim.cuotas.map(c => (
              <li key={c.numero} className="grid grid-cols-[2rem_1fr_auto] gap-2 py-1">
                <span className="text-slate-400">#{c.numero}</span>
                <span>{fechaSolo(c.fecha)}</span>
                <span className="font-medium">{dinero(c.valor)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
      <button onClick={guardar} disabled={guardando}
        className="w-full h-12 rounded-xl bg-marca text-white font-semibold disabled:opacity-40 active:bg-marca-oscuro">
        {guardando ? 'Guardando…' : 'Crear préstamo'}
      </button>
    </Modal>
  )
}
