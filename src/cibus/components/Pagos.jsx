import { useCallback, useEffect, useMemo, useState } from 'react'
import { usePersistido, borrarBorradores, TREINTA_MIN } from '../lib/usePersistido'
import { supabase } from '../lib/supabase'
import { dinero, fechaHora } from '../lib/formato'
import { claseInput } from '../lib/estilos'
import { coincide } from '../lib/buscar'
import { textoMetodo } from '../lib/pagos'
import { useDueno } from '../context/rol'
import Modal from './Modal'
import ClienteDetalle from './ClienteDetalle'
import PrestamoDetalle from './PrestamoDetalle'
import BarraFija from './BarraFija'

// Historial de pagos: abonos de fiados y pagos de préstamos (estos solo los ve el dueño).
// Desde aquí también se registra un pago nuevo.
export default function Pagos({ rango }) {
  const dueno = useDueno()
  const [filas, setFilas] = useState([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [texto, setTexto] = useState('')
  const [tipo, setTipo] = useState('todos')          // todos | fiado | prestamo
  const [cobrar, setCobrar] = usePersistido('pagos:cobrar', null, true, TREINTA_MIN)         // 'fiado' | 'prestamo' | null
  const [clienteAbierto, setClienteAbierto] = usePersistido('pagos:clienteAbierto', null, true, TREINTA_MIN)
  const [prestamoAbierto, setPrestamoAbierto] = usePersistido('pagos:prestamoAbierto', null, true, TREINTA_MIN)

  const cargar = useCallback(async () => {
    setCargando(true); setError('')
    const entre = (q) => (rango.hasta ? q.gte('fecha', rango.desde).lt('fecha', rango.hasta) : q.gte('fecha', rango.desde))
    const [ab, pp] = await Promise.all([
      entre(supabase.from('fiado_movimientos').select('id, fecha, monto, metodo, clientes(nombre, documento, telefono)')
        .eq('tipo', 'abono')).order('fecha', { ascending: false }).range(0, 999),
      dueno
        ? entre(supabase.from('prestamo_pagos').select('id, fecha, monto, metodo, prestamos(clientes(nombre, documento, telefono))'))
            .order('fecha', { ascending: false }).range(0, 999)
        : Promise.resolve({ data: [] }),
    ])
    if (ab.error || pp.error) setError((ab.error || pp.error).message)
    const lista = [
      ...(ab.data ?? []).map(a => ({ id: `f${a.id}`, tipo: 'fiado', fecha: a.fecha, monto: a.monto, metodo: a.metodo, cliente: a.clientes })),
      ...(pp.data ?? []).map(g => ({ id: `p${g.id}`, tipo: 'prestamo', fecha: g.fecha, monto: g.monto, metodo: g.metodo, cliente: g.prestamos?.clientes })),
    ].sort((a, b) => new Date(b.fecha) - new Date(a.fecha))
    setFilas(lista)
    setCargando(false)
  }, [rango, dueno])
  useEffect(() => { if (dueno !== null) cargar() }, [cargar, dueno])

  const visibles = useMemo(() => filas.filter(f =>
    (tipo === 'todos' || f.tipo === tipo)
    && coincide([f.cliente?.nombre, f.cliente?.documento, f.cliente?.telefono, textoMetodo(f.metodo)], texto)),
  [filas, tipo, texto])
  const total = visibles.reduce((s, f) => s + Number(f.monto), 0)

  const tipos = [{ id: 'todos', texto: 'Todos' }, { id: 'fiado', texto: 'Fiados' },
                 ...(dueno ? [{ id: 'prestamo', texto: 'Préstamos' }] : [])]

  return (
    <div className="space-y-4">
      <BarraFija nivel={3.75}>
      <div className="bg-white rounded-2xl shadow-sm p-4 space-y-3">
        <div>
          <p className="text-xs text-slate-400">Recibido ({visibles.length} pagos)</p>
          <p className="text-2xl font-bold text-marca">{dinero(total)}</p>
        </div>
        <div className={`grid gap-3 ${dueno ? 'grid-cols-2' : 'grid-cols-1'}`}>
          <button onClick={() => setCobrar('fiado')}
            className="h-11 rounded-xl bg-marca text-white text-sm font-semibold active:bg-marca-oscuro">Cobrar fiado</button>
          {dueno && (
            <button onClick={() => setCobrar('prestamo')}
              className="h-11 rounded-xl bg-lima/20 text-marca text-sm font-semibold active:bg-lima/30">Cobrar préstamo</button>
          )}
        </div>
      </div>

      <input value={texto} onChange={e => setTexto(e.target.value)}
             placeholder="Buscar por nombre o documento" className={claseInput} />

      {tipos.length > 1 && (
        <div className={`grid gap-2 ${tipos.length === 3 ? 'grid-cols-3' : 'grid-cols-2'}`}>
          {tipos.map(t => (
            <button key={t.id} onClick={() => setTipo(t.id)}
              className={`h-10 rounded-xl text-xs font-medium ${tipo === t.id ? 'bg-marca text-white' : 'bg-white text-slate-600 shadow-sm'}`}>
              {t.texto}
            </button>
          ))}
        </div>
      )}
      </BarraFija>

      {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}

      {cargando ? (
        <p className="text-center text-sm text-slate-400 py-8">Cargando…</p>
      ) : visibles.length === 0 ? (
        <p className="text-center text-sm text-slate-400 py-8">No hay pagos {texto.trim() ? 'con esa búsqueda' : 'en este periodo'}</p>
      ) : (
        <ul className="bg-white rounded-2xl shadow-sm divide-y divide-slate-100">
          {visibles.map(f => (
            <li key={f.id} className="min-h-14 px-4 py-2 grid grid-cols-[1fr_auto] gap-3 items-center">
              <div className="min-w-0">
                <p className="text-sm font-medium break-words">{f.cliente?.nombre ?? 'Cliente'}</p>
                <p className="text-xs text-slate-400 break-words">{fechaHora(f.fecha)} · {textoMetodo(f.metodo)}</p>
                <p className="text-xs text-slate-400 break-words">{f.tipo === 'fiado' ? 'Abono a fiado' : 'Pago de préstamo'}</p>
              </div>
              <span className="text-sm font-semibold text-marca">{dinero(f.monto)}</span>
            </li>
          ))}
        </ul>
      )}

      {cobrar && (
        <SelectorCobro tipo={cobrar} onCerrar={() => setCobrar(null)}
          onElegir={(x) => { if (cobrar === 'fiado') setClienteAbierto(x); else setPrestamoAbierto(x); setCobrar(null) }} />
      )}
      {clienteAbierto && <ClienteDetalle cliente={clienteAbierto} onCerrar={() => setClienteAbierto(null)} onCambio={cargar} />}
      {prestamoAbierto && <PrestamoDetalle prestamo={prestamoAbierto} onCerrar={() => setPrestamoAbierto(null)} onCambio={cargar} />}
    </div>
  )
}

// Lista de quienes deben (fiado) o de préstamos activos, para elegir a quién se le cobra.
function SelectorCobro({ tipo, onCerrar, onElegir }) {
  const [items, setItems] = useState(null)
  const [texto, setTexto] = useState('')

  useEffect(() => {
    const q = tipo === 'fiado'
      ? supabase.from('clientes_saldo').select('*').gt('saldo', 0).order('nombre')
      : supabase.from('prestamos_resumen').select('*').eq('estado', 'activo').order('cliente_nombre')
    q.range(0, 4999).then(({ data }) => setItems(data ?? []))
  }, [tipo])

  const nombre = (x) => (tipo === 'fiado' ? x.nombre : x.cliente_nombre)
  const doc = (x) => (tipo === 'fiado' ? x.documento : x.cliente_documento)
  const lista = (items ?? []).filter(x => coincide([nombre(x), doc(x), tipo === 'fiado' ? x.telefono : x.cliente_telefono], texto))

  return (
    <Modal titulo={tipo === 'fiado' ? 'Cobrar fiado' : 'Cobrar préstamo'} onCerrar={onCerrar}>
      <input autoFocus value={texto} onChange={e => setTexto(e.target.value)}
             placeholder="Buscar por nombre o documento" className={claseInput} />
      {items === null ? (
        <p className="text-center text-sm text-slate-400 py-6">Cargando…</p>
      ) : lista.length === 0 ? (
        <p className="text-center text-sm text-slate-400 py-6">Nadie debe nada</p>
      ) : (
        <ul className="rounded-2xl bg-slate-50 divide-y divide-white">
          {lista.map(x => (
            <li key={x.id}>
              <button onClick={() => onElegir(x)}
                className="w-full px-4 py-3 grid grid-cols-[1fr_auto] gap-3 items-center text-left active:bg-slate-100">
                <div className="min-w-0">
                  <p className="text-sm font-medium break-words">{nombre(x)}</p>
                  <p className="text-xs text-slate-400 break-words">{doc(x) ?? 'Sin documento'}</p>
                </div>
                <span className="text-sm font-semibold text-naranja-oscuro">{dinero(x.saldo)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  )
}
