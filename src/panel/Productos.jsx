import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase, urlImagen } from '../lib/supabase'
import { traerTodo } from '../lib/traerTodo'
import { cop } from '../lib/pedido'
import { UNIDADES } from '../lib/csv'
import { reducirImagen, nombreArchivo } from '../lib/imagen'
import { mensajeError } from '../lib/errores'
import { Btn, Volver, Aviso, Campo, BarraFija, clsInput } from '../tienda/ui'
import { Titulo, Seccion, Insignia, Interruptor, Opciones, SoloLectura } from './piezas'
import CargaMasiva from './CargaMasiva'

const COLS = 'id,codigo,nombre,categoria,precio_venta,precio_compra,stock,unidad,activo,publicado,disponible,controla_stock,descripcion,imagenes'
const FILTROS = [['todos', 'Todos'], ['publicados', 'En la tienda'], ['ocultos', 'Ocultos'], ['agotados', 'Agotados']]
const agotado = (p) => !(p.controla_stock ? Number(p.stock) > 0 : p.disponible)

export default function Productos({ ctx, volver }) {
  const [vista, setVista] = useState('lista')   // lista · form · masiva
  const [sel, setSel] = useState(null)
  const [lista, setLista] = useState(null)
  const [error, setError] = useState('')
  const [filtro, setFiltro] = useState('todos')
  const [texto, setTexto] = useState('')
  const [ocupado, setOcupado] = useState(null)
  const nid = ctx.neg.negocio_id

  const cargar = useCallback(async () => {
    const { data, error: e } = await traerTodo(() => supabase.from('productos').select(COLS).eq('negocio_id', nid).eq('activo', true).order('nombre').order('id'))
    if (e) setError(mensajeError(e)); else { setError(''); setLista(data) }
  }, [nid])
  useEffect(() => { cargar() }, [cargar])

  const visibles = useMemo(() => {
    const q = texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    return (lista || []).filter((p) => {
      if (filtro === 'publicados' && !p.publicado) return false
      if (filtro === 'ocultos' && p.publicado) return false
      if (filtro === 'agotados' && !agotado(p)) return false
      return !q || p.nombre.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().includes(q)
    })
  }, [lista, filtro, texto])

  async function rapido(p, cambio, clave) {
    setOcupado(p.id + clave); setError('')
    const { error: e } = await supabase.from('productos').update(cambio).eq('negocio_id', nid).eq('id', p.id)
    setOcupado(null)
    if (e) return setError(mensajeError(e))
    setLista((l) => l.map((x) => (x.id === p.id ? { ...x, ...cambio } : x)))
  }

  if (vista === 'form') return <Formulario ctx={ctx} producto={sel} volver={() => { setVista('lista'); cargar() }} />
  if (vista === 'masiva') return <CargaMasiva ctx={ctx} volver={() => { setVista('lista'); cargar() }} />

  return (
    <div className="pb-32">
      <Volver onClick={volver} texto="Volver al panel" />
      <Titulo sub={lista ? `${lista.length} productos` : ''}>Productos</Titulo>
      {ctx.soloLectura && <SoloLectura />}
      {error && <div className="mb-4"><Aviso tipo="error">{error}</Aviso></div>}
      <input type="search" value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Buscar un producto" aria-label="Buscar un producto" className={`${clsInput} mb-3`} />
      <div className="mb-5"><Opciones columnas={4} valor={filtro} opciones={FILTROS} onChange={setFiltro} /></div>

      {!lista && !error && <p className="py-8 text-center text-xl text-tinta/60">Cargando productos…</p>}
      {lista?.length === 0 && <p className="rounded-2xl border-2 border-black/10 bg-white p-6 text-center text-xl">Todavía no tienes productos. Toca «Nuevo producto» o «Cargar muchos productos».</p>}
      {lista && lista.length > 0 && visibles.length === 0 && <p className="rounded-2xl border-2 border-black/10 bg-white p-6 text-center text-xl">No hay productos con ese filtro.</p>}

      <div className="space-y-3">
        {visibles.map((p) => {
          const foto = urlImagen(p.imagenes?.[0])
          return (
            <article key={p.id} className="rounded-2xl border-2 border-black/5 bg-white p-4 shadow-sm">
              <div className="flex gap-3">
                {foto ? <img src={foto} alt="" loading="lazy" className="h-20 w-20 shrink-0 rounded-xl object-cover" /> : <div aria-hidden="true" className="flex h-20 w-20 shrink-0 items-center justify-center rounded-xl bg-principal/10 text-3xl font-bold text-principal/40">{p.nombre.charAt(0).toUpperCase()}</div>}
                <div className="min-w-0 flex-1">
                  <h3 className="break-words text-xl font-bold leading-snug">{p.nombre}</h3>
                  <p className="text-xl font-bold text-principal">{cop(p.precio_venta)}</p>
                  <div className="mt-1 flex flex-wrap gap-2">
                    {!p.publicado && <Insignia tono="gris">Oculto</Insignia>}
                    {agotado(p) && <Insignia tono="rojo">Agotado</Insignia>}
                    {p.controla_stock && <Insignia tono="azul">Stock {Number(p.stock)}</Insignia>}
                  </div>
                </div>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                {!ctx.soloLectura && (p.controla_stock
                  ? <Btn variante="suave" onClick={() => { setSel(p); setVista('form') }}>Cambiar stock</Btn>
                  : <Btn variante="suave" disabled={ocupado === p.id + 'd'} onClick={() => rapido(p, { disponible: !p.disponible }, 'd')}>{p.disponible ? 'Marcar agotado' : 'Ya hay'}</Btn>)}
                {!ctx.soloLectura && <Btn variante="suave" disabled={ocupado === p.id + 'p'} onClick={() => rapido(p, { publicado: !p.publicado }, 'p')}>{p.publicado ? 'Ocultar' : 'Mostrar'}</Btn>}
              </div>
              <div className="mt-2"><Btn onClick={() => { setSel(p); setVista('form') }}>{ctx.soloLectura ? 'Ver' : 'Editar'}</Btn></div>
            </article>
          )
        })}
      </div>

      {!ctx.soloLectura && (
        <BarraFija>
          <div className="grid grid-cols-2 gap-3">
            <Btn variante="suave" onClick={() => setVista('masiva')}>Cargar muchos</Btn>
            <Btn onClick={() => { setSel(null); setVista('form') }}>Nuevo producto</Btn>
          </div>
        </BarraFija>
      )}
    </div>
  )
}

function Formulario({ ctx, producto, volver }) {
  const nuevo = !producto
  const nid = ctx.neg.negocio_id
  const controla = nuevo ? ctx.modulos.includes('caja') : producto.controla_stock
  const [f, setF] = useState(() => ({
    nombre: producto?.nombre || '', precio_venta: producto?.precio_venta ?? '', precio_compra: producto?.precio_compra || '', categoria: producto?.categoria || '',
    unidad: producto?.unidad || 'und', descripcion: producto?.descripcion || '', codigo: producto?.codigo || '', publicado: producto?.publicado ?? true,
    disponible: producto?.disponible ?? true, stock: producto?.stock ?? 0, imagenes: producto?.imagenes || [],
  }))
  const [cats, setCats] = useState([])
  const [otra, setOtra] = useState(false)
  const [errores, setErrores] = useState({})
  const [error, setError] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [subiendo, setSubiendo] = useState(false)
  const [confirmarQuitar, setConfirmarQuitar] = useState(false)
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })

  useEffect(() => {
    supabase.from('categorias').select('nombre').eq('negocio_id', nid).eq('activa', true).order('orden').order('nombre').then(({ data }) => {
      const n = (data || []).map((c) => c.nombre)
      if (f.categoria && !n.includes(f.categoria)) n.push(f.categoria)
      setCats(n)
    })
  }, [nid]) // eslint-disable-line react-hooks/exhaustive-deps

  async function subirFoto(e) {
    const archivo = e.target.files?.[0]; e.target.value = ''
    if (!archivo) return
    if (f.imagenes.length >= 4) return setError('Puedes poner hasta 4 fotos por producto.')
    setSubiendo(true); setError('')
    try {
      const blob = await reducirImagen(archivo, 900)
      const ruta = `${nid}/productos/${nombreArchivo()}`
      const { error: e2 } = await supabase.storage.from('negocios').upload(ruta, blob, { contentType: 'image/webp' })
      if (e2) throw e2
      setF((x) => ({ ...x, imagenes: [...x.imagenes, ruta] }))
    } catch (x) { setError(mensajeError(x)) }
    setSubiendo(false)
  }
  const quitarFoto = (r) => { setF({ ...f, imagenes: f.imagenes.filter((x) => x !== r) }); supabase.storage.from('negocios').remove([r]).then(() => {}, () => {}) }

  function validar() {
    const e = {}
    if (f.nombre.trim().length < 2) e.nombre = 'Escribe el nombre del producto'
    const pr = Number(String(f.precio_venta).replace(/[$.\s]/g, '').replace(',', '.'))
    if (!(pr > 0)) e.precio_venta = 'Escribe el precio de venta (mayor que cero)'
    setErrores(e)
    return { ok: Object.keys(e).length === 0, pr }
  }

  async function guardar() {
    const { ok, pr } = validar()
    if (!ok) return window.scrollTo({ top: 0, behavior: 'smooth' })
    setGuardando(true); setError('')
    const fila = {
      nombre: f.nombre.trim(), precio_venta: pr, categoria: f.categoria.trim() || null, unidad: f.unidad, descripcion: f.descripcion.trim() || null,
      codigo: f.codigo.trim() || null, publicado: f.publicado, imagenes: f.imagenes,
      precio_compra: Number(String(f.precio_compra).replace(/[$.\s]/g, '').replace(',', '.')) || 0,
    }
    if (!controla) fila.disponible = f.disponible
    let res
    if (nuevo) {
      if (controla) fila.stock = Number(f.stock) || 0
      res = await supabase.from('productos').insert({ ...fila, negocio_id: nid }).select('id').single()
    } else {
      res = await supabase.from('productos').update(fila).eq('negocio_id', nid).eq('id', producto.id).select('id')
      if (!res.error && !res.data?.length) res = { error: { message: 'No tienes permiso para cambiar este producto.' } }
      if (!res.error && controla && Number(f.stock) !== Number(producto.stock)) {
        res = await supabase.rpc('ajustar_stock', { p_negocio_id: nid, p_producto_id: producto.id, p_stock_real: Number(f.stock) || 0, p_motivo: 'Cambio desde el panel' })
      }
    }
    if (!res.error && fila.categoria) await supabase.from('categorias').upsert({ negocio_id: nid, nombre: fila.categoria }, { onConflict: 'negocio_id,nombre', ignoreDuplicates: true })
    setGuardando(false)
    if (res.error) { setError(mensajeError(res.error)); return window.scrollTo({ top: 0, behavior: 'smooth' }) }
    volver()
  }

  async function quitar() {
    setGuardando(true)
    const { data, error: e } = await supabase.from('productos').update({ activo: false }).eq('negocio_id', nid).eq('id', producto.id).select('id')
    setGuardando(false)
    if (e || !data?.length) { setConfirmarQuitar(false); return setError(e ? mensajeError(e) : 'Solo el dueño puede quitar productos.') }
    volver()
  }

  const lectura = ctx.soloLectura
  return (
    <div className="pb-40">
      <Volver onClick={volver} texto="Volver a los productos" />
      <Titulo>{nuevo ? 'Nuevo producto' : lectura ? 'Producto' : 'Editar producto'}</Titulo>
      {lectura && <SoloLectura />}
      {error && <div className="mb-4"><Aviso tipo="error">{error}</Aviso></div>}
      <fieldset disabled={lectura} className="space-y-5">
        <Campo etiqueta="Nombre del producto" error={errores.nombre}><input className={clsInput} value={f.nombre} onChange={set('nombre')} maxLength={120} /></Campo>
        <Campo etiqueta="Precio de venta ($)" error={errores.precio_venta} ayuda="Solo números, por ejemplo 2500."><input className={clsInput} inputMode="numeric" value={f.precio_venta} onChange={set('precio_venta')} /></Campo>
        <Campo etiqueta="Categoría">
          {otra
            ? <input className={clsInput} placeholder="Nombre de la categoría nueva" value={f.categoria} onChange={set('categoria')} maxLength={60} />
            : <select className={clsInput} value={f.categoria} onChange={(e) => e.target.value === '__nueva' ? (setOtra(true), setF({ ...f, categoria: '' })) : set('categoria')(e)}>
                <option value="">Sin categoría</option>
                {cats.map((c) => <option key={c} value={c}>{c}</option>)}
                <option value="__nueva">+ Crear categoría nueva</option>
              </select>}
        </Campo>
        <Campo etiqueta="¿Cómo se vende?">
          <select className={clsInput} value={f.unidad} onChange={set('unidad')}>{UNIDADES.map((u) => <option key={u} value={u}>{u === 'und' ? 'Por unidad' : u}</option>)}</select>
        </Campo>
        <Campo etiqueta="Descripción (opcional)"><textarea className={`${clsInput} min-h-[96px] py-3`} maxLength={300} value={f.descripcion} onChange={set('descripcion')} /></Campo>

        <Seccion titulo="Fotos">
          <div className="grid grid-cols-2 gap-3">
            {f.imagenes.map((r) => (
              <div key={r} className="space-y-2">
                <img src={urlImagen(r)} alt="" className="aspect-square w-full rounded-xl object-cover" />
                {!lectura && <Btn variante="suave" type="button" onClick={() => quitarFoto(r)}>Quitar</Btn>}
              </div>
            ))}
          </div>
          {!lectura && f.imagenes.length < 4 && (
            <label className="mt-3 flex min-h-[64px] w-full cursor-pointer items-center justify-center rounded-2xl border-2 border-dashed border-principal/40 text-lg font-semibold text-principal">
              {subiendo ? 'Subiendo la foto…' : f.imagenes.length ? 'Agregar otra foto' : 'Agregar una foto'}
              <input type="file" accept="image/*" className="hidden" onChange={subirFoto} disabled={subiendo} />
            </label>
          )}
        </Seccion>

        {controla
          ? <Campo etiqueta="Cuántos hay (stock)"><input className={clsInput} inputMode="decimal" value={f.stock} onChange={set('stock')} /></Campo>
          : <Interruptor valor={f.disponible} onChange={(v) => setF({ ...f, disponible: v })} texto="Hay disponible" ayuda="Apágalo cuando se acabe: sale «Agotado» y no se puede pedir." />}
        <Interruptor valor={f.publicado} onChange={(v) => setF({ ...f, publicado: v })} texto="Mostrar en la tienda" ayuda="Apagado, el producto queda oculto para los clientes." />

        <details className="rounded-2xl border-2 border-black/5 bg-white p-4">
          <summary className="min-h-[44px] cursor-pointer text-lg font-semibold">Más datos (opcional)</summary>
          <div className="mt-4 space-y-5">
            <Campo etiqueta="Código o referencia"><input className={clsInput} value={f.codigo} onChange={set('codigo')} maxLength={40} /></Campo>
            <Campo etiqueta="Costo de compra ($)"><input className={clsInput} inputMode="numeric" value={f.precio_compra} onChange={set('precio_compra')} /></Campo>
          </div>
        </details>

        {!nuevo && ctx.esDueno && !lectura && (
          confirmarQuitar
            ? <Seccion titulo="¿Quitar este producto?"><p className="mb-3 text-lg">Deja de salir en la tienda y en tu lista. Los pedidos que ya hicieron no cambian.</p><div className="grid grid-cols-2 gap-3"><Btn variante="suave" onClick={() => setConfirmarQuitar(false)}>No</Btn><Btn onClick={quitar} disabled={guardando}>Sí, quitar</Btn></div></Seccion>
            : <Btn variante="suave" type="button" onClick={() => setConfirmarQuitar(true)}>Quitar este producto</Btn>
        )}
      </fieldset>

      {!lectura && <BarraFija><Btn onClick={guardar} disabled={guardando || subiendo}>{guardando ? 'Guardando…' : 'Guardar'}</Btn></BarraFija>}
    </div>
  )
}
