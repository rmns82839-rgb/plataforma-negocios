// Garantías de equipos (celulares, accesorios, electrodomésticos): serial/IMEI, vencimiento y reclamos. Módulo «garantias».
import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { claseInput } from '../lib/estilos'
import { coincide } from '../lib/buscar'
import { enlaceWhatsApp } from '../lib/datosCliente'
import { useDueno } from '../context/rol'
import { confirmar } from '../lib/confirmar'
import Modal, { Campo } from './Modal'
import BarraFija from './BarraFija'

const FILTROS = [['vigentes', 'Vigentes'], ['por_vencer', 'Por vencer'], ['vencidas', 'Vencidas'], ['todas', 'Todas']]
const hoy = () => { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10) }
const dias = (vence) => Math.round((new Date(vence + 'T00:00:00') - new Date(hoy() + 'T00:00:00')) / 86400000)
const fechaLarga = (s) => new Date(s + 'T00:00:00').toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' })
const estadoDe = (g) => {
  if (g.estado === 'reclamada') return { t: 'En reclamo', c: 'text-amber-600' }
  if (g.estado === 'cerrada') return { t: 'Cerrada', c: 'text-slate-400' }
  const d = dias(g.vence)
  if (d < 0) return { t: 'Vencida', c: 'text-red-600' }
  if (d <= 30) return { t: `Vence en ${d} ${d === 1 ? 'día' : 'días'}`, c: 'text-amber-600' }
  return { t: 'Vigente', c: 'text-marca' }
}

export default function Garantias() {
  const dueno = useDueno()
  const [lista, setLista] = useState([])
  const [filtro, setFiltro] = useState('vigentes')
  const [texto, setTexto] = useState('')
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [abierta, setAbierta] = useState(null)

  const cargar = useCallback(async () => {
    setCargando(true)
    const { data, error: err } = await supabase.from('garantias').select('*').order('vence', { ascending: true }).range(0, 999)
    setError(err?.message ?? ''); setLista(data ?? []); setCargando(false)
  }, [])
  useEffect(() => { cargar() }, [cargar])

  const visibles = lista.filter(g => {
    const vivo = g.estado === 'vigente'
    if (filtro === 'vigentes') return vivo && dias(g.vence) >= 0
    if (filtro === 'por_vencer') return vivo && dias(g.vence) >= 0 && dias(g.vence) <= 30
    if (filtro === 'vencidas') return vivo && dias(g.vence) < 0
    return true
  }).filter(g => coincide([g.cliente_nombre, g.articulo, g.serial, g.telefono], texto))

  return (
    <div className="space-y-4">
      <BarraFija nivel={0}>
        <div className="grid grid-cols-[1fr_auto] gap-2">
          <input value={texto} onChange={e => setTexto(e.target.value)} placeholder="Buscar por cliente, equipo o IMEI" className={claseInput} />
          <button onClick={() => setAbierta({})} className="h-12 px-4 rounded-xl bg-marca text-white text-sm font-semibold active:bg-marca-oscuro">+ Garantía</button>
        </div>
        <div className="grid grid-cols-4 gap-2 mt-2">
          {FILTROS.map(([id, t]) => (
            <button key={id} onClick={() => setFiltro(id)} className={`min-h-10 rounded-xl text-[11px] font-semibold leading-tight px-1 ${filtro === id ? 'bg-negro text-champagne' : 'bg-white text-slate-500 shadow-sm'}`}>{t}</button>
          ))}
        </div>
      </BarraFija>
      {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
      {cargando ? <p className="text-center text-sm text-slate-400 py-8">Cargando…</p> : visibles.length === 0 ? (
        <p className="text-center text-sm text-slate-400 py-8">No hay garantías aquí</p>
      ) : (
        <ul className="bg-white rounded-2xl shadow-sm divide-y divide-slate-100">
          {visibles.map(g => {
            const e = estadoDe(g)
            return (
              <li key={g.id}>
                <button onClick={() => setAbierta(g)} className="w-full min-h-14 px-4 py-2 grid grid-cols-[1fr_auto] gap-3 items-center text-left active:bg-slate-50">
                  <div className="min-w-0">
                    <p className="text-sm font-medium break-words">{g.articulo}</p>
                    <p className="text-xs text-slate-400 break-words">{g.cliente_nombre}{g.serial ? ` · ${g.serial}` : ''}</p>
                  </div>
                  <span className={`text-xs font-semibold text-right ${e.c}`}>{e.t}</span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
      {abierta && <Form g={abierta} dueno={dueno} onCerrar={() => setAbierta(null)} onListo={() => { setAbierta(null); cargar() }} />}
    </div>
  )
}

function Form({ g, dueno, onCerrar, onListo }) {
  const nueva = !g.id
  const [f, setF] = useState({ cliente_nombre: g.cliente_nombre ?? '', telefono: g.telefono ?? '', articulo: g.articulo ?? '', serial: g.serial ?? '',
    fecha_compra: g.fecha_compra ?? hoy(), meses: String(g.meses ?? 6), notas: g.notas ?? '' })
  const [error, setError] = useState('')
  const [guardando, setGuardando] = useState(false)
  const poner = (k) => (e) => setF(p => ({ ...p, [k]: e.target.value }))
  const guardar = async (estado) => {
    if (!f.cliente_nombre.trim()) return setError('Escribe el nombre del cliente')
    if (!f.articulo.trim()) return setError('Escribe qué equipo es')
    const meses = Number(f.meses)
    if (!Number.isInteger(meses) || meses < 0 || meses > 60) return setError('Los meses van de 0 a 60')
    setGuardando(true); setError('')
    const fila = { cliente_nombre: f.cliente_nombre.trim(), telefono: f.telefono.replace(/\D/g, '').slice(0, 20) || null, articulo: f.articulo.trim(),
      serial: f.serial.trim() || null, fecha_compra: f.fecha_compra, meses, notas: f.notas.trim() || null, ...(estado ? { estado } : {}) }
    const { error: err } = nueva ? await supabase.from('garantias').insert(fila) : await supabase.from('garantias').update(fila).eq('id', g.id)
    setGuardando(false)
    if (err) return setError(err.message)
    onListo()
  }
  const borrar = async () => {
    if (!(await confirmar({ titulo: '¿Borrar esta garantía?', texto: 'No se puede deshacer.', si: 'Sí, borrar' }))) return
    const { error: err } = await supabase.from('garantias').delete().eq('id', g.id)
    if (err) return setError(err.message)
    onListo()
  }
  const e = !nueva ? estadoDe(g) : null
  const aviso = !nueva && g.telefono && enlaceWhatsApp(g.telefono, `Hola ${g.cliente_nombre}, te escribimos por la garantía de tu ${g.articulo}${g.vence ? ` (vence el ${fechaLarga(g.vence)})` : ''}.`)

  return (
    <Modal titulo={nueva ? 'Nueva garantía' : 'Garantía'} onCerrar={onCerrar}>
      {e && <p className={`text-sm font-semibold ${e.c}`}>{e.t}{g.vence ? ` · vence el ${fechaLarga(g.vence)}` : ''}</p>}
      <Campo etiqueta="Equipo"><input autoFocus={nueva} value={f.articulo} onChange={poner('articulo')} placeholder="Celular Samsung A15" className={claseInput} /></Campo>
      <Campo etiqueta="Serial o IMEI"><input value={f.serial} onChange={poner('serial')} inputMode="text" className={claseInput} /></Campo>
      <Campo etiqueta="Cliente"><input value={f.cliente_nombre} onChange={poner('cliente_nombre')} className={claseInput} /></Campo>
      <Campo etiqueta="Celular del cliente"><input value={f.telefono} onChange={poner('telefono')} inputMode="tel" className={claseInput} /></Campo>
      <div className="grid grid-cols-2 gap-3">
        <Campo etiqueta="Fecha de compra"><input type="date" value={f.fecha_compra} onChange={poner('fecha_compra')} className={claseInput} /></Campo>
        <Campo etiqueta="Meses de garantía"><input value={f.meses} onChange={poner('meses')} inputMode="numeric" className={claseInput} /></Campo>
      </div>
      <Campo etiqueta="Notas (opcional)"><textarea value={f.notas} onChange={poner('notas')} rows={3} className={`${claseInput} h-auto py-3`} /></Campo>
      {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
      <button onClick={() => guardar()} disabled={guardando} className="w-full h-12 rounded-xl bg-marca text-white font-semibold disabled:opacity-40 active:bg-marca-oscuro">
        {guardando ? 'Guardando…' : nueva ? 'Guardar garantía' : 'Guardar cambios'}
      </button>
      {!nueva && g.estado === 'vigente' && (
        <div className="grid grid-cols-2 gap-2">
          <button onClick={() => guardar('reclamada')} className="h-11 rounded-xl bg-amber-50 text-amber-700 text-sm font-semibold">Marcar en reclamo</button>
          <button onClick={() => guardar('cerrada')} className="h-11 rounded-xl bg-slate-100 text-slate-600 text-sm font-semibold">Cerrar</button>
        </div>
      )}
      {!nueva && g.estado !== 'vigente' && <button onClick={() => guardar('vigente')} className="w-full h-11 rounded-xl bg-slate-100 text-slate-600 text-sm font-semibold">Volver a vigente</button>}
      {aviso && <a href={aviso} target="_blank" rel="noreferrer" className="grid place-items-center w-full h-11 rounded-xl bg-champagne text-negro text-sm font-semibold">Escribir por WhatsApp</a>}
      {!nueva && dueno && <button onClick={borrar} className="w-full h-11 rounded-xl bg-red-50 text-red-600 text-sm font-semibold active:bg-red-100">Borrar garantía</button>}
    </Modal>
  )
}
