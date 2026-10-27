import { useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { fotosDe } from '../lib/fotos'
import Modal from './Modal'

// Pasa al catálogo en línea los productos que ya tienen foto y aún no se muestran. Todos vienen marcados; se desmarcan los que no.
export default function PublicarEnLinea({ productos, onCerrar, onGuardado }) {
  const candidatos = useMemo(() => productos.filter(p => !p.publicado && fotosDe(p).length > 0), [productos])
  const [fuera, setFuera] = useState(() => new Set())      // ids desmarcados
  const [buscar, setBuscar] = useState('')
  const [fase, setFase] = useState('elegir')               // elegir | guardando | fin
  const [res, setRes] = useState(null)
  const [avance, setAvance] = useState(0)

  const visibles = useMemo(() => {
    const q = buscar.trim().toLowerCase()
    return q ? candidatos.filter(p => p.nombre.toLowerCase().includes(q)) : candidatos
  }, [candidatos, buscar])
  const elegidos = candidatos.filter(p => !fuera.has(p.id))

  const marcar = (ids, v) => setFuera(prev => { const n = new Set(prev); ids.forEach(id => v ? n.delete(id) : n.add(id)); return n })

  const publicar = async () => {
    setFase('guardando'); setAvance(0)
    let ok = 0, fallos = 0, motivo = ''
    const ids = elegidos.map(p => p.id)
    for (let i = 0; i < ids.length; i += 50) {
      const { error } = await supabase.from('productos').update({ publicado: true }).in('id', ids.slice(i, i + 50))
      if (error) { fallos += ids.slice(i, i + 50).length; motivo = motivo || error.message } else ok += ids.slice(i, i + 50).length
      setAvance(Math.min(ids.length, i + 50))
    }
    setRes({ ok, fallos, motivo }); setFase('fin'); onGuardado?.()
  }

  return (
    <Modal titulo="Mostrar en la tienda en línea" onCerrar={onCerrar} ancho="max-w-lg">
      {fase === 'elegir' && (
        candidatos.length === 0 ? (
          <div className="space-y-3">
            <p className="text-sm text-slate-600 text-center py-4">No hay productos con foto pendientes de mostrar. 🎉</p>
            <button onClick={onCerrar} className="w-full min-h-12 rounded-xl bg-slate-100 text-slate-700 font-medium">Cerrar</button>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-slate-600">Estos productos ya tienen foto pero <b>no se ven</b> en la tienda. Desmarca los que no quieras mostrar.</p>
            <input value={buscar} onChange={e => setBuscar(e.target.value)} placeholder="Buscar por nombre…"
              className="w-full h-11 rounded-xl bg-slate-50 px-3 text-sm outline-none ring-1 ring-slate-200 focus:ring-marca" />
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => marcar(visibles.map(p => p.id), true)} className="h-10 rounded-xl bg-lima/20 text-marca text-xs font-semibold">Marcar todos</button>
              <button onClick={() => marcar(visibles.map(p => p.id), false)} className="h-10 rounded-xl bg-slate-100 text-slate-600 text-xs font-semibold">Desmarcar todos</button>
            </div>
            <ul className="max-h-[50vh] overflow-y-auto overscroll-contain divide-y divide-slate-100 rounded-xl ring-1 ring-slate-100">
              {visibles.map(p => (
                <li key={p.id}>
                  <label className="grid grid-cols-[auto_3rem_1fr] gap-3 items-center px-3 py-2">
                    <input type="checkbox" checked={!fuera.has(p.id)} onChange={() => marcar([p.id], fuera.has(p.id))} className="h-5 w-5 accent-[#1f6f4a]" />
                    <img src={fotosDe(p)[0]} alt="" className="h-12 w-12 rounded-lg object-contain bg-white ring-1 ring-slate-100" />
                    <span className="min-w-0"><span className="block text-sm font-medium truncate">{p.nombre}</span>
                      <span className="block text-[11px] text-slate-400 truncate">{p.categoria || 'Sin categoría'}</span></span>
                  </label>
                </li>
              ))}
            </ul>
            <div className="sticky bottom-0 -mx-5 px-5 pt-2 pb-1 bg-white/95 backdrop-blur grid grid-cols-[auto_1fr] gap-2">
              <button onClick={onCerrar} className="min-h-12 px-4 rounded-xl bg-slate-100 text-slate-600 text-sm font-medium">Volver</button>
              <button onClick={publicar} disabled={elegidos.length === 0}
                className="min-h-12 rounded-xl bg-negro text-champagne font-semibold disabled:opacity-40">
                Mostrar {elegidos.length} en línea
              </button>
            </div>
          </div>
        )
      )}
      {fase === 'guardando' && (
        <div className="space-y-2 py-2">
          <p className="text-sm font-medium text-slate-700 text-center">Publicando {avance} de {elegidos.length}…</p>
          <div className="h-2.5 rounded-full bg-slate-100 overflow-hidden" role="progressbar" aria-valuemin={0} aria-valuemax={elegidos.length} aria-valuenow={avance}>
            <div className="h-full bg-marca transition-all" style={{ width: `${Math.max(6, Math.round(100 * avance / Math.max(1, elegidos.length)))}%` }} />
          </div>
        </div>
      )}
      {fase === 'fin' && res && (
        <div className="space-y-3">
          <div className={`rounded-2xl p-4 text-center ${res.fallos ? 'bg-champagne/30' : 'bg-esmeralda/10'}`}>
            <p className="font-bold text-marca">✓ {res.ok} producto(s) ya se ven en la tienda</p>
            {res.fallos > 0 && <p className="text-xs text-red-600">{res.fallos} no se pudieron publicar. {res.motivo}</p>}
          </div>
          <button onClick={onCerrar} className="w-full min-h-12 rounded-xl bg-negro text-champagne font-semibold">Listo</button>
        </div>
      )}
    </Modal>
  )
}
