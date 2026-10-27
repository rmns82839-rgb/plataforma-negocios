// Promociones que cambian el precio solas al escanear (3x2, % de descuento, precio promocional).
// Solo el dueño las crea. No confundir con "Ofertas", que son avisos para el catálogo.
import { useCallback, useEffect, useState } from 'react'
import { usePersistido, borrarBorradores, TREINTA_MIN } from '../lib/usePersistido'
import { supabase } from '../lib/supabase'
import { claseInput } from '../lib/estilos'
import { dinero, aNumero } from '../lib/formato'
import { useDueno } from '../context/rol'
import { TIPOS_PROMO, vigente, textoPromo } from '../lib/promos'
import { hoyTexto } from '../lib/periodo'
import { GENEROS, textoGenero } from '../lib/ropa'
import Modal, { Campo } from './Modal'
import { useBorradorForm } from '../lib/useBorradorForm'
import AvisoBorrador from './AvisoBorrador'
import { confirmar } from '../lib/confirmar'

const objetivoTexto = (p) =>
  p.productos?.nombre ?? (p.categoria ? `categoría ${p.categoria}` : p.prendas?.nombre ? `ropa · ${p.prendas.nombre}`
    : p.categoria_ropa ? `ropa · categoría ${p.categoria_ropa}` : p.genero ? `ropa · ${textoGenero(p.genero)}` : '')

const estado = (p) => {
  if (!p.activa) return { texto: 'Pausada', clase: 'bg-slate-100 text-slate-500' }
  if (String(p.desde).slice(0, 10) > hoyTexto()) return { texto: 'Programada', clase: 'bg-champagne/30 text-oro-oscuro' }
  if (!vigente(p)) return { texto: 'Vencida', clase: 'bg-slate-100 text-slate-500' }
  return { texto: 'Aplicando', clase: 'bg-esmeralda/10 text-esmeralda' }
}

function Formulario({ promo, onGuardado, onCerrar }) {
  const editando = Boolean(promo?.id)
  const [f, setF, bor] = useBorradorForm(`borrador-promo${editando ? '-' + promo.id : ''}`, {
    nombre: promo?.nombre ?? '',
    catalogo: promo?.prenda_id || promo?.categoria_ropa || promo?.genero ? 'ropa' : 'tienda',
    aplica: promo?.categoria ? 'categoria' : promo?.prenda_id ? 'prenda' : promo?.categoria_ropa ? 'categoria_ropa' : promo?.genero ? 'genero' : 'producto',
    categoria: promo?.categoria ?? promo?.categoria_ropa ?? '',
    genero: promo?.genero ?? 'mujer',
    tipo: promo?.tipo ?? 'porcentaje',
    valor: promo?.valor != null ? String(Number(promo.valor)) : '',
    lleva: promo?.lleva ? String(promo.lleva) : '3',
    paga: promo?.paga ? String(promo.paga) : '2',
    desde: promo?.desde ? String(promo.desde).slice(0, 10) : hoyTexto(),
    hasta: promo?.hasta ? String(promo.hasta).slice(0, 10) : '',
    activa: promo?.activa ?? true,
  })
  const [producto, setProducto, borProd] = useBorradorForm(`borrador-promo-producto${editando ? '-' + promo.id : ''}`, promo?.productos ? { id: promo.producto_id, nombre: promo.productos.nombre } : promo?.prendas ? { id: promo.prenda_id, nombre: promo.prendas.nombre } : null, !editando)
  const limpiarBorrador = () => { bor.limpiar(); borProd.limpiar() }
  const desdeCero = () => { bor.empezarDeNuevo(); borProd.empezarDeNuevo() }
  const [q, setQ] = useState('')
  const [resultados, setResultados] = useState([])
  const [categorias, setCategorias] = useState([])
  const [error, setError] = useState('')
  const [guardando, setGuardando] = useState(false)
  const set = (k) => (e) => setF(p => ({ ...p, [k]: e.target.value }))

  const esRopa = f.catalogo === 'ropa'
  useEffect(() => {
    supabase.from(esRopa ? 'prendas' : 'productos').select('categoria').eq('activo', true).not('categoria', 'is', null).limit(1000)
      .then(({ data }) => setCategorias([...new Set((data ?? []).map(x => x.categoria).filter(Boolean))].sort()))
  }, [esRopa])
  useEffect(() => {
    const t = q.trim()
    if (t.length < 1) { setResultados([]); return undefined }
    const h = setTimeout(async () => {
      const { data } = await supabase.from(esRopa ? 'prendas' : 'productos').select('id, nombre').eq('activo', true).ilike('nombre', `%${t}%`).order('nombre').limit(5)
      setResultados(data ?? [])
    }, 250)
    return () => clearTimeout(h)
  }, [q, esRopa])

  const guardar = async () => {
    if (f.nombre.trim().length < 2) return setError('Ponle un nombre a la promoción (ej. "3x2 en arroz")')
    if ((f.aplica === 'producto' || f.aplica === 'prenda') && !producto) return setError(f.aplica === 'prenda' ? 'Elige la prenda' : 'Elige el producto')
    if ((f.aplica === 'categoria' || f.aplica === 'categoria_ropa') && !f.categoria.trim()) return setError('Escribe o elige la categoría')
    if (f.hasta && f.hasta < f.desde) return setError('La fecha final no puede ser anterior a la inicial')
    const valor = aNumero(f.valor)
    if (f.tipo === 'porcentaje' && (valor < 1 || valor > 90)) return setError('El porcentaje va de 1 a 90')
    if (f.tipo === 'precio' && valor <= 0) return setError('Escribe el precio promocional')
    const lleva = Math.round(aNumero(f.lleva)), paga = Math.round(aNumero(f.paga))
    if (f.tipo === 'nxm' && !(paga >= 1 && lleva > paga)) return setError('"Lleva" debe ser mayor que "paga" (ej. lleva 3, paga 2)')
    setGuardando(true); setError('')
    const fila = {
      nombre: f.nombre.trim(), tipo: f.tipo,
      producto_id: f.aplica === 'producto' ? producto.id : null,
      categoria: f.aplica === 'categoria' ? f.categoria.trim() : null,
      ...(esRopa || promo?.prenda_id || promo?.categoria_ropa || promo?.genero ? {
        prenda_id: f.aplica === 'prenda' ? producto.id : null,
        categoria_ropa: f.aplica === 'categoria_ropa' ? f.categoria.trim() : null,
        genero: f.aplica === 'genero' ? f.genero : null,
      } : {}),
      valor: f.tipo === 'nxm' ? null : valor,
      lleva: f.tipo === 'nxm' ? lleva : null, paga: f.tipo === 'nxm' ? paga : null,
      desde: f.desde, hasta: f.hasta || null, activa: f.activa,
    }
    const { error: err } = editando
      ? await supabase.from('promociones').update(fila).eq('id', promo.id)
      : await supabase.from('promociones').insert(fila)
    setGuardando(false)
    if (err) return setError(err.message)
    limpiarBorrador()
    onGuardado()
  }

  const borrar = async () => {
    if (!(await confirmar({ titulo: '¿Borrar esta promoción?', texto: 'No se puede deshacer.', si: 'Sí, borrar' }))) return
    const { error: err } = await supabase.from('promociones').delete().eq('id', promo.id)
    if (err) return setError(err.message)
    limpiarBorrador()
    onGuardado()
  }

  const Chips = ({ valor, opciones, onElegir }) => (
    <div className={`grid gap-2 ${opciones.length === 2 ? 'grid-cols-2' : opciones.length === 4 ? 'grid-cols-4' : 'grid-cols-3'}`}>
      {opciones.map(o => (
        <button key={o.id} onClick={() => onElegir(o.id)}
          className={`min-h-11 rounded-xl text-xs font-medium px-1 ${valor === o.id ? 'bg-marca text-white' : 'bg-slate-100 text-slate-600'}`}>
          {o.texto}
        </button>
      ))}
    </div>
  )

  return (
    <Modal titulo={editando ? 'Editar promoción' : 'Nueva promoción'} onCerrar={() => { limpiarBorrador(); onCerrar?.() }}>
      {bor.recuperado && <AvisoBorrador onNuevo={desdeCero} />}
      <Campo etiqueta="Nombre (sale en la factura)">
        <input value={f.nombre} onChange={set('nombre')} maxLength={60} placeholder='Ej. "3x2 en arroz"' className={claseInput} />
      </Campo>

      <div className="space-y-2">
        <p className="text-xs font-medium text-slate-500">¿En qué catálogo?</p>
        <Chips valor={f.catalogo}
               onElegir={(v) => { setF(p => ({ ...p, catalogo: v, aplica: v === 'ropa' ? 'prenda' : 'producto', categoria: '' })); setProducto(null); setQ(''); setResultados([]) }}
               opciones={[{ id: 'tienda', texto: 'Tienda' }, { id: 'ropa', texto: 'Ropa' }]} />
        <p className="text-xs font-medium text-slate-500 pt-1">¿A qué se aplica?</p>
        {esRopa ? (
          <Chips valor={f.aplica} onElegir={(v) => setF(p => ({ ...p, aplica: v, categoria: '' }))}
                 opciones={[{ id: 'prenda', texto: 'Una prenda' }, { id: 'categoria_ropa', texto: 'Una categoría' }, { id: 'genero', texto: 'Un género' }]} />
        ) : (
          <Chips valor={f.aplica} onElegir={(v) => setF(p => ({ ...p, aplica: v }))}
                 opciones={[{ id: 'producto', texto: 'Un producto' }, { id: 'categoria', texto: 'Una categoría' }]} />
        )}
        {f.aplica === 'producto' || f.aplica === 'prenda' ? (
          <div className="space-y-2">
            {producto && (
              <div className="grid grid-cols-[1fr_auto] gap-2 items-center rounded-xl bg-slate-50 p-3">
                <span className="text-sm font-medium truncate">{producto.nombre}</span>
                <button onClick={() => setProducto(null)} aria-label="Quitar" className="h-9 w-9 rounded-full bg-slate-200 text-slate-500">✕</button>
              </div>
            )}
            {!producto && <input value={q} onChange={e => setQ(e.target.value)} placeholder={esRopa ? 'Buscar prenda' : 'Buscar producto'} className={claseInput} />}
            {!producto && resultados.length > 0 && (
              <div className="rounded-xl border border-slate-200 divide-y divide-slate-100 bg-white">
                {resultados.map(p => (
                  <button key={p.id} onClick={() => { setProducto(p); setQ(''); setResultados([]) }}
                    className="w-full min-h-11 px-4 text-left text-sm active:bg-slate-50">{p.nombre}</button>
                ))}
              </div>
            )}
          </div>
        ) : f.aplica === 'genero' ? (
          <Chips valor={f.genero} onElegir={(v) => setF(p => ({ ...p, genero: v }))} opciones={GENEROS} />
        ) : (
          <>
            <input value={f.categoria} onChange={set('categoria')} list="cats-promo" placeholder={esRopa ? 'Categoría (como está en Ropa)' : 'Categoría (como está en Productos)'} className={claseInput} />
            <datalist id="cats-promo">{categorias.map(c => <option key={c} value={c} />)}</datalist>
          </>
        )}
      </div>

      <div className="space-y-2">
        <p className="text-xs font-medium text-slate-500">¿Qué descuento da?</p>
        <Chips valor={f.tipo} onElegir={(v) => setF(p => ({ ...p, tipo: v }))}
               opciones={[{ id: 'porcentaje', texto: '% descuento' }, { id: 'nxm', texto: 'Lleva N paga M' }, { id: 'precio', texto: 'Precio fijo' }]} />
        {f.tipo === 'nxm' ? (
          <div className="grid grid-cols-2 gap-3">
            <Campo etiqueta="Lleva"><input value={f.lleva} onChange={set('lleva')} inputMode="numeric" className={claseInput} /></Campo>
            <Campo etiqueta="Paga"><input value={f.paga} onChange={set('paga')} inputMode="numeric" className={claseInput} /></Campo>
          </div>
        ) : (
          <Campo etiqueta={f.tipo === 'porcentaje' ? 'Porcentaje de descuento' : 'Precio promocional por unidad'}>
            <input value={f.valor} onChange={set('valor')} inputMode="decimal" placeholder={f.tipo === 'porcentaje' ? 'Ej. 20' : 'Ej. 1500'} className={claseInput} />
          </Campo>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Campo etiqueta="Desde"><input type="date" value={f.desde} onChange={set('desde')} className={claseInput} /></Campo>
        <Campo etiqueta="Hasta (opcional)"><input type="date" value={f.hasta} onChange={set('hasta')} className={claseInput} /></Campo>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <button onClick={() => setF(p => ({ ...p, activa: true }))}
          className={`h-11 rounded-xl text-sm font-medium ${f.activa ? 'bg-marca text-white' : 'bg-slate-100 text-slate-600'}`}>Activa</button>
        <button onClick={() => setF(p => ({ ...p, activa: false }))}
          className={`h-11 rounded-xl text-sm font-medium ${!f.activa ? 'bg-marca text-white' : 'bg-slate-100 text-slate-600'}`}>Pausada</button>
      </div>
      <p className="text-xs text-slate-400">
        Se aplica sola al vender y, en ropa, también se ve en el catálogo. Si un producto tiene varias promociones, gana la que más descuenta. No se suma con un precio cambiado a mano.
      </p>

      {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
      <div className={`grid gap-3 ${editando ? 'grid-cols-2' : 'grid-cols-1'}`}>
        {editando && <button onClick={borrar} className="h-12 rounded-xl bg-red-50 text-red-600 font-semibold">Borrar</button>}
        <button onClick={guardar} disabled={guardando}
          className="h-12 rounded-xl bg-marca text-white font-semibold disabled:opacity-40 active:bg-marca-oscuro">
          {guardando ? 'Guardando…' : 'Guardar'}
        </button>
      </div>
    </Modal>
  )
}

export default function PromocionesAdmin() {
  const dueno = useDueno()
  const [lista, setLista] = useState([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [form, setForm] = usePersistido('promos:form', null, true, TREINTA_MIN)

  const cargar = useCallback(async () => {
    let { data, error: err } = await supabase.from('promociones').select('*, productos:producto_id(nombre), prendas:prenda_id(nombre)').order('creado_en', { ascending: false }).range(0, 199)
    if (err) ({ data, error: err } = await supabase.from('promociones').select('*, productos:producto_id(nombre)').order('creado_en', { ascending: false }).range(0, 199))   // aún sin migracion-v11
    if (err) setError(/relation .*promociones|schema cache|does not exist/i.test(err.message) ? 'Falta ejecutar migracion-v9.sql en Supabase.' : err.message)
    setLista(data ?? [])
    setCargando(false)
  }, [])
  useEffect(() => { if (dueno) cargar() }, [cargar, dueno])

  if (!dueno) return <p className="text-center text-sm text-slate-400 py-8">Solo el dueño administra las promociones.</p>

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl shadow-sm p-4 grid grid-cols-2 gap-3 items-center">
        <div>
          <p className="text-xs text-slate-400">Promociones creadas</p>
          <p className="text-2xl font-bold">{lista.length}</p>
        </div>
        <button onClick={() => setForm({})}
          className="h-11 rounded-xl bg-marca text-white text-sm font-semibold active:bg-marca-oscuro">+ Nueva promoción</button>
      </div>

      {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}

      {cargando ? (
        <p className="text-center text-sm text-slate-400 py-8">Cargando…</p>
      ) : lista.length === 0 ? (
        <p className="text-center text-sm text-slate-400 py-8">Aún no hay promociones. Crea una y se aplica sola en la Caja.</p>
      ) : (
        <ul className="grid gap-3 lg:grid-cols-2 lg:[&>li:last-child:nth-child(odd)]:col-span-2">
          {lista.map(p => {
            const e = estado(p)
            return (
              <li key={p.id}>
                <button onClick={() => setForm(p)}
                  className="w-full bg-white rounded-2xl shadow-sm p-3 grid grid-cols-[1fr_auto] gap-3 items-center text-left active:bg-slate-50">
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold truncate">{p.nombre}</span>
                    <span className="block text-xs text-slate-400 truncate">
                      {textoPromo(p, dinero)} · {objetivoTexto(p)}
                    </span>
                  </span>
                  <span className={`text-[11px] font-medium rounded-full px-2.5 py-1 ${e.clase}`}>{e.texto}</span>
                </button>
              </li>
            )
          })}
        </ul>
      )}

      {form && <Formulario promo={form.id ? form : null} onGuardado={() => { setForm(null); cargar() }} onCerrar={() => setForm(null)} />}
    </div>
  )
}
