// Encargos de la panadería: tortas, pasabocas y pedidos para un día y una hora, con anticipo y saldo por cobrar.
// Módulo «encargos» (viene de fábrica en el tipo panadería).
import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { claseInput } from '../lib/estilos'
import { coincide } from '../lib/buscar'
import { dinero, aNumero, fechaHora } from '../lib/formato'
import { enlaceWhatsApp } from '../lib/datosCliente'
import { useDueno } from '../context/rol'
import { usePersistido, TREINTA_MIN } from '../lib/usePersistido'
import { confirmar } from '../lib/confirmar'
import Modal, { Campo } from './Modal'
import BarraFija from './BarraFija'

const ESTADOS = { pendiente: 'Pendiente', listo: 'Listo', entregado: 'Entregado', cancelado: 'Cancelado' }
const FILTROS = [['por_entregar', 'Por entregar'], ['entregado', 'Entregados'], ['cancelado', 'Cancelados']]

const aLocal = (iso) => {                       // ISO → valor de <input type="datetime-local">
  const d = iso ? new Date(iso) : new Date(Date.now() + 86400000)
  if (!iso) d.setHours(10, 0, 0, 0)
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}
const mismoDia = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
// «Hoy», «Mañana» o «Atrasado» para lo que aún no se entrega
const cuando = (iso, ahora = new Date()) => {
  const d = new Date(iso)
  if (mismoDia(d, ahora)) return d < ahora ? 'Atrasado' : 'Hoy'
  if (d < ahora) return 'Atrasado'
  if (mismoDia(d, new Date(ahora.getTime() + 86400000))) return 'Mañana'
  return ''
}
const saldoDe = (e) => Math.max(0, Number(e.total) - Number(e.anticipo))

export default function Encargos() {
  const [filas, setFilas] = useState([])
  const [filtro, setFiltro] = usePersistido('encargos:filtro', 'por_entregar', true, TREINTA_MIN)
  const [texto, setTexto] = useState('')
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [form, setForm] = useState(null)       // null | {} nuevo | fila existente

  const cargar = useCallback(async () => {
    setCargando(true)
    const { data, error: err } = await supabase.from('encargos').select('*').order('entrega', { ascending: true }).range(0, 1999)
    setError(err?.message || ''); setFilas(data ?? []); setCargando(false)
  }, [])
  useEffect(() => { cargar() }, [cargar])

  const porEntregar = filas.filter(e => e.estado === 'pendiente' || e.estado === 'listo')
  const deHoy = porEntregar.filter(e => ['Hoy', 'Atrasado'].includes(cuando(e.entrega))).length
  const saldoTotal = porEntregar.reduce((s, e) => s + saldoDe(e), 0)
  const visibles = filas
    .filter(e => filtro === 'por_entregar' ? (e.estado === 'pendiente' || e.estado === 'listo') : e.estado === filtro)
    .filter(e => coincide([e.cliente_nombre, e.descripcion, e.telefono], texto))
  if (filtro !== 'por_entregar') visibles.reverse()

  return (
    <div className="space-y-4">
      <BarraFija nivel={0}>
        <div className="grid grid-cols-2 gap-2 mb-2">
          <div className="rounded-xl bg-negro text-champagne px-3 py-2 text-center"><p className="text-[11px] opacity-80">Para hoy o atrasados</p><p className="text-lg font-semibold">{deHoy}</p></div>
          <div className="rounded-xl bg-negro text-champagne px-3 py-2 text-center"><p className="text-[11px] opacity-80">Saldo por cobrar</p><p className="text-lg font-semibold">{dinero(saldoTotal)}</p></div>
        </div>
        <div className="grid grid-cols-[1fr_auto] gap-2">
          <input value={texto} onChange={e => setTexto(e.target.value)} placeholder="Buscar por cliente o encargo" className={claseInput} />
          <button onClick={() => setForm({})} className="h-12 px-4 rounded-xl bg-marca text-white text-sm font-semibold active:bg-marca-oscuro">+ Encargo</button>
        </div>
        <div className="grid grid-cols-3 gap-2 mt-2">
          {FILTROS.map(([id, t]) => (
            <button key={id} onClick={() => setFiltro(id)} className={`h-10 rounded-xl text-xs font-semibold ${filtro === id ? 'bg-negro text-champagne' : 'bg-white text-slate-500 shadow-sm'}`}>{t}</button>
          ))}
        </div>
      </BarraFija>

      {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2 break-words">{error}</p>}
      {cargando ? <p className="text-center text-sm text-slate-400 py-8">Cargando…</p> : visibles.length === 0 ? (
        <p className="text-center text-sm text-slate-400 py-8">No hay encargos aquí</p>
      ) : (
        <ul className="bg-white rounded-2xl shadow-sm divide-y divide-slate-100">
          {visibles.map(e => {
            const c = e.estado === 'pendiente' || e.estado === 'listo' ? cuando(e.entrega) : ''
            return (
              <li key={e.id}>
                <button onClick={() => setForm(e)} className="w-full min-h-16 px-4 py-2 grid grid-cols-[1fr_auto] gap-3 items-center text-left active:bg-slate-50">
                  <div className="min-w-0">
                    <p className="text-sm font-medium break-words">{e.cliente_nombre} · {e.descripcion}</p>
                    <p className="text-xs text-slate-400 break-words">{fechaHora(e.entrega)}{c && <span className={`ml-2 font-semibold ${c === 'Atrasado' ? 'text-red-500' : 'text-marca'}`}>{c}</span>}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs font-semibold">{e.estado === 'listo' ? 'Listo' : ESTADOS[e.estado]}</p>
                    {saldoDe(e) > 0 && e.estado !== 'cancelado' && <p className="text-xs text-slate-400">Debe {dinero(saldoDe(e))}</p>}
                  </div>
                </button>
              </li>
            )
          })}
        </ul>
      )}
      {form && <FormEncargo encargo={form} onCerrar={() => setForm(null)} onListo={() => { setForm(null); cargar() }} />}
    </div>
  )
}

function FormEncargo({ encargo, onCerrar, onListo }) {
  const dueno = useDueno()
  const nuevo = !encargo.id
  const [f, setF] = useState({ cliente_nombre: encargo.cliente_nombre ?? '', telefono: encargo.telefono ?? '', descripcion: encargo.descripcion ?? '', entrega: aLocal(encargo.entrega),
    total: encargo.total ? String(Number(encargo.total)) : '', anticipo: encargo.anticipo ? String(Number(encargo.anticipo)) : '', notas: encargo.notas ?? '' })
  const [error, setError] = useState('')
  const [guardando, setGuardando] = useState(false)
  const poner = (k) => (e) => setF(p => ({ ...p, [k]: e.target.value }))
  const total = aNumero(f.total) || 0, anticipo = aNumero(f.anticipo) || 0

  const guardar = async (estado) => {
    if (!f.cliente_nombre.trim()) return setError('Escribe el nombre del cliente')
    if (!f.descripcion.trim()) return setError('Describe el encargo (por ejemplo «Torta de chocolate para 20»)')
    if (!f.entrega) return setError('Elige el día y la hora de entrega')
    if (anticipo > total) return setError('El anticipo no puede ser mayor que el total')
    setGuardando(true); setError('')
    const fila = { cliente_nombre: f.cliente_nombre.trim(), telefono: f.telefono.replace(/\D/g, '').slice(0, 20) || null, descripcion: f.descripcion.trim(),
      entrega: new Date(f.entrega).toISOString(), total, anticipo, notas: f.notas.trim() || null, ...(estado ? { estado } : {}) }
    const { error: err } = nuevo ? await supabase.from('encargos').insert(fila) : await supabase.from('encargos').update(fila).eq('id', encargo.id)
    setGuardando(false)
    if (err) return setError(err.message)
    onListo()
  }
  const marcar = async (estado) => {
    if (estado === 'entregado' && total - anticipo > 0 &&
      !(await confirmar({ titulo: `¿Entregado? Falta cobrar ${dinero(total - anticipo)}`, texto: 'Cóbralo en la caja si aún no lo has hecho.', si: 'Sí, entregado' }))) return
    if (estado === 'cancelado' && !(await confirmar({ titulo: '¿Cancelar este encargo?', texto: anticipo > 0 ? `Recuerda devolver el anticipo de ${dinero(anticipo)} si corresponde.` : 'No se puede deshacer fácilmente.', si: 'Sí, cancelar' }))) return
    guardar(estado)
  }
  const borrar = async () => {
    if (!(await confirmar({ titulo: '¿Borrar este encargo?', texto: 'No se puede deshacer.', si: 'Sí, borrar' }))) return
    const { error: err } = await supabase.from('encargos').delete().eq('id', encargo.id)
    if (err) return setError(err.message)
    onListo()
  }
  const aviso = f.telefono && enlaceWhatsApp(f.telefono, `Hola ${f.cliente_nombre.trim()}, tu encargo (${f.descripcion.trim()}) ya está listo. Te esperamos.`)
  const activo = !nuevo && (encargo.estado === 'pendiente' || encargo.estado === 'listo')

  return (
    <Modal titulo={nuevo ? 'Nuevo encargo' : 'Encargo'} onCerrar={onCerrar}>
      <Campo etiqueta="Cliente"><input autoFocus={nuevo} value={f.cliente_nombre} onChange={poner('cliente_nombre')} className={claseInput} /></Campo>
      <Campo etiqueta="Celular"><input value={f.telefono} onChange={poner('telefono')} inputMode="tel" className={claseInput} /></Campo>
      <Campo etiqueta="¿Qué encargó?"><textarea value={f.descripcion} onChange={poner('descripcion')} rows={3} placeholder="Torta de chocolate para 20 personas, 100 pasabocas…" className={`${claseInput} h-auto py-3`} /></Campo>
      <Campo etiqueta="Día y hora de entrega"><input type="datetime-local" value={f.entrega} onChange={poner('entrega')} className={claseInput} /></Campo>
      <div className="grid grid-cols-2 gap-3">
        <Campo etiqueta="Total"><input value={f.total} onChange={poner('total')} inputMode="decimal" placeholder="120000" className={claseInput} /></Campo>
        <Campo etiqueta="Anticipo"><input value={f.anticipo} onChange={poner('anticipo')} inputMode="decimal" placeholder="50000" className={claseInput} /></Campo>
      </div>
      <div className="rounded-xl bg-negro text-champagne px-4 py-3 grid grid-cols-[1fr_auto] items-center">
        <span className="text-sm">Saldo por cobrar</span><span className="text-xl font-semibold">{dinero(Math.max(0, total - anticipo))}</span>
      </div>
      <Campo etiqueta="Notas (opcional)"><textarea value={f.notas} onChange={poner('notas')} rows={2} className={`${claseInput} h-auto py-3`} /></Campo>
      {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2 break-words">{error}</p>}
      <button onClick={() => guardar()} disabled={guardando} className="w-full h-12 rounded-xl bg-marca text-white font-semibold disabled:opacity-40 active:bg-marca-oscuro">
        {guardando ? 'Guardando…' : nuevo ? 'Guardar encargo' : 'Guardar cambios'}
      </button>
      {activo && (
        <div className="grid grid-cols-3 gap-2">
          <button onClick={() => marcar('listo')} disabled={encargo.estado === 'listo'} className="h-11 rounded-xl bg-lima/25 text-marca text-xs font-semibold disabled:opacity-40">Listo</button>
          <button onClick={() => marcar('entregado')} className="h-11 rounded-xl bg-negro text-champagne text-xs font-semibold">Entregado</button>
          <button onClick={() => marcar('cancelado')} className="h-11 rounded-xl bg-slate-100 text-slate-600 text-xs font-semibold">Cancelar</button>
        </div>
      )}
      {!nuevo && !activo && <button onClick={() => guardar('pendiente')} className="w-full h-11 rounded-xl bg-slate-100 text-slate-600 text-sm font-semibold">Volver a pendiente</button>}
      {aviso && <a href={aviso} target="_blank" rel="noreferrer" className="grid place-items-center w-full h-11 rounded-xl bg-champagne text-negro text-sm font-semibold">Avisar por WhatsApp que está listo</a>}
      {!nuevo && dueno && <button onClick={borrar} className="w-full h-11 rounded-xl bg-red-50 text-red-600 text-sm font-semibold active:bg-red-100">Borrar encargo</button>}
    </Modal>
  )
}
