// Productos base: el dueño marca categorías y la plataforma copia a su inventario los productos conocidos
// (nombre, código de barras y foto real cuando existe), SIN precio y ocultos. Nunca toca los productos que ya tiene.
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import Modal from './Modal'

export default function ProductosBase({ onCerrar, onGuardado }) {
  const [cats, setCats] = useState(null)
  const [marcadas, setMarcadas] = useState(new Set())
  const [error, setError] = useState('')
  const [cargando, setCargando] = useState(false)
  const [hecho, setHecho] = useState(null)

  useEffect(() => {
    let vivo = true
    supabase.rpc('catalogo_base_categorias').then(({ data, error: e }) => {
      if (!vivo) return
      if (e) return setError(e.message)
      setCats(data || [])
      setMarcadas(new Set((data || []).filter(c => c.nuevos > 0).map(c => c.categoria)))
    })
    return () => { vivo = false }
  }, [])

  const disponibles = (cats || []).filter(c => c.nuevos > 0)
  const total = useMemo(() => disponibles.filter(c => marcadas.has(c.categoria)).reduce((s, c) => s + c.nuevos, 0), [disponibles, marcadas])
  const alternar = (k) => setMarcadas(s => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n })

  const agregar = async () => {
    setCargando(true); setError('')
    const { data, error: e } = await supabase.rpc('cargar_catalogo_base', { p_categorias: [...marcadas] })
    setCargando(false)
    if (e) return setError(e.message)
    setHecho(data?.cargados ?? 0)
    onGuardado?.()
  }

  if (hecho !== null) {
    return (
      <Modal titulo="¡Listo!" onCerrar={onCerrar}>
        <p className="text-sm text-slate-600">Se agregaron <b>{hecho}</b> productos a tu inventario. Entran <b>ocultos y en $0</b>: ponles el precio y muéstralos solo en los que vendes.</p>
        <button onClick={onCerrar} className="w-full h-12 rounded-xl bg-marca text-white font-semibold active:bg-marca-oscuro">Ver mis productos</button>
      </Modal>
    )
  }
  return (
    <Modal titulo="Productos base" onCerrar={onCerrar}>
      <p className="text-sm text-slate-500">Ya traen nombre, código de barras y, cuando hay, la foto. Tú solo les pones el precio.</p>
      {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
      {!cats && !error && <p className="text-center text-sm text-slate-400 py-6">Buscando productos…</p>}
      {cats && cats.length === 0 && <p className="text-sm text-slate-500">Todavía no tenemos catálogo base para este tipo de negocio. Crea tus productos uno por uno o con «Cargar muchos».</p>}
      {cats && cats.length > 0 && disponibles.length === 0 && <p className="text-sm text-marca">Ya tienes todos los productos base de tu tipo de negocio.</p>}
      {disponibles.length > 0 && (<>
        <div className="grid grid-cols-2 gap-2">
          <button onClick={() => setMarcadas(new Set(disponibles.map(c => c.categoria)))} className="h-10 rounded-xl bg-slate-100 text-slate-700 text-xs font-semibold">Marcar todas</button>
          <button onClick={() => setMarcadas(new Set())} className="h-10 rounded-xl bg-slate-100 text-slate-700 text-xs font-semibold">Quitar todas</button>
        </div>
        <ul className="space-y-2">
          {disponibles.map(c => (
            <li key={c.categoria}>
              <label className={`flex min-h-12 cursor-pointer items-center gap-3 rounded-xl px-3 py-2 ring-1 ${marcadas.has(c.categoria) ? 'ring-marca bg-lima/10' : 'ring-slate-200 bg-white'}`}>
                <input type="checkbox" checked={marcadas.has(c.categoria)} onChange={() => alternar(c.categoria)} className="h-5 w-5 shrink-0 accent-marca" />
                <span className="min-w-0 flex-1 break-words text-sm font-medium">{c.categoria}</span>
                <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-bold">{c.nuevos}</span>
              </label>
            </li>
          ))}
        </ul>
        <p className="text-center text-sm">Se agregarán <b>{total}</b> productos, ocultos y en $0</p>
        <button onClick={agregar} disabled={cargando || total === 0} className="w-full h-12 rounded-xl bg-marca text-white font-semibold disabled:opacity-40 active:bg-marca-oscuro">
          {cargando ? 'Agregando…' : 'Agregar a mi inventario'}
        </button>
      </>)}
    </Modal>
  )
}
