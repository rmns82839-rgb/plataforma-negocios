// Cargar muchos productos de una vez: se pega la lista (de Excel, WhatsApp o escrita a mano) o se sube un archivo CSV.
// Primero se muestra cómo quedó cada producto; recién al confirmar se guarda. Nunca toca los productos que ya existen.
import { useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { dinero, numero } from '../lib/formato'
import { claseInput } from '../lib/estilos'
import { leerLista, separarExistentes, filaProducto, MAX_FILAS } from '../lib/cargaMasiva'
import Modal from './Modal'

const EJEMPLO = 'Arroz Diana 1kg;5000;20;Víveres\nAceite 1L;12500;8;Víveres\nGaseosa 1.5L;4500;24;Bebidas'
const TROZO = 100

export default function CargaMasiva({ productos, onCerrar, onGuardado }) {
  const [texto, setTexto] = useState('')
  const [publicar, setPublicar] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')
  const [listo, setListo] = useState(null)               // { creados, fallidos[] }

  const plan = useMemo(() => {
    const r = leerLista(texto)
    return { ...r, ...separarExistentes(r.filas, productos) }
  }, [texto, productos])

  const alElegirArchivo = async (e) => {
    const f = e.target.files?.[0]; e.target.value = ''
    if (!f) return
    if (f.size > 1024 * 1024) return setError('El archivo es muy grande (máximo 1 MB). Divídelo en partes.')
    setError(''); setTexto(await f.text())
  }

  const guardar = async () => {
    setGuardando(true); setError('')
    const filas = plan.nuevas.map(f => filaProducto(f, publicar))
    let creados = 0; const fallidos = []
    for (let i = 0; i < filas.length; i += TROZO) {
      const trozo = filas.slice(i, i + TROZO)
      const { error: err } = await supabase.from('productos').insert(trozo)
      if (!err) { creados += trozo.length; continue }
      for (const fila of trozo) {                           // si un trozo falla, se prueba uno por uno para no perder los buenos
        const { error: e2 } = await supabase.from('productos').insert(fila)
        if (e2) fallidos.push(`${fila.nombre}: ${e2.code === '23505' ? 'el código ya existe' : e2.message}`); else creados += 1
      }
    }
    setGuardando(false)
    setListo({ creados, fallidos })
    if (creados > 0) onGuardado?.()
  }

  if (listo) return (
    <Modal titulo="Carga terminada" onCerrar={onCerrar}>
      <div className="space-y-4 text-center py-2">
        <p className="text-5xl" aria-hidden="true">{listo.creados > 0 ? '✓' : '⚠️'}</p>
        <p className="text-xl font-semibold text-slate-800">{listo.creados} producto{listo.creados === 1 ? '' : 's'} agregado{listo.creados === 1 ? '' : 's'}</p>
        {listo.creados > 0 && <p className="text-base text-slate-600">Ahora puedes ponerles foto con <b>Importar fotos</b> y mostrarlos en la tienda en línea.</p>}
        {listo.fallidos.length > 0 && (
          <div className="text-left rounded-xl bg-red-50 p-3 space-y-1">
            <p className="text-base font-semibold text-red-700">No se pudieron agregar {listo.fallidos.length}:</p>
            <ul className="text-sm text-red-700 space-y-0.5 break-words">{listo.fallidos.slice(0, 10).map((m, i) => <li key={i}>{m}</li>)}</ul>
          </div>
        )}
        <button onClick={onCerrar} className="w-full h-14 rounded-xl bg-negro text-champagne text-lg font-semibold active:opacity-90">Cerrar</button>
      </div>
    </Modal>
  )

  const hay = plan.nuevas.length > 0
  return (
    <Modal titulo="Cargar muchos productos" onCerrar={onCerrar} ancho="max-w-lg">
      <p className="text-base text-slate-600">Pega tu lista aquí: una línea por producto, con el <b>nombre</b> y el <b>precio</b>. Si quieres, agrega cantidad, categoría y código de barras separados por <b>;</b> (o copia las columnas desde Excel).</p>
      <div className="rounded-xl bg-slate-50 p-3 space-y-1">
        <p className="text-sm font-semibold text-slate-600">Ejemplo</p>
        <pre className="text-sm text-slate-700 whitespace-pre-wrap break-words font-sans">{EJEMPLO}</pre>
        <button onClick={() => setTexto(EJEMPLO)} className="text-sm font-semibold text-marca underline">Usar este ejemplo</button>
      </div>
      <textarea value={texto} onChange={e => { setTexto(e.target.value); setError('') }} rows={8} aria-label="Lista de productos"
        placeholder="Pega aquí tu lista" className={`${claseInput} h-auto py-3 text-base font-mono`} />
      <label className="min-h-12 rounded-xl bg-slate-100 text-slate-700 text-base font-semibold grid place-items-center active:bg-slate-200 px-3 text-center">
        …o subir un archivo de Excel guardado como CSV
        <input type="file" accept=".csv,.txt,text/csv,text/plain" onChange={alElegirArchivo} className="hidden" />
      </label>
      {error && <p className="text-base text-red-600 bg-red-50 rounded-lg px-3 py-2 break-words">{error}</p>}

      {texto.trim() && (
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-xl bg-emerald-50 p-2"><p className="text-2xl font-bold text-emerald-700">{plan.nuevas.length}</p><p className="text-sm text-emerald-800 leading-tight">se agregan</p></div>
            <div className="rounded-xl bg-amber-50 p-2"><p className="text-2xl font-bold text-amber-700">{plan.yaExisten.length}</p><p className="text-sm text-amber-800 leading-tight">ya existen</p></div>
            <div className="rounded-xl bg-red-50 p-2"><p className="text-2xl font-bold text-red-700">{plan.invalidas.length}</p><p className="text-sm text-red-800 leading-tight">con problema</p></div>
          </div>
          {plan.conTitulos && <p className="text-sm text-slate-500">Leí la primera línea como títulos de las columnas.</p>}
          {hay && (
            <ul className="divide-y divide-slate-100 rounded-xl ring-1 ring-slate-200 max-h-56 overflow-y-auto">
              {plan.nuevas.slice(0, 60).map(f => (
                <li key={f.linea} className="px-3 py-2 grid grid-cols-[1fr_auto] gap-3 items-center">
                  <span className="min-w-0 text-base break-words">{f.nombre}<span className="block text-sm text-slate-500">{[f.categoria, Number.isFinite(f.stock) ? `${numero(f.stock)} en stock` : '', f.codigo].filter(Boolean).join(' · ')}</span></span>
                  <span className="text-base font-semibold tabular-nums">{dinero(f.precio_venta)}</span>
                </li>
              ))}
              {plan.nuevas.length > 60 && <li className="px-3 py-2 text-sm text-slate-500">…y {plan.nuevas.length - 60} más</li>}
            </ul>
          )}
          {plan.yaExisten.length > 0 && <p className="text-sm text-amber-800 bg-amber-50 rounded-lg px-3 py-2 break-words">Ya los tienes, no se tocan: {plan.yaExisten.slice(0, 5).map(f => f.nombre).join(', ')}{plan.yaExisten.length > 5 ? '…' : ''}</p>}
          {plan.invalidas.length > 0 && (
            <ul className="text-sm text-red-700 bg-red-50 rounded-lg px-3 py-2 space-y-0.5 break-words">
              {plan.invalidas.slice(0, 6).map((x, i) => <li key={i}>{x.linea ? `Línea ${x.linea}: ` : ''}{x.motivo}{x.texto ? ` («${x.texto.slice(0, 40)}»)` : ''}</li>)}
              {plan.invalidas.length > 6 && <li>…y {plan.invalidas.length - 6} más</li>}
            </ul>
          )}
        </div>
      )}

      <label className="grid grid-cols-[1.75rem_1fr] gap-3 items-start text-base text-slate-700 leading-snug">
        <input type="checkbox" checked={publicar} onChange={e => setPublicar(e.target.checked)} className="h-7 w-7 accent-[#0b0b0b]" />
        <span>Mostrarlos también en la tienda en línea. <span className="text-slate-500">(Sin foto se ven con un dibujo; es mejor ponerles foto primero.)</span></span>
      </label>
      <p className="text-sm text-slate-500">Máximo {MAX_FILAS} productos por vez. Los precios de compra y la cantidad se pueden completar después.</p>
      <div className="grid grid-cols-[auto_1fr] gap-3">
        <button onClick={onCerrar} className="h-14 px-5 rounded-xl bg-slate-100 text-slate-600 text-base font-medium active:bg-slate-200">← Volver</button>
        <button onClick={guardar} disabled={!hay || guardando} className="h-14 rounded-xl bg-negro text-champagne text-lg font-semibold active:opacity-90 disabled:opacity-40">
          {guardando ? 'Guardando…' : hay ? `Agregar ${plan.nuevas.length} producto${plan.nuevas.length === 1 ? '' : 's'}` : 'Agregar'}
        </button>
      </div>
    </Modal>
  )
}
