import { useCallback, useEffect, useState } from 'react'
import { usePersistido, borrarBorradores, TREINTA_MIN } from '../lib/usePersistido'
import { supabase } from '../lib/supabase'
import { dinero, aNumero } from '../lib/formato'
import { claseInput } from '../lib/estilos'
import { comprimirImagen } from '../lib/imagen'
import Modal, { Campo } from './Modal'
import { fotosDe, MAX_FOTOS } from '../lib/fotos'
import { rutaPrenda } from '../lib/tiendaUrl'
import { useCopiado, textoCopiar } from '../lib/useCopiado'
import { useDueno } from '../context/rol'
import { GENEROS, textoGenero } from '../lib/ropa'
import BarraFija, { Desplegable } from './BarraFija'
import PedidosRopa from './PedidosRopa'
import VentaRopa from './VentaRopa'
import { useBorradorForm } from '../lib/useBorradorForm'
import AvisoBorrador from './AvisoBorrador'
import { confirmar } from '../lib/confirmar'
import { enlaceTienda } from '../lib/enlaces'
import QrCatalogo from './QrCatalogo'

const TALLAS = ['XS', 'S', 'M', 'L', 'XL', 'Única']

function FormPrenda({ prenda, onGuardado, onCerrar }) {
  const dueno = useDueno()
  const editando = Boolean(prenda?.id)
  const [f, setF, bor] = useBorradorForm(`borrador-prenda${editando ? '-' + prenda.id : ''}`, {
    nombre: prenda?.nombre ?? '',
    descripcion: prenda?.descripcion ?? '',
    categoria: prenda?.categoria ?? '',
    precio: prenda?.precio ?? '',
    costo: prenda?.costo ? String(prenda.costo) : '',
    genero: prenda?.genero ?? 'unisex',
    activo: prenda?.activo ?? true,
  })
  const [fotos, setFotos, borFotos] = useBorradorForm(`borrador-prenda-fotos${editando ? '-' + prenda.id : ''}`, fotosDe(prenda))
  const [variantes, setVariantes, borVar] = useBorradorForm(`borrador-prenda-variantes${editando ? '-' + prenda.id : ''}`,
    (prenda?.prenda_variantes ?? []).map(v => ({ talla: v.talla, color: v.color, stock: v.stock })))
  const limpiarBorrador = () => { bor.limpiar(); borFotos.limpiar(); borVar.limpiar() }
  const desdeCero = () => { bor.empezarDeNuevo(); borFotos.empezarDeNuevo(); borVar.empezarDeNuevo() }
  const [error, setError] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [subiendo, setSubiendo] = useState(false)

  const set = (k) => (e) => setF(prev => ({ ...prev, [k]: e.target.value }))

  const subirFotos = async (e) => {
    const archivos = [...(e.target.files ?? [])].slice(0, MAX_FOTOS - fotos.length)
    e.target.value = ''
    if (!archivos.length) return
    setSubiendo(true); setError('')
    try {
      const nuevas = []
      for (const archivo of archivos) {
        const blob = await comprimirImagen(archivo)
        const ruta = `${crypto.randomUUID()}.jpg`
        const { error: err } = await supabase.storage
          .from('prendas').upload(ruta, blob, { contentType: 'image/jpeg' })
        if (err) throw err
        nuevas.push(supabase.storage.from('prendas').getPublicUrl(ruta).data.publicUrl)
      }
      setFotos(prev => [...prev, ...nuevas])
    } catch (err) {
      setError('No se pudo subir la foto: ' + err.message)
    }
    setSubiendo(false)
  }

  const quitarFoto = async (i) => {
    if (!(await confirmar({ titulo: '¿Quitar esta foto?', texto: 'Dejará de verse en el catálogo cuando guardes.' }))) return
    setFotos(prev => prev.filter((_, j) => j !== i))
  }
  const hacerPortada = (i) => setFotos(prev => [prev[i], ...prev.filter((_, j) => j !== i)])

  const [copiado, copiar] = useCopiado()
  const copiarEnlace = () => copiar(`${window.location.origin}${rutaPrenda(prenda)}`)

  const cambiarVar = (i, k, valor) =>
    setVariantes(prev => prev.map((v, j) => (j === i ? { ...v, [k]: valor } : v)))

  const guardar = async () => {
    setError('')
    if (!f.nombre.trim()) return setError('Falta el nombre')
    if (aNumero(f.precio) <= 0) return setError('Falta el precio')
    const validas = variantes.filter(v => v.talla.trim())
    setGuardando(true)

    const fila = {
      nombre: f.nombre.trim(),
      descripcion: f.descripcion.trim() || null,
      categoria: f.categoria.trim() || null,
      precio: aNumero(f.precio),
      genero: f.genero,
      ...(dueno ? { costo: Math.max(0, aNumero(f.costo)) } : {}),
      imagenes: fotos,
      imagen_url: fotos[0] ?? null,
      activo: f.activo,
    }
    const q = editando
      ? supabase.from('prendas').update(fila).eq('id', prenda.id).select().single()
      : supabase.from('prendas').insert(fila).select().single()
    const { data, error: err } = await q
    if (err) {
      setGuardando(false)
      return setError(/genero|costo|column/i.test(err.message) ? 'Falta ejecutar migracion-v11.sql en Supabase. ' + err.message : err.message)
    }

    // Reemplazo simple de variantes: borra las del producto y vuelve a insertar
    const { error: errDel } = await supabase.from('prenda_variantes').delete().eq('prenda_id', data.id)
    if (errDel) { setGuardando(false); return setError(errDel.message) }
    if (validas.length) {
      const { error: errIns } = await supabase.from('prenda_variantes').insert(
        validas.map(v => ({
          prenda_id: data.id, talla: v.talla.trim(), color: v.color.trim(), stock: Math.max(0, Math.round(aNumero(v.stock))),
        })))
      if (errIns) { setGuardando(false); return setError(errIns.message) }
    }
    setGuardando(false)
    limpiarBorrador()
    onGuardado?.()
  }

  const eliminar = async () => {
    if (!(await confirmar({ titulo: `¿Eliminar "${prenda.nombre}" del catálogo?`, texto: 'Se borra la prenda y sus tallas. No se puede deshacer.', si: 'Sí, eliminar' }))) return
    const { error: err } = await supabase.from('prendas').delete().eq('id', prenda.id)
    if (err) return setError(err.message)
    limpiarBorrador()
    onGuardado?.()
  }

  return (
    <Modal titulo={editando ? 'Editar prenda' : 'Nueva prenda'} onCerrar={() => { limpiarBorrador(); onCerrar?.() }}>
      {bor.recuperado && <AvisoBorrador onNuevo={desdeCero} />}
      <div className="space-y-2">
        <p className="text-xs font-medium text-slate-500">
          Fotos ({fotos.length}/{MAX_FOTOS}) · la primera es la portada
        </p>
        <div className="grid grid-cols-5 gap-2">
          {fotos.map((src, i) => (
            <div key={src} className="relative aspect-square rounded-lg overflow-hidden bg-slate-100">
              <img src={src} alt="" className="w-full h-full object-cover" />
              <button onClick={() => quitarFoto(i)} aria-label="Quitar foto"
                className="absolute top-0.5 right-0.5 h-5 w-5 rounded-full bg-black/60 text-white text-[10px]">
                ✕
              </button>
              {i === 0 ? (
                <span className="absolute bottom-0 inset-x-0 bg-marca/80 text-white text-[9px] text-center py-0.5">
                  Portada
                </span>
              ) : (
                <button onClick={() => hacerPortada(i)} aria-label="Usar como portada"
                  className="absolute bottom-0.5 left-0.5 h-5 w-5 rounded-full bg-white/85 text-[11px] text-marca">
                  ★
                </button>
              )}
            </div>
          ))}
          {fotos.length < MAX_FOTOS && (
            <label className="aspect-square rounded-lg border border-dashed border-marca/40 text-marca
                              text-xl grid place-items-center cursor-pointer active:bg-lima/10">
              {subiendo ? <span className="text-[10px]">…</span> : '+'}
              <input type="file" accept="image/*" multiple onChange={subirFotos}
                     disabled={subiendo} className="hidden" />
            </label>
          )}
        </div>
      </div>

      <Campo etiqueta="Nombre">
        <input value={f.nombre} onChange={set('nombre')} className={claseInput} />
      </Campo>
      <div className="grid grid-cols-2 gap-3">
        <Campo etiqueta="Precio de venta">
          <input value={f.precio} onChange={set('precio')} inputMode="numeric" className={claseInput} />
        </Campo>
        {dueno ? (
          <Campo etiqueta="Costo (solo lo ves tú)">
            <input value={f.costo} onChange={set('costo')} inputMode="numeric" placeholder="0" className={claseInput} />
          </Campo>
        ) : (
          <Campo etiqueta="Categoría">
            <input value={f.categoria} onChange={set('categoria')} placeholder="Camisetas…" className={claseInput} />
          </Campo>
        )}
      </div>
      {dueno && (
        <Campo etiqueta="Categoría">
          <input value={f.categoria} onChange={set('categoria')} placeholder="Camisetas…" className={claseInput} />
        </Campo>
      )}
      <div className="space-y-2">
        <p className="text-xs font-medium text-slate-500">¿Para quién es?</p>
        <div className="grid grid-cols-4 gap-2">
          {GENEROS.map(g => (
            <button key={g.id} type="button" onClick={() => setF(prev => ({ ...prev, genero: g.id }))}
              className={`h-11 rounded-xl text-xs font-medium ${f.genero === g.id ? 'bg-marca text-white' : 'bg-slate-100 text-slate-600'}`}>
              {g.texto}
            </button>
          ))}
        </div>
      </div>
      <Campo etiqueta="Descripción (opcional)">
        <textarea value={f.descripcion} onChange={set('descripcion')} rows={2}
          className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:border-marca focus:ring-2 focus:ring-marca/20 outline-none" />
      </Campo>

      <div className="space-y-2">
        <p className="text-xs font-medium text-slate-500">Tallas, colores y stock</p>
        {variantes.map((v, i) => (
          <div key={i} className="grid grid-cols-[4.5rem_1fr_4rem_2.5rem] gap-2">
            <input list="tallas" value={v.talla} onChange={e => cambiarVar(i, 'talla', e.target.value)}
                   placeholder="Talla" className={claseInput + ' !px-3'} />
            <input value={v.color} onChange={e => cambiarVar(i, 'color', e.target.value)}
                   placeholder="Color" className={claseInput + ' !px-3'} />
            <input value={v.stock} onChange={e => cambiarVar(i, 'stock', e.target.value)}
                   inputMode="numeric" placeholder="Cant." className={claseInput + ' !px-2 text-center'} />
            <button onClick={() => setVariantes(prev => prev.filter((_, j) => j !== i))}
                    className="h-12 rounded-xl bg-slate-100 text-slate-500">✕</button>
          </div>
        ))}
        <datalist id="tallas">{TALLAS.map(t => <option key={t} value={t} />)}</datalist>
        <button onClick={() => setVariantes(prev => [...prev, { talla: '', color: '', stock: '' }])}
          className="w-full h-10 rounded-xl border border-dashed border-marca/40 text-marca text-sm font-medium">
          + Agregar talla / color
        </button>
      </div>

      <label className="flex items-center gap-3 h-10">
        <input type="checkbox" checked={f.activo}
               onChange={e => setF(prev => ({ ...prev, activo: e.target.checked }))}
               className="h-5 w-5 accent-[#1F6F54]" />
        <span className="text-sm text-slate-600">Visible en el catálogo</span>
      </label>

      {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}

      <button onClick={guardar} disabled={guardando || subiendo}
        className="w-full h-12 rounded-xl bg-marca text-white font-semibold disabled:opacity-40 active:bg-marca-oscuro">
        {guardando ? 'Guardando…' : 'Guardar'}
      </button>
      {editando && (
        <button onClick={copiarEnlace}
          className="w-full h-10 rounded-xl bg-lima/20 text-marca text-sm font-semibold">
          {textoCopiar(copiado, 'Copiar enlace de esta prenda')}
        </button>
      )}
      {editando && dueno && (
        <button onClick={eliminar} className="w-full h-10 rounded-xl text-sm text-red-500">
          Eliminar prenda
        </button>
      )}
    </Modal>
  )
}

export default function RopaAdmin() {
  const [prendas, setPrendas] = useState([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [form, setForm] = usePersistido('ropa:form', null, true, TREINTA_MIN)
  const [vista, setVista] = usePersistido('ropa:vista', 'prendas', true, TREINTA_MIN)     // 'prendas' | 'pedidos'
  const [pendientes, setPendientes] = useState(0)
  const [vender, setVender] = usePersistido('ropa:vender', false, true, TREINTA_MIN)
  const [genero, setGenero] = useState('todos')

  useEffect(() => {
    supabase.from('pedidos_ropa').select('id', { count: 'exact', head: true }).eq('estado', 'pendiente')
      .then(({ count, error: err }) => { if (!err) setPendientes(count ?? 0) })
  }, [vista])

  const cargar = useCallback(async () => {
    setCargando(true)
    const { data, error: err } = await supabase
      .from('prendas').select('*, prenda_variantes(*)').order('creado_en', { ascending: false })
    if (err) setError(err.message)
    setPrendas(data ?? [])
    setCargando(false)
  }, [])
  useEffect(() => { cargar() }, [cargar])

  const enlace = enlaceTienda()
  const [copiado, copiar] = useCopiado()
  const [verQr, setVerQr] = useState(false)
  const textoWa = `Mira mi catálogo de ropa y haz tu pedido 👉 ${enlace}`

  return (
    <div className="space-y-4">
      <BarraFija>
      <div className="grid grid-cols-2 gap-2">
        {[{ id: 'prendas', texto: 'Prendas' }, { id: 'pedidos', texto: `Pedidos${pendientes ? ` (${pendientes})` : ''}` }].map(t => (
          <button key={t.id} onClick={() => setVista(t.id)}
            className={`h-11 rounded-xl text-sm font-medium ${vista === t.id ? 'bg-marca text-white' : 'bg-white text-slate-600 shadow-sm'}`}>
            {t.texto}
          </button>
        ))}
      </div>
        {vista === 'prendas' && (
        <>
      <div className="grid grid-cols-2 gap-2">
        <button onClick={() => setForm({})}
          className="h-10 rounded-xl bg-marca text-white font-semibold active:bg-marca-oscuro">
          + Nueva prenda
        </button>
        <button onClick={() => setVender(true)}
          className="h-10 rounded-xl bg-champagne text-negro font-semibold active:bg-champagne-claro">
          Vender ropa
        </button>
      </div>
      <div className="grid grid-cols-5 gap-2">
        {['todos', ...GENEROS.map(g => g.id)].map(g => (
          <button key={g} onClick={() => setGenero(g)}
            className={`h-9 rounded-xl text-[11px] font-medium break-words px-1 ${genero === g ? 'bg-marca text-white' : 'bg-white text-slate-600 shadow-sm'}`}>
            {g === 'todos' ? 'Todos' : textoGenero(g)}
          </button>
        ))}
      </div>
        </>
        )}
      </BarraFija>

      <Desplegable titulo="Enlace del catálogo" nota="Ver, copiar y compartir por WhatsApp o QR">
        <p className="text-sm text-slate-700 break-words">{enlace}</p>
        <div className="grid grid-cols-2 gap-2 mt-2">
          <a href={enlace} target="_blank" rel="noopener noreferrer"
             className="min-h-12 rounded-xl bg-slate-100 text-slate-700 text-sm font-semibold grid place-items-center text-center px-2">
            Ver como lo ve el cliente
          </a>
          <button onClick={() => copiar(enlace)}
            className="min-h-12 rounded-xl bg-lima/20 text-marca text-sm font-semibold px-2">
            {textoCopiar(copiado, 'Copiar enlace')}
          </button>
          <a href={`https://wa.me/?text=${encodeURIComponent(textoWa)}`} target="_blank" rel="noopener noreferrer"
             className="min-h-12 rounded-xl bg-esmeralda text-white text-sm font-semibold grid place-items-center text-center px-2">
            Compartir por WhatsApp
          </a>
          <button onClick={() => setVerQr(true)}
            className="min-h-12 rounded-xl bg-negro text-champagne text-sm font-semibold px-2">
            Código QR
          </button>
        </div>
        {verQr && <QrCatalogo enlace={enlace} subtitulo="Catálogo de ropa · Pide por WhatsApp" onCerrar={() => setVerQr(false)} />}
      </Desplegable>

      {vista === 'pedidos' && <PedidosRopa onCambio={setPendientes} />}

      {vista === 'prendas' && (
      <>


      {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}

      {cargando ? (
        <p className="text-center text-sm text-slate-400 py-8">Cargando…</p>
      ) : prendas.length === 0 ? (
        <p className="text-center text-sm text-slate-400 py-8">Aún no hay prendas en el catálogo</p>
      ) : (
        <ul className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {prendas.filter(p => genero === 'todos' || (p.genero ?? 'unisex') === genero).map(p => {
            const stock = p.prenda_variantes.reduce((s, v) => s + v.stock, 0)
            return (
              <li key={p.id}>
                <button onClick={() => setForm(p)}
                  className="w-full bg-white rounded-2xl shadow-sm overflow-hidden text-left active:opacity-80">
                  <div className="aspect-square bg-slate-100 relative">
                    {fotosDe(p)[0] && <img src={fotosDe(p)[0]} alt="" className="w-full h-full object-cover" />}
                    {!p.activo && (
                      <span className="absolute top-2 left-2 text-[10px] px-2 py-0.5 rounded-full bg-black/60 text-white">
                        Oculta
                      </span>
                    )}
                  </div>
                  <div className="p-3 space-y-0.5">
                    <p className="text-sm font-medium break-words">{p.nombre}</p>
                    <p className="text-sm font-semibold text-marca">{dinero(p.precio)}</p>
                    <p className="text-[10px] uppercase tracking-[0.15em] text-oro">{textoGenero(p.genero)}</p>
                    <p className={`text-xs ${stock === 0 ? 'text-naranja-oscuro' : 'text-slate-400'}`}>
                      {stock === 0 ? 'Agotada' : `${stock} en stock`}
                    </p>
                  </div>
                </button>
              </li>
            )
          })}
        </ul>
      )}

      </>
      )}

      {vender && <VentaRopa onCerrar={() => setVender(false)} onVendido={cargar} />}

      {form && (
        <FormPrenda prenda={form} onCerrar={() => setForm(null)}
                    onGuardado={() => { setForm(null); cargar() }} />
      )}
    </div>
  )
}
