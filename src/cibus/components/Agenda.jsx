// Agenda de la veterinaria: citas y mascotas. Módulo «agenda» (viene de fábrica en el tipo veterinaria).
import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { claseInput } from '../lib/estilos'
import { coincide } from '../lib/buscar'
import { fechaHora } from '../lib/formato'
import { enlaceWhatsApp } from '../lib/datosCliente'
import { useDueno } from '../context/rol'
import { usePersistido, TREINTA_MIN } from '../lib/usePersistido'
import { confirmar } from '../lib/confirmar'
import Modal, { Campo } from './Modal'
import BarraFija from './BarraFija'

const ESPECIES = [['perro', 'Perro'], ['gato', 'Gato'], ['ave', 'Ave'], ['conejo', 'Conejo'], ['reptil', 'Reptil'], ['otro', 'Otro']]
const MOTIVOS = ['Consulta', 'Vacuna', 'Desparasitación', 'Control', 'Peluquería', 'Cirugía', 'Examen']
const ESTADOS = { pendiente: 'Pendiente', atendida: 'Atendida', cancelada: 'Cancelada', no_vino: 'No vino' }
const FILTROS = [['pendiente', 'Próximas'], ['atendida', 'Atendidas'], ['otras', 'Canceladas']]

const aLocal = (iso) => {                       // ISO → valor de <input type="datetime-local">
  const d = iso ? new Date(iso) : new Date(Date.now() + 3600000)
  d.setMinutes(0, 0, 0)
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}
const edad = (nac) => {
  if (!nac) return ''
  const m = Math.max(0, Math.floor((Date.now() - new Date(nac).getTime()) / 2629800000))
  return m < 12 ? `${m} ${m === 1 ? 'mes' : 'meses'}` : `${Math.floor(m / 12)} ${Math.floor(m / 12) === 1 ? 'año' : 'años'}`
}

export default function Agenda() {
  const dueno = useDueno()
  const [vista, setVista] = usePersistido('agenda:vista', 'citas', true, TREINTA_MIN)
  const [mascotas, setMascotas] = useState([])
  const [citas, setCitas] = useState([])
  const [filtro, setFiltro] = useState('pendiente')
  const [texto, setTexto] = useState('')
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [cita, setCita] = useState(null)       // null | {} nueva | fila existente
  const [mascota, setMascota] = useState(null)

  const cargar = useCallback(async () => {
    setCargando(true)
    const [m, c] = await Promise.all([
      supabase.from('mascotas').select('*').eq('activo', true).order('nombre').range(0, 999),
      supabase.from('citas').select('*').order('inicio', { ascending: true }).range(0, 999),
    ])
    setError(m.error?.message || c.error?.message || '')
    setMascotas(m.data ?? []); setCitas(c.data ?? [])
    setCargando(false)
  }, [])
  useEffect(() => { cargar() }, [cargar])

  const porId = Object.fromEntries(mascotas.map(m => [m.id, m]))
  const visiblesCitas = citas
    .filter(c => filtro === 'otras' ? (c.estado === 'cancelada' || c.estado === 'no_vino') : c.estado === filtro)
    .filter(c => coincide([porId[c.mascota_id]?.nombre, porId[c.mascota_id]?.dueno_nombre, c.motivo], texto))
  if (filtro !== 'pendiente') visiblesCitas.reverse()
  const visiblesMascotas = mascotas.filter(m => coincide([m.nombre, m.raza, m.dueno_nombre, m.dueno_telefono], texto))

  return (
    <div className="space-y-4">
      <BarraFija nivel={0}>
        <div className="grid grid-cols-2 gap-2">
          {[['citas', 'Citas'], ['mascotas', 'Mascotas']].map(([id, t]) => (
            <button key={id} onClick={() => { setVista(id); setTexto('') }}
              className={`h-11 rounded-xl text-sm font-semibold ${vista === id ? 'bg-marca text-white' : 'bg-white text-slate-500 shadow-sm'}`}>{t}</button>
          ))}
        </div>
        <div className="grid grid-cols-[1fr_auto] gap-2 mt-2">
          <input value={texto} onChange={e => setTexto(e.target.value)} placeholder={vista === 'citas' ? 'Buscar por mascota, dueño o motivo' : 'Buscar mascota o dueño'} className={claseInput} />
          <button onClick={() => (vista === 'citas' ? setCita({}) : setMascota({}))}
            className="h-12 px-4 rounded-xl bg-marca text-white text-sm font-semibold active:bg-marca-oscuro">+ {vista === 'citas' ? 'Cita' : 'Mascota'}</button>
        </div>
        {vista === 'citas' && (
          <div className="grid grid-cols-3 gap-2 mt-2">
            {FILTROS.map(([id, t]) => (
              <button key={id} onClick={() => setFiltro(id)}
                className={`h-10 rounded-xl text-xs font-semibold ${filtro === id ? 'bg-negro text-champagne' : 'bg-white text-slate-500 shadow-sm'}`}>{t}</button>
            ))}
          </div>
        )}
      </BarraFija>

      {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
      {cargando ? <p className="text-center text-sm text-slate-400 py-8">Cargando…</p> : vista === 'citas' ? (
        visiblesCitas.length === 0 ? <p className="text-center text-sm text-slate-400 py-8">No hay citas aquí</p> : (
          <ul className="bg-white rounded-2xl shadow-sm divide-y divide-slate-100">
            {visiblesCitas.map(c => {
              const m = porId[c.mascota_id]
              return (
                <li key={c.id}>
                  <button onClick={() => setCita(c)} className="w-full min-h-14 px-4 py-2 grid grid-cols-[1fr_auto] gap-3 items-center text-left active:bg-slate-50">
                    <div className="min-w-0">
                      <p className="text-sm font-medium break-words">{m?.nombre ?? 'Mascota'} · {c.motivo}</p>
                      <p className="text-xs text-slate-400 break-words">{m?.dueno_nombre ? `${m.dueno_nombre} · ` : ''}{fechaHora(c.inicio)}</p>
                    </div>
                    <span className={`text-xs font-semibold ${c.estado === 'pendiente' ? 'text-marca' : 'text-slate-400'}`}>{ESTADOS[c.estado]}</span>
                  </button>
                </li>
              )
            })}
          </ul>
        )
      ) : (
        visiblesMascotas.length === 0 ? <p className="text-center text-sm text-slate-400 py-8">Todavía no hay mascotas</p> : (
          <ul className="bg-white rounded-2xl shadow-sm divide-y divide-slate-100">
            {visiblesMascotas.map(m => (
              <li key={m.id}>
                <button onClick={() => setMascota(m)} className="w-full min-h-14 px-4 py-2 grid grid-cols-[1fr_auto] gap-3 items-center text-left active:bg-slate-50">
                  <div className="min-w-0">
                    <p className="text-sm font-medium break-words">{m.nombre} <span className="text-slate-400 font-normal">· {ESPECIES.find(e => e[0] === m.especie)?.[1]}{m.raza ? ` ${m.raza}` : ''}</span></p>
                    <p className="text-xs text-slate-400 break-words">{m.dueno_nombre || 'Sin dueño anotado'}{m.nacimiento ? ` · ${edad(m.nacimiento)}` : ''}</p>
                  </div>
                  <span className="text-slate-400" aria-hidden="true">›</span>
                </button>
              </li>
            ))}
          </ul>
        )
      )}

      {cita && <FormCita cita={cita} mascotas={mascotas} dueno={dueno} onCerrar={() => setCita(null)} onListo={() => { setCita(null); cargar() }}
        onNuevaMascota={() => { setCita(null); setMascota({}) }} />}
      {mascota && <FormMascota mascota={mascota} dueno={dueno} onCerrar={() => setMascota(null)} onListo={() => { setMascota(null); cargar() }} />}
    </div>
  )
}

function FormCita({ cita, mascotas, dueno, onCerrar, onListo, onNuevaMascota }) {
  const nueva = !cita.id
  const [f, setF] = useState({ mascota_id: cita.mascota_id ?? mascotas[0]?.id ?? '', inicio: aLocal(cita.inicio), motivo: cita.motivo ?? '', notas: cita.notas ?? '' })
  const [error, setError] = useState('')
  const [guardando, setGuardando] = useState(false)
  const m = mascotas.find(x => x.id === f.mascota_id)
  const poner = (k) => (e) => setF(p => ({ ...p, [k]: e.target.value }))

  const guardar = async (estado) => {
    if (!f.mascota_id) return setError('Elige la mascota (o créala primero)')
    if (!f.motivo.trim()) return setError('Escribe el motivo de la cita')
    if (!f.inicio) return setError('Elige el día y la hora')
    setGuardando(true); setError('')
    const fila = { mascota_id: f.mascota_id, inicio: new Date(f.inicio).toISOString(), motivo: f.motivo.trim(), notas: f.notas.trim() || null, ...(estado ? { estado } : {}) }
    const { error: err } = nueva ? await supabase.from('citas').insert(fila) : await supabase.from('citas').update(fila).eq('id', cita.id)
    setGuardando(false)
    if (err) return setError(err.message)
    onListo()
  }
  const borrar = async () => {
    if (!(await confirmar({ titulo: '¿Borrar esta cita?', texto: 'No se puede deshacer.', si: 'Sí, borrar' }))) return
    const { error: err } = await supabase.from('citas').delete().eq('id', cita.id)
    if (err) return setError(err.message)
    onListo()
  }
  const recordatorio = m?.dueno_telefono && enlaceWhatsApp(m.dueno_telefono,
    `Hola${m.dueno_nombre ? ` ${m.dueno_nombre}` : ''}, te recordamos la cita de ${m.nombre} (${f.motivo || 'consulta'}) el ${fechaHora(new Date(f.inicio).toISOString())}.`)

  return (
    <Modal titulo={nueva ? 'Nueva cita' : 'Cita'} onCerrar={onCerrar}>
      {mascotas.length === 0 ? (
        <button onClick={onNuevaMascota} className="w-full h-12 rounded-xl bg-marca text-white font-semibold">Primero registra una mascota</button>
      ) : (<>
        <Campo etiqueta="Mascota">
          <select value={f.mascota_id} onChange={poner('mascota_id')} className={claseInput}>
            {mascotas.map(x => <option key={x.id} value={x.id}>{x.nombre}{x.dueno_nombre ? ` — ${x.dueno_nombre}` : ''}</option>)}
          </select>
        </Campo>
        <Campo etiqueta="Día y hora"><input type="datetime-local" value={f.inicio} onChange={poner('inicio')} className={claseInput} /></Campo>
        <Campo etiqueta="Motivo">
          <input value={f.motivo} onChange={poner('motivo')} list="motivos-cita" placeholder="Vacuna, consulta…" className={claseInput} />
          <datalist id="motivos-cita">{MOTIVOS.map(x => <option key={x} value={x} />)}</datalist>
        </Campo>
        <Campo etiqueta="Notas (opcional)"><textarea value={f.notas} onChange={poner('notas')} rows={3} className={`${claseInput} h-auto py-3`} /></Campo>
        {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
        <button onClick={() => guardar()} disabled={guardando} className="w-full h-12 rounded-xl bg-marca text-white font-semibold disabled:opacity-40 active:bg-marca-oscuro">
          {guardando ? 'Guardando…' : nueva ? 'Agendar cita' : 'Guardar cambios'}
        </button>
        {!nueva && cita.estado === 'pendiente' && (
          <div className="grid grid-cols-3 gap-2">
            <button onClick={() => guardar('atendida')} className="h-11 rounded-xl bg-lima/25 text-marca text-xs font-semibold">Atendida</button>
            <button onClick={() => guardar('no_vino')} className="h-11 rounded-xl bg-slate-100 text-slate-600 text-xs font-semibold">No vino</button>
            <button onClick={() => guardar('cancelada')} className="h-11 rounded-xl bg-slate-100 text-slate-600 text-xs font-semibold">Cancelar</button>
          </div>
        )}
        {!nueva && cita.estado !== 'pendiente' && (
          <button onClick={() => guardar('pendiente')} className="w-full h-11 rounded-xl bg-slate-100 text-slate-600 text-sm font-semibold">Volver a pendiente</button>
        )}
        {recordatorio && <a href={recordatorio} target="_blank" rel="noreferrer" className="grid place-items-center w-full h-11 rounded-xl bg-champagne text-negro text-sm font-semibold">Recordar por WhatsApp</a>}
        {!nueva && dueno && <button onClick={borrar} className="w-full h-11 rounded-xl bg-red-50 text-red-600 text-sm font-semibold active:bg-red-100">Borrar cita</button>}
      </>)}
    </Modal>
  )
}

function FormMascota({ mascota, dueno, onCerrar, onListo }) {
  const nueva = !mascota.id
  const [f, setF] = useState({ nombre: mascota.nombre ?? '', especie: mascota.especie ?? 'perro', raza: mascota.raza ?? '', sexo: mascota.sexo ?? '', nacimiento: mascota.nacimiento ?? '',
    dueno_nombre: mascota.dueno_nombre ?? '', dueno_telefono: mascota.dueno_telefono ?? '', notas: mascota.notas ?? '' })
  const [error, setError] = useState('')
  const [guardando, setGuardando] = useState(false)
  const poner = (k) => (e) => setF(p => ({ ...p, [k]: e.target.value }))

  const guardar = async () => {
    if (!f.nombre.trim()) return setError('Escribe el nombre de la mascota')
    setGuardando(true); setError('')
    const fila = { nombre: f.nombre.trim(), especie: f.especie, raza: f.raza.trim() || null, sexo: f.sexo || null, nacimiento: f.nacimiento || null,
      dueno_nombre: f.dueno_nombre.trim() || null, dueno_telefono: f.dueno_telefono.replace(/\D/g, '').slice(0, 20) || null, notas: f.notas.trim() || null }
    const { error: err } = nueva ? await supabase.from('mascotas').insert(fila) : await supabase.from('mascotas').update(fila).eq('id', mascota.id)
    setGuardando(false)
    if (err) return setError(err.message)
    onListo()
  }
  const archivar = async () => {
    if (!(await confirmar({ titulo: '¿Quitar esta mascota?', texto: 'Dejará de salir en la lista. Sus citas anteriores se conservan.', si: 'Sí, quitar' }))) return
    const { error: err } = await supabase.from('mascotas').update({ activo: false }).eq('id', mascota.id)
    if (err) return setError(err.message)
    onListo()
  }

  return (
    <Modal titulo={nueva ? 'Nueva mascota' : mascota.nombre} onCerrar={onCerrar}>
      <Campo etiqueta="Nombre"><input autoFocus={nueva} value={f.nombre} onChange={poner('nombre')} className={claseInput} /></Campo>
      <div className="grid grid-cols-2 gap-3">
        <Campo etiqueta="Especie"><select value={f.especie} onChange={poner('especie')} className={claseInput}>{ESPECIES.map(([v, t]) => <option key={v} value={v}>{t}</option>)}</select></Campo>
        <Campo etiqueta="Sexo"><select value={f.sexo} onChange={poner('sexo')} className={claseInput}><option value="">—</option><option value="macho">Macho</option><option value="hembra">Hembra</option></select></Campo>
        <Campo etiqueta="Raza"><input value={f.raza} onChange={poner('raza')} className={claseInput} /></Campo>
        <Campo etiqueta="Nacimiento"><input type="date" value={f.nacimiento} onChange={poner('nacimiento')} className={claseInput} /></Campo>
      </div>
      <Campo etiqueta="Dueño"><input value={f.dueno_nombre} onChange={poner('dueno_nombre')} className={claseInput} /></Campo>
      <Campo etiqueta="Celular del dueño"><input value={f.dueno_telefono} onChange={poner('dueno_telefono')} inputMode="tel" className={claseInput} /></Campo>
      <Campo etiqueta="Notas (alergias, vacunas, carácter…)"><textarea value={f.notas} onChange={poner('notas')} rows={3} className={`${claseInput} h-auto py-3`} /></Campo>
      {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
      <button onClick={guardar} disabled={guardando} className="w-full h-12 rounded-xl bg-marca text-white font-semibold disabled:opacity-40 active:bg-marca-oscuro">
        {guardando ? 'Guardando…' : nueva ? 'Guardar mascota' : 'Guardar cambios'}
      </button>
      {!nueva && dueno && <button onClick={archivar} className="w-full h-11 rounded-xl bg-red-50 text-red-600 text-sm font-semibold active:bg-red-100">Quitar mascota</button>}
    </Modal>
  )
}
