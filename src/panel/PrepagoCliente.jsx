// Saldo prepago de un cliente: lo que dejó adelantado. Recargar, devolver y corregir es solo del dueño (y nunca en solo lectura).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { mensajeError } from '../lib/errores'
import { cop } from '../lib/pedido'
import { aNumero } from '../lib/caja'
import { TEXTO_MOV, signoMov, formasDeRecarga, valorBono, textoFecha, fechaEn, idNuevo } from '../lib/prepago'
import { Btn, Volver, Aviso, Campo, clsInput } from '../tienda/ui'
import { Seccion, Opciones, fechaHora } from './piezas'

const ATAJOS = [10000, 20000, 50000, 100000]
const PLAZOS = [['30', '30 días'], ['60', '60 días'], ['90', '90 días'], ['sin', 'Sin fecha']]
const TITULOS = { recargar: 'Recargar saldo', devolver: 'Devolver saldo', ajustar: 'Corregir el saldo' }

export default function PrepagoCliente({ nid, cliente, puedeEditar, onCambio }) {
  const [movs, setMovs] = useState(null)
  const [res, setRes] = useState(null)             // fila de prepago_saldos
  const [formas, setFormas] = useState([])
  const [modo, setModo] = useState('')             // '' · recargar · devolver · ajustar
  const [paso, setPaso] = useState(1)
  const [monto, setMonto] = useState('')
  const [metodo, setMetodo] = useState('efectivo')
  const [nota, setNota] = useState('')
  const [signo, setSigno] = useState('mas')
  const [bonoModo, setBonoModo] = useState('no')
  const [bonoTxt, setBonoTxt] = useState('')
  const [plazo, setPlazo] = useState('30')
  const [fechaTope, setFechaTope] = useState('')
  const [error, setError] = useState('')
  const [aviso, setAviso] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [verTodo, setVerTodo] = useState(false)
  const clave = useRef(idNuevo())                  // si se pierde la respuesta y se reintenta, la recarga no se duplica

  const cargar = useCallback(async () => {
    const [a, b] = await Promise.all([
      supabase.from('prepago_movimientos').select('*').eq('negocio_id', nid).eq('cliente_id', cliente.id).order('fecha', { ascending: false }).limit(200),
      supabase.from('prepago_saldos').select('*').eq('negocio_id', nid).eq('cliente_id', cliente.id).maybeSingle(),
    ])
    setMovs(a.error ? [] : (a.data || [])); setRes(b.data || null)
  }, [nid, cliente.id])
  useEffect(() => { cargar() }, [cargar])
  useEffect(() => {
    supabase.from('formas_pago').select('id,nombre,tipo,activa').eq('negocio_id', nid).eq('activa', true).order('orden').then(({ data }) => setFormas(data || []))
  }, [nid])

  const formasR = useMemo(() => formasDeRecarga(formas), [formas])
  const metodoOk = formasR.some((f) => f.id === metodo) ? metodo : (formasR[0]?.id ?? 'efectivo')
  const saldo = Number(res?.saldo || 0)
  const propio = Number(res?.saldo_real || 0)
  const bonoVigente = Number(res?.bono || 0)
  const valor = Math.round(aNumero(monto))
  const bono = modo === 'recargar' ? valorBono(bonoModo, valor, bonoTxt) : 0
  const vence = bono <= 0 ? null : plazo === 'sin' ? null : plazo === 'fecha' ? fechaTope : fechaEn(Number(plazo))

  if (!movs) return null
  if (!puedeEditar && movs.length === 0) return null      // el cajero lo ve solo si el cliente ya tiene historial

  const cerrar = () => { setModo(''); setPaso(1); setMonto(''); setNota(''); setBonoModo('no'); setBonoTxt(''); setPlazo('30'); setFechaTope(''); setError('') }
  const abrir = (m) => { setAviso(''); cerrar(); setModo(m) }

  function siguiente() {
    setError('')
    if (!(valor > 0)) return setError('Escribe un valor mayor a cero')
    if (modo === 'recargar' && valor > 5000000) return setError('Una recarga no puede pasar de $5.000.000')
    if (modo === 'recargar' && bono > valor) return setError('El bono no puede ser mayor que la recarga')
    if (modo === 'recargar' && bono > 0 && plazo === 'fecha' && (!fechaTope || fechaTope <= fechaEn(0))) return setError('Elige una fecha límite del bono que sea después de hoy')
    if (modo === 'devolver' && valor > propio) return setError(`Solo puedes devolver la plata que dejó (${cop(propio)}). El bono no se devuelve.`)
    if (modo === 'ajustar' && signo === 'menos' && valor > propio) return setError(`El saldo no puede quedar negativo (tiene ${cop(propio)})`)
    if (modo !== 'recargar' && nota.trim().length < 3) return setError('Escribe el motivo')
    setPaso(2)
  }

  async function confirmar() {
    setOcupado(true); setError('')
    const args = modo === 'recargar'
      ? ['prepago_recargar', { p_negocio_id: nid, p_cliente_id: cliente.id, p_monto: valor, p_metodo: metodoOk, p_nota: nota.trim() || null, p_clave: clave.current, p_bono: bono, p_bono_vence: vence }]
      : modo === 'devolver'
        ? ['prepago_devolver', { p_negocio_id: nid, p_cliente_id: cliente.id, p_monto: valor, p_metodo: metodoOk, p_motivo: nota.trim(), p_clave: clave.current }]
        : ['prepago_ajustar', { p_negocio_id: nid, p_cliente_id: cliente.id, p_monto: signo === 'mas' ? valor : -valor, p_motivo: nota.trim() }]
    const { error: e } = await supabase.rpc(...args)
    setOcupado(false)
    if (e) return setError(mensajeError(e))
    clave.current = idNuevo()
    setAviso(modo === 'recargar' ? `✓ Recarga de ${cop(valor)} guardada.` : modo === 'devolver' ? `✓ Se devolvieron ${cop(valor)}.` : '✓ Corrección guardada.')
    cerrar(); await cargar(); onCambio?.()
  }

  const lista = verTodo ? movs : movs.slice(0, 5)
  const despues = modo === 'recargar' ? saldo + valor + bono : (modo === 'ajustar' && signo === 'mas') ? saldo + valor : saldo - valor

  return (
    <Seccion titulo="Saldo prepago">
      <div className="mb-4 rounded-2xl border-2 border-principal/20 bg-principal/5 p-4 text-center">
        <p className="text-lg text-tinta/70">Tiene a su favor</p>
        <p className="break-words text-4xl font-bold text-principal">{cop(saldo)}</p>
        {bonoVigente > 0 && <p className="mt-1 text-lg text-amber-900">Incluye {cop(bonoVigente)} de bono{res?.bono_vence ? ` que vence el ${textoFecha(res.bono_vence)}` : ' (sin fecha límite)'}</p>}
      </div>
      {aviso && !modo && <div className="mb-4"><Aviso tipo="ok">{aviso}</Aviso></div>}

      {puedeEditar && !modo && (
        <div className="grid grid-cols-3 gap-2">
          <button type="button" onClick={() => abrir('recargar')} className="min-h-[60px] rounded-2xl bg-principal px-1 text-lg font-bold text-white">Recargar</button>
          <button type="button" disabled={propio <= 0} onClick={() => abrir('devolver')} className="min-h-[60px] rounded-2xl border-2 border-black/10 bg-white px-1 text-lg font-bold disabled:opacity-40">Devolver</button>
          <button type="button" onClick={() => abrir('ajustar')} className="min-h-[60px] rounded-2xl border-2 border-black/10 bg-white px-1 text-lg font-bold">Corregir</button>
        </div>
      )}

      {puedeEditar && modo && paso === 1 && (
        <div className="space-y-4">
          <Volver onClick={cerrar} texto="Volver al saldo" />
          <h4 className="text-2xl font-bold">{TITULOS[modo]}</h4>
          {error && <Aviso tipo="error">{error}</Aviso>}
          {modo === 'ajustar' && <Opciones valor={signo} opciones={[['mas', 'Sumar'], ['menos', 'Restar']]} onChange={setSigno} />}
          {modo === 'recargar' && (
            <div className="grid grid-cols-2 gap-2" role="group" aria-label="Valores rápidos">
              {ATAJOS.map((v) => (
                <button key={v} type="button" aria-pressed={valor === v} onClick={() => setMonto(String(v))}
                  className={`min-h-[56px] rounded-2xl border-2 px-2 text-xl font-bold ${valor === v ? 'border-principal bg-principal text-white' : 'border-black/10 bg-white'}`}>{cop(v)}</button>
              ))}
            </div>
          )}
          <Campo etiqueta="Valor en pesos"><input className={clsInput} inputMode="numeric" placeholder="$ 0" value={monto} onChange={(e) => setMonto(e.target.value)} /></Campo>
          {valor > 0 && <p className="text-xl font-bold text-principal">{cop(valor)}</p>}

          {modo === 'recargar' && (
            <div className="rounded-2xl border-2 border-black/10 bg-white p-4">
              <p className="mb-2 text-lg font-semibold">Bono de regalo (opcional)</p>
              <div className="grid grid-cols-2 gap-2" role="group" aria-label="Bono">
                {[['no', 'Sin bono'], ['5', '5 %'], ['10', '10 %'], ['otro', 'Otro valor']].map(([id, t]) => (
                  <button key={id} type="button" aria-pressed={bonoModo === id} onClick={() => setBonoModo(id)}
                    className={`min-h-[56px] rounded-2xl border-2 px-2 text-lg font-bold ${bonoModo === id ? 'border-principal bg-principal text-white' : 'border-black/10 bg-white'}`}>{t}</button>
                ))}
              </div>
              {bonoModo === 'otro' && <div className="mt-3"><input className={clsInput} inputMode="numeric" placeholder="Valor del bono en pesos" aria-label="Valor del bono" value={bonoTxt} onChange={(e) => setBonoTxt(e.target.value)} /></div>}
              {bono > 0 && (
                <div className="mt-3 space-y-3">
                  <p className="text-xl font-bold text-green-800">Bono {cop(bono)} · el cliente tendrá {cop(valor + bono)}</p>
                  <p className="text-lg font-semibold">¿Hasta cuándo puede gastar el bono?</p>
                  <div className="grid grid-cols-2 gap-2" role="group" aria-label="Plazo del bono">
                    {[...PLAZOS, ['fecha', 'Elegir fecha']].map(([id, t], i, a) => (
                      <button key={id} type="button" aria-pressed={plazo === id} onClick={() => setPlazo(id)}
                        className={`min-h-[56px] rounded-2xl border-2 px-2 text-lg font-bold ${i === a.length - 1 && a.length % 2 === 1 ? 'col-span-2' : ''} ${plazo === id ? 'border-principal bg-principal text-white' : 'border-black/10 bg-white'}`}>{t}</button>
                    ))}
                  </div>
                  {plazo === 'fecha' && <input type="date" className={clsInput} value={fechaTope} min={fechaEn(1)} aria-label="Fecha límite del bono" onChange={(e) => setFechaTope(e.target.value)} />}
                  {vence && <p className="text-base text-tinta/70">Vence el {textoFecha(vence)}. Lo que no gaste hasta ese día se pierde, y el bono nunca se devuelve en plata.</p>}
                </div>
              )}
            </div>
          )}

          {modo !== 'ajustar' && (
            <div>
              <p className="mb-2 text-lg font-semibold">{modo === 'recargar' ? 'El cliente pagó con' : 'Se le devuelve con'}</p>
              <div className="grid grid-cols-2 gap-2" role="group" aria-label="Forma de pago">
                {formasR.map((f, i) => (
                  <button key={f.id} type="button" aria-pressed={metodoOk === f.id} onClick={() => setMetodo(f.id)}
                    className={`min-h-[56px] rounded-2xl border-2 px-2 text-lg font-bold leading-tight ${i === formasR.length - 1 && formasR.length % 2 === 1 ? 'col-span-2' : ''} ${metodoOk === f.id ? 'border-principal bg-principal text-white' : 'border-black/10 bg-white'}`}>{f.nombre}</button>
                ))}
              </div>
            </div>
          )}
          <Campo etiqueta={modo === 'recargar' ? 'Nota (opcional)' : 'Motivo (obligatorio)'}><input className={clsInput} maxLength={200} value={nota} onChange={(e) => setNota(e.target.value)} /></Campo>
          {modo === 'ajustar' && <p className="text-base text-tinta/70">Corregir solo cambia el saldo del cliente; no mueve plata de la caja.</p>}
          <Btn onClick={siguiente}>Continuar</Btn>
        </div>
      )}

      {puedeEditar && modo && paso === 2 && (
        <div className="space-y-4">
          <Volver onClick={() => { setPaso(1); setError('') }} texto="Volver a cambiar" />
          {error && <Aviso tipo="error">{error}</Aviso>}
          <div className="rounded-2xl border-2 border-black/10 bg-white p-4 text-center">
            <p className="text-lg text-tinta/70">{TITULOS[modo]} · {cliente.nombre}</p>
            <p className="break-words text-4xl font-bold">{modo === 'ajustar' && signo === 'menos' ? '− ' : ''}{cop(valor)}</p>
            {modo !== 'ajustar' && <p className="text-lg text-tinta/70">{modo === 'recargar' ? 'Pagó con' : 'Se devuelve con'} {formasR.find((f) => f.id === metodoOk)?.nombre}</p>}
            {modo === 'recargar' && bono > 0 && <p className="mt-1 text-lg font-semibold text-amber-900">+ Bono de regalo {cop(bono)} {vence ? `(vence el ${textoFecha(vence)})` : '(sin fecha límite)'}</p>}
            <p className="mt-2 text-lg text-tinta/70">Saldo después: <b>{cop(despues)}</b></p>
          </div>
          <Btn variante="verde" disabled={ocupado} onClick={confirmar}>{ocupado ? 'Guardando…' : 'Confirmar'}</Btn>
        </div>
      )}

      {movs.length > 0 && !modo && (
        <div className="mt-5">
          <p className="mb-2 text-lg font-semibold">Movimientos del saldo</p>
          <ul className="space-y-3">
            {lista.map((m) => (
              <li key={m.id} className="grid grid-cols-[1fr_auto] items-baseline gap-3 border-b border-black/5 pb-2">
                <span className="min-w-0 break-words">
                  <span className="block text-lg font-semibold">{TEXTO_MOV[m.tipo] ?? m.tipo}</span>
                  <span className="block text-base text-tinta/60">
                    {fechaHora(m.fecha)}{m.nota && m.tipo !== 'bono' ? ` · ${m.nota}` : ''}
                    {m.tipo === 'bono' ? ` · ${m.vence ? (m.vence < fechaEn(0) ? `venció el ${textoFecha(m.vence)}` : `vence el ${textoFecha(m.vence)}`) : 'sin fecha límite'}` : ''}
                    {Number(m.monto_bono) > 0 ? ` · ${cop(m.monto_bono)} salieron del bono` : ''}
                  </span>
                </span>
                <span className={`shrink-0 text-xl font-bold ${signoMov(m) > 0 ? 'text-green-800' : 'text-tinta/70'}`}>{signoMov(m) > 0 ? '+' : '−'}{cop(m.monto)}</span>
              </li>
            ))}
          </ul>
          {movs.length > 5 && <div className="mt-3"><Btn variante="suave" onClick={() => setVerTodo((v) => !v)}>{verTodo ? 'Ver menos' : `Ver todos (${movs.length})`}</Btn></div>}
        </div>
      )}
    </Seccion>
  )
}
