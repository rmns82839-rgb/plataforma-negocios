import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { claseInput } from '../lib/estilos'
import { categoriaExistente } from '../lib/duplicados'

const NUEVA = '__nueva__'

/** Desplegable con las categorías que ya existen (las mismas del catálogo en línea) y la opción de crear una nueva. */
export default function CategoriaSelect({ valor, onCambio }) {
  const [existentes, setExistentes] = useState([])
  const [nueva, setNueva] = useState(false)

  useEffect(() => {
    let vivo = true
    supabase.from('productos').select('categoria').not('categoria', 'is', null)
      .then(({ data }) => {
        if (!vivo) return
        setExistentes([...new Set((data ?? []).map(r => (r.categoria ?? '').trim()).filter(Boolean))]
          .sort((a, b) => a.localeCompare(b, 'es')))
      })
    return () => { vivo = false }
  }, [])

  // Si el producto ya tiene una categoría que no está en la lista, se incluye igual
  const opciones = useMemo(
    () => (valor && !existentes.includes(valor) ? [...existentes, valor].sort((a, b) => a.localeCompare(b, 'es')) : existentes),
    [existentes, valor])

  if (nueva) {
    const yaExiste = valor.trim() ? categoriaExistente(valor, existentes) : null     // la misma categoría escrita distinto (tildes, mayúsculas, plural)
    const usar = (c) => { setNueva(false); onCambio(c) }
    return (
      <div className="space-y-2">
        <div className="grid grid-cols-[1fr_auto] gap-2">
          <input autoFocus value={valor} onChange={e => onCambio(e.target.value)}
                 onBlur={() => { if (yaExiste) usar(yaExiste) }}
                 placeholder="Nombre de la categoría" className={claseInput} />
          <button type="button" onClick={() => { setNueva(false); onCambio('') }}
                  className="h-11 px-3 rounded-lg bg-slate-100 text-xs font-medium text-slate-600">Volver</button>
        </div>
        {yaExiste && (
          <div className="rounded-xl bg-amber-50 ring-1 ring-amber-300 p-3 space-y-2">
            <p className="text-base text-amber-900 break-words">Esa categoría ya existe: <b>{yaExiste}</b>. No se puede crear repetida.</p>
            <button type="button" onClick={() => usar(yaExiste)}
              className="w-full min-h-12 rounded-xl bg-amber-500 text-white text-base font-semibold break-words">Usar «{yaExiste}»</button>
          </div>
        )}
      </div>
    )
  }

  return (
    <select value={valor} className={claseInput}
            onChange={e => { if (e.target.value === NUEVA) { setNueva(true); onCambio('') } else onCambio(e.target.value) }}>
      <option value="">Sin categoría</option>
      {opciones.map(c => <option key={c} value={c}>{c}</option>)}
      <option value={NUEVA}>＋ Nueva categoría…</option>
    </select>
  )
}
