// Referencias, marca, medida y compatibilidad de cada producto (ferretería, repuestos, tecnología). Módulo «referencias».
import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { claseInput } from '../lib/estilos'
import { coincide } from '../lib/buscar'
import { dinero } from '../lib/formato'
import Modal, { Campo } from './Modal'
import BarraFija from './BarraFija'

const TAM = 1000
async function traerTodo(tabla, cols, orden) {         // Supabase entrega máximo 1000 por consulta: se pide por páginas
  const filas = []
  for (let desde = 0; desde < 20000; desde += TAM) {
    let q = supabase.from(tabla).select(cols)
    if (orden) q = q.order(orden)
    const { data, error } = await q.range(desde, desde + TAM - 1)
    if (error) return { error }
    filas.push(...data)
    if (data.length < TAM) break
  }
  return { filas }
}

export default function Referencias() {
  const [productos, setProductos] = useState([])
  const [datos, setDatos] = useState({})
  const [texto, setTexto] = useState('')
  const [solo, setSolo] = useState('todos')        // todos | sin
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [abierto, setAbierto] = useState(null)

  const cargar = useCallback(async () => {
    setCargando(true)
    const [p, d] = await Promise.all([traerTodo('productos', 'id,codigo,nombre,precio_venta,activo', 'nombre'), traerTodo('producto_datos', '*')])
    setError(p.error?.message || d.error?.message || '')
    setProductos((p.filas ?? []).filter(x => x.activo !== false))
    setDatos(Object.fromEntries((d.filas ?? []).map(x => [x.producto_id, x])))
    setCargando(false)
  }, [])
  useEffect(() => { cargar() }, [cargar])

  const lista = useMemo(() => productos
    .filter(p => solo === 'todos' || !(datos[p.id]?.marca || datos[p.id]?.referencia || datos[p.id]?.medida))
    .filter(p => { const d = datos[p.id] ?? {}; return coincide([p.nombre, p.codigo, d.marca, d.referencia, d.medida, d.compatible, d.ubicacion], texto) })
    .slice(0, 200), [productos, datos, texto, solo])
  const conDatos = Object.values(datos).filter(d => d.marca || d.referencia || d.medida).length

  return (
    <div className="space-y-4">
      <BarraFija nivel={0}>
        <input value={texto} onChange={e => setTexto(e.target.value)} placeholder="Buscar por nombre, marca, referencia o medida" className={claseInput} />
        <div className="grid grid-cols-2 gap-2 mt-2">
          {[['todos', 'Todos'], ['sin', 'Sin datos']].map(([id, t]) => (
            <button key={id} onClick={() => setSolo(id)} className={`h-10 rounded-xl text-xs font-semibold ${solo === id ? 'bg-negro text-champagne' : 'bg-white text-slate-500 shadow-sm'}`}>{t}</button>
          ))}
        </div>
      </BarraFija>
      {!cargando && <p className="text-xs text-slate-400 px-1">{conDatos} de {productos.length} productos con marca, referencia o medida</p>}
      {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
      {cargando ? <p className="text-center text-sm text-slate-400 py-8">Cargando…</p> : lista.length === 0 ? (
        <p className="text-center text-sm text-slate-400 py-8">{productos.length === 0 ? 'Primero crea productos' : 'No hay resultados'}</p>
      ) : (
        <ul className="bg-white rounded-2xl shadow-sm divide-y divide-slate-100">
          {lista.map(p => {
            const d = datos[p.id] ?? {}
            const linea = [d.marca, d.referencia, d.medida].filter(Boolean).join(' · ')
            return (
              <li key={p.id}>
                <button onClick={() => setAbierto(p)} className="w-full min-h-14 px-4 py-2 grid grid-cols-[1fr_auto] gap-3 items-center text-left active:bg-slate-50">
                  <div className="min-w-0">
                    <p className="text-sm font-medium break-words">{p.nombre}</p>
                    <p className={`text-xs break-words ${linea ? 'text-marca' : 'text-slate-400'}`}>{linea || 'Sin marca, referencia ni medida'}{d.ubicacion ? ` · ${d.ubicacion}` : ''}</p>
                  </div>
                  <span className="text-sm font-semibold tabular-nums">{dinero(p.precio_venta)}</span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
      {abierto && <Form producto={abierto} dato={datos[abierto.id]} onCerrar={() => setAbierto(null)} onListo={() => { setAbierto(null); cargar() }} />}
    </div>
  )
}

function Form({ producto, dato, onCerrar, onListo }) {
  const [f, setF] = useState({ marca: dato?.marca ?? '', referencia: dato?.referencia ?? '', medida: dato?.medida ?? '', compatible: dato?.compatible ?? '', ubicacion: dato?.ubicacion ?? '' })
  const [error, setError] = useState('')
  const [guardando, setGuardando] = useState(false)
  const poner = (k) => (e) => setF(p => ({ ...p, [k]: e.target.value }))
  const guardar = async () => {
    setGuardando(true); setError('')
    const fila = { producto_id: producto.id }
    for (const k of Object.keys(f)) fila[k] = f[k].trim() || null
    const { error: err } = await supabase.from('producto_datos').upsert(fila, { onConflict: 'negocio_id,producto_id' })
    setGuardando(false)
    if (err) return setError(err.message)
    onListo()
  }
  return (
    <Modal titulo={producto.nombre} onCerrar={onCerrar}>
      <div className="grid grid-cols-2 gap-3">
        <Campo etiqueta="Marca"><input autoFocus value={f.marca} onChange={poner('marca')} className={claseInput} /></Campo>
        <Campo etiqueta="Referencia"><input value={f.referencia} onChange={poner('referencia')} className={claseInput} /></Campo>
        <Campo etiqueta="Medida"><input value={f.medida} onChange={poner('medida')} placeholder='1/4" x 2"' className={claseInput} /></Campo>
        <Campo etiqueta="Ubicación"><input value={f.ubicacion} onChange={poner('ubicacion')} placeholder="Estante 3" className={claseInput} /></Campo>
      </div>
      <Campo etiqueta="Sirve para / compatible con"><textarea value={f.compatible} onChange={poner('compatible')} rows={3} className={`${claseInput} h-auto py-3`} /></Campo>
      {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
      <button onClick={guardar} disabled={guardando} className="w-full h-12 rounded-xl bg-marca text-white font-semibold disabled:opacity-40 active:bg-marca-oscuro">{guardando ? 'Guardando…' : 'Guardar'}</button>
    </Modal>
  )
}
