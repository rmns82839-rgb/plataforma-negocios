// Servicios de la papelería: fotocopias, impresiones, anillado… Módulo «servicios» (viene de fábrica en el tipo papelería).
// Un servicio es un producto SIN control de stock: se cobra en la caja como cualquier otro, por unidad (copia, hoja, trabajo)
// y con precio por cantidad opcional («desde 50 copias, a $80 cada una»).
import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { claseInput } from '../lib/estilos'
import { coincide } from '../lib/buscar'
import { dinero, aNumero } from '../lib/formato'
import { confirmar } from '../lib/confirmar'
import Modal, { Campo } from './Modal'
import BarraFija from './BarraFija'

// [nombre, precio por unidad, desde cuántas, precio desde esa cantidad]
const TIPICOS = [
  ['Fotocopia blanco y negro', 100, 50, 80],
  ['Fotocopia a color', 500, 20, 400],
  ['Impresión blanco y negro', 300, 20, 250],
  ['Impresión a color', 800, 10, 700],
  ['Escaneo', 500],
  ['Anillado', 3000],
  ['Plastificado', 2500],
  ['Empastado', 8000],
  ['Foto tipo carnet', 8000],
]
const base = { categoria: 'Servicios', precio_compra: 0, stock: 0, stock_minimo: 0, controla_stock: false, unidad: 'und', publicado: false, activo: true }

export default function Servicios({ irACaja }) {
  const [lista, setLista] = useState([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [texto, setTexto] = useState('')
  const [form, setForm] = useState(null)               // null | {} nuevo | fila existente
  const [elegidos, setElegidos] = useState(() => new Set())
  const [creando, setCreando] = useState(false)

  const cargar = useCallback(async () => {
    setCargando(true)
    const { data, error: err } = await supabase.from('productos').select('*').eq('controla_stock', false).eq('activo', true).order('nombre').range(0, 999)
    setError(err?.message || ''); setLista(data ?? []); setCargando(false)
  }, [])
  useEffect(() => { cargar() }, [cargar])

  const yaHay = new Set(lista.map(s => s.nombre.trim().toLowerCase()))
  const faltan = TIPICOS.filter(t => !yaHay.has(t[0].toLowerCase()))
  const visibles = lista.filter(s => coincide([s.nombre], texto))
  const alternar = (n) => setElegidos(prev => { const x = new Set(prev); x.has(n) ? x.delete(n) : x.add(n); return x })

  const crearTipicos = async () => {
    const filas = TIPICOS.filter(t => elegidos.has(t[0])).map(([nombre, precio, desde, precioDesde]) =>
      ({ ...base, nombre, precio_venta: precio, ...(desde ? { cantidad_mayor: desde, precio_mayor: precioDesde } : {}) }))
    if (filas.length === 0) return
    setCreando(true); setError('')
    const { error: err } = await supabase.from('productos').insert(filas)
    setCreando(false)
    if (err) return setError(err.message)
    setElegidos(new Set()); cargar()
  }

  return (
    <div className="space-y-4">
      <BarraFija nivel={0}>
        <div className="grid grid-cols-[1fr_auto] gap-2">
          <input value={texto} onChange={e => setTexto(e.target.value)} placeholder="Buscar servicio" className={claseInput} />
          <button onClick={() => setForm({})} className="h-12 px-4 rounded-xl bg-marca text-white text-sm font-semibold active:bg-marca-oscuro">+ Servicio</button>
        </div>
        {irACaja && <button onClick={irACaja} className="mt-2 w-full h-11 rounded-xl bg-negro text-champagne text-sm font-semibold">🛒 Ir a cobrar en la caja</button>}
      </BarraFija>

      {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2 break-words">{error}</p>}

      {faltan.length > 0 && (
        <div className="rounded-2xl bg-white shadow-sm p-3 space-y-2">
          <p className="text-sm font-semibold break-words">Servicios típicos de una papelería</p>
          <p className="text-xs text-slate-500 break-words">Marca los que ofreces y se crean con un precio de ejemplo. Después tocas cada uno para poner tu precio.</p>
          <div className="grid grid-cols-2 gap-2">
            {faltan.map(([n, p]) => (
              <button key={n} onClick={() => alternar(n)} aria-pressed={elegidos.has(n)}
                className={`min-h-12 rounded-xl px-2 py-1 text-xs font-semibold leading-tight break-words ${elegidos.has(n) ? 'bg-marca text-white' : 'bg-slate-100 text-slate-700'}`}>
                {elegidos.has(n) ? '✓ ' : ''}{n}<span className="block font-normal opacity-80">{dinero(p)}</span>
              </button>
            ))}
          </div>
          <button onClick={crearTipicos} disabled={elegidos.size === 0 || creando}
            className="w-full h-12 rounded-xl bg-negro text-champagne text-sm font-semibold disabled:opacity-40">{creando ? 'Creando…' : `Agregar ${elegidos.size || ''} ${elegidos.size === 1 ? 'servicio' : 'servicios'}`.replace('  ', ' ')}</button>
        </div>
      )}

      {cargando ? <p className="text-center text-sm text-slate-400 py-8">Cargando…</p> : visibles.length === 0 ? (
        <p className="text-center text-sm text-slate-400 py-8">{lista.length === 0 ? 'Todavía no tienes servicios' : 'No hay servicios con ese nombre'}</p>
      ) : (
        <ul className="bg-white rounded-2xl shadow-sm divide-y divide-slate-100">
          {visibles.map(s => (
            <li key={s.id}>
              <button onClick={() => setForm(s)} className="w-full min-h-14 px-4 py-2 grid grid-cols-[1fr_auto] gap-3 items-center text-left active:bg-slate-50">
                <div className="min-w-0">
                  <p className="text-sm font-medium break-words">{s.nombre}</p>
                  <p className="text-xs text-slate-400 break-words">{s.cantidad_mayor ? `Desde ${Number(s.cantidad_mayor)}: ${dinero(s.precio_mayor)} c/u` : 'Sin precio por cantidad'}</p>
                </div>
                <span className="text-sm font-semibold">{dinero(s.precio_venta)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {form && <FormServicio servicio={form} onCerrar={() => setForm(null)} onListo={() => { setForm(null); cargar() }} />}
    </div>
  )
}

function FormServicio({ servicio, onCerrar, onListo }) {
  const nuevo = !servicio.id
  const [f, setF] = useState({ nombre: servicio.nombre ?? '', precio: servicio.precio_venta ? String(Number(servicio.precio_venta)) : '',
    desde: servicio.cantidad_mayor ? String(Number(servicio.cantidad_mayor)) : '', precioDesde: servicio.precio_mayor ? String(Number(servicio.precio_mayor)) : '' })
  const [error, setError] = useState('')
  const [guardando, setGuardando] = useState(false)
  const poner = (k) => (e) => setF(p => ({ ...p, [k]: e.target.value }))

  const guardar = async () => {
    const precio = aNumero(f.precio), desde = aNumero(f.desde), pDesde = aNumero(f.precioDesde)
    if (!f.nombre.trim()) return setError('Escribe el nombre del servicio')
    if (!(precio > 0)) return setError('Escribe el precio por unidad')
    const conCantidad = f.desde.trim() !== '' || f.precioDesde.trim() !== ''
    if (conCantidad && !(desde > 1 && pDesde > 0)) return setError('Para el precio por cantidad llena las dos casillas: desde cuántas y a cuánto cada una')
    if (conCantidad && pDesde >= precio) return setError('El precio por cantidad debe ser menor que el precio normal')
    setGuardando(true); setError('')
    const fila = { nombre: f.nombre.trim(), precio_venta: precio, cantidad_mayor: conCantidad ? desde : null, precio_mayor: conCantidad ? pDesde : null }
    const { error: err } = nuevo ? await supabase.from('productos').insert({ ...base, ...fila }) : await supabase.from('productos').update(fila).eq('id', servicio.id)
    setGuardando(false)
    if (err) return setError(err.message)
    onListo()
  }
  const quitar = async () => {
    if (!(await confirmar({ titulo: '¿Quitar este servicio?', texto: 'Deja de salir en la caja. Las ventas que ya hiciste se conservan.', si: 'Sí, quitar' }))) return
    const { error: err } = await supabase.from('productos').update({ activo: false }).eq('id', servicio.id)
    if (err) return setError(err.message)
    onListo()
  }

  return (
    <Modal titulo={nuevo ? 'Nuevo servicio' : servicio.nombre} onCerrar={onCerrar}>
      <Campo etiqueta="Nombre"><input autoFocus={nuevo} value={f.nombre} onChange={poner('nombre')} placeholder="Fotocopia, impresión…" className={claseInput} /></Campo>
      <Campo etiqueta="Precio por unidad (copia, hoja o trabajo)"><input value={f.precio} onChange={poner('precio')} inputMode="decimal" placeholder="100" className={claseInput} /></Campo>
      <div className="rounded-xl bg-slate-50 p-3 space-y-2">
        <p className="text-sm font-semibold break-words">Precio por cantidad (opcional)</p>
        <div className="grid grid-cols-2 gap-3">
          <Campo etiqueta="Desde cuántas"><input value={f.desde} onChange={poner('desde')} inputMode="decimal" placeholder="50" className={claseInput} /></Campo>
          <Campo etiqueta="Cada una a"><input value={f.precioDesde} onChange={poner('precioDesde')} inputMode="decimal" placeholder="80" className={claseInput} /></Campo>
        </div>
      </div>
      {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2 break-words">{error}</p>}
      <button onClick={guardar} disabled={guardando} className="w-full h-12 rounded-xl bg-marca text-white font-semibold disabled:opacity-40 active:bg-marca-oscuro">
        {guardando ? 'Guardando…' : nuevo ? 'Guardar servicio' : 'Guardar cambios'}
      </button>
      {!nuevo && <button onClick={quitar} className="w-full h-11 rounded-xl bg-red-50 text-red-600 text-sm font-semibold active:bg-red-100">Quitar servicio</button>}
    </Modal>
  )
}
