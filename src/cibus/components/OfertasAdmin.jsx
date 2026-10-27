import { useCallback, useEffect, useState } from 'react'
import { usePersistido, borrarBorradores, TREINTA_MIN } from '../lib/usePersistido'
import { supabase } from '../lib/supabase'
import { claseInput } from '../lib/estilos'
import { useDueno } from '../context/rol'
import { hastaTexto } from '../lib/ofertas'
import Modal, { Campo } from './Modal'
import FotosEditor from './FotosEditor'
import { useBorradorForm } from '../lib/useBorradorForm'
import AvisoBorrador from './AvisoBorrador'
import { confirmar } from '../lib/confirmar'

const CATALOGOS = [
  { id: 'tienda', texto: 'Tienda' },
  { id: 'ropa', texto: 'Ropa' },
  { id: 'ambos', texto: 'Ambos' },
]
const hoy = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date())   // AAAA-MM-DD

const estado = (o) => {
  if (!o.activa) return { texto: 'Pausada', clase: 'bg-slate-100 text-slate-500' }
  const h = hoy()
  if (o.desde && o.desde > h) return { texto: 'Programada', clase: 'bg-champagne/30 text-oro-oscuro' }
  if (o.hasta && o.hasta < h) return { texto: 'Vencida', clase: 'bg-slate-100 text-slate-500' }
  return { texto: 'Visible', clase: 'bg-esmeralda/10 text-esmeralda' }
}

function Formulario({ oferta, onGuardado, onCerrar }) {
  const editando = Boolean(oferta?.id)
  const [f, setF, bor] = useBorradorForm(`borrador-oferta${editando ? '-' + oferta.id : ''}`, {
    catalogo: oferta?.catalogo ?? 'tienda',
    titulo: oferta?.titulo ?? '',
    detalle: oferta?.detalle ?? '',
    etiqueta: oferta?.etiqueta ?? '',
    desde: oferta?.desde ?? '',
    hasta: oferta?.hasta ?? '',
    activa: oferta?.activa ?? true,
  })
  const [fotos, setFotos, borFotos] = useBorradorForm(`borrador-oferta-fotos${editando ? '-' + oferta.id : ''}`, oferta?.imagen ? [oferta.imagen] : [])
  const limpiarBorrador = () => { bor.limpiar(); borFotos.limpiar() }
  const desdeCero = () => { bor.empezarDeNuevo(); borFotos.empezarDeNuevo() }
  const [error, setError] = useState('')
  const [guardando, setGuardando] = useState(false)
  const set = (k) => (e) => setF(p => ({ ...p, [k]: e.target.value }))

  const guardar = async () => {
    if (!f.titulo.trim()) return setError('Escribe el título de la oferta')
    if (f.desde && f.hasta && f.desde > f.hasta) return setError('La fecha final no puede ser anterior a la inicial')
    setGuardando(true); setError('')
    const fila = {
      catalogo: f.catalogo,
      titulo: f.titulo.trim(),
      detalle: f.detalle.trim() || null,
      etiqueta: f.etiqueta.trim() || null,
      imagen: fotos[0] ?? null,
      desde: f.desde || null,
      hasta: f.hasta || null,
      activa: f.activa,
    }
    const { error: err } = editando
      ? await supabase.from('ofertas').update(fila).eq('id', oferta.id)
      : await supabase.from('ofertas').insert(fila)
    setGuardando(false)
    if (err) return setError(err.message)
    limpiarBorrador()
    onGuardado()
  }

  const borrar = async () => {
    if (!(await confirmar({ titulo: '¿Borrar esta oferta?', texto: 'No se puede deshacer.', si: 'Sí, borrar' }))) return
    const { error: err } = await supabase.from('ofertas').delete().eq('id', oferta.id)
    if (err) return setError(err.message)
    limpiarBorrador()
    onGuardado()
  }

  return (
    <Modal titulo={editando ? 'Editar oferta' : 'Nueva oferta'} onCerrar={() => { limpiarBorrador(); onCerrar?.() }}>
      {bor.recuperado && <AvisoBorrador onNuevo={desdeCero} />}
      <Campo etiqueta="Título (lo primero que ve el cliente)">
        <input value={f.titulo} onChange={set('titulo')} maxLength={80} placeholder="Ej: Semana de la camiseta" className={claseInput} />
      </Campo>
      <Campo etiqueta="Etiqueta corta (opcional)">
        <input value={f.etiqueta} onChange={set('etiqueta')} maxLength={20} placeholder="Ej: -20%  ·  2x1  ·  Combo" className={claseInput} />
      </Campo>
      <Campo etiqueta="Detalle (opcional)">
        <textarea value={f.detalle} onChange={set('detalle')} maxLength={400} rows={3}
          placeholder="Qué incluye, condiciones, productos en oferta…" className={`${claseInput} h-auto py-3`} />
      </Campo>
      <div className="grid grid-cols-2 gap-3">
        <Campo etiqueta="Desde (opcional)"><input type="date" value={f.desde} onChange={set('desde')} className={claseInput} /></Campo>
        <Campo etiqueta="Hasta (opcional)"><input type="date" value={f.hasta} onChange={set('hasta')} className={claseInput} /></Campo>
      </div>
      <FotosEditor fotos={fotos} onChange={setFotos} bucket="anuncios-foto" carpeta="" max={1} />
      <div className="grid grid-cols-2 gap-2">
        <button onClick={() => setF(p => ({ ...p, activa: true }))}
          className={`h-11 rounded-xl text-sm font-medium ${f.activa ? 'bg-marca text-white' : 'bg-slate-100 text-slate-600'}`}>Activa</button>
        <button onClick={() => setF(p => ({ ...p, activa: false }))}
          className={`h-11 rounded-xl text-sm font-medium ${!f.activa ? 'bg-marca text-white' : 'bg-slate-100 text-slate-600'}`}>Pausada</button>
      </div>
      <p className="text-xs text-slate-400">La oferta es un aviso para el cliente: no cambia precios ni inventario.</p>

      {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}

      <div className={`grid gap-3 ${editando ? 'grid-cols-2' : 'grid-cols-1'}`}>
        {editando && (
          <button onClick={borrar} className="h-12 rounded-xl bg-red-50 text-red-600 font-semibold">Borrar</button>
        )}
        <button onClick={guardar} disabled={guardando}
          className="h-12 rounded-xl bg-marca text-white font-semibold disabled:opacity-40 active:bg-marca-oscuro">
          {guardando ? 'Guardando…' : 'Guardar'}
        </button>
      </div>
    </Modal>
  )
}

// Ofertas que ve el cliente al abrir /tienda o /ropa. Solo el dueño las administra.
export default function OfertasAdmin() {
  const dueno = useDueno()
  const [lista, setLista] = useState([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [form, setForm] = usePersistido('ofertas:form', null, true, TREINTA_MIN)

  const cargar = useCallback(async () => {
    const { data, error: err } = await supabase.from('ofertas').select('*').order('creado_en', { ascending: false }).range(0, 199)
    if (err) setError(/relation .*ofertas|schema cache|does not exist/i.test(err.message)
      ? 'Falta ejecutar migracion-v7.sql en Supabase.' : err.message)
    setLista(data ?? [])
    setCargando(false)
  }, [])
  useEffect(() => { if (dueno) cargar() }, [cargar, dueno])

  if (!dueno) return <p className="text-center text-sm text-slate-400 py-8">Solo el dueño administra las ofertas.</p>

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl shadow-sm p-4 grid grid-cols-2 gap-3 items-center">
        <div>
          <p className="text-xs text-slate-400">Ofertas creadas</p>
          <p className="text-2xl font-bold">{lista.length}</p>
        </div>
        <button onClick={() => setForm({})}
          className="h-11 rounded-xl bg-marca text-white text-sm font-semibold active:bg-marca-oscuro">+ Nueva oferta</button>
      </div>

      {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}

      {cargando ? (
        <p className="text-center text-sm text-slate-400 py-8">Cargando…</p>
      ) : lista.length === 0 ? (
        <p className="text-center text-sm text-slate-400 py-8">Aún no hay ofertas. Crea una y aparece en una ventana al abrir el catálogo.</p>
      ) : (
        <ul className="grid gap-3 lg:grid-cols-2 lg:[&>li:last-child:nth-child(odd)]:col-span-2">
          {lista.map(o => {
            const e = estado(o)
            return (
              <li key={o.id}>
                <button onClick={() => setForm(o)}
                  className="w-full bg-white rounded-2xl shadow-sm p-3 grid grid-cols-[3.5rem_1fr_auto] gap-3 items-center text-left active:bg-slate-50">
                  <span className="h-14 w-14 rounded-xl bg-slate-100 overflow-hidden">
                    {o.imagen && <img src={o.imagen} alt="" className="w-full h-full object-cover" />}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold break-words">{o.titulo}</span>
                    <span className="block text-xs text-slate-400 break-words">
                      {CATALOGOS.find(c => c.id === o.catalogo)?.texto}{o.etiqueta ? ` · ${o.etiqueta}` : ''}{o.hasta ? ` · ${hastaTexto(o.hasta)}` : ''}
                    </span>
                  </span>
                  <span className={`text-[11px] font-medium rounded-full px-2.5 py-1 ${e.clase}`}>{e.texto}</span>
                </button>
              </li>
            )
          })}
        </ul>
      )}

      {form && <Formulario oferta={form.id ? form : null} onGuardado={() => { setForm(null); cargar() }} onCerrar={() => setForm(null)} />}
    </div>
  )
}
