import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { aNumero, aCantidad, dinero, numero, fechaSolo } from '../lib/formato'
import { UNIDADES } from '../lib/documentos'
import { useDueno } from '../context/rol'
import { encolarInsert } from '../lib/sincronizar'
import { esErrorDeRed, idNuevo } from '../lib/offline'
import { agregarProductoLocal } from '../lib/catalogoLocal'
import Modal, { Campo } from './Modal'
import ComponentesKit, { componentesAFilas } from './ComponentesKit'
import Escaner from './Escaner'
import FotosEditor from './FotosEditor'
import CategoriaSelect from './CategoriaSelect'
import { claseInput } from '../lib/estilos'
import { useBorradorForm } from '../lib/useBorradorForm'
import AvisoBorrador from './AvisoBorrador'
import { leerQrProducto } from '../lib/qrProducto'
import { traerTodo } from '../lib/traerTodo'
import { buscarRepetidos } from '../lib/duplicados'

const desde = (p) => ({
  codigo: p?.codigo ?? '',
  nombre: p?.nombre ?? '',
  categoria: p?.categoria ?? '',
  unidad: p?.unidad ?? 'und',
  precio_compra: p?.precio_compra ?? '',
  precio_venta: p?.precio_venta ?? '',
  stock: p?.stock ?? '',
  stock_minimo: p?.stock_minimo ?? '',
  precio_minimo: p?.precio_minimo ?? '',
  precio_mayor: p?.precio_mayor ?? '',
  cantidad_mayor: p?.cantidad_mayor ?? '',
  es_kit: Boolean(p?.es_kit),
  fecha_vencimiento: p?.fecha_vencimiento ?? '',
  descripcion: p?.descripcion ?? '',
  publicado: Boolean(p?.publicado),
  imagenes: p?.imagenes ?? [],
})

// Crea o edita un producto. `producto` con id = edición; sin id = alta
// (por ejemplo con el código ya escaneado).
// Si el código que escaneas ya existe, se cargan sus datos en vez de crear un duplicado:
// así un lote nuevo del mismo producto no hay que digitarlo otra vez.
export default function ProductoForm({ producto, onGuardado, onCerrar, onArchivar }) {
  const dueno = useDueno()
  const [base, setBase] = useState(producto)
  const editando = Boolean(base?.id)
  const [f, setF, bor] = useBorradorForm(`borrador-producto${producto?.id ? '-' + producto.id : ''}`, desde(producto), Boolean(producto?.id) || !producto?.codigo)
  const [aviso, setAviso] = useState('')
  const [error, setError] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [parecidos, setParecidos] = useState([])        // productos que se parecen al que se va a crear (hay que confirmar)
  const confirmoParecido = useRef(false)
  const [verEscaner, setVerEscaner] = useState(false)
  const [lotes, setLotes] = useState([])
  const [comps, setComps] = useState([])      // lo que lleva el combo: [{ id, nombre, txt }]

  const set = (k) => (e) => setF(prev => ({ ...prev, [k]: e.target.value }))
  const costo = aNumero(f.precio_compra)
  const venta = aNumero(f.precio_venta)
  const ganancia = venta - costo

  // ¿Ya existe un producto con este código? (incluye los que se habían quitado)
  const buscarCodigo = useCallback(async (codigo) => {
    let c = String(codigo ?? '').trim()
    if (!c) return
    // QR con la información del producto: se llenan los campos y se usa su código
    const qr = leerQrProducto(c)
    if (qr) {
      const { codigo: cq, ...resto } = qr
      setF(prev => {
        const sig = { ...prev, codigo: cq ?? '' }
        for (const [k, v] of Object.entries(resto)) if (!String(prev[k] ?? '').trim()) sig[k] = v
        return sig
      })
      setAviso('Leí los datos del QR del producto. Revisa que todo esté bien antes de guardar.')
      if (!cq) return
      c = cq
    }
    const { data } = await supabase.from('productos').select('*').eq('codigo', c).maybeSingle()
    if (data && data.id !== base?.id) {
      setBase(data)
      setF(desde(data))
      setError('')
      setAviso(data.activo
        ? `Ese código ya existe: «${data.nombre}». Cargué sus datos; si llegó un lote nuevo, usa «+ Stock» o «Compra».`
        : `«${data.nombre}» estaba quitado del inventario. Al guardar vuelve a quedar activo.`)
    }
  }, [base?.id])

  // Si el formulario se abre con un código (por ejemplo desde la caja), se comprueba de una vez
  useEffect(() => {
    if (!producto?.id && producto?.codigo) buscarCodigo(producto.codigo)
  }, [producto, buscarCodigo])

  // Lotes del producto (con cuánto queda de cada uno)
  useEffect(() => {
    if (!base?.id) return
    supabase.from('lotes_saldo').select('*').eq('producto_id', base.id)
      .order('fecha', { ascending: false }).limit(6)
      .then(({ data }) => setLotes(data ?? []))
  }, [base?.id])

  const alEscanear = (codigo) => {
    setF(prev => ({ ...prev, codigo }))
    setVerEscaner(false)
    buscarCodigo(codigo)
  }

  const guardar = async () => {
    setError('')
    if (!f.nombre.trim()) return setError('Falta el nombre')
    if (aNumero(f.precio_venta) <= 0) return setError('Falta el precio de venta')
    if (f.es_kit && comps.filter(c => aCantidad(c.txt) > 0).length === 0) return setError('Un combo necesita al menos un producto adentro')
    setParecidos([])
    // ¿Ya existe? (producto nuevo, o nombre cambiado). Sin internet no se revisa y la base de datos decide al sincronizar.
    if (!editando || f.nombre.trim() !== String(base?.nombre ?? '').trim()) {
      setGuardando(true)
      const { data: lista, error: errLista } = await traerTodo(() => supabase.from('productos').select('id,nombre,stock,activo').order('id'))
      setGuardando(false)
      if (!errLista && lista) {
        const { igual, parecido } = buscarRepetidos(f.nombre, lista, base?.id ?? null)
        const activo = igual.find(x => x.activo !== false)
        if (activo) return setError(`Ya existe «${activo.nombre}» (hay ${numero(activo.stock)} en stock). Búscalo y edítalo, o usa «+ Stock» o «Compra» para sumarle unidades. No se puede crear otro igual.`)
        const quitado = igual[0]
        if (quitado) return setError(`«${quitado.nombre}» ya existe pero está quitado del inventario. Búscalo con su nombre o código para volver a activarlo.`)
        const cercanos = parecido.filter(x => x.activo !== false).slice(0, 4)
        if (cercanos.length > 0 && !confirmoParecido.current) return setParecidos(cercanos)
      }
    }
    confirmoParecido.current = false
    setGuardando(true)
    const fila = {
      codigo: f.codigo.trim() || null,
      nombre: f.nombre.trim(),
      categoria: f.categoria.trim() || null,
      unidad: f.unidad,
      precio_compra: aNumero(f.precio_compra),
      precio_venta: aNumero(f.precio_venta),
      stock: aCantidad(f.stock),
      stock_minimo: aCantidad(f.stock_minimo),
      fecha_vencimiento: f.fecha_vencimiento || null,
      descripcion: f.descripcion.trim() || null,
      publicado: f.publicado,
      imagenes: f.imagenes,
      activo: true,
    }
    // El precio mínimo solo lo fija el dueño (y solo se envía si hay algo que guardar)
    if (dueno === true && (String(f.precio_minimo ?? '').trim() !== '' || base?.precio_minimo != null)) {
      fila.precio_minimo = String(f.precio_minimo ?? '').trim() === '' ? null : aNumero(f.precio_minimo)
    }
    // Mayorista y combo: solo los fija el dueño (y solo se envían si hay algo, por compatibilidad)
    if (dueno === true) {
      const hayMayor = String(f.precio_mayor ?? '').trim() !== '' || base?.precio_mayor != null
      if (hayMayor) {
        fila.precio_mayor = String(f.precio_mayor ?? '').trim() === '' ? null : aNumero(f.precio_mayor)
        fila.cantidad_mayor = String(f.cantidad_mayor ?? '').trim() === '' ? null : aCantidad(f.cantidad_mayor)
      }
      if (f.es_kit || base?.es_kit) fila.es_kit = f.es_kit
    }
    const q = editando
      ? supabase.from('productos').update(fila).eq('id', base.id).select().single()
      : supabase.from('productos').insert(fila).select().single()
    let { data, error: err } = await q
    if (err && esErrorDeRed(err) && !editando) {
      // Sin internet: el producto nuevo queda guardado en este equipo (sin foto), se puede vender ya y se sube solo después
      if (f.es_kit) { setGuardando(false); setError('Los combos se crean cuando haya internet.'); return }
      const idLocal = idNuevo()
      const filaOff = { ...fila, id: idLocal, imagenes: [] }
      await encolarInsert('productos', filaOff, `Producto nuevo: ${fila.nombre}`)
      data = { es_kit: false, publicado: false, ...filaOff }
      await agregarProductoLocal(data)
      err = null
    }
    setGuardando(false)
    if (err) {
      setError(err.code === '23505' ? 'Ya existe un producto con ese código' : err.message)
      return
    }
    if (dueno === true && (f.es_kit || base?.es_kit)) {
      const del = await supabase.from('producto_componentes').delete().eq('kit_id', data.id)
      const filas = f.es_kit ? componentesAFilas(data.id, comps.filter(c => aCantidad(c.txt) > 0)) : []
      const ins = filas.length ? await supabase.from('producto_componentes').insert(filas) : { error: null }
      if (del.error || ins.error) { setError((del.error || ins.error).message); return }
    }
    bor.limpiar()
    onGuardado?.(data)
  }

  return (
    <Modal titulo={editando ? 'Editar producto' : 'Nuevo producto'} onCerrar={() => { bor.limpiar(); onCerrar?.() }}>
      {bor.recuperado && <AvisoBorrador onNuevo={bor.empezarDeNuevo} />}
      <div className="space-y-2">
        <Campo etiqueta="Código de barras">
          <div className="grid grid-cols-[1fr_auto] gap-2">
            <input data-escaner="true" value={f.codigo} onChange={set('codigo')}
                   onBlur={() => !editando && buscarCodigo(f.codigo)}
                   inputMode="numeric" placeholder="Escanéalo o déjalo vacío" className={claseInput} />
            <button type="button" onClick={() => setVerEscaner(v => !v)}
              className={`h-12 px-4 rounded-xl text-sm font-semibold ${
                verEscaner ? 'bg-marca text-white' : 'bg-lima/20 text-marca active:bg-lima/30'}`}>
              Escanear
            </button>
          </div>
        </Campo>
        {verEscaner && <Escaner onCodigo={alEscanear} compacto />}
        {aviso && <p className="text-sm text-marca bg-lima/20 rounded-lg px-3 py-2">{aviso}</p>}
      </div>

      <Campo etiqueta="Nombre">
        <input value={f.nombre} onChange={set('nombre')} className={claseInput} />
      </Campo>

      <div className="grid grid-cols-2 gap-3 [&>*:last-child:nth-child(odd)]:col-span-2">
        <Campo etiqueta="Categoría (opcional)">
          <CategoriaSelect valor={f.categoria} onCambio={v => setF(prev => ({ ...prev, categoria: v }))} />
        </Campo>
        <Campo etiqueta="Se vende por">
          <select value={f.unidad} onChange={set('unidad')} className={claseInput}>
            {UNIDADES.map(u => <option key={u.id} value={u.id}>{u.texto}</option>)}
          </select>
        </Campo>
        {!f.es_kit && (
          <Campo etiqueta="Precio de compra">
            <input value={f.precio_compra} onChange={set('precio_compra')}
                   inputMode="numeric" className={claseInput} />
          </Campo>
        )}
        <Campo etiqueta="Precio de venta">
          <input value={f.precio_venta} onChange={set('precio_venta')}
                 inputMode="numeric" className={claseInput} />
        </Campo>
        {!f.es_kit && (
          <>
            <Campo etiqueta="Stock actual">
              <input value={f.stock} onChange={set('stock')} inputMode="decimal" className={claseInput} />
            </Campo>
            <Campo etiqueta="Stock mínimo">
              <input value={f.stock_minimo} onChange={set('stock_minimo')}
                     inputMode="decimal" className={claseInput} />
            </Campo>
          </>
        )}
        {dueno === true && (
          <Campo etiqueta="Precio mínimo (opcional)">
            <input value={f.precio_minimo} onChange={set('precio_minimo')}
                   inputMode="numeric" placeholder="Hasta dónde puede bajar" className={claseInput} />
          </Campo>
        )}
      </div>
      {dueno === true && (
        <div className="rounded-2xl bg-slate-50 p-3 space-y-3">
          <p className="text-xs font-medium text-slate-500">Venta al por mayor (opcional)</p>
          <div className="grid grid-cols-2 gap-3">
            <Campo etiqueta="Precio mayorista">
              <input value={f.precio_mayor} onChange={set('precio_mayor')} inputMode="numeric" className={claseInput} />
            </Campo>
            <Campo etiqueta="Desde (cantidad)">
              <input value={f.cantidad_mayor} onChange={set('cantidad_mayor')} inputMode="decimal" placeholder="Ej. 6" className={claseInput} />
            </Campo>
          </div>
          <p className="text-[11px] text-slate-400">
            Se aplica solo cuando llevan esa cantidad o más, y siempre a los clientes marcados como mayoristas.
          </p>
          <label className="grid grid-cols-[1fr_auto] gap-3 items-center">
            <span>
              <span className="block text-sm font-semibold">Es un combo o kit</span>
              <span className="block text-xs text-slate-400">Se vende como un solo producto y descuenta el inventario de lo que lleva.</span>
            </span>
            <input type="checkbox" checked={f.es_kit} onChange={e => setF(prev => ({ ...prev, es_kit: e.target.checked }))}
                   className="h-6 w-6 accent-[#1F6F54]" />
          </label>
          {f.es_kit && <ComponentesKit kitId={base?.id} valor={comps} onCambiar={setComps} />}
        </div>
      )}
      {costo > 0 && venta > 0 && !f.es_kit && (
        <p className={`text-sm rounded-lg px-3 py-2 ${
          ganancia > 0 ? 'text-marca bg-lima/20' : 'text-red-600 bg-red-50'}`}>
          {ganancia > 0
            ? `Ganas ${dinero(ganancia)} por ${f.unidad === 'und' ? 'unidad' : f.unidad} · margen ${(ganancia / costo * 100).toFixed(1)}% sobre el costo`
            : 'Ojo: lo vendes por debajo del costo'}
        </p>
      )}
      <Campo etiqueta="Vencimiento (solo si no manejas lotes)">
        <input type="date" value={f.fecha_vencimiento ?? ''} onChange={set('fecha_vencimiento')}
               className={claseInput} />
      </Campo>

      <div className="rounded-2xl bg-slate-50 p-3 space-y-3">
        <label className="grid grid-cols-[1fr_auto] gap-3 items-center">
          <span>
            <span className="block text-sm font-semibold">Mostrar en la tienda en línea</span>
            <span className="block text-xs text-slate-400">Aparece en el catálogo público y en Google. No se muestra el costo ni cuántas unidades hay.</span>
          </span>
          <input type="checkbox" checked={f.publicado}
                 onChange={e => setF(prev => ({ ...prev, publicado: e.target.checked }))}
                 className="h-6 w-6 accent-[#1F6F54]" />
        </label>
        {f.publicado && (
          <>
            <FotosEditor fotos={f.imagenes} carpeta="productos/"
                         onChange={(imagenes) => setF(prev => ({ ...prev, imagenes }))} />
            {f.imagenes.length === 0 && <p className="text-xs text-slate-400 -mt-1">La foto es opcional: sin foto, en la tienda se ve el logo de Matriz.</p>}
            <Campo etiqueta="Descripción para los clientes (opcional)">
              <textarea value={f.descripcion} onChange={set('descripcion')} rows={3} maxLength={600}
                        placeholder="Marca, tamaño, para qué sirve…" className={claseInput + ' h-auto py-3'} />
            </Campo>
          </>
        )}
      </div>

      {lotes.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs font-medium text-slate-500">Lotes (el más nuevo primero)</p>
          <ul className="divide-y divide-slate-100 rounded-xl bg-slate-50 px-3">
            {lotes.map(l => (
              <li key={l.id} className="py-2 grid grid-cols-[1fr_auto] gap-3 text-xs items-center">
                <div className="min-w-0">
                  <p className="font-medium text-slate-700 break-words">{l.numero ? `Lote ${l.numero}` : 'Sin número de lote'}</p>
                  <p className="text-slate-400">
                    Entró {fechaSolo(l.fecha)}{l.fecha_vencimiento ? ` · vence ${fechaSolo(l.fecha_vencimiento)}` : ''}
                  </p>
                </div>
                <span className={`font-semibold ${Number(l.restante) > 0 ? 'text-marca' : 'text-slate-300'}`}>
                  quedan {numero(l.restante)} de {numero(l.cantidad)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}

      {parecidos.length > 0 && (
        <div className="rounded-xl bg-amber-50 ring-1 ring-amber-300 p-3 space-y-3">
          <p className="text-base font-semibold text-amber-900">¿Es el mismo producto?</p>
          <p className="text-sm text-amber-900">Ya hay {parecidos.length === 1 ? 'uno parecido' : 'otros parecidos'}:</p>
          <ul className="text-base text-slate-800 space-y-1">
            {parecidos.map(x => <li key={x.id} className="break-words">• {x.nombre} <span className="text-slate-500">({numero(x.stock)} en stock)</span></li>)}
          </ul>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => setParecidos([])}
              className="min-h-12 rounded-xl bg-white ring-1 ring-slate-300 text-base font-semibold text-slate-700">← Volver y revisar</button>
            <button type="button" onClick={() => { confirmoParecido.current = true; guardar() }}
              className="min-h-12 rounded-xl bg-amber-500 text-white text-base font-semibold">Es otro, guardar</button>
          </div>
        </div>
      )}

      <button onClick={guardar} disabled={guardando}
        className="w-full h-12 rounded-xl bg-marca text-white font-semibold disabled:opacity-40 active:bg-marca-oscuro">
        {guardando ? 'Guardando…' : 'Guardar'}
      </button>
      {editando && onArchivar && dueno === true && base.activo !== false && (
        <button onClick={() => onArchivar(base)}
          className="w-full h-10 rounded-xl text-sm text-red-500">
          Quitar este producto
        </button>
      )}
    </Modal>
  )
}
