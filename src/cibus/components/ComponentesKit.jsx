// Editor de lo que lleva un combo: busca productos y les pone la cantidad.
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { claseInput } from '../lib/estilos'
import { aCantidad, numero } from '../lib/formato'

export default function ComponentesKit({ kitId, valor, onCambiar, ocupados = [] }) {
  const [q, setQ] = useState('')
  const [resultados, setResultados] = useState([])

  // Al editar un combo existente se cargan sus componentes
  useEffect(() => {
    if (!kitId) return
    // (dos consultas: la plataforma no usa selecciones anidadas entre tablas)
    ;(async () => {
      const { data } = await supabase.from('producto_componentes').select('componente_id, cantidad').eq('kit_id', kitId)
      const filas = data ?? []
      const { data: prods } = filas.length ? await supabase.from('productos').select('id, nombre').in('id', filas.map(x => x.componente_id)) : { data: [] }
      const nombre = new Map((prods ?? []).map(x => [x.id, x.nombre]))
      onCambiar(filas.map(x => ({ id: x.componente_id, nombre: nombre.get(x.componente_id) ?? '', txt: numero(x.cantidad) })))
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kitId])

  useEffect(() => {
    const t = q.trim()
    if (t.length < 1) { setResultados([]); return undefined }
    const h = setTimeout(async () => {
      const { data } = await supabase.from('productos').select('id, nombre').eq('activo', true).eq('es_kit', false)
        .ilike('nombre', `%${t}%`).order('nombre').limit(5)
      setResultados((data ?? []).filter(p => p.id !== kitId && !ocupados.includes(p.id) && !valor.some(v => v.id === p.id)))
    }, 250)
    return () => clearTimeout(h)
  }, [q, kitId, valor, ocupados])

  const poner = (id, cambios) => onCambiar(valor.map(v => (v.id === id ? { ...v, ...cambios } : v)))

  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-slate-500">Lo que lleva el combo</p>
      {valor.length === 0 && <p className="text-xs text-slate-400">Agrega al menos un producto.</p>}
      <ul className="space-y-2">
        {valor.map(v => (
          <li key={v.id} className="grid grid-cols-[1fr_5rem_2.5rem] gap-2 items-center">
            <span className="text-sm break-words">{v.nombre}</span>
            <input value={v.txt} onChange={e => poner(v.id, { txt: e.target.value })} inputMode="decimal"
                   aria-label={`Cantidad de ${v.nombre}`} className={`${claseInput} h-11 text-center`} />
            <button onClick={() => onCambiar(valor.filter(x => x.id !== v.id))} aria-label={`Quitar ${v.nombre}`}
              className="h-10 w-10 rounded-full bg-slate-200 text-slate-500">✕</button>
          </li>
        ))}
      </ul>
      <input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar producto para agregar" className={claseInput} />
      {resultados.length > 0 && (
        <div className="rounded-xl border border-slate-200 divide-y divide-slate-100 bg-white">
          {resultados.map(p => (
            <button key={p.id} onClick={() => { onCambiar([...valor, { id: p.id, nombre: p.nombre, txt: '1' }]); setQ(''); setResultados([]) }}
              className="w-full min-h-11 px-4 text-left text-sm active:bg-slate-50">{p.nombre}</button>
          ))}
        </div>
      )}
    </div>
  )
}

export const componentesAFilas = (kitId, valor) =>
  valor.map(v => ({ kit_id: kitId, componente_id: v.id, cantidad: aCantidad(v.txt) }))
