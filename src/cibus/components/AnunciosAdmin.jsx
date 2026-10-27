// Publicidad (ventana emergente) de los catálogos. Solo el dueño. Cada anuncio tiene un interruptor para apagarlo en un toque.
import { useCallback, useEffect, useRef, useState } from 'react'
import { usePersistido, borrarBorradores, TREINTA_MIN } from '../lib/usePersistido'
import { supabase } from '../lib/supabase'
import { claseInput } from '../lib/estilos'
import { useDueno } from '../context/rol'
import { hastaTexto } from '../lib/ofertas'
import Modal, { Campo } from './Modal'
import FotosEditor from './FotosEditor'
import AnuncioTarjeta from './AnuncioTarjeta'
import { confirmar } from '../lib/confirmar'
import { subirVideo, borrarVideo, limpiarVideosVencidos, fechaMasDias, MAX_VIDEO_MB, MAX_VIDEO_SEG, MAX_DIAS_VIDEO } from '../lib/videoAnuncios'

const CATALOGOS = [{ id: 'tienda', texto: 'Tienda' }, { id: 'ropa', texto: 'Ropa' }, { id: 'ambos', texto: 'Ambos' }]
const FRECUENCIAS = [{ id: 'sesion', texto: 'Una vez por visita' }, { id: 'dia', texto: 'Una vez al día' }]
const SEGUNDOS = [{ id: 5, texto: '5 segundos' }, { id: 8, texto: '8 segundos' }, { id: 12, texto: '12 segundos' }, { id: 0, texto: 'No se cierra sola' }]
const hoy = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date())

const estado = (a) => {
  if (!a.activa) return { texto: 'Apagado', clase: 'bg-slate-100 text-slate-500' }
  const h = hoy()
  if (a.desde && a.desde > h) return { texto: 'Programado', clase: 'bg-champagne/30 text-oro-oscuro' }
  if (a.hasta && a.hasta < h) return { texto: 'Vencido', clase: 'bg-slate-100 text-slate-500' }
  return { texto: 'Visible', clase: 'bg-esmeralda/10 text-esmeralda' }
}

function Formulario({ anuncio, onGuardado, onCerrar }) {
  const editando = Boolean(anuncio?.id)
  const [f, setF] = usePersistido(`anuncio:${anuncio?.id ?? 'nuevo'}:form`, {
    catalogo: anuncio?.catalogo ?? 'tienda', titulo: anuncio?.titulo ?? '', texto: anuncio?.texto ?? '',
    boton_texto: anuncio?.boton_texto ?? '', boton_enlace: anuncio?.boton_enlace ?? '',
    frecuencia: anuncio?.frecuencia ?? 'dia', segundos: anuncio ? (anuncio.segundos ?? 0) : 8, desde: anuncio?.desde ?? '', hasta: anuncio?.hasta ?? '', activa: anuncio?.activa ?? true,
  })
  const [fotos, setFotos] = usePersistido(`anuncio:${anuncio?.id ?? 'nuevo'}:fotos`, anuncio?.imagen ? [anuncio.imagen] : [])
  const [video, setVideo] = useState(anuncio?.video ?? null)
  const [subiendoVideo, setSubiendoVideo] = useState(false)
  const subidoSinGuardar = useRef(null)          // video subido en esta ventana que todavía no se guardó en el anuncio
  const cerrar = async () => {
    if (subidoSinGuardar.current) await borrarVideo(subidoSinGuardar.current)     // si cancela, no queda un video huérfano ocupando espacio
    borrarBorradores('anuncio:'); onCerrar()
  }
  const [error, setError] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [previa, setPrevia] = useState(false)
  const set = (k) => (e) => setF(p => ({ ...p, [k]: e.target.value }))
  const fila = () => ({
    catalogo: f.catalogo, titulo: f.titulo.trim(), texto: f.texto.trim() || null, imagen: fotos[0] ?? null,
    boton_texto: f.boton_texto.trim() || null, boton_enlace: f.boton_enlace.trim() || null,
    frecuencia: f.frecuencia, segundos: f.segundos || null, desde: f.desde || null, hasta: f.hasta || null, activa: f.activa,
    ...(video || anuncio?.video ? { video } : {}),      // sin video no se toca la columna (así funciona aunque falte migracion-v40)
  })
  const elegirVideo = async (e) => {
    const archivo = e.target.files?.[0]; e.target.value = ''
    if (!archivo) return
    setSubiendoVideo(true); setError('')
    const r = await subirVideo(archivo)
    setSubiendoVideo(false)
    if (r.error) return setError(r.error)
    if (subidoSinGuardar.current) await borrarVideo(subidoSinGuardar.current)     // reemplazó uno que acababa de subir
    subidoSinGuardar.current = r.url
    setVideo(r.url)
    setF(p => (p.hasta ? p : { ...p, hasta: fechaMasDias(7) }))      // propone 7 días; puede cambiarla
  }
  const quitarVideo = async () => {
    if (!(await confirmar({ titulo: '¿Quitar el video?', texto: 'Se borra también del almacenamiento.', si: 'Sí, quitar' }))) return
    if (subidoSinGuardar.current) { await borrarVideo(subidoSinGuardar.current); subidoSinGuardar.current = null }
    setVideo(null)         // el video que ya estaba guardado se borra al guardar el anuncio
  }

  const guardar = async () => {
    if (!f.titulo.trim()) return setError('Escribe el título del anuncio')
    if (f.boton_enlace.trim() && !/^https?:\/\//i.test(f.boton_enlace.trim())) return setError('El enlace debe empezar por https://')
    if (f.desde && f.hasta && f.desde > f.hasta) return setError('La fecha final no puede ser anterior a la inicial')
    if (video && !f.hasta) return setError('Con video, elige la fecha “Hasta”: el video se borra solo ese día')
    if (video && f.hasta > fechaMasDias(MAX_DIAS_VIDEO)) return setError(`Con video, la fecha “Hasta” puede ser de máximo ${MAX_DIAS_VIDEO} días desde hoy`)
    setGuardando(true); setError('')
    const { error: err } = editando
      ? await supabase.from('anuncios').update(fila()).eq('id', anuncio.id)
      : await supabase.from('anuncios').insert(fila())
    setGuardando(false)
    if (err) return setError(/anuncios_video_con_fecha|column .*video/i.test(err.message) ? 'Falta ejecutar migracion-v40.sql en Supabase' : err.message)
    subidoSinGuardar.current = null
    if (anuncio?.video && anuncio.video !== video) await borrarVideo(anuncio.video)     // el video anterior se borra del almacenamiento
    borrarBorradores('anuncio:')
    onGuardado()
  }
  const borrar = async () => {
    if (!(await confirmar({ titulo: '¿Borrar este anuncio?', texto: 'No se puede deshacer.', si: 'Sí, borrar' }))) return
    const { error: err } = await supabase.from('anuncios').delete().eq('id', anuncio.id)
    if (err) return setError(err.message)
    if (anuncio.video) await borrarVideo(anuncio.video)
    if (subidoSinGuardar.current) await borrarVideo(subidoSinGuardar.current)
    onGuardado()
  }

  return (
    <>
      <Modal titulo={editando ? 'Editar anuncio' : 'Nuevo anuncio'} onCerrar={cerrar}>
        <div className="space-y-2">
          <p className="text-xs font-medium text-slate-500">¿Dónde se muestra?</p>
          <div className="grid grid-cols-3 gap-2">
            {CATALOGOS.map(c => (
              <button key={c.id} onClick={() => setF(p => ({ ...p, catalogo: c.id }))}
                className={`h-11 rounded-xl text-sm font-medium ${f.catalogo === c.id ? 'bg-marca text-white' : 'bg-slate-100 text-slate-600'}`}>{c.texto}</button>
            ))}
          </div>
        </div>
        <Campo etiqueta="Título"><input value={f.titulo} onChange={set('titulo')} maxLength={80} placeholder="Ej: Pon tu publicidad aquí" className={claseInput} /></Campo>
        <Campo etiqueta="Texto (opcional)">
          <textarea value={f.texto} onChange={set('texto')} maxLength={300} rows={3} placeholder="Qué quieres decirle al cliente" className={`${claseInput} h-auto py-3`} />
        </Campo>
        <div className="grid grid-cols-2 gap-3">
          <Campo etiqueta="Texto del botón (opcional)"><input value={f.boton_texto} onChange={set('boton_texto')} maxLength={30} placeholder="Ej: Ver más" className={claseInput} /></Campo>
          <Campo etiqueta="Enlace del botón"><input value={f.boton_enlace} onChange={set('boton_enlace')} inputMode="url" placeholder="https://… (vacío = WhatsApp)" className={claseInput} /></Campo>
        </div>
        <div className="space-y-2">
          <p className="text-xs font-medium text-slate-500">¿Cada cuánto le sale al cliente?</p>
          <div className="grid grid-cols-2 gap-2">
            {FRECUENCIAS.map(c => (
              <button key={c.id} onClick={() => setF(p => ({ ...p, frecuencia: c.id }))}
                className={`h-11 rounded-xl text-sm font-medium ${f.frecuencia === c.id ? 'bg-marca text-white' : 'bg-slate-100 text-slate-600'}`}>{c.texto}</button>
            ))}
          </div>
        </div>
        <div className="space-y-2">
          <p className="text-xs font-medium text-slate-500">¿Cuánto tiempo se queda en pantalla?</p>
          <div className="grid grid-cols-2 gap-2">
            {SEGUNDOS.map(c => (
              <button key={c.id} onClick={() => setF(p => ({ ...p, segundos: c.id }))}
                className={`h-11 rounded-xl text-sm font-medium ${Number(f.segundos) === c.id ? 'bg-marca text-white' : 'bg-slate-100 text-slate-600'}`}>{c.texto}</button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Campo etiqueta="Desde (opcional)"><input type="date" value={f.desde} onChange={set('desde')} className={claseInput} /></Campo>
          <Campo etiqueta="Hasta (opcional)"><input type="date" value={f.hasta} onChange={set('hasta')} className={claseInput} /></Campo>
        </div>
        <FotosEditor fotos={fotos} onChange={setFotos} carpeta="anuncios/" max={1} />
        <div className="space-y-2 rounded-2xl bg-slate-50 p-3">
          <p className="text-sm font-semibold text-slate-700">Video corto (opcional)</p>
          <p className="text-sm text-slate-500">Máximo {MAX_VIDEO_SEG} segundos y {MAX_VIDEO_MB} MB. Es temporal: se borra solo el día de “Hasta” (máximo {MAX_DIAS_VIDEO} días) y no ocupa espacio después. La foto de arriba se ve mientras carga.</p>
          {video && <video src={video} controls muted playsInline className="w-full max-h-56 rounded-xl bg-black" />}
          <div className="grid grid-cols-2 gap-2">
            <label className={`min-h-12 rounded-xl grid place-items-center text-base font-semibold text-center px-2 leading-tight ${subiendoVideo ? 'bg-slate-200 text-slate-400' : 'bg-marca text-white active:bg-marca-oscuro'}`}>
              {subiendoVideo ? 'Subiendo…' : video ? 'Cambiar video' : 'Subir video'}
              <input type="file" accept="video/mp4,video/webm,video/quicktime" onChange={elegirVideo} disabled={subiendoVideo} className="hidden" />
            </label>
            <button onClick={quitarVideo} disabled={!video || subiendoVideo} className="min-h-12 rounded-xl bg-red-50 text-red-600 text-base font-semibold disabled:opacity-40">Quitar video</button>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <button onClick={() => setF(p => ({ ...p, activa: true }))} className={`h-11 rounded-xl text-sm font-medium ${f.activa ? 'bg-marca text-white' : 'bg-slate-100 text-slate-600'}`}>Encendido</button>
          <button onClick={() => setF(p => ({ ...p, activa: false }))} className={`h-11 rounded-xl text-sm font-medium ${!f.activa ? 'bg-marca text-white' : 'bg-slate-100 text-slate-600'}`}>Apagado</button>
        </div>
        {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
        <button onClick={() => f.titulo.trim() ? setPrevia(true) : setError('Escribe el título para ver la vista previa')}
          className="w-full h-11 rounded-xl bg-slate-100 text-slate-700 text-sm font-medium">Ver cómo se ve</button>
        <div className={`grid gap-3 ${editando ? 'grid-cols-2' : 'grid-cols-1'}`}>
          {editando && <button onClick={borrar} className="h-12 rounded-xl bg-red-50 text-red-600 font-semibold">Borrar</button>}
          <button onClick={guardar} disabled={guardando} className="h-12 rounded-xl bg-marca text-white font-semibold disabled:opacity-40 active:bg-marca-oscuro">{guardando ? 'Guardando…' : 'Guardar'}</button>
        </div>
      </Modal>
      {previa && (
        <div className="fixed inset-0 z-[80] grid place-items-center p-5 bg-black/60" onClick={() => setPrevia(false)}>
          <div onClick={e => e.stopPropagation()} className="w-full grid place-items-center">
            <AnuncioTarjeta anuncio={{ ...fila(), titulo: f.titulo.trim() }} vistaPrevia cierreAuto onCerrar={() => setPrevia(false)} />
          </div>
        </div>
      )}
    </>
  )
}

export default function AnunciosAdmin() {
  const dueno = useDueno()
  const [lista, setLista] = useState([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [form, setForm] = usePersistido('anuncios:form', null, true, TREINTA_MIN)

  const cargar = useCallback(async () => {
    const { data, error: err } = await supabase.from('anuncios').select('*').order('creado_en', { ascending: false }).range(0, 99)
    setError(err ? (/anuncios|schema cache|does not exist/i.test(err.message) ? 'Falta ejecutar migracion-v23.sql en Supabase.' : err.message) : '')
    setLista(data ?? [])
    setCargando(false)
  }, [])
  useEffect(() => { if (dueno) limpiarVideosVencidos().finally(cargar) }, [cargar, dueno])

  const alternar = async (a) => {
    const { error: err } = await supabase.from('anuncios').update({ activa: !a.activa }).eq('id', a.id)
    if (err) return setError(err.message)
    cargar()
  }

  if (!dueno) return <p className="text-center text-sm text-slate-400 py-8">Solo el dueño administra la publicidad.</p>
  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl shadow-sm p-4 space-y-3">
        <p className="text-sm text-slate-600">Una ventana de publicidad que sale al entrar al catálogo. Solo se muestra <b>un anuncio a la vez</b> (el más reciente que esté encendido). Apágalo con el interruptor cuando no lo quieras.</p>
        <button onClick={() => setForm({})} className="w-full h-11 rounded-xl bg-marca text-white text-sm font-semibold active:bg-marca-oscuro">+ Nuevo anuncio</button>
      </div>
      {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
      {cargando ? <p className="text-center text-sm text-slate-400 py-8">Cargando…</p>
        : lista.length === 0 ? <p className="text-center text-sm text-slate-400 py-8">Aún no hay anuncios.</p>
        : (
        <ul className="grid gap-3 lg:grid-cols-2 lg:[&>li:last-child:nth-child(odd)]:col-span-2">
          {lista.map(a => {
            const e = estado(a)
            return (
              <li key={a.id} className="bg-white rounded-2xl shadow-sm p-3 space-y-3">
                <button onClick={() => setForm(a)} className="w-full grid grid-cols-[3.5rem_1fr_auto] gap-3 items-center text-left">
                  <span className="h-14 w-14 rounded-xl bg-slate-100 overflow-hidden">{a.imagen && <img src={a.imagen} alt="" className="w-full h-full object-cover" />}</span>
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold">{a.titulo}</span>
                    <span className="block text-xs text-slate-400">{a.video ? '🎬 Con video · ' : ''}{CATALOGOS.find(c => c.id === a.catalogo)?.texto} · {a.frecuencia === 'dia' ? 'una vez al día' : 'una vez por visita'}{a.hasta ? ` · ${hastaTexto(a.hasta)}` : ''}</span>
                  </span>
                  <span className={`text-[11px] font-medium rounded-full px-2.5 py-1 ${e.clase}`}>{e.texto}</span>
                </button>
                <button onClick={() => alternar(a)} role="switch" aria-checked={a.activa}
                  className={`w-full h-11 rounded-xl grid grid-cols-[1fr_auto] items-center px-4 text-sm font-medium ${a.activa ? 'bg-esmeralda/10 text-esmeralda' : 'bg-slate-100 text-slate-500'}`}>
                  <span>{a.activa ? 'Encendido: lo ven los clientes' : 'Apagado: nadie lo ve'}</span>
                  <span className={`h-6 w-11 rounded-full p-0.5 transition ${a.activa ? 'bg-esmeralda' : 'bg-slate-300'}`}>
                    <span className={`block h-5 w-5 rounded-full bg-white transition-transform ${a.activa ? 'translate-x-5' : ''}`} />
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
      {form && <Formulario anuncio={form.id ? form : null} onGuardado={() => { setForm(null); cargar() }} onCerrar={() => setForm(null)} />}
    </div>
  )
}
