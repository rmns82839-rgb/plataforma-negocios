import { useCallback, useEffect, useState } from 'react'
import { supabase, urlImagen, urlMusica } from '../lib/supabase'
import { mensajeError } from '../lib/errores'
import { reducirImagen, nombreArchivo } from '../lib/imagen'
import { estrellasTexto, ingredientesDeTexto, ingredientesATexto, validarAudio, rutaMusica } from '../lib/vitrina'
import { Btn, Aviso, Campo, clsInput } from '../tienda/ui'
import { Titulo, Seccion, Insignia, Interruptor, Opciones, SoloLectura, fechaHora } from './piezas'

const TIPOS = [['desayuno', 'Desayuno'], ['almuerzo', 'Almuerzo'], ['cena', 'Cena'], ['otro', 'Otro']]

export default function Vitrina({ ctx, volver }) {
  const m = ctx.modulos
  const pestañas = [['opiniones', 'Opiniones'], ['menu', 'Menú del día'], ['musica', 'Música']]
    .filter(([k]) => m.includes({ opiniones: 'opiniones', menu: 'menu_del_dia', musica: 'musica_fondo' }[k]))
  const [vista, setVista] = useState(pestañas[0]?.[0])
  const puede = ctx.esDueno && !ctx.soloLectura

  return (
    <div>
      <button onClick={volver} className="mb-4 inline-flex min-h-[48px] items-center rounded-xl px-2 text-lg font-semibold text-principal hover:underline">← Volver al inicio</button>
      <Titulo sub="Lo que tus clientes ven y dicen de tu tienda">Opiniones, menú y música</Titulo>
      {ctx.soloLectura && <SoloLectura />}
      {pestañas.length === 0 && <Aviso>Tu plan todavía no incluye estas opciones. Puedes verlas en «Mi plan».</Aviso>}
      {pestañas.length > 1 && <div className="mb-5"><Opciones valor={vista} opciones={pestañas} onChange={setVista} columnas={pestañas.length === 3 ? 3 : 2} /></div>}
      {vista === 'opiniones' && <ListaOpiniones nid={ctx.neg.negocio_id} puede={puede} />}
      {vista === 'menu' && <MenuHoy nid={ctx.neg.negocio_id} puede={puede} />}
      {vista === 'musica' && <Musica nid={ctx.neg.negocio_id} puede={puede} />}
    </div>
  )
}

// ---------- Opiniones: aprobar, ocultar y responder ----------
function ListaOpiniones({ nid, puede }) {
  const [lista, setLista] = useState(null)
  const [resp, setResp] = useState({})
  const [error, setError] = useState('')
  const [ocupado, setOcupado] = useState('')
  const cargar = useCallback(async () => {
    const { data, error: e } = await supabase.rpc('listar_opiniones_admin', { p_negocio_id: nid })
    if (e) setError(mensajeError(e)); else { setLista(data || []); setResp(Object.fromEntries((data || []).map((o) => [o.id, o.respuesta || '']))) }
  }, [nid])
  useEffect(() => { cargar() }, [cargar])

  async function cambiar(o, estado) {
    setOcupado(o.id); setError('')
    const { error: e } = await supabase.rpc('moderar_opinion', { p_negocio_id: nid, p_id: o.id, p_estado: estado, p_respuesta: resp[o.id] || null })
    setOcupado('')
    if (e) return setError(mensajeError(e))
    cargar()
  }
  if (!lista) return <p className="py-8 text-center text-xl text-tinta/60">{error || 'Cargando…'}</p>
  const pendientes = lista.filter((o) => o.estado === 'pendiente').length
  return (
    <div>
      {error && <div className="mb-3"><Aviso tipo="error">{error}</Aviso></div>}
      {lista.length === 0 && <Aviso>Todavía nadie ha dejado una opinión.</Aviso>}
      {pendientes > 0 && <div className="mb-4"><Aviso tipo="previa"><b>{pendientes} {pendientes === 1 ? 'opinión espera' : 'opiniones esperan'} tu revisión.</b> Solo se publican cuando tú las apruebas.</Aviso></div>}
      <ul className="space-y-3">
        {lista.map((o) => (
          <li key={o.id} className="rounded-2xl border-2 border-black/5 bg-white p-4">
            <div className="flex items-baseline justify-between gap-3"><b className="break-words text-lg">{o.nombre}</b><span className="text-xl text-secundario" aria-label={`${o.estrellas} de 5`}>{estrellasTexto(o.estrellas)}</span></div>
            <p className="mb-2 text-base text-tinta/60">{fechaHora(o.creado_en)} · <Insignia tono={o.estado === 'publicado' ? 'verde' : o.estado === 'oculto' ? 'gris' : 'ambar'}>{o.estado === 'publicado' ? 'Publicada' : o.estado === 'oculto' ? 'Oculta' : 'Por revisar'}</Insignia></p>
            {o.texto && <p className="mb-3 break-words text-lg leading-snug">{o.texto}</p>}
            {puede && (
              <>
                <Campo etiqueta="Tu respuesta (opcional)"><textarea rows={2} maxLength={300} value={resp[o.id] ?? ''} onChange={(e) => setResp({ ...resp, [o.id]: e.target.value })} className={`${clsInput} py-3`} /></Campo>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <Btn variante="verde" disabled={ocupado === o.id} onClick={() => cambiar(o, 'publicado')}>{o.estado === 'publicado' ? 'Guardar respuesta' : 'Publicar'}</Btn>
                  <Btn variante="suave" disabled={ocupado === o.id || o.estado === 'oculto'} onClick={() => cambiar(o, 'oculto')}>Ocultar</Btn>
                </div>
              </>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}

// ---------- Menú del día ----------
function MenuHoy({ nid, puede }) {
  const [actual, setActual] = useState(undefined)
  const [f, setF] = useState({ nombre: '', descripcion: '', emoji: '🍲', tipo: 'almuerzo', ingredientes: '', foto: null, manana: false })
  const [msg, setMsg] = useState(null)
  const [ocupado, setOcupado] = useState(false)

  const cargar = useCallback(async () => {
    const { data, error } = await supabase.from('menu_hoy').select('*').eq('negocio_id', nid).maybeSingle()
    if (error) return setMsg({ tipo: 'error', texto: mensajeError(error) })
    setActual(data || null)
    if (data) setF({ nombre: data.nombre, descripcion: data.descripcion || '', emoji: data.emoji || '🍲', tipo: data.tipo || 'almuerzo', ingredientes: ingredientesATexto(data.ingredientes), foto: data.foto, manana: false })
  }, [nid])
  useEffect(() => { cargar() }, [cargar])

  async function subirFoto(e) {
    const a = e.target.files?.[0]; e.target.value = ''
    if (!a) return
    setOcupado(true); setMsg(null)
    try {
      const blob = await reducirImagen(a, 900)
      const ruta = `${nid}/anuncios/menu-${nombreArchivo()}`
      const { error } = await supabase.storage.from('negocios').upload(ruta, blob, { contentType: 'image/webp' })
      if (error) throw error
      setF((x) => ({ ...x, foto: ruta }))
    } catch (x) { setMsg({ tipo: 'error', texto: mensajeError(x) }) }
    setOcupado(false)
  }
  async function guardar() {
    setMsg(null)
    if (!f.nombre.trim()) return setMsg({ tipo: 'error', texto: 'Escribe el nombre del menú' })
    setOcupado(true)
    const { error } = await supabase.rpc('fijar_menu_hoy', {
      p_negocio_id: nid, p_menu_id: null, p_nombre: f.nombre, p_descripcion: f.descripcion, p_foto: f.foto, p_emoji: f.emoji,
      p_tipo: f.tipo, p_ingredientes: ingredientesDeTexto(f.ingredientes), p_manana: f.manana,
    })
    setOcupado(false)
    if (error) return setMsg({ tipo: 'error', texto: mensajeError(error) })
    setMsg({ tipo: 'ok', texto: f.manana ? 'Listo. El menú se mostrará mañana.' : 'Listo. Tus clientes ya ven el menú de hoy.' }); cargar()
  }
  async function quitar() {
    setOcupado(true)
    const { error } = await supabase.rpc('quitar_menu_hoy', { p_negocio_id: nid })
    setOcupado(false)
    if (error) return setMsg({ tipo: 'error', texto: mensajeError(error) })
    setActual(null); setF({ nombre: '', descripcion: '', emoji: '🍲', tipo: 'almuerzo', ingredientes: '', foto: null, manana: false }); setMsg({ tipo: 'ok', texto: 'Quitamos el menú del día.' })
  }
  if (actual === undefined) return <p className="py-8 text-center text-xl text-tinta/60">{msg?.texto || 'Cargando…'}</p>
  const foto = urlImagen(f.foto)
  return (
    <Seccion titulo={actual ? 'Menú elegido' : 'Elige el menú del día'}>
      {actual && <p className="mb-3 text-base text-tinta/70">Se muestra el día: <b>{actual.fecha}</b></p>}
      <div className="space-y-4">
        <Campo etiqueta="Nombre del menú"><input value={f.nombre} maxLength={120} disabled={!puede} onChange={(e) => setF({ ...f, nombre: e.target.value })} className={clsInput} /></Campo>
        <Campo etiqueta="Descripción (opcional)"><textarea rows={3} maxLength={400} disabled={!puede} value={f.descripcion} onChange={(e) => setF({ ...f, descripcion: e.target.value })} className={`${clsInput} py-3`} /></Campo>
        <div><p className="mb-2 text-lg font-semibold">Momento del día</p><Opciones valor={f.tipo} opciones={TIPOS} onChange={(v) => puede && setF({ ...f, tipo: v })} columnas={4} /></div>
        <Campo etiqueta="Dibujo (emoji)"><input value={f.emoji} maxLength={4} disabled={!puede} onChange={(e) => setF({ ...f, emoji: e.target.value })} className={clsInput} /></Campo>
        <Campo etiqueta="Qué trae (uno por línea)" ayuda="Máximo 20"><textarea rows={5} disabled={!puede} value={f.ingredientes} onChange={(e) => setF({ ...f, ingredientes: e.target.value })} className={`${clsInput} py-3`} /></Campo>
        <div>
          <p className="mb-2 text-lg font-semibold">Foto (opcional)</p>
          {foto && <img src={foto} alt="Foto del menú" className="mb-2 aspect-[16/9] w-full rounded-2xl bg-white object-cover" />}
          {puede && <label className="flex min-h-[56px] cursor-pointer items-center justify-center rounded-2xl border-2 border-principal/30 bg-white px-4 text-lg font-semibold text-principal">{foto ? 'Cambiar la foto' : 'Elegir una foto'}<input type="file" accept="image/*" className="sr-only" onChange={subirFoto} /></label>}
          {puede && foto && <Btn variante="suave" className="mt-2" onClick={() => setF({ ...f, foto: null })}>Quitar la foto</Btn>}
        </div>
        {puede && <Interruptor valor={f.manana} onChange={(v) => setF({ ...f, manana: v })} texto="Mostrarlo desde mañana" ayuda="Si no, se muestra hoy mismo" />}
        {msg && <Aviso tipo={msg.tipo}>{msg.texto}</Aviso>}
        {puede && <div className="grid grid-cols-2 gap-2"><Btn disabled={ocupado} onClick={guardar}>{ocupado ? 'Guardando…' : 'Guardar menú'}</Btn><Btn variante="suave" disabled={ocupado || !actual} onClick={quitar}>Quitar menú</Btn></div>}
      </div>
    </Seccion>
  )
}

// ---------- Música de fondo ----------
function Musica({ nid, puede }) {
  const [actual, setActual] = useState(undefined)
  const [msg, setMsg] = useState(null)
  const [ocupado, setOcupado] = useState(false)
  const cargar = useCallback(async () => {
    const { data, error } = await supabase.from('musica_fondo').select('*').eq('negocio_id', nid).maybeSingle()
    if (error) setMsg({ tipo: 'error', texto: mensajeError(error) }); else setActual(data || null)
  }, [nid])
  useEffect(() => { cargar() }, [cargar])

  async function subir(e) {
    const a = e.target.files?.[0]; e.target.value = ''
    const malo = validarAudio(a)
    if (malo) return setMsg({ tipo: 'error', texto: malo })
    setOcupado(true); setMsg(null)
    try {
      const ruta = rutaMusica(nid, a.type)
      const { error } = await supabase.storage.from('musica-negocios').upload(ruta, a, { contentType: a.type })
      if (error) throw error
      const { error: e2 } = await supabase.rpc('fijar_musica_fondo', { p_negocio_id: nid, p_ruta: ruta, p_nombre: a.name.replace(/\.[^.]+$/, '').slice(0, 80) })
      if (e2) { await supabase.storage.from('musica-negocios').remove([ruta]); throw e2 }
      if (actual?.ruta && actual.ruta !== ruta) await supabase.storage.from('musica-negocios').remove([actual.ruta])   // nunca se acumulan archivos
      setMsg({ tipo: 'ok', texto: 'Listo. La música ya está en tu tienda (el cliente la enciende con un botón).' }); cargar()
    } catch (x) { setMsg({ tipo: 'error', texto: mensajeError(x) }) }
    setOcupado(false)
  }
  async function quitar() {
    setOcupado(true)
    const { error } = await supabase.rpc('quitar_musica_fondo', { p_negocio_id: nid })
    if (error) { setOcupado(false); return setMsg({ tipo: 'error', texto: mensajeError(error) }) }
    if (actual?.ruta) await supabase.storage.from('musica-negocios').remove([actual.ruta])
    setOcupado(false); setActual(null); setMsg({ tipo: 'ok', texto: 'Quitamos la música.' })
  }
  if (actual === undefined) return <p className="py-8 text-center text-xl text-tinta/60">{msg?.texto || 'Cargando…'}</p>
  return (
    <Seccion titulo="Canción de fondo">
      <p className="mb-3 text-lg text-tinta/80">Una sola canción (MP3 o M4A, hasta 4 MB). En el celular de tu cliente solo suena si toca el botón «Poner música».</p>
      {actual ? (
        <div className="mb-4 rounded-2xl bg-principal/5 p-4"><p className="break-words text-lg font-semibold">🎵 {actual.nombre}</p><audio controls src={urlMusica(actual.ruta)} className="mt-2 w-full" /></div>
      ) : <div className="mb-4"><Aviso>Todavía no tienes música en tu tienda.</Aviso></div>}
      {msg && <div className="mb-4"><Aviso tipo={msg.tipo}>{msg.texto}</Aviso></div>}
      {puede && (
        <div className="grid grid-cols-2 gap-2">
          <label className={`flex min-h-[56px] cursor-pointer items-center justify-center rounded-2xl bg-principal px-3 text-center text-lg font-semibold text-white ${ocupado ? 'opacity-50' : ''}`}>{ocupado ? 'Subiendo…' : actual ? 'Cambiar canción' : 'Subir canción'}<input type="file" accept="audio/*" disabled={ocupado} className="sr-only" onChange={subir} /></label>
          <Btn variante="suave" disabled={ocupado || !actual} onClick={quitar}>Quitar música</Btn>
        </div>
      )}
    </Seccion>
  )
}
