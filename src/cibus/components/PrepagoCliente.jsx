import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { dinero, aNumero, fechaHora } from '../lib/formato'
import { claseInput } from '../lib/estilos'
import { usePersistido, borrarBorradores, TREINTA_MIN } from '../lib/usePersistido'
import { useDueno } from '../context/rol'
import { useConfig } from '../lib/config'
import { practicaActiva, usePractica, moverPrepagoSimulado, prepagoSimulado } from '../lib/practica'
import { TEXTO_MOV, signoMov, saldoDeMovs, formasDeRecarga, textoFecha, fechaEn } from '../lib/prepago'
import { idNuevo } from '../lib/offline'
import { textoMetodo } from '../lib/pagos'

const ATAJOS = [10000, 20000, 50000, 100000]
const PLAZOS = [['30', '30 días'], ['60', '60 días'], ['90', '90 días'], ['sin', 'Sin plazo']]

// Saldo prepago de un cliente: lo que dejó adelantado y aún no gasta. Recargar, devolver y corregir es solo del dueño.
export default function PrepagoCliente({ cliente, onCambio }) {
  const dueno = useDueno()
  const { formas } = useConfig()
  usePractica()                                     // se vuelve a pintar cuando cambia el saldo simulado
  const base = `prepago:${cliente.id}:`
  const [movs, setMovs] = useState(null)            // null = cargando · false = todavía no existe la tabla (falta la migración)
  const [modo, setModo] = usePersistido(base + 'modo', '', true, TREINTA_MIN)     // '' | recargar | devolver | ajustar
  const [monto, setMonto] = usePersistido(base + 'monto', '')
  const [metodo, setMetodo] = usePersistido(base + 'metodo', 'efectivo')
  const [nota, setNota] = usePersistido(base + 'nota', '')
  const [signo, setSigno] = usePersistido(base + 'signo', 'mas')
  const [bonoModo, setBonoModo] = usePersistido(base + 'bonoModo', 'no')        // no | 5 | 10 | otro  (el valor del bono lo decide el dueño)
  const [bonoTxt, setBonoTxt] = usePersistido(base + 'bonoTxt', '')
  const [plazo, setPlazo] = usePersistido(base + 'plazo', '30')                 // 30 | 60 | 90 | sin | fecha
  const [fechaTope, setFechaTope] = usePersistido(base + 'fechaTope', '')
  const [resumen, setResumen] = useState(null)                                    // fila de prepago_saldos: { saldo, saldo_real, bono, bono_vence }
  const [paso, setPaso] = useState(1)
  const [error, setError] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [aviso, setAviso] = useState('')
  const [verTodo, setVerTodo] = useState(false)
  const clave = useRef(idNuevo())                    // si la respuesta se pierde y se reintenta, la recarga no se duplica

  const cargar = useCallback(async () => {
    const { data, error: e } = await supabase.from('prepago_movimientos').select('*').eq('cliente_id', cliente.id)
      .order('fecha', { ascending: false }).range(0, 499)
    setMovs(e ? false : (data ?? []))
    const { data: fila } = await supabase.from('prepago_saldos').select('*').eq('cliente_id', cliente.id).maybeSingle()
    setResumen(fila ?? null)
  }, [cliente.id])
  useEffect(() => { cargar() }, [cargar])

  const formasR = useMemo(() => formasDeRecarga(formas), [formas])
  const metodoOk = formasR.some(f => f.id === metodo) ? metodo : (formasR[0]?.id ?? 'efectivo')
  // Con la migración v36 el saldo viene de la base (plata + bono vigente); sin ella se suma de los movimientos
  const conBono = resumen && resumen.saldo_real !== undefined
  const real = resumen ? Number(resumen.saldo) : (movs ? saldoDeMovs(movs) : 0)
  const bonoVigente = conBono ? Number(resumen.bono ?? 0) : 0
  const propio = conBono ? Number(resumen.saldo_real ?? 0) : real
  const sim = practicaActiva() ? prepagoSimulado(cliente.id) : 0
  const saldo = real + sim
  const valor = Math.round(aNumero(monto))
  const bonoValor = modo !== 'recargar' || valor <= 0 ? 0
    : bonoModo === 'no' ? 0
    : bonoModo === 'otro' ? Math.max(0, Math.round(aNumero(bonoTxt)))
    : Math.round(valor * Number(bonoModo) / 100)
  const venceBono = bonoValor <= 0 ? null : plazo === 'sin' ? null : plazo === 'fecha' ? fechaTope : fechaEn(Number(plazo))

  if (movs === false) return null                    // todavía sin migracion-v35: no se muestra nada
  if (movs === null) return null
  if (!dueno && movs.length === 0) return null       // el cajero solo lo ve si el cliente tiene historial

  const cerrar = () => { setModo(''); setMonto(''); setNota(''); setBonoModo('no'); setBonoTxt(''); setPlazo('30'); setFechaTope(''); setPaso(1); setError(''); borrarBorradores(base) }

  const confirmar = async () => {
    setOcupado(true); setError('')
    const args = modo === 'recargar'
      ? ['prepago_recargar', { p_cliente_id: cliente.id, p_monto: valor, p_metodo: metodoOk, p_nota: nota.trim() || null, p_clave: clave.current, p_bono: bonoValor, p_bono_vence: venceBono }]
      : modo === 'devolver'
        ? ['prepago_devolver', { p_cliente_id: cliente.id, p_monto: valor, p_metodo: metodoOk, p_motivo: nota.trim(), p_clave: clave.current }]
        : ['prepago_ajustar', { p_cliente_id: cliente.id, p_monto: signo === 'mas' ? valor : -valor, p_motivo: nota.trim() }]
    const { error: e } = await supabase.rpc(...args)
    setOcupado(false)
    if (e) {
      return setError(/prepago_|schema cache|Could not find the function/i.test(e.message) && !/Solo el due|Saldo|saldo|Escribe|Elige|puedes|Una recarga/.test(e.message)
        ? 'Falta ejecutar migracion-v35.sql en Supabase.' : e.message)
    }
    clave.current = idNuevo()
    if (practicaActiva()) moverPrepagoSimulado(cliente.id, modo === 'recargar' ? valor + bonoValor : modo === 'devolver' ? -valor : (signo === 'mas' ? valor : -valor))
    setAviso(modo === 'recargar' ? `Recarga de ${dinero(valor)} guardada.` : modo === 'devolver' ? `Se devolvieron ${dinero(valor)}.` : 'Corrección guardada.')
    cerrar(); await cargar(); onCambio?.()
  }

  const siguiente = () => {
    setError('')
    if (valor <= 0) return setError('Escribe un valor mayor a cero')
    if (modo === 'recargar' && valor > 5000000) return setError('Una recarga no puede pasar de $5.000.000')
    if (modo === 'recargar' && bonoValor > valor) return setError('El bono no puede ser mayor que la recarga')
    if (modo === 'recargar' && bonoValor > 0 && plazo === 'fecha' && (!fechaTope || fechaTope <= fechaEn(0))) return setError('Elige una fecha límite del bono que sea después de hoy')
    if (modo === 'devolver' && valor > propio + sim) return setError(`Solo puedes devolver la plata que dejó (${dinero(propio + sim)}). El bono no se devuelve.`)
    if (modo === 'ajustar' && signo === 'menos' && valor > propio + sim) return setError(`El saldo no puede quedar negativo (tiene ${dinero(propio + sim)})`)
    if (modo !== 'recargar' && nota.trim().length < 3) return setError('Escribe el motivo')
    setPaso(2)
  }

  const titulos = { recargar: 'Recargar saldo', devolver: 'Devolver saldo', ajustar: 'Corregir el saldo' }
  const lista = verTodo ? movs : movs.slice(0, 5)

  return (
    <div className="rounded-2xl bg-slate-50 p-3 space-y-3">
      <div className="grid grid-cols-[1fr_auto] gap-3 items-end">
        <div>
          <p className="text-xs text-slate-400">Saldo prepago (a su favor)</p>
          <p className="text-2xl font-bold text-marca">{dinero(saldo)}</p>
          {bonoVigente > 0 && (
            <p className="text-xs text-oro-oscuro">Incluye {dinero(bonoVigente)} de bono{resumen?.bono_vence ? ` que vence el ${textoFecha(resumen.bono_vence)}` : ' (sin fecha límite)'}</p>
          )}
          {sim !== 0 && <p className="text-[11px] text-amber-700">Incluye {dinero(sim)} de práctica (no es real).</p>}
        </div>
      </div>
      {aviso && !modo && <p className="text-xs text-marca bg-lima/20 rounded-lg px-2 py-1">{aviso}</p>}

      {dueno === true && !modo && (
        <div className="grid grid-cols-3 gap-2">
          <button onClick={() => { setAviso(''); setModo('recargar') }} className="min-h-11 rounded-xl bg-negro text-champagne text-sm font-semibold">Recargar</button>
          <button onClick={() => { setAviso(''); setModo('devolver') }} disabled={saldo <= 0}
            className="min-h-11 rounded-xl bg-white ring-1 ring-slate-200 text-slate-600 text-sm font-medium disabled:opacity-40">Devolver</button>
          <button onClick={() => { setAviso(''); setModo('ajustar') }}
            className="min-h-11 rounded-xl bg-white ring-1 ring-slate-200 text-slate-600 text-sm font-medium">Corregir</button>
        </div>
      )}

      {dueno === true && modo && paso === 1 && (
        <div className="space-y-2">
          <p className="text-sm font-semibold">{titulos[modo]}</p>
          {modo === 'ajustar' && (
            <div className="grid grid-cols-2 gap-2">
              {[['mas', 'Sumar'], ['menos', 'Restar']].map(([id, t]) => (
                <button key={id} onClick={() => setSigno(id)}
                  className={`min-h-11 rounded-xl text-sm font-medium ${signo === id ? 'bg-negro text-champagne' : 'bg-white ring-1 ring-slate-200 text-slate-600'}`}>{t}</button>
              ))}
            </div>
          )}
          {modo === 'recargar' && (
            <div className="grid grid-cols-4 gap-2">
              {ATAJOS.map(v => (
                <button key={v} onClick={() => setMonto(String(v))}
                  className={`h-10 rounded-lg text-xs font-medium ${valor === v ? 'bg-negro text-champagne' : 'bg-white ring-1 ring-slate-200 text-slate-600'}`}>
                  {dinero(v).replace(',00', '')}
                </button>
              ))}
            </div>
          )}
          <input value={monto} onChange={e => setMonto(e.target.value)} inputMode="numeric" placeholder="Valor en pesos" className={claseInput} />
          {modo === 'recargar' && (
            <div className="rounded-xl bg-white ring-1 ring-slate-200 p-3 space-y-2">
              <p className="text-xs font-medium text-slate-500">Bono de regalo (opcional)</p>
              <div className="grid grid-cols-4 gap-2">
                {[['no', 'Sin bono'], ['5', '5 %'], ['10', '10 %'], ['otro', 'Otro valor']].map(([id, t]) => (
                  <button key={id} onClick={() => setBonoModo(id)}
                    className={`min-h-10 rounded-lg text-xs font-medium leading-tight px-1 ${bonoModo === id ? 'bg-negro text-champagne' : 'bg-slate-100 text-slate-600'}`}>{t}</button>
                ))}
              </div>
              {bonoModo === 'otro' && (
                <input value={bonoTxt} onChange={e => setBonoTxt(e.target.value)} inputMode="numeric" placeholder="Valor del bono en pesos" className={claseInput} />
              )}
              {bonoValor > 0 && (
                <>
                  <p className="text-sm font-semibold text-marca">Bono: {dinero(bonoValor)} · el cliente tendrá {dinero(valor + bonoValor)}</p>
                  <p className="text-xs font-medium text-slate-500">¿Hasta cuándo puede gastar el bono?</p>
                  <div className="grid grid-cols-4 gap-2">
                    {PLAZOS.map(([id, t]) => (
                      <button key={id} onClick={() => setPlazo(id)}
                        className={`min-h-10 rounded-lg text-xs font-medium leading-tight px-1 ${plazo === id ? 'bg-negro text-champagne' : 'bg-slate-100 text-slate-600'}`}>{t}</button>
                    ))}
                  </div>
                  <button onClick={() => setPlazo('fecha')}
                    className={`w-full min-h-10 rounded-lg text-xs font-medium ${plazo === 'fecha' ? 'bg-negro text-champagne' : 'bg-slate-100 text-slate-600'}`}>Elegir otra fecha</button>
                  {plazo === 'fecha' && <input type="date" value={fechaTope} min={fechaEn(1)} onChange={e => setFechaTope(e.target.value)} className={claseInput} />}
                  {plazo !== 'sin' && venceBono && <p className="text-[11px] text-slate-400">Vence el {textoFecha(venceBono)}. Lo que no gaste hasta ese día se pierde.</p>}
                </>
              )}
            </div>
          )}
          {modo !== 'ajustar' && (
            <label className="block space-y-1">
              <span className="text-xs font-medium text-slate-500">{modo === 'recargar' ? 'El cliente pagó con' : 'Se le devuelve con'}</span>
              <select value={metodoOk} onChange={e => setMetodo(e.target.value)} className={claseInput}>
                {formasR.map(f => <option key={f.id} value={f.id}>{f.nombre}</option>)}
              </select>
            </label>
          )}
          <input value={nota} onChange={e => setNota(e.target.value)} maxLength={200}
            placeholder={modo === 'recargar' ? 'Nota (opcional)' : 'Motivo (obligatorio)'} className={claseInput} />
          {modo === 'ajustar' && <p className="text-[11px] text-slate-400">Corregir solo cambia el saldo del cliente; no mueve plata de la caja.</p>}
          {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
          <div className="grid grid-cols-[auto_1fr] gap-2">
            <button onClick={cerrar} className="min-h-12 px-4 rounded-xl bg-slate-100 text-slate-600 text-sm font-medium">Volver</button>
            <button onClick={siguiente} className="min-h-12 rounded-xl bg-negro text-champagne font-semibold">Continuar</button>
          </div>
        </div>
      )}

      {dueno === true && modo && paso === 2 && (
        <div className="space-y-3">
          <div className="rounded-2xl bg-white p-4 text-center space-y-1">
            <p className="text-sm text-slate-500">{titulos[modo]} · {cliente.nombre}</p>
            <p className="text-3xl font-bold tabular-nums">{modo === 'ajustar' && signo === 'menos' ? '− ' : ''}{dinero(valor)}</p>
            {modo !== 'ajustar' && <p className="text-xs text-slate-500">{modo === 'recargar' ? 'Pagó con' : 'Se devuelve con'} {textoMetodo(metodoOk)}</p>}
            {modo === 'recargar' && bonoValor > 0 && (
              <p className="text-xs text-oro-oscuro">+ Bono de regalo {dinero(bonoValor)} {venceBono ? `(vence el ${textoFecha(venceBono)})` : '(sin fecha límite)'}</p>
            )}
            <p className="text-xs text-slate-400">
              Saldo después: {dinero(modo === 'recargar' ? saldo + valor + bonoValor : (modo === 'ajustar' && signo === 'mas') ? saldo + valor : saldo - valor)}
            </p>
          </div>
          {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
          <div className="grid grid-cols-[auto_1fr] gap-2">
            <button onClick={() => { setPaso(1); setError('') }} disabled={ocupado} className="min-h-12 px-4 rounded-xl bg-slate-100 text-slate-600 text-sm font-medium">Volver</button>
            <button onClick={confirmar} disabled={ocupado} className="min-h-12 rounded-xl bg-negro text-champagne font-semibold disabled:opacity-50">
              {ocupado ? 'Guardando…' : 'Confirmar'}
            </button>
          </div>
        </div>
      )}

      {movs.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs font-medium text-slate-500">Movimientos del saldo</p>
          <ul className="divide-y divide-slate-100 rounded-xl bg-white px-3">
            {lista.map(m => (
              <li key={m.id} className="py-2 grid grid-cols-[1fr_auto] gap-x-3 text-xs items-center">
                <span className="min-w-0">
                  <span className="block font-medium text-slate-700 break-words">{TEXTO_MOV[m.tipo] ?? m.tipo}{m.metodo ? ` · ${textoMetodo(m.metodo)}` : ''}</span>
                  <span className="block text-slate-400 break-words">
                    {fechaHora(m.fecha)}{m.nota && m.tipo !== 'bono' ? ` · ${m.nota}` : ''}
                    {m.tipo === 'bono' ? ` · ${m.vence ? (m.vence < fechaEn(0) ? `venció el ${textoFecha(m.vence)}` : `vence el ${textoFecha(m.vence)}`) : 'sin fecha límite'}` : ''}
                    {Number(m.monto_bono) > 0 ? ` · ${dinero(m.monto_bono)} salieron del bono` : ''}
                  </span>
                </span>
                <span className={`font-semibold tabular-nums ${m.tipo === 'bono' ? 'text-oro-oscuro' : signoMov(m) > 0 ? 'text-marca' : 'text-slate-600'}`}>
                  {signoMov(m) > 0 ? '+' : '−'}{dinero(m.monto)}
                </span>
              </li>
            ))}
          </ul>
          {movs.length > 5 && (
            <button onClick={() => setVerTodo(v => !v)} className="w-full h-9 text-xs font-medium text-slate-500">
              {verTodo ? 'Ver menos' : `Ver todos (${movs.length})`}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
