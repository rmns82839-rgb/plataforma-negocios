// Revisión de las opiniones de los clientes (solo el dueño): aprobar, ocultar y responder.
import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { claseInput } from '../lib/estilos'
import { Estrellas } from './ComentariosTienda'

const FILTROS = [['pendiente', 'Por revisar'], ['publicado', 'Publicados'], ['oculto', 'Ocultos'], ['todos', 'Todos']]
const ETIQUETA = {
  pendiente: ['POR REVISAR', 'bg-amber-100 text-amber-800', 'border-amber-400 bg-amber-50/50'],
  publicado: ['PUBLICADO', 'bg-emerald-100 text-emerald-800', 'border-emerald-500 bg-emerald-50/50'],
  oculto: ['OCULTO', 'bg-slate-200 text-slate-700', 'border-slate-300 bg-slate-50'],
}
const fecha = (iso) => new Date(iso).toLocaleString('es-CO', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' })

export default function ComentariosAdmin() {
  const [filas, setFilas] = useState(null)
  const [filtro, setFiltro] = useState('pendiente')
  const [resp, setResp] = useState({})            // id → respuesta que se está escribiendo
  const [error, setError] = useState('')
  const [trabajando, setTrabajando] = useState('')

  const cargar = useCallback(async () => {
    const { data, error: err } = await supabase.rpc('listar_comentarios_admin')
    if (err) { setError(/could not find the function|schema cache/i.test(err.message) ? 'Falta ejecutar migracion-v39.sql en Supabase' : err.message); return setFilas([]) }
    setFilas(Array.isArray(data) ? data : [])
  }, [])
  useEffect(() => { cargar() }, [cargar])

  const marcar = async (c, estado) => {
    setTrabajando(c.id); setError('')
    const { error: err } = await supabase.rpc('moderar_comentario', { p_id: c.id, p_estado: estado, p_respuesta: resp[c.id] ?? c.respuesta ?? '' })
    setTrabajando('')
    if (err) return setError(err.message)
    await cargar()
  }

  const n = (e) => (filas ?? []).filter(c => c.estado === e).length
  const visibles = (filas ?? []).filter(c => filtro === 'todos' || c.estado === filtro)

  return (
    <div className="space-y-4 lg:max-w-2xl lg:mx-auto">
      <div>
        <h2 className="text-xl font-bold text-slate-800">Opiniones de los clientes</h2>
        <p className="text-base text-slate-600">Cada opinión nueva queda <b>por revisar</b>. Solo las que apruebes se ven en el catálogo. Puedes responderles.</p>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {FILTROS.map(([id, t]) => (
          <button key={id} onClick={() => setFiltro(id)}
            className={`min-h-12 rounded-xl text-base font-semibold leading-tight px-2 ${filtro === id ? 'bg-negro text-champagne' : 'bg-white ring-1 ring-slate-200 text-slate-600'}`}>
            {t}{id !== 'todos' ? ` (${n(id)})` : ''}
          </button>
        ))}
      </div>
      {error && <p className="text-base text-red-600 bg-red-50 rounded-lg px-3 py-2 break-words">{error}</p>}
      {filas === null && <p className="text-center text-base text-slate-500 py-6">Cargando…</p>}
      {filas && visibles.length === 0 && !error && <p className="text-center text-base text-slate-500 py-6">No hay opiniones en esta lista.</p>}
      <ul className="space-y-3">
        {visibles.map(c => {
          const [txt, chip, caja] = ETIQUETA[c.estado]
          return (
            <li key={c.id} className={`rounded-2xl border-l-4 p-4 space-y-3 shadow-sm ${caja}`}>
              <div className="grid grid-cols-[1fr_auto] gap-2 items-center">
                <span className="text-base font-semibold text-slate-800 break-words">{c.nombre}</span>
                <Estrellas n={c.estrellas} />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${chip}`}>{txt}</span>
                <span className="text-sm text-slate-500">{fecha(c.creado_en)}</span>
              </div>
              {c.texto ? <p className="text-base text-slate-700 break-words">{c.texto}</p> : <p className="text-base text-slate-400">(Solo dejó estrellas)</p>}
              <label className="block space-y-1">
                <span className="text-sm font-medium text-slate-600">Tu respuesta (opcional, se ve debajo de su opinión)</span>
                <textarea rows={2} maxLength={300} value={resp[c.id] ?? c.respuesta ?? ''} onChange={e => setResp(r => ({ ...r, [c.id]: e.target.value }))}
                  placeholder="Ej. ¡Gracias por tu opinión! Te esperamos pronto." className={`${claseInput} h-auto py-2 text-base`} />
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => marcar(c, 'oculto')} disabled={trabajando === c.id || c.estado === 'oculto'}
                  className="min-h-12 rounded-xl bg-slate-200 text-slate-700 text-base font-semibold disabled:opacity-40 active:bg-slate-300">Ocultar</button>
                <button onClick={() => marcar(c, 'publicado')} disabled={trabajando === c.id}
                  className="min-h-12 rounded-xl bg-emerald-600 text-white text-base font-semibold disabled:opacity-50 active:bg-emerald-700">
                  {c.estado === 'publicado' ? 'Guardar respuesta' : 'Aprobar y publicar'}
                </button>
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
