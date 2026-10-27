import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { comprimirImagen } from '../lib/imagen'
import { usePersistido, TREINTA_MIN } from '../lib/usePersistido'
import { leerCsv, planImportacion, plantillaSinFoto, sinFoto, limpiarTextoCsv } from '../lib/importarFotos'
import { dibujarGenerica } from '../lib/imagenGenerica'
import { MAX_FOTOS, fotosDe } from '../lib/fotos'
import { confirmar } from '../lib/confirmar'
import Modal from './Modal'

const TANDA = 50          // productos por revisión: así la lista es manejable y el celular no se llena de fotos
const EN_PARALELO = 4

// Importar fotos en bloque: un CSV con enlaces → se traen, se revisan y se guardan en la app (nunca se enlazan de otra página).
export default function ImportarFotos({ productos, onCerrar, onGuardado }) {
  const [csv, setCsv] = usePersistido('fotos:csv', '', true, TREINTA_MIN * 48)
  const [nombre, setNombre] = usePersistido('fotos:archivo', '', true, TREINTA_MIN * 48)
  const [pegado, setPegado] = usePersistido('fotos:pegado', '', true, TREINTA_MIN * 48)
  const [etapa, setEtapa] = useState('')
  const [fase, setFase] = useState('inicio')           // inicio | buscando | revisar | guardando | fin
  const [items, setItems] = useState([])               // [{ producto, fotos: [{ vista, blob, error, quitada, url }], usar }]
  const [avance, setAvance] = useState({ hechas: 0, total: 0 })
  const [resultado, setResultado] = useState(null)
  const [error, setError] = useState('')
  const [hechosIds, setHechosIds] = useState(() => new Set())
  const cancelar = useRef(false)

  const plan = useMemo(() => {
    if (!csv) return null
    try { return planImportacion(leerCsv(csv), productos) } catch { return { listos: [], yaTienen: 0, sinCoincidencia: [], sinEnlaces: 0, error: 'No se pudo leer el archivo' } }
  }, [csv, productos])
  const pendientes = useMemo(() => (plan?.listos ?? []).filter(l => !hechosIds.has(l.producto.id) && (l.reemplaza || sinFoto(l.producto))), [plan, hechosIds])
  const sinFotoTotal = useMemo(() => productos.filter(sinFoto).length, [productos])
  const sinNada = useMemo(() => productos.filter(p => sinFoto(p) && !hechosIds.has(p.id)), [productos, hechosIds])

  const soltarVistas = (lista) => lista.forEach(it => it.fotos.forEach(f => f.vista && URL.revokeObjectURL(f.vista)))
  const itemsRef = useRef([]); itemsRef.current = items
  useEffect(() => () => soltarVistas(itemsRef.current), [])

  const elegirArchivo = async (e) => {
    const f = e.target.files?.[0]; e.target.value = ''
    if (!f) return
    if (f.size > 5_000_000) return setError('El archivo es muy grande (máx. 5 MB)')
    setError(''); setHechosIds(new Set())
    setCsv(await f.text()); setNombre(f.name)
  }

  const usarTextoPegado = () => {
    const limpio = limpiarTextoCsv(pegado)
    if (!limpio) return setError('No encontré la lista. Pega el texto completo, desde la línea que empieza con "codigo,nombre,categoria".')
    setError(''); setHechosIds(new Set())
    setCsv(limpio); setNombre('Texto pegado'); setPegado('')
  }

  const bajarPlantilla = () => {
    const blob = new Blob([plantillaSinFoto(productos)], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob); a.download = 'productos-sin-foto.csv'
    document.body.appendChild(a); a.click(); a.remove()
    setTimeout(() => URL.revokeObjectURL(a.href), 2000)
  }

  const traer = async (url, token) => {
    const r = await fetch('/api/traer-foto', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ url }),
    })
    if (!r.ok) {
      const j = await r.json().catch(() => ({}))
      throw new Error(j.error || `Error ${r.status}`)
    }
    return comprimirImagen(await r.blob(), 900, 0.8)
  }

  const tokenActual = async () => {
    const { data: s } = await supabase.auth.getSession()
    const token = s?.session?.access_token
    if (!token) setError('Tu sesión venció. Vuelve a entrar.')
    return token
  }

  // Trae las fotos de una lista de productos (cada uno con sus enlaces) y pasa a la pantalla de revisión
  const traerItems = async (nuevos, token) => {
    const trabajos = nuevos.flatMap(it => it.fotos.map(f => ({ it, f })))
    setItems(nuevos); setEtapa(''); setFase('buscando'); setAvance({ hechas: 0, total: trabajos.length })
    let hechas = 0, cursor = 0
    const obrero = async () => {
      while (cursor < trabajos.length && !cancelar.current) {
        const { f } = trabajos[cursor++]
        try { f.blob = await traer(f.url, token); f.vista = URL.createObjectURL(f.blob) }
        catch (e) { f.error = e?.message || 'No se pudo traer' }
        hechas++; setAvance({ hechas, total: trabajos.length })
      }
    }
    await Promise.all(Array.from({ length: EN_PARALELO }, obrero))
    if (cancelar.current) { setFase('inicio'); return }
    setItems([...nuevos]); setFase('revisar')
  }

  const buscarTanda = async () => {
    const tanda = pendientes.slice(0, TANDA)
    if (tanda.length === 0) return
    setError(''); cancelar.current = false
    const token = await tokenActual(); if (!token) return
    soltarVistas(items)
    await traerItems(tanda.map(l => ({ producto: l.producto, usar: true, enLinea: true, reemplaza: Boolean(l.reemplaza), fotoActual: l.tarjeta ?? '', origen: l.reemplaza ? 'Reemplaza la tarjeta de letras por una foto real.' : '', fotos: l.urls.map(url => ({ url, vista: '', blob: null, error: '', quitada: false })) })), token)
  }

  // Imagen genérica (ícono + nombre) para lo que siga sin foto. Por defecto NO se muestra en la tienda en línea.
  const hacerGenericas = async () => {
    const lista = sinNada.slice(0, TANDA)
    if (lista.length === 0) return
    setError(''); cancelar.current = false
    soltarVistas(items); setItems([])
    setEtapa('Dibujando imágenes…'); setFase('buscando'); setAvance({ hechas: 0, total: lista.length })
    const nuevos = []
    try {
      for (const p of lista) {
        if (cancelar.current) break
        const blob = await dibujarGenerica(p)
        nuevos.push({ producto: p, usar: true, enLinea: false, generica: true, origen: 'Imagen genérica: no es una foto real. Queda oculta de la tienda en línea hasta que la marques.',
          fotos: [{ url: '', vista: URL.createObjectURL(blob), blob, error: '', quitada: false }] })
        setAvance({ hechas: nuevos.length, total: lista.length })
      }
    } catch (e) { setError(e?.message || 'No se pudieron dibujar las imágenes'); soltarVistas(nuevos); setEtapa(''); setFase('inicio'); return }
    if (cancelar.current) { soltarVistas(nuevos); setEtapa(''); setFase('inicio'); return }
    setItems(nuevos); setEtapa(''); setFase('revisar')
  }

  const volverAlInicio = () => { cancelar.current = true; soltarVistas(items); setItems([]); setFase('inicio'); setError('') }

  const alternarFoto = (i, j) => setItems(prev => prev.map((it, a) => a !== i ? it : { ...it, fotos: it.fotos.map((f, b) => b !== j ? f : { ...f, quitada: !f.quitada }) }))
  const alternarUsar = (i) => setItems(prev => prev.map((it, a) => a !== i ? it : { ...it, usar: !it.usar }))
  const alternarLinea = (i) => setItems(prev => prev.map((it, a) => a !== i ? it : { ...it, enLinea: !it.enLinea }))
  const todosLinea = (v) => setItems(prev => prev.map(it => ({ ...it, enLinea: v })))
  const buenas = (it) => it.fotos.filter(f => f.blob && !f.quitada)
  const aGuardar = items.filter(it => it.usar && buenas(it).length > 0)
  const nEnLinea = aGuardar.filter(it => it.enLinea).length

  const guardar = async () => {
    if (aGuardar.length === 0) return
    setFase('guardando'); setError(''); setAvance({ hechas: 0, total: aGuardar.length })
    // por si alguien subió una foto a mano mientras tanto: no se pisa
    const { data: actuales } = await supabase.from('productos').select('id, imagenes, imagen_url').in('id', aGuardar.map(it => it.producto.id))
    const yaConFoto = new Set((actuales ?? []).filter(p => (p.imagenes?.length ?? 0) > 0 || p.imagen_url).map(p => p.id))
    const fotoHoy = new Map((actuales ?? []).map(p => [p.id, fotosDe(p)[0] ?? '']))
    let guardados = 0, fallos = 0, saltados = 0, publicados = 0, primerError = ''
    const ok = new Set()
    for (const [n, it] of aGuardar.entries()) {
      if (it.reemplaza ? fotoHoy.get(it.producto.id) !== it.fotoActual : yaConFoto.has(it.producto.id)) { saltados++; ok.add(it.producto.id); setAvance({ hechas: n + 1, total: aGuardar.length }); continue }
      try {
        const urls = []
        for (const f of buenas(it).slice(0, MAX_FOTOS)) {
          const ruta = `productos/${it.generica ? 'generica-' : ''}${crypto.randomUUID()}.jpg`
          const { error: e1 } = await supabase.storage.from('prendas').upload(ruta, f.blob, { contentType: 'image/jpeg' })
          if (e1) throw e1
          urls.push(supabase.storage.from('prendas').getPublicUrl(ruta).data.publicUrl)
        }
        const { error: e2 } = await supabase.from('productos').update(it.enLinea ? { imagenes: urls, publicado: true } : { imagenes: urls }).eq('id', it.producto.id)
        if (e2) throw e2
        guardados++; ok.add(it.producto.id); if (it.enLinea) publicados++
      } catch (e) { fallos++; if (!primerError) primerError = e?.message || String(e) }
      setAvance({ hechas: n + 1, total: aGuardar.length })
    }
    // los que se descartaron a propósito no vuelven a salir en esta tanda
    for (const it of items) if (!it.usar || buenas(it).length === 0) ok.add(it.producto.id)
    setHechosIds(prev => new Set([...prev, ...ok]))
    soltarVistas(items); setItems([])
    setResultado({ guardados, fallos, saltados, publicados, primerError })
    setFase('fin')
    onGuardado?.()
  }

  const cerrar = async () => {
    if (fase === 'buscando' || fase === 'guardando') {
      if (!(await confirmar({ titulo: '¿Salir ahora?', texto: 'Se detiene el proceso. Lo que ya se guardó se queda.' }))) return
      cancelar.current = true
    }
    onCerrar()
  }

  const Barra = ({ texto }) => (
    <div className="space-y-2 py-2">
      <p className="text-sm font-medium text-slate-700 text-center">{texto}</p>
      <div className="h-2.5 rounded-full bg-slate-100 overflow-hidden" role="progressbar" aria-valuemin={0} aria-valuemax={avance.total} aria-valuenow={avance.hechas}>
        <div className="h-full bg-marca transition-all" style={{ width: `${Math.max(6, Math.round(100 * avance.hechas / Math.max(1, avance.total)))}%` }} />
      </div>
    </div>
  )

  return (
    <Modal titulo="Importar fotos" onCerrar={cerrar} ancho="max-w-lg">
      {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}

      {fase === 'inicio' && (
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            Hay <b>{sinFotoTotal}</b> producto(s) sin foto. Llena un archivo CSV con enlaces de fotos, la app las trae, tú revisas y se guardan <b>dentro de la app</b>.
          </p>
          <ol className="text-sm text-slate-600 space-y-1 list-decimal pl-5">
            <li>Descarga la lista de productos sin foto.</li>
            <li>Llénala con enlaces directos a fotos (hasta 3 por producto) en las columnas <code>foto_1_url</code>, <code>foto_2_url</code>, <code>foto_3_url</code>.</li>
            <li>Súbela aquí y revisa antes de guardar.</li>
          </ol>
          <p className="text-sm text-slate-600">Si el archivo trae la columna <code>foto_actual</code> (las tarjetas de letras), esas se cambian por la foto real. Una foto puesta a mano nunca se reemplaza.</p>
          <div className="grid grid-cols-2 gap-2">
            <button onClick={bajarPlantilla} disabled={sinFotoTotal === 0}
              className="min-h-11 rounded-xl bg-slate-100 text-slate-700 text-sm font-semibold px-2 leading-tight disabled:opacity-40">
              Descargar lista sin foto
            </button>
            <label className="min-h-11 rounded-xl bg-marca text-white text-sm font-semibold px-2 leading-tight grid place-items-center cursor-pointer active:bg-marca-oscuro text-center">
              {csv ? 'Cambiar archivo' : 'Elegir archivo CSV'}
              <input type="file" accept=".csv,text/csv,text/plain" className="hidden" onChange={elegirArchivo} />
            </label>
          </div>

          <div className="rounded-2xl bg-slate-50 p-3 space-y-2">
            <p className="text-sm font-semibold break-words">¿La IA te dio el texto en el chat? Pégalo aquí</p>
            <textarea value={pegado} onChange={e => setPegado(e.target.value)} rows={4} spellCheck={false}
              placeholder={'codigo,nombre,categoria,foto_1_url,...'}
              className="w-full rounded-xl border border-slate-200 bg-white p-2 text-xs font-mono" />
            <button onClick={usarTextoPegado} disabled={!pegado.trim()}
              className="w-full min-h-11 rounded-xl bg-slate-800 text-white text-sm font-semibold disabled:opacity-40">Usar este texto</button>
            <p className="text-[11px] text-slate-400">Se quitan solos los ``` y las líneas sobrantes.</p>
          </div>

          {plan && (
            <div className="rounded-2xl bg-slate-50 p-3 space-y-2">
              <p className="text-xs text-slate-500 break-words">Archivo: {nombre || 'sin nombre'}</p>
              {plan.error ? <p className="text-sm text-red-600">{plan.error}</p> : (
                <div className="grid grid-cols-2 gap-2 text-center">
                  <div className="rounded-xl bg-white py-2"><p className="text-lg font-bold text-marca">{pendientes.length}</p><p className="text-[11px] text-slate-500">listos para traer</p></div>
                  <div className="rounded-xl bg-white py-2"><p className="text-lg font-bold text-slate-600">{plan.yaTienen}</p><p className="text-[11px] text-slate-500">ya tenían foto</p></div>
                  <div className="rounded-xl bg-white py-2"><p className="text-lg font-bold text-slate-600">{plan.sinEnlaces}</p><p className="text-[11px] text-slate-500">sin enlace</p></div>
                  <div className="rounded-xl bg-white py-2"><p className="text-lg font-bold text-slate-600">{plan.sinCoincidencia.length}</p><p className="text-[11px] text-slate-500">no encontrados</p></div>
                </div>
              )}
              {plan.sinCoincidencia.length > 0 && (
                <p className="text-[11px] text-slate-400 break-words">No encontrados: {plan.sinCoincidencia.slice(0, 6).join(', ')}{plan.sinCoincidencia.length > 6 ? '…' : ''}</p>
              )}
            </div>
          )}

          {plan && !plan.error && pendientes.length > 0 && (
            <button onClick={buscarTanda}
              className="w-full min-h-12 rounded-xl bg-negro text-champagne font-semibold">
              Traer fotos de {Math.min(TANDA, pendientes.length)} producto(s){pendientes.length > TANDA ? ` (de ${pendientes.length})` : ''}
            </button>
          )}
          <div className="grid grid-cols-1 gap-2">
            <div className="rounded-2xl ring-1 ring-slate-200 p-3 space-y-2">
              <p className="text-sm font-semibold break-words">Imagen genérica para los que sigan sin foto</p>
              <p className="text-xs text-slate-500">Dibuja un ícono de la categoría con el nombre del producto. No es una foto real y queda oculta de la tienda en línea hasta que tú la marques.</p>
              <button onClick={hacerGenericas} disabled={sinNada.length === 0}
                className="w-full min-h-11 rounded-xl bg-slate-100 text-slate-700 text-sm font-semibold disabled:opacity-40">
                {sinNada.length ? `Crear imagen para ${Math.min(sinNada.length, TANDA)} producto(s)` : 'Todos tienen foto'}
              </button>
            </div>
          </div>
          <p className="text-[11px] text-slate-400">Usa solo fotos que tengas derecho a publicar. Las que no se puedan traer aparecen marcadas para que las pongas a mano.</p>
        </div>
      )}

      {fase === 'buscando' && (
        <div className="space-y-3">
          <Barra texto={etapa ? `${etapa} ${avance.hechas} de ${avance.total}` : `Trayendo foto ${Math.min(avance.hechas + 1, avance.total)} de ${avance.total}…`} />
          <button onClick={() => { cancelar.current = true }} className="w-full min-h-11 rounded-xl bg-slate-100 text-slate-600 text-sm font-medium">Cancelar</button>
        </div>
      )}

      {fase === 'revisar' && (
        <div className="space-y-3">
          <p className="text-sm text-slate-600">Revisa que cada foto sea del producto correcto. Toca una foto para quitarla, o desmarca el producto.</p>
          <div className="rounded-2xl bg-slate-50 p-3 grid grid-cols-[1fr_auto_auto] gap-2 items-center">
            <span className="min-w-0"><span className="block text-sm font-semibold">Mostrar en la tienda en línea</span>
              <span className="block text-[11px] text-slate-400">{nEnLinea} de {aGuardar.length} marcados</span></span>
            <button onClick={() => todosLinea(true)} className="h-9 px-3 rounded-lg bg-lima/20 text-marca text-xs font-semibold">Todos</button>
            <button onClick={() => todosLinea(false)} className="h-9 px-3 rounded-lg bg-slate-200 text-slate-600 text-xs font-semibold">Ninguno</button>
          </div>
          <ul className="space-y-2">
            {items.map((it, i) => (
              <li key={it.producto.id} className={`rounded-2xl ring-1 p-2.5 space-y-2 ${it.usar && buenas(it).length ? 'ring-slate-200 bg-white' : 'ring-slate-100 bg-slate-50 opacity-70'}`}>
                <label className="grid grid-cols-[auto_1fr] gap-2 items-center">
                  <input type="checkbox" checked={it.usar} onChange={() => alternarUsar(i)} className="h-5 w-5 accent-[#1f6f4a]" />
                  <span className="min-w-0"><span className="block text-sm font-medium break-words">{it.producto.nombre}</span>
                    <span className="block text-[11px] text-slate-400 break-words">{it.producto.codigo || 'sin código'}</span></span>
                </label>
                {it.origen && <p className="text-[11px] text-slate-500 break-words">{it.origen}</p>}
                <label className="grid grid-cols-[auto_1fr] gap-2 items-center text-xs text-slate-600">
                  <input type="checkbox" checked={it.enLinea} onChange={() => alternarLinea(i)} className="h-5 w-5 accent-[#1f6f4a]" />
                  Mostrar en la tienda en línea
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {[0, 1, 2].map(j => {
                    const f = it.fotos[j]
                    if (!f) return <div key={j} className="aspect-square rounded-xl bg-slate-50" />
                    if (!f.blob) return (
                      <div key={j} className="aspect-square rounded-xl bg-red-50 text-red-600 text-[10px] leading-tight p-1.5 grid place-items-center text-center overflow-hidden">{f.error || 'No se pudo traer'}</div>
                    )
                    return (
                      <button key={j} onClick={() => alternarFoto(i, j)} className="relative aspect-square rounded-xl overflow-hidden bg-slate-100">
                        <img src={f.vista} alt="" className={`w-full h-full object-contain bg-white ${f.quitada ? 'opacity-30' : ''}`} />
                        <span className={`absolute top-1 right-1 h-5 w-5 rounded-full text-[11px] grid place-items-center ${f.quitada ? 'bg-slate-500 text-white' : 'bg-marca text-white'}`}>{f.quitada ? '✕' : '✓'}</span>
                      </button>
                    )
                  })}
                </div>
              </li>
            ))}
          </ul>
          <div className="sticky bottom-0 -mx-5 px-5 pt-2 pb-1 bg-white/95 backdrop-blur grid grid-cols-[auto_1fr] gap-2">
            <button onClick={volverAlInicio} className="min-h-12 px-4 rounded-xl bg-slate-100 text-slate-600 text-sm font-medium">Volver</button>
            <button onClick={guardar} disabled={aGuardar.length === 0}
              className="min-h-12 rounded-xl bg-negro text-champagne font-semibold disabled:opacity-40">
              Guardar {aGuardar.length} producto(s)
            </button>
          </div>
        </div>
      )}

      {fase === 'guardando' && <Barra texto={`Guardando ${Math.min(avance.hechas + 1, avance.total)} de ${avance.total}…`} />}

      {fase === 'fin' && resultado && (
        <div className="space-y-3">
          <div className={`rounded-2xl p-4 text-center ${resultado.fallos ? 'bg-champagne/30' : 'bg-esmeralda/10'}`}>
            <p className="font-bold text-marca">✓ {resultado.guardados} producto(s) con foto nueva</p>
            {resultado.saltados > 0 && <p className="text-xs text-slate-500">{resultado.saltados} ya tenían foto y no se tocaron.</p>}
            {resultado.publicados > 0 && <p className="text-xs text-slate-500">{resultado.publicados} quedaron visibles en la tienda en línea.</p>}
            {resultado.primerError && <p className="text-[11px] text-red-500 break-words">Motivo: {resultado.primerError}</p>}
            {resultado.fallos > 0 && <p className="text-xs text-red-600">{resultado.fallos} no se pudieron guardar. Vuelve a intentarlos.</p>}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button onClick={onCerrar} className="min-h-12 rounded-xl bg-slate-100 text-slate-700 font-medium">Cerrar</button>
            <button onClick={() => { setFase('inicio'); setResultado(null) }}
              className="min-h-12 rounded-xl bg-negro text-champagne font-semibold">
              {pendientes.length > 0 ? `Siguiente tanda (${pendientes.length})` : 'Listo'}
            </button>
          </div>
        </div>
      )}
    </Modal>
  )
}
