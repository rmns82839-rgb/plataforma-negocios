import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { dinero, aNumero, aCantidad, numero } from '../lib/formato'
import { claseInput } from '../lib/estilos'
import Escaner from './Escaner'
import Modal from './Modal'
import ProductoForm from './ProductoForm'
import { useBorradorForm } from '../lib/useBorradorForm'
import AvisoBorrador from './AvisoBorrador'
import BotonCelular from './BotonCelular'
import { ordenarPorInicio, buscarProductosPorNombre } from '../lib/buscar'
import { usePersistido } from '../lib/usePersistido'
import { useDueno } from '../context/rol'
import { precioConMargen } from '../lib/margen'

const pctNum = (t) => { const n = parseFloat(String(t ?? '').replace(',', '.')); return Number.isFinite(n) && n >= 0 ? n : 0 }

// Entrada de mercancía con varios productos: escanea, pon cantidad y costo, guarda.
// Suma al stock y actualiza el precio de compra de cada producto.
export default function Compra({ onGuardado, onCerrar }) {
  const [lineas, setLineas, borLin] = useBorradorForm('borrador-compra', [])      // [{ producto, cantidad, costo, vence }]
  const [proveedor, setProveedor, borProv] = useBorradorForm('borrador-compra-prov', '')
  const limpiarBorrador = () => { borLin.limpiar(); borProv.limpiar() }
  const desdeCero = () => { borLin.empezarDeNuevo(); borProv.empezarDeNuevo() }
  const [proveedores, setProveedores] = useState([])
  const [verEscaner, setVerEscaner] = useState(true)
  const [busqueda, setBusqueda] = useState('')
  const [resultados, setResultados] = useState([])
  const [aviso, setAviso] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [nuevoCodigo, setNuevoCodigo] = useState(null)   // código escaneado que aún no existe
  const dueno = useDueno()
  const [foco, setFoco] = useState(null)             // producto recién agregado: el cursor salta a su costo
  const [masAbierto, setMasAbierto] = useState(() => new Set())   // productos con lote y vencimiento a la vista
  const [usarMargen, setUsarMargen] = usePersistido('compra:usarMargen', false)     // el precio de cada producto sale del costo + % de ganancia
  const [margen, setMargen] = usePersistido('compra:margen', '30')                  // % para todos
  const [margenCat, setMargenCat] = usePersistido('compra:margenCat', {})           // % distinto para una categoría: { 'Aseo': '40' }
  const [porCategoria, setPorCategoria] = useState(false)
  const pctDe = useCallback((l) => pctNum(margenCat[l.producto.categoria ?? ''] ?? margen), [margen, margenCat])

  useEffect(() => {
    supabase.from('compras').select('proveedor').not('proveedor', 'is', null)
      .order('fecha', { ascending: false }).limit(200)
      .then(({ data }) => setProveedores([...new Set((data ?? []).map(c => c.proveedor))]))
  }, [])

  const agregar = useCallback((producto) => {
    setLineas(prev => {
      const i = prev.findIndex(l => l.producto.id === producto.id)
      if (i >= 0) {
        const copia = [...prev]
        copia[i] = { ...copia[i], cantidad: String(aCantidad(copia[i].cantidad) + 1) }
        return copia
      }
      return [{
        producto, cantidad: '1',
        costo: producto.precio_compra ? String(Number(producto.precio_compra)) : '',
        venta: producto.precio_venta ? String(Number(producto.precio_venta)) : '',
        lote: '',
        vence: '',
      }, ...prev]                                    // el último que escaneas queda arriba, a la vista
    })
    setFoco(producto.id)
    setAviso('')
  }, [])
  useEffect(() => {
    if (!foco) return
    const t = setTimeout(() => { document.querySelector(`[data-costo="${foco}"]`)?.focus(); setFoco(null) }, 60)
    return () => clearTimeout(t)
  }, [foco, lineas.length])

  const alEscanear = useCallback(async (codigo) => {
    const { data, error } = await supabase
      .from('productos').select('*').eq('codigo', codigo).eq('activo', true).maybeSingle()
    if (error) return setAviso(error.message)
    if (data) agregar(data)
    else setNuevoCodigo(codigo)   // producto nuevo: se crea aquí mismo con el código ya escaneado
  }, [agregar])

  useEffect(() => {
    const q = busqueda.trim()
    if (q.length < 1) { setResultados([]); return }
    const t = setTimeout(async () => {
      const { data } = await buscarProductosPorNombre(supabase, q)
      setResultados(ordenarPorInicio(data ?? [], q).slice(0, 30))
    }, 250)
    return () => clearTimeout(t)
  }, [busqueda])

  // Con el botón activo, el precio de venta de cada producto se calcula solo con su costo (los que se editaron a mano no se tocan)
  const llave = lineas.map(l => `${l.producto.id}:${l.costo}:${l.manual ? 1 : 0}`).join('|')
  useEffect(() => {
    if (!usarMargen || dueno !== true) return
    setLineas(prev => {
      let cambio = false
      const sig = prev.map(l => {
        if (l.manual) return l
        const p = precioConMargen(aNumero(l.costo), pctDe(l))
        if (p > 0 && String(p) !== String(l.venta)) { cambio = true; return { ...l, venta: String(p) } }
        return l
      })
      return cambio ? sig : prev
    })
  }, [usarMargen, dueno, llave, pctDe]) // eslint-disable-line react-hooks/exhaustive-deps

  const cambiar = (id, campo, valor) =>
    setLineas(prev => prev.map(l => l.producto.id === id ? { ...l, [campo]: valor } : l))
  const quitar = (id) => setLineas(prev => prev.filter(l => l.producto.id !== id))

  const total = Math.round(lineas.reduce((s, l) => s + aNumero(l.costo) * aCantidad(l.cantidad), 0))

  const guardar = async () => {
    if (lineas.some(l => aCantidad(l.cantidad) <= 0)) return setAviso('Revisa las cantidades')
    setGuardando(true); setAviso('')
    const { error } = await supabase.rpc('registrar_compra', {
      p_items: lineas.map(l => ({
        producto_id: l.producto.id,
        cantidad: aCantidad(l.cantidad),
        costo_unitario: aNumero(l.costo),
        precio_venta: aNumero(l.venta) !== Number(l.producto.precio_venta) ? aNumero(l.venta) : null,
        lote: l.lote || null,
        vence: l.vence || null,
      })),
      p_proveedor: proveedor,
    })
    setGuardando(false)
    if (error) return setAviso(error.message)
    limpiarBorrador()
    onGuardado?.()
  }

  return (
    <Modal titulo="Entrada de mercancía" onCerrar={() => { limpiarBorrador(); onCerrar?.() }}>
      {borLin.recuperado && <AvisoBorrador onNuevo={desdeCero} texto="Recuperamos la entrada de mercancía que estabas armando." />}
      <div className="sticky top-16 z-20 -mx-5 px-5 py-2 bg-white/95 backdrop-blur space-y-2 border-b border-slate-100">
        <div className="grid grid-cols-[1fr_auto] gap-2">
          <input value={busqueda} onChange={e => setBusqueda(e.target.value)}
                 placeholder="Buscar por nombre" className={claseInput} />
          <button onClick={() => setVerEscaner(v => !v)} aria-pressed={verEscaner}
            className={`min-h-12 px-4 rounded-xl text-sm font-semibold ${verEscaner ? 'bg-negro text-champagne' : 'bg-slate-100 text-slate-700'}`}>
            📷 {verEscaner ? 'Ocultar' : 'Escanear'}
          </button>
        </div>
        {resultados.length > 0 && (
          <div className="rounded-xl border border-slate-200 divide-y divide-slate-100 max-h-[18.5rem] overflow-y-auto overscroll-contain">
            {resultados.map(p => (
              <button key={p.id} onClick={() => { agregar(p); setBusqueda(''); setResultados([]) }}
                className="w-full min-h-12 px-4 py-2 grid grid-cols-[1fr_auto] gap-3 items-center text-left active:bg-slate-50">
                <span className="text-sm truncate">{p.nombre}</span>
                <span className="text-xs text-slate-400">hay {numero(p.stock)}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {verEscaner && <Escaner onCodigo={alEscanear} compacto />}
      <BotonCelular onCodigo={alEscanear} />

      {aviso && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{aviso}</p>}

      {lineas.length > 0 && dueno === true && (
        <div className="space-y-3 rounded-2xl bg-slate-50 p-3">
          <button onClick={() => setUsarMargen(v => !v)} aria-pressed={usarMargen}
            className={`w-full min-h-12 rounded-xl text-base font-semibold px-2 leading-tight ${usarMargen ? 'bg-marca text-white' : 'bg-white ring-1 ring-slate-200 text-slate-700'}`}>
            {usarMargen ? '✓ Precios calculados con % de ganancia' : 'Calcular precios con % de ganancia'}
          </button>
          {usarMargen && (
            <div className="space-y-3">
              <p className="text-sm text-slate-600">Escribe el costo de cada producto y el precio de venta sale solo para todos.</p>
              <div className="grid grid-cols-4 gap-2">
                {['20', '30', '40'].map(m => (
                  <button key={m} onClick={() => setMargen(m)} className={`min-h-11 rounded-xl text-base font-semibold ${margen === m ? 'bg-negro text-champagne' : 'bg-white ring-1 ring-slate-200'}`}>{m} %</button>
                ))}
                <input value={margen} onChange={e => setMargen(e.target.value.replace(/[^\d.,]/g, ''))} inputMode="decimal" aria-label="Otro porcentaje de ganancia" className={`${claseInput} !min-h-11 text-center`} />
              </div>
              <button onClick={() => setPorCategoria(v => !v)} className="w-full min-h-11 rounded-xl bg-white ring-1 ring-slate-200 text-sm font-semibold text-slate-700">
                {porCategoria ? 'Ocultar % por categoría' : 'Poner un % distinto por categoría'}
              </button>
              {porCategoria && (
                <ul className="space-y-2">
                  {[...new Set(lineas.map(l => l.producto.categoria ?? ''))].map(c => (
                    <li key={c || 'sin'} className="grid grid-cols-[1fr_6rem] gap-3 items-center">
                      <span className="text-sm break-words">{c || 'Sin categoría'}</span>
                      <input value={margenCat[c] ?? ''} placeholder={`${margen || 0} %`} inputMode="decimal" aria-label={`% de ganancia de ${c || 'sin categoría'}`}
                        onChange={e => { const v = e.target.value.replace(/[^\d.,]/g, ''); setMargenCat(prev => { const n = { ...prev }; if (v === '') delete n[c]; else n[c] = v; return n }) }}
                        className={`${claseInput} !min-h-11 text-center`} />
                    </li>
                  ))}
                </ul>
              )}
              <p className="text-sm text-slate-500">Se redondea a los 50 pesos más cercanos. Si cambias un precio a mano, ese producto ya no se recalcula.</p>
            </div>
          )}
        </div>
      )}

      {lineas.length === 0 ? (
        <p className="text-center text-base text-slate-400 py-6">Escanea o busca los productos que llegaron. El último que agregues queda arriba y el cursor salta al costo.</p>
      ) : (
        <ul className="space-y-3">
          {lineas.map((l, idx) => {
            const id = l.producto.id
            const margenTxt = aNumero(l.costo) > 0 && aNumero(l.venta) > 0 ? `${(((aNumero(l.venta) - aNumero(l.costo)) / aNumero(l.costo)) * 100).toFixed(1)} %` : '—'
            const mas = masAbierto.has(id) || Boolean(l.lote) || Boolean(l.vence)
            const paso = (d) => cambiar(id, 'cantidad', String(Math.max(0, aCantidad(l.cantidad) + d)))
            return (
              <li key={id} className={`rounded-2xl p-3 space-y-3 ${idx === 0 ? 'bg-champagne/20 ring-1 ring-oro/40' : 'bg-slate-50'}`}>
                <div className="grid grid-cols-[1fr_auto] gap-3 items-start">
                  <p className="text-base font-semibold break-words leading-snug">{l.producto.nombre}</p>
                  <button onClick={() => quitar(id)} className="min-h-10 px-2 text-sm text-red-600 font-semibold">Quitar</button>
                </div>
                <div className="grid grid-cols-[1fr_auto] gap-3 items-end">
                  <div className="space-y-0.5">
                    <span className="text-xs text-slate-500">Cantidad{l.producto.unidad && l.producto.unidad !== 'und' ? ` (${l.producto.unidad})` : ''}</span>
                    <div className="grid grid-cols-[3rem_1fr_3rem] gap-2">
                      <button onClick={() => paso(-1)} aria-label="Menos" className="h-12 rounded-xl bg-white ring-1 ring-slate-200 text-2xl font-semibold active:bg-slate-100">−</button>
                      <input value={l.cantidad} onChange={e => cambiar(id, 'cantidad', e.target.value)} inputMode="decimal" aria-label="Cantidad" className={`${claseInput} text-center`} />
                      <button onClick={() => paso(1)} aria-label="Más" className="h-12 rounded-xl bg-white ring-1 ring-slate-200 text-2xl font-semibold active:bg-slate-100">+</button>
                    </div>
                  </div>
                  <div className="text-center rounded-xl bg-white px-3 h-12 grid content-center min-w-[5.5rem]">
                    <span className="text-[11px] text-slate-500 leading-none">Margen</span>
                    <span className="text-sm font-bold">{margenTxt}</span>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <label className="space-y-0.5">
                    <span className="text-xs text-slate-500">Costo c/u</span>
                    <input data-costo={id} value={l.costo} onChange={e => cambiar(id, 'costo', e.target.value)} inputMode="numeric" className={claseInput} />
                  </label>
                  <label className="space-y-0.5">
                    <span className="text-xs text-slate-500">Precio de venta</span>
                    <input value={l.venta} onChange={e => setLineas(prev => prev.map(x => x.producto.id === id ? { ...x, venta: e.target.value, manual: true } : x))}
                           inputMode="numeric" className={claseInput} />
                  </label>
                </div>
                {usarMargen && dueno === true && l.manual && (
                  <button onClick={() => cambiar(id, 'manual', false)} className="text-sm text-oro-oscuro underline min-h-8">Precio a mano · volver a automático</button>
                )}
                {mas ? (
                  <div className="grid grid-cols-2 gap-3">
                    <label className="space-y-0.5">
                      <span className="text-xs text-slate-500">Lote (opcional)</span>
                      <input value={l.lote} onChange={e => cambiar(id, 'lote', e.target.value)} className={claseInput} />
                    </label>
                    <label className="space-y-0.5">
                      <span className="text-xs text-slate-500">Vence (opcional)</span>
                      <input type="date" value={l.vence} onChange={e => cambiar(id, 'vence', e.target.value)} className={claseInput} />
                    </label>
                  </div>
                ) : (
                  <button onClick={() => setMasAbierto(prev => new Set(prev).add(id))} className="w-full min-h-10 rounded-xl bg-white ring-1 ring-slate-200 text-sm font-semibold text-slate-600">+ Lote y fecha de vencimiento</button>
                )}
              </li>
            )
          })}
        </ul>
      )}

      {lineas.length > 0 && (
        <>
          <div>
            <input value={proveedor} onChange={e => setProveedor(e.target.value)} list="lista-proveedores"
                   placeholder="Proveedor (opcional)" className={claseInput} />
            <datalist id="lista-proveedores">
              {proveedores.map(p => <option key={p} value={p} />)}
            </datalist>
          </div>
          {/* Total y botón siempre a la vista, aunque la lista sea larga */}
          <div className="sticky bottom-0 z-20 -mx-5 px-5 pt-3 pb-3 bg-white/95 backdrop-blur border-t border-slate-200 space-y-2 shadow-[0_-6px_12px_-8px_rgba(0,0,0,0.25)]">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-slate-600">Total de la compra ({lineas.length} {lineas.length === 1 ? 'producto' : 'productos'})</span>
              <span className="text-2xl font-bold text-marca">{dinero(total)}</span>
            </div>
            <button onClick={guardar} disabled={guardando}
              className="w-full h-14 rounded-xl bg-marca text-white text-lg font-semibold disabled:opacity-40 active:bg-marca-oscuro">
              {guardando ? 'Guardando…' : 'Guardar entrada'}
            </button>
          </div>
        </>
      )}
      {nuevoCodigo && (
        <ProductoForm
          producto={{ codigo: nuevoCodigo }}
          onCerrar={() => setNuevoCodigo(null)}
          onGuardado={(p) => { setNuevoCodigo(null); agregar(p) }}
        />
      )}
    </Modal>
  )
}
