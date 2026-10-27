// Productos que parecen repetidos: el dueño los ve juntos y quita el que sobra, en dos pasos (tocar «Quitar» y luego «Sí, quitar»).
// Quitar = sacarlo del inventario (las ventas anteriores se conservan), igual que el botón «Quitar» del producto.
// Si el que se quita tenía unidades, se suman al que se queda para que el inventario no pierda nada.
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { buscarRepetidos } from '../lib/repetidos'
import { fotosDe } from '../lib/fotos'
import { dinero, numero } from '../lib/formato'
import Modal from './Modal'

const CLAVE_IGNORADOS = 'repetidos-ignorados'
const leerIgnorados = () => { try { return new Set(JSON.parse(localStorage.getItem(CLAVE_IGNORADOS) || '[]')) } catch { return new Set() } }
const guardarIgnorados = (s) => { try { localStorage.setItem(CLAVE_IGNORADOS, JSON.stringify([...s].slice(-500))) } catch { /* sin almacenamiento */ } }
const llaveGrupo = (ids) => [...ids].map(String).sort().join('+')

export default function Repetidos({ productos, onCerrar, onCambio }) {
  const [grupos, setGrupos] = useState(null)
  const [quitados, setQuitados] = useState(() => new Set())
  const [ignorados, setIgnorados] = useState(leerIgnorados)
  const [elegido, setElegido] = useState({})            // llave del grupo → id del producto que se queda
  const [confirmando, setConfirmando] = useState(null)  // id del producto que se va a quitar (segundo paso)
  const [pasarStock, setPasarStock] = useState(true)
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState('')
  const [aviso, setAviso] = useState('')

  const porId = useMemo(() => new Map(productos.map(p => [p.id, p])), [productos])

  useEffect(() => {
    setGrupos(null)
    const t = setTimeout(() => setGrupos(buscarRepetidos(productos)), 30)   // deja pintar «Buscando…» antes de calcular
    return () => clearTimeout(t)
  }, [productos])

  // Grupos que siguen vigentes (sin los ya quitados ni los que el dueño marcó como "no son repetidos")
  const vigentes = useMemo(() => (grupos ?? [])
    .map(g => ({ ...g, ids: g.ids.filter(id => !quitados.has(id)) }))
    .filter(g => g.ids.length >= 2 && !ignorados.has(llaveGrupo(g.ids))), [grupos, quitados, ignorados])

  const quedaPorDefecto = (ids) => {
    const lista = ids.map(id => porId.get(id)).filter(Boolean)
    lista.sort((a, b) => (fotosDe(b).length > 0) - (fotosDe(a).length > 0) || Number(b.stock) - Number(a.stock) || String(b.nombre).length - String(a.nombre).length)
    return lista[0]?.id
  }
  const quien = (g) => (g.ids.includes(elegido[llaveGrupo(g.ids)]) ? elegido[llaveGrupo(g.ids)] : quedaPorDefecto(g.ids))

  const quitar = async (g, p) => {
    const sobrevive = porId.get(quien(g))
    if (!sobrevive || sobrevive.id === p.id) return
    setOcupado(true); setError(''); setAviso('')
    const pasa = pasarStock && Number(p.stock) > 0
    if (pasa) {
      const a = await supabase.rpc('ajustar_stock', { p_producto_id: sobrevive.id, p_stock_real: Number(sobrevive.stock) + Number(p.stock), p_motivo: `Se unió con un repetido: ${p.nombre}`.slice(0, 120) })
      if (a.error) { setOcupado(false); return setError(`No se pudo pasar el stock: ${a.error.message}. No se quitó nada.`) }
      const b = await supabase.rpc('ajustar_stock', { p_producto_id: p.id, p_stock_real: 0, p_motivo: `Se unió con "${sobrevive.nombre}"`.slice(0, 120) })
      if (b.error) { setOcupado(false); return setError(`Se sumó el stock a «${sobrevive.nombre}», pero no se pudo dejar en cero el repetido: ${b.error.message}. Revisa los dos antes de seguir.`) }
    }
    const { error: err } = await supabase.from('productos').update({ activo: false }).eq('id', p.id)
    setOcupado(false)
    if (err) return setError(err.message)
    sobrevive.stock = Number(sobrevive.stock) + (pasa ? Number(p.stock) : 0)    // para que el siguiente cálculo parta de lo nuevo
    setQuitados(s => new Set(s).add(p.id)); setConfirmando(null)
    setAviso(pasa ? `Listo. «${p.nombre}» salió y sus ${numero(p.stock)} unidades pasaron a «${sobrevive.nombre}».` : `Listo. «${p.nombre}» salió del inventario.`)
    onCambio?.()
  }

  const noSonRepetidos = (g) => { const s = new Set(ignorados); s.add(llaveGrupo(g.ids)); setIgnorados(s); guardarIgnorados(s) }

  return (
    <Modal titulo="Productos repetidos" onCerrar={onCerrar} ancho="max-w-2xl">
      <p className="text-sm text-slate-600">
        Estos productos se parecen mucho. Deja el que sirve y quita el repetido: pide confirmación dos veces, y las ventas anteriores no se pierden.
      </p>
      <label className="grid grid-cols-[auto_1fr] gap-3 items-start rounded-xl bg-slate-50 p-3 text-sm text-slate-700">
        <input type="checkbox" checked={pasarStock} onChange={e => setPasarStock(e.target.checked)} className="mt-0.5 h-5 w-5" />
        <span>Al quitar uno, <b>sumar sus unidades</b> al que se queda (así el inventario no pierde nada).</span>
      </label>
      {error && <p role="alert" className="text-sm rounded-lg px-3 py-2 bg-red-50 text-red-600 break-words">{error}</p>}
      {aviso && <p role="status" className="text-sm rounded-lg px-3 py-2 bg-emerald-50 text-emerald-700 break-words">{aviso}</p>}

      {grupos === null ? <p className="text-center text-sm text-slate-400 py-8">Buscando repetidos…</p>
        : vigentes.length === 0 ? <p className="text-center text-sm text-slate-500 py-8">No encontré productos repetidos. 🎉</p>
        : (
          <div className="space-y-4">
            <p className="text-xs text-slate-400">{vigentes.length} {vigentes.length === 1 ? 'grupo' : 'grupos'} por revisar</p>
            {vigentes.map((g) => {
              const llave = llaveGrupo(g.ids), queda = quien(g)
              return (
                <section key={llave} className="rounded-2xl ring-1 ring-slate-200 p-3 space-y-2">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{g.motivo}</p>
                  <ul className="space-y-2">
                    {g.ids.map(id => {
                      const p = porId.get(id); if (!p) return null
                      const seQueda = id === queda
                      return (
                        <li key={id} className={`rounded-xl p-3 grid gap-2 ${seQueda ? 'bg-emerald-50 ring-1 ring-emerald-200' : 'bg-slate-50'}`}>
                          <div className="grid grid-cols-[1fr_auto] gap-3 items-start">
                            <div className="min-w-0">
                              <p className="text-sm font-medium break-words">{p.nombre}</p>
                              <p className="text-xs text-slate-500 break-words">{p.codigo || 'sin código'} · {dinero(p.precio_venta)} · stock {numero(p.stock)}{fotosDe(p).length > 0 ? ' · con foto' : ''}</p>
                            </div>
                            {seQueda && <span className="text-xs font-semibold text-emerald-700 whitespace-nowrap">✓ Se queda</span>}
                          </div>
                          {!seQueda && confirmando !== id && (
                            <div className="grid grid-cols-2 gap-2">
                              <button onClick={() => setElegido(e => ({ ...e, [llave]: id }))} disabled={ocupado}
                                className="min-h-11 rounded-xl bg-white ring-1 ring-slate-200 text-slate-700 text-sm font-semibold px-2 leading-tight active:bg-slate-100 disabled:opacity-40">Dejar este</button>
                              <button onClick={() => { setError(''); setAviso(''); setConfirmando(id) }} disabled={ocupado}
                                className="min-h-11 rounded-xl bg-white ring-1 ring-red-300 text-red-600 text-sm font-semibold px-2 leading-tight active:bg-red-50 disabled:opacity-40">Quitar</button>
                            </div>
                          )}
                          {!seQueda && confirmando === id && (
                            <div role="alertdialog" className="rounded-xl bg-red-50 p-3 space-y-2">
                              <p className="text-sm text-red-700 font-semibold break-words">¿Quitar «{p.nombre}» del inventario?</p>
                              <p className="text-xs text-red-700/90 break-words">
                                {pasarStock && Number(p.stock) > 0 ? `Sus ${numero(p.stock)} unidades se suman a «${porId.get(queda)?.nombre}». ` : ''}
                                {p.codigo ? `Su código ${p.codigo} dejará de funcionar en la caja. ` : ''}Las ventas anteriores se conservan.
                              </p>
                              <div className="grid grid-cols-2 gap-2">
                                <button onClick={() => setConfirmando(null)} disabled={ocupado} className="min-h-11 rounded-xl bg-white text-slate-700 text-sm font-semibold active:bg-slate-100 disabled:opacity-40">Cancelar</button>
                                <button onClick={() => quitar(g, p)} disabled={ocupado} className="min-h-11 rounded-xl bg-red-600 text-white text-sm font-semibold active:opacity-80 disabled:opacity-40">{ocupado ? 'Quitando…' : 'Sí, quitar'}</button>
                              </div>
                            </div>
                          )}
                        </li>
                      )
                    })}
                  </ul>
                  <button onClick={() => noSonRepetidos(g)} disabled={ocupado} className="w-full min-h-11 rounded-xl text-sm font-medium text-slate-500 active:bg-slate-100 disabled:opacity-40">Estos no son repetidos</button>
                </section>
              )
            })}
          </div>
        )}
    </Modal>
  )
}
