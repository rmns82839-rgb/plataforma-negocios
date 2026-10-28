// Horario de atención por día: el cliente ve «Abierto ahora / Cerrado» en el catálogo y en el directorio de tiendas.
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { claseInput } from '../lib/estilos'
import { DIAS, ORDEN_SEMANA, OPCIONES_HORA, estadoHorario, textoEstado, franjasDe, validarSemana, resumenHorario, hora12, finDeHoy } from '../../lib/horario'

const FRANJA_NUEVA = ['08:00', '18:00']
const aDias = (semana) => Object.fromEntries(ORDEN_SEMANA.map(d => [d, franjasDe(semana, d)]))
const aSemana = (dias) => Object.fromEntries(ORDEN_SEMANA.map(d => [String(d), dias[d]]))

function Hora({ valor, onCambio, etiqueta, minimo }) {
  const opciones = useMemo(() => {
    const o = OPCIONES_HORA.filter(h => !minimo || h > minimo)
    return o.includes(valor) || !valor ? o : [...o, valor].sort()
  }, [valor, minimo])
  return (
    <label className="block min-w-0">
      <span className="text-sm text-slate-500">{etiqueta}</span>
      <select value={valor} onChange={(e) => onCambio(e.target.value)} className={claseInput}>
        {opciones.map(h => <option key={h} value={h}>{hora12(h)}</option>)}
      </select>
    </label>
  )
}

export default function HorarioAtencion() {
  const [dias, setDias] = useState(() => aDias(null))
  const [hayHorario, setHayHorario] = useState(false)       // false = todavía no lo ha llenado
  const [cerradoHasta, setCerradoHasta] = useState(null)
  const [enDirectorio, setEnDirectorio] = useState(true)
  const [guardado, setGuardado] = useState('')
  const [cargando, setCargando] = useState(true)
  const [ocupado, setOcupado] = useState(false)
  const [aviso, setAviso] = useState(null)

  useEffect(() => {
    supabase.from('negocio').select('*').eq('id', 1).maybeSingle().then(({ data, error }) => {
      if (error) setAviso({ tipo: 'error', texto: error.message })
      const sem = data?.horario_semana ?? null
      const d = aDias(sem)
      setDias(d); setHayHorario(Boolean(sem)); setCerradoHasta(data?.cerrado_hasta ?? null); setEnDirectorio(data?.en_directorio !== false)
      setGuardado(JSON.stringify({ d, e: data?.en_directorio !== false }))
      setCargando(false)
    })
  }, [])

  const semana = aSemana(dias)
  const cambios = !cargando && JSON.stringify({ d: dias, e: enDirectorio }) !== guardado
  const abiertoHoy = cerradoHasta && new Date(cerradoHasta) > new Date() ? { abierto: false, temporal: true } : estadoHorario(hayHorario || cambios ? semana : null, null)
  const t = textoEstado(abiertoHoy)

  const poner = (d, franjas) => { setDias(p => ({ ...p, [d]: franjas })); setAviso(null) }
  const cambiarHora = (d, i, j, v) => {
    const f = dias[d].map(x => [...x]); f[i][j] = v
    if (f[i][0] >= f[i][1]) { if (j === 0) f[i][1] = OPCIONES_HORA.find(h => h > v) ?? '23:59'; else f[i][0] = [...OPCIONES_HORA].reverse().find(h => h < v) ?? '04:00' }
    poner(d, f)
  }
  const copiarATodos = (desde) => { const f = dias[desde]; setDias(Object.fromEntries(ORDEN_SEMANA.map(d => [d, f.map(x => [...x])]))); setAviso(null) }
  const primeroAbierto = ORDEN_SEMANA.find(d => dias[d].length)

  const guardar = async (extra = {}) => {
    const err = validarSemana(semana)
    if (err) return setAviso({ tipo: 'error', texto: err })
    setOcupado(true); setAviso(null)
    const { error } = await supabase.from('negocio').update({
      horario_semana: semana, horario: resumenHorario(semana).slice(0, 200), en_directorio: enDirectorio, ...extra, actualizado_en: new Date().toISOString(),
    }).eq('id', 1)
    setOcupado(false)
    if (error) return setAviso({ tipo: 'error', texto: error.message })
    setHayHorario(true); setGuardado(JSON.stringify({ d: dias, e: enDirectorio }))
    if ('cerrado_hasta' in extra) setCerradoHasta(extra.cerrado_hasta)
    setAviso({ tipo: 'ok', texto: 'cerrado_hasta' in extra ? (extra.cerrado_hasta ? 'Listo: hoy aparece como cerrado. Mañana se abre solo.' : 'Listo: ya apareces abierto según tu horario.') : 'Horario guardado. Tus clientes ya lo ven.' })
  }

  if (cargando) return <p className="text-center text-sm text-slate-400 py-4">Cargando horario…</p>

  return (
    <section className="bg-white rounded-2xl shadow-sm p-4 space-y-4" aria-labelledby="titulo-horario">
      <div>
        <h3 id="titulo-horario" className="text-base font-semibold">Horario de atención</h3>
        <p className="text-sm text-slate-500">Tus clientes verán si estás abierto o cerrado, y en el directorio de tiendas puedes salir entre las abiertas.</p>
      </div>

      {t
        ? <p className={`rounded-xl p-3 text-base font-semibold ${t.abierto ? 'bg-emerald-50 text-emerald-900' : 'bg-red-50 text-red-900'}`}>Ahora mismo tu tienda aparece: {t.texto}</p>
        : <p className="rounded-xl bg-amber-50 text-amber-900 p-3 text-base">Todavía no has puesto tu horario: los clientes no sabrán si estás abierto. Llénalo y guarda.</p>}

      <div className="space-y-3">
        {ORDEN_SEMANA.map(d => {
          const f = dias[d]
          return (
            <div key={d} className="rounded-xl border border-slate-200 p-3 space-y-3">
              <div className="grid grid-cols-[1fr_auto] items-center gap-3">
                <p className="text-base font-semibold break-words">{DIAS[d]}</p>
                <div className="grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1" role="group" aria-label={`${DIAS[d]}: abierto o cerrado`}>
                  {[[true, 'Abierto'], [false, 'Cerrado']].map(([v, tx]) => (
                    <button key={tx} type="button" aria-pressed={(f.length > 0) === v}
                      onClick={() => poner(d, v ? (f.length ? f : [[...FRANJA_NUEVA]]) : [])}
                      className={`min-h-11 min-w-[5.5rem] rounded-lg text-base font-semibold ${(f.length > 0) === v ? (v ? 'bg-esmeralda text-white' : 'bg-white text-slate-700 shadow-sm') : 'text-slate-500'}`}>{tx}</button>
                  ))}
                </div>
              </div>
              {f.map((fr, i) => (
                <div key={i} className="space-y-2">
                  {f.length > 1 && <p className="text-sm font-semibold text-slate-500">{i === 0 ? 'Primer horario (mañana)' : 'Segundo horario (tarde)'}</p>}
                  <div className="grid grid-cols-2 gap-3">
                    <Hora etiqueta="Abre" valor={fr[0]} onCambio={(v) => cambiarHora(d, i, 0, v)} />
                    <Hora etiqueta="Cierra" valor={fr[1]} minimo={fr[0]} onCambio={(v) => cambiarHora(d, i, 1, v)} />
                  </div>
                </div>
              ))}
              {f.length === 1 && f[0][1] <= '19:00' && (
                <button type="button" onClick={() => poner(d, [[f[0][0], '12:00'], ['14:00', f[0][1] > '14:00' ? f[0][1] : '18:00']])}
                  className="min-h-11 w-full rounded-xl border border-slate-300 text-base font-medium text-slate-700">Cierro para almorzar (dos horarios)</button>
              )}
              {f.length === 2 && (
                <button type="button" onClick={() => poner(d, [[f[0][0], f[1][1]]])}
                  className="min-h-11 w-full rounded-xl border border-slate-300 text-base font-medium text-slate-700">Atiendo todo el día seguido</button>
              )}
            </div>
          )
        })}
      </div>

      {primeroAbierto != null && (
        <button type="button" onClick={() => copiarATodos(primeroAbierto)}
          className="min-h-12 w-full rounded-xl border border-slate-300 text-base font-semibold text-slate-700">Usar el horario del {DIAS[primeroAbierto].toLowerCase()} en todos los días</button>
      )}

      <label className="flex items-start gap-3 rounded-xl border border-slate-200 p-3 text-base">
        <input type="checkbox" className="mt-1 h-6 w-6 shrink-0 accent-esmeralda" checked={enDirectorio} onChange={(e) => { setEnDirectorio(e.target.checked); setAviso(null) }} />
        <span><b>Salir en el directorio de tiendas de Matriz</b><br /><span className="text-slate-500">Así te encuentran los clientes que buscan tiendas abiertas cerca de ellos. Nunca mostramos tu ubicación exacta, solo a cuántos kilómetros estás.</span></span>
      </label>

      <div className="rounded-xl border border-slate-200 p-3 space-y-2">
        <p className="text-base font-semibold">¿Hoy no vas a abrir?</p>
        {cerradoHasta && new Date(cerradoHasta) > new Date()
          ? <button type="button" disabled={ocupado} onClick={() => guardar({ cerrado_hasta: null })} className="min-h-12 w-full rounded-xl bg-esmeralda text-white text-base font-semibold disabled:opacity-60">Volver a abrir hoy</button>
          : <button type="button" disabled={ocupado} onClick={() => guardar({ cerrado_hasta: finDeHoy() })} className="min-h-12 w-full rounded-xl border-2 border-red-300 text-red-800 text-base font-semibold disabled:opacity-60">Hoy no abro (aparecer cerrado hasta mañana)</button>}
      </div>

      {aviso && aviso.texto && <p role="status" className={`rounded-xl p-3 text-base ${aviso.tipo === 'ok' ? 'bg-emerald-50 text-emerald-900' : 'bg-red-50 text-red-800'}`}>{aviso.texto}</p>}
      {cambios && <p className="text-sm font-semibold text-amber-700">Tienes cambios sin guardar.</p>}
      <button type="button" disabled={ocupado || (!cambios && hayHorario)} onClick={() => guardar()}
        className="w-full min-h-14 rounded-xl bg-negro text-champagne text-lg font-bold disabled:opacity-50">{ocupado ? 'Guardando…' : 'Guardar horario'}</button>
    </section>
  )
}
