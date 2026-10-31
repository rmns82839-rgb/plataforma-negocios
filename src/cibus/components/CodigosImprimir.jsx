// Códigos de barras internos para productos sin código (frutas, verduras, pan…).
// El dueño genera los códigos, imprime la hoja y la deja junto a la caja: se escanea el código del producto
// y la caja pide el peso (si el producto es por kilo).
import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { claseInput } from '../lib/estilos'
import { coincide } from '../lib/buscar'
import { ean13Svg, ean13Valido } from '../lib/ean13'

const TAM = 1000
async function traerTodo() {
  const filas = []
  for (let desde = 0; desde < 20000; desde += TAM) {
    const { data, error } = await supabase.from('productos').select('id,nombre,codigo,unidad,categoria').eq('activo', true).order('nombre').order('id').range(desde, desde + TAM - 1)
    if (error) return { error }
    filas.push(...data)
    if (data.length < TAM) break
  }
  return { filas }
}
const esInterno = (c) => /^2\d{12}$/.test(c || '') && ean13Valido(c)
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))

function imprimir(lista) {
  const tarjetas = lista.map((p) => `<div class="t"><p class="n">${esc(p.nombre)}</p>${ean13Svg(p.codigo, { alto: 56 })}<p class="c">${p.codigo}${p.unidad === 'kg' ? ' · por kilo' : ''}</p></div>`).join('')
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Códigos de productos</title><style>
    @page{margin:10mm} body{font-family:Arial,sans-serif;margin:0}
    .g{display:grid;grid-template-columns:repeat(3,1fr);gap:6mm}
    .t{border:1px solid #bbb;border-radius:6px;padding:3mm;text-align:center;break-inside:avoid}
    .n{font-size:13px;font-weight:700;margin:0 0 2mm;line-height:1.2}.c{font-size:11px;margin:1mm 0 0;letter-spacing:1px}
    svg{max-height:22mm}</style></head><body><div class="g">${tarjetas}</div></body></html>`
  const f = document.createElement('iframe')
  f.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0'
  document.body.appendChild(f)
  f.contentDocument.open(); f.contentDocument.write(html); f.contentDocument.close()
  setTimeout(() => { f.contentWindow.focus(); f.contentWindow.print(); setTimeout(() => f.remove(), 2000) }, 300)
}

export default function CodigosImprimir() {
  const [productos, setProductos] = useState([])
  const [cargando, setCargando] = useState(true), [error, setError] = useState(''), [generando, setGenerando] = useState(false), [aviso, setAviso] = useState('')
  const [texto, setTexto] = useState(''), [categoria, setCategoria] = useState('todas')

  const cargar = useCallback(async () => {
    setCargando(true)
    const r = await traerTodo()
    if (r.error) setError(r.error.message); else { setProductos(r.filas); setError('') }
    setCargando(false)
  }, [])
  useEffect(() => { cargar() }, [cargar])

  const sinCodigo = useMemo(() => productos.filter((p) => !p.codigo).length, [productos])
  const internos = useMemo(() => productos.filter((p) => esInterno(p.codigo)), [productos])
  const categorias = useMemo(() => [...new Set(internos.map((p) => p.categoria).filter(Boolean))].sort(), [internos])
  const lista = useMemo(() => internos.filter((p) => (categoria === 'todas' || p.categoria === categoria) && coincide([p.nombre, p.codigo], texto)), [internos, categoria, texto])

  async function generar() {
    setGenerando(true); setError(''); setAviso('')
    const { data, error: e } = await supabase.rpc('generar_codigos_internos')
    setGenerando(false)
    if (e) return setError(e.message)
    setAviso(`Listo: ${data?.asignados ?? 0} productos recibieron su código.`)
    cargar()
  }

  return (
    <div className="space-y-3 lg:max-w-3xl lg:mx-auto">
      <div>
        <h2 className="text-xl font-bold leading-snug">Códigos de productos</h2>
        <p className="text-sm text-slate-600 leading-snug">Para lo que no trae código de barras: frutas, verduras, pan. Imprime la hoja y déjala junto a la caja: escaneas el producto y la caja te pide el peso.</p>
      </div>
      {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
      {aviso && <p className="text-sm text-green-800 bg-green-50 rounded-lg px-3 py-2">{aviso}</p>}

      <div className="rounded-2xl border border-slate-200 bg-white p-3 space-y-2">
        <p className="text-base leading-snug">{cargando ? 'Cargando…' : sinCodigo > 0 ? <>Tienes <b>{sinCodigo}</b> {sinCodigo === 1 ? 'producto' : 'productos'} sin código.</> : 'Todos tus productos ya tienen código.'}</p>
        {sinCodigo > 0 && <button onClick={generar} disabled={generando} className="w-full h-12 rounded-xl bg-marca text-white font-semibold disabled:opacity-40 active:bg-marca-oscuro">{generando ? 'Generando…' : 'Generar códigos'}</button>}
      </div>

      {internos.length > 0 && (
        <>
          <div className="grid grid-cols-2 gap-2">
            <input value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Buscar producto" aria-label="Buscar producto" className={claseInput} />
            <select value={categoria} onChange={(e) => setCategoria(e.target.value)} aria-label="Categoría" className={claseInput}>
              <option value="todas">Todas las categorías</option>
              {categorias.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <button onClick={() => imprimir(lista)} disabled={!lista.length} className="w-full h-12 rounded-xl bg-marca text-white font-semibold disabled:opacity-40 active:bg-marca-oscuro">🖨️ Imprimir hoja ({lista.length})</button>
          <ul className="grid grid-cols-2 gap-2">
            {lista.slice(0, 60).map((p) => (
              <li key={p.id} className="rounded-xl border border-slate-200 bg-white p-2 text-center">
                <p className="text-sm font-semibold leading-snug break-words">{p.nombre}</p>
                <div className="my-1" dangerouslySetInnerHTML={{ __html: ean13Svg(p.codigo, { alto: 50 }) }} />
                <p className="text-xs text-slate-600 tracking-wider">{p.codigo}{p.unidad === 'kg' ? ' · por kilo' : ''}</p>
              </li>
            ))}
          </ul>
          {lista.length > 60 && <p className="text-sm text-slate-500">…y {lista.length - 60} más (salen todos al imprimir).</p>}
        </>
      )}
    </div>
  )
}
