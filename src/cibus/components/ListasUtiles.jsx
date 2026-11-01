// Listas de útiles escolares de la papelería: una lista por colegio y grado. Se arma una vez y, cuando llega el cliente
// con su lista, se lleva completa a la caja (cantidades incluidas). Módulo «listas_utiles».
import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { claseInput } from '../lib/estilos'
import { coincide, buscarProductosPorNombre } from '../lib/buscar'
import { dinero, numero } from '../lib/formato'
import { leerBorrador, guardarBorrador, DOCE_HORAS } from '../lib/borrador'
import { useDueno } from '../context/rol'
import { confirmar } from '../lib/confirmar'
import Modal, { Campo } from './Modal'
import BarraFija from './BarraFija'

const CLAVE_BORRADOR = 'borrador-caja'      // la misma venta en curso que lee la caja

export default function ListasUtiles({ irACaja }) {
  const [listas, setListas] = useState([])
  const [items, setItems] = useState([])
  const [prods, setProds] = useState({})              // id → producto (precio y stock de hoy)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [texto, setTexto] = useState('')
  const [nueva, setNueva] = useState(false)
  const [abierta, setAbierta] = useState(null)        // id de la lista abierta

  const cargar = useCallback(async () => {
    setCargando(true)
    const [l, i] = await Promise.all([
      supabase.from('listas_utiles').select('*').eq('activo', true).order('colegio').order('nombre').range(0, 999),
      supabase.from('lista_utiles_items').select('*').range(0, 4999),
    ])
    setError(l.error?.message || i.error?.message || '')
    const its = i.data ?? []
    setListas(l.data ?? []); setItems(its)
    const ids = [...new Set(its.map(x => x.producto_id))]
    const mapa = {}
    for (let k = 0; k < ids.length; k += 100) {
      const { data } = await supabase.from('productos').select('*').in('id', ids.slice(k, k + 100))
      for (const p of data ?? []) mapa[p.id] = p
    }
    setProds(mapa); setCargando(false)
  }, [])
  useEffect(() => { cargar() }, [cargar])

  const resumen = useMemo(() => {
    const r = {}
    for (const l of listas) r[l.id] = { n: 0, total: 0 }
    for (const it of items) { const x = r[it.lista_id]; if (x) { x.n += 1; x.total += Number(it.cantidad) * Number(prods[it.producto_id]?.precio_venta ?? 0) } }
    return r
  }, [listas, items, prods])
  const visibles = listas.filter(l => coincide([l.nombre, l.colegio, l.grado], texto))
  const lista = listas.find(l => l.id === abierta)

  return (
    <div className="space-y-4">
      <BarraFija nivel={0}>
        <div className="grid grid-cols-[1fr_auto] gap-2">
          <input value={texto} onChange={e => setTexto(e.target.value)} placeholder="Buscar por colegio o grado" className={claseInput} />
          <button onClick={() => setNueva(true)} className="h-12 px-4 rounded-xl bg-marca text-white text-sm font-semibold active:bg-marca-oscuro">+ Lista</button>
        </div>
      </BarraFija>

      {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2 break-words">{error}</p>}
      {cargando ? <p className="text-center text-sm text-slate-400 py-8">Cargando…</p> : visibles.length === 0 ? (
        <p className="text-center text-sm text-slate-400 py-8 break-words">{listas.length === 0 ? 'Todavía no tienes listas. Crea una por colegio y grado.' : 'No hay listas con eso'}</p>
      ) : (
        <ul className="bg-white rounded-2xl shadow-sm divide-y divide-slate-100">
          {visibles.map(l => (
            <li key={l.id}>
              <button onClick={() => setAbierta(l.id)} className="w-full min-h-14 px-4 py-2 grid grid-cols-[1fr_auto] gap-3 items-center text-left active:bg-slate-50">
                <div className="min-w-0">
                  <p className="text-sm font-medium break-words">{l.nombre}</p>
                  <p className="text-xs text-slate-400 break-words">{[l.colegio, l.grado].filter(Boolean).join(' · ') || 'Sin colegio'} · {resumen[l.id]?.n ?? 0} {(resumen[l.id]?.n ?? 0) === 1 ? 'útil' : 'útiles'}</p>
                </div>
                <span className="text-sm font-semibold">{dinero(resumen[l.id]?.total)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {nueva && <FormLista onCerrar={() => setNueva(false)} onListo={(id) => { setNueva(false); cargar().then(() => setAbierta(id)) }} />}
      {lista && <DetalleLista lista={lista} items={items.filter(i => i.lista_id === lista.id)} prods={prods} irACaja={irACaja}
        onCerrar={() => setAbierta(null)} onCambio={cargar} onBorrada={() => { setAbierta(null); cargar() }} />}
    </div>
  )
}

function FormLista({ lista, onCerrar, onListo }) {
  const nueva = !lista?.id
  const [f, setF] = useState({ nombre: lista?.nombre ?? '', colegio: lista?.colegio ?? '', grado: lista?.grado ?? '' })
  const [error, setError] = useState('')
  const [guardando, setGuardando] = useState(false)
  const poner = (k) => (e) => setF(p => ({ ...p, [k]: e.target.value }))
  const guardar = async () => {
    if (!f.nombre.trim()) return setError('Ponle un nombre a la lista (por ejemplo «Transición» o «Primero A»)')
    setGuardando(true); setError('')
    const fila = { nombre: f.nombre.trim(), colegio: f.colegio.trim() || null, grado: f.grado.trim() || null }
    const r = nueva ? await supabase.from('listas_utiles').insert(fila).select('id').single() : await supabase.from('listas_utiles').update(fila).eq('id', lista.id).select('id').single()
    setGuardando(false)
    if (r.error) return setError(r.error.message)
    onListo(r.data?.id)
  }
  return (
    <Modal titulo={nueva ? 'Nueva lista de útiles' : 'Datos de la lista'} onCerrar={onCerrar}>
      <Campo etiqueta="Nombre de la lista"><input autoFocus value={f.nombre} onChange={poner('nombre')} placeholder="Transición, Primero A…" className={claseInput} /></Campo>
      <Campo etiqueta="Colegio (opcional)"><input value={f.colegio} onChange={poner('colegio')} className={claseInput} /></Campo>
      <Campo etiqueta="Grado (opcional)"><input value={f.grado} onChange={poner('grado')} className={claseInput} /></Campo>
      {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2 break-words">{error}</p>}
      <button onClick={guardar} disabled={guardando} className="w-full h-12 rounded-xl bg-marca text-white font-semibold disabled:opacity-40 active:bg-marca-oscuro">
        {guardando ? 'Guardando…' : nueva ? 'Crear y agregar útiles' : 'Guardar cambios'}
      </button>
    </Modal>
  )
}

function DetalleLista({ lista, items, prods, irACaja, onCerrar, onCambio, onBorrada }) {
  const dueno = useDueno()
  const [busca, setBusca] = useState('')
  const [res, setRes] = useState([])
  const [error, setError] = useState('')
  const [editar, setEditar] = useState(false)
  const [ocupado, setOcupado] = useState(false)

  useEffect(() => {
    const q = busca.trim()
    if (q.length < 1) { setRes([]); return }
    const t = setTimeout(async () => { const { data } = await buscarProductosPorNombre(supabase, q); setRes((data ?? []).slice(0, 12)) }, 250)
    return () => clearTimeout(t)
  }, [busca])

  const lineas = items.filter(i => prods[i.producto_id]).sort((a, b) => prods[a.producto_id].nombre.localeCompare(prods[b.producto_id].nombre, 'es'))
  const total = lineas.reduce((s, i) => s + Number(i.cantidad) * Number(prods[i.producto_id].precio_venta), 0)
  const hecho = async (p) => { const { error: err } = await p; if (err) setError(err.message); else { setError(''); await onCambio() } }

  const agregar = async (p) => {
    setBusca(''); setRes([])
    const ya = items.find(i => i.producto_id === p.id)
    if (ya) return hecho(supabase.from('lista_utiles_items').update({ cantidad: Number(ya.cantidad) + 1 }).eq('id', ya.id))
    return hecho(supabase.from('lista_utiles_items').insert({ lista_id: lista.id, producto_id: p.id, cantidad: 1 }))
  }
  const cambiar = (it, cant) => cant <= 0
    ? hecho(supabase.from('lista_utiles_items').delete().eq('id', it.id))
    : hecho(supabase.from('lista_utiles_items').update({ cantidad: cant }).eq('id', it.id))

  const alCaja = () => {
    if (lineas.length === 0) return setError('La lista está vacía')
    const g = leerBorrador(CLAVE_BORRADOR, DOCE_HORAS) ?? { lineas: [], clienteId: '', descuentoTxt: '', dom: null, nota: '', pedido: null }
    for (const it of lineas) {
      const ex = g.lineas.find(x => x.id === it.producto_id)
      if (ex) ex.cantidad = Math.round((Number(ex.cantidad) + Number(it.cantidad)) * 1000) / 1000
      else g.lineas.push({ id: it.producto_id, cantidad: Number(it.cantidad) })
    }
    guardarBorrador(CLAVE_BORRADOR, g)
    onCerrar(); irACaja?.()
  }
  const duplicar = async () => {
    setOcupado(true); setError('')
    const r = await supabase.from('listas_utiles').insert({ nombre: `${lista.nombre} (copia)`, colegio: lista.colegio, grado: lista.grado }).select('id').single()
    if (r.error) { setOcupado(false); return setError(r.error.message) }
    if (items.length) {
      const e2 = await supabase.from('lista_utiles_items').insert(items.map(i => ({ lista_id: r.data.id, producto_id: i.producto_id, cantidad: i.cantidad })))
      if (e2.error) { setOcupado(false); return setError(e2.error.message) }
    }
    setOcupado(false); await onCambio(); onCerrar()
  }
  const borrar = async () => {
    if (!(await confirmar({ titulo: `¿Borrar la lista «${lista.nombre}»?`, texto: 'Los productos no se borran, solo la lista.', si: 'Sí, borrar' }))) return
    const { error: err } = await supabase.from('listas_utiles').delete().eq('id', lista.id)
    if (err) return setError(err.message)
    onBorrada()
  }

  return (
    <Modal titulo={lista.nombre} onCerrar={onCerrar}>
      <p className="text-sm text-slate-500 break-words">{[lista.colegio, lista.grado].filter(Boolean).join(' · ') || 'Sin colegio'}</p>
      <Campo etiqueta="Agregar un útil">
        <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Busca por nombre o código" className={claseInput} />
      </Campo>
      {res.length > 0 && (
        <ul className="rounded-xl bg-slate-50 divide-y divide-slate-100 max-h-56 overflow-y-auto">
          {res.map(p => (
            <li key={p.id}><button onClick={() => agregar(p)} className="w-full min-h-12 px-3 py-1 grid grid-cols-[1fr_auto] gap-2 items-center text-left active:bg-slate-100">
              <span className="text-sm break-words">{p.nombre}</span><span className="text-xs font-semibold">{dinero(p.precio_venta)}</span></button></li>
          ))}
        </ul>
      )}

      {lineas.length === 0 ? <p className="text-center text-sm text-slate-400 py-4">Todavía no hay útiles en esta lista</p> : (
        <ul className="rounded-xl bg-white ring-1 ring-slate-100 divide-y divide-slate-100">
          {lineas.map(it => {
            const p = prods[it.producto_id], c = Number(it.cantidad)
            const falta = p.controla_stock !== false && Number(p.stock) < c
            return (
              <li key={it.id} className="px-3 py-2 space-y-1">
                <p className="text-sm font-medium break-words">{p.nombre}</p>
                <div className="grid grid-cols-[auto_1fr_auto] gap-2 items-center">
                  <div className="grid grid-cols-[2.5rem_3rem_2.5rem] items-center text-center">
                    <button onClick={() => cambiar(it, c - 1)} aria-label="Quitar uno" className="h-10 rounded-lg bg-slate-100 font-bold">−</button>
                    <span className="text-sm font-semibold">{numero(c)}</span>
                    <button onClick={() => cambiar(it, c + 1)} aria-label="Agregar uno" className="h-10 rounded-lg bg-slate-100 font-bold">+</button>
                  </div>
                  <span className="text-xs text-slate-400 text-right break-words">{dinero(p.precio_venta)} c/u</span>
                  <span className="text-sm font-semibold text-right">{dinero(c * Number(p.precio_venta))}</span>
                </div>
                {falta && <p className="text-xs font-medium text-red-500">Solo quedan {numero(p.stock)}</p>}
              </li>
            )
          })}
        </ul>
      )}

      <div className="rounded-xl bg-negro text-champagne px-4 py-3 grid grid-cols-[1fr_auto] items-center">
        <span className="text-sm">Total de la lista</span><span className="text-xl font-semibold">{dinero(total)}</span>
      </div>
      {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2 break-words">{error}</p>}
      <button onClick={alCaja} disabled={lineas.length === 0} className="w-full h-12 rounded-xl bg-marca text-white font-semibold disabled:opacity-40 active:bg-marca-oscuro">🛒 Llevar la lista a la caja</button>
      <div className="grid grid-cols-2 gap-2">
        <button onClick={() => setEditar(true)} className="h-11 rounded-xl bg-slate-100 text-slate-700 text-sm font-semibold">Editar datos</button>
        <button onClick={duplicar} disabled={ocupado} className="h-11 rounded-xl bg-slate-100 text-slate-700 text-sm font-semibold disabled:opacity-40">Duplicar lista</button>
      </div>
      {dueno && <button onClick={borrar} className="w-full h-11 rounded-xl bg-red-50 text-red-600 text-sm font-semibold active:bg-red-100">Borrar lista</button>}
      {editar && <FormLista lista={lista} onCerrar={() => setEditar(false)} onListo={() => { setEditar(false); onCambio() }} />}
    </Modal>
  )
}
