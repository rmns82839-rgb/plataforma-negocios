import { useState } from 'react'
import { supabase, negocioActual } from '../lib/supabase'
import { comprimirImagen } from '../lib/imagen'
import { MAX_FOTOS, fotosDe } from '../lib/fotos'
import { esGenerica } from '../lib/imagenGenerica'
import { enlaceGoogle } from '../lib/googleImagenes'
import { descargarFotos } from '../lib/descargarFotos'

// Desplegable sutil debajo de cada producto para ponerle foto rápido: Foto (cámara), Subir (galería), Pegar (lo copiado de Google),
// Google, Editar y Bajar. Una foto nueva SOLO se suma: nunca reemplaza ni quita las que ya tiene.
// Si lo único que tenía era la imagen genérica, la nueva pasa a ser la portada.
export default function AccionesProducto({ producto, abierto, onToggle, onEditar, onHecho }) {
  const [msg, setMsg] = useState({ tipo: '', texto: '' })        // tipo: '' | 'ok' | 'error' | 'ocupado'
  const ocupado = msg.tipo === 'ocupado'
  const aviso = (tipo, texto) => setMsg({ tipo, texto })

  // Trae una foto desde un enlace de internet por medio del servidor (el navegador no puede leer fotos de otras páginas)
  const traerPorEnlace = async (url) => {
    if (!/^https?:\/\//i.test(url)) throw new Error('Lo copiado no es una imagen ni un enlace. En Google deja pulsada la foto y elige «Copiar imagen».')
    const { data: s } = await supabase.auth.getSession()
    const token = s?.session?.access_token
    if (!token) throw new Error('Tu sesión venció. Vuelve a entrar.')
    const r = await fetch('/api/traer-foto', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ url, negocio_id: negocioActual() }) })
    if (r.status === 404) throw new Error('Aquí aún no se pueden traer fotos por enlace. Copia la imagen (no la dirección) o usa Subir.')
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `Error ${r.status}`)
    return r.blob()
  }

  const guardar = async (archivo) => {
    const { data: actual } = await supabase.from('productos').select('imagenes, imagen_url').eq('id', producto.id).maybeSingle()
    const previas = actual?.imagenes?.length ? actual.imagenes : (actual?.imagen_url ? [actual.imagen_url] : [])
    if (previas.length >= MAX_FOTOS) throw new Error(`Ya tiene ${MAX_FOTOS} fotos`)
    const blob = await comprimirImagen(archivo, 1000, 0.8)
    const ruta = `productos/${crypto.randomUUID()}.jpg`
    const { error: e1 } = await supabase.storage.from('prendas').upload(ruta, blob, { contentType: 'image/jpeg', cacheControl: '31536000' })
    if (e1) throw e1
    const url = supabase.storage.from('prendas').getPublicUrl(ruta).data.publicUrl
    const soloGenericas = previas.length > 0 && previas.every(esGenerica)
    const todas = soloGenericas ? [url, ...previas] : [...previas, url]
    const { error: e2 } = await supabase.from('productos').update({ imagenes: todas }).eq('id', producto.id)
    if (e2) throw e2
    aviso('ok', '✓ Foto guardada'); onHecho?.(producto, todas)
  }
  const correr = async (trabajo) => {
    aviso('ocupado', 'Trabajando…')
    try { await trabajo() } catch (err) { aviso('error', err?.name === 'NotAllowedError' ? 'Permite «pegar» cuando el navegador lo pida y vuelve a intentar.' : (err?.message || 'No se pudo. Intenta de nuevo.')) }
  }

  const desdeArchivo = (e) => {
    const archivo = e.target.files?.[0]; e.target.value = ''
    if (archivo) correr(() => guardar(archivo))
  }
  const pegar = () => correr(async () => {
    let blob = null, texto = ''
    if (navigator.clipboard?.read) {
      for (const it of await navigator.clipboard.read()) {
        const tipo = it.types.find(t => t.startsWith('image/'))
        if (tipo) { blob = await it.getType(tipo); break }
        if (it.types.includes('text/plain')) texto = (await (await it.getType('text/plain')).text()).trim()
      }
    } else if (navigator.clipboard?.readText) texto = (await navigator.clipboard.readText()).trim()
    else throw new Error('Este navegador no deja pegar desde aquí. Usa Subir.')
    if (!blob) {
      if (!texto) throw new Error('No hay nada copiado. En Google deja pulsada la foto y elige «Copiar imagen».')
      blob = await traerPorEnlace(texto.split(/\s+/)[0])
    }
    await guardar(blob)
  })
  const bajar = () => correr(async () => {
    const r = await descargarFotos([producto], () => {})
    if (r.bajadas === 0) throw new Error('No se pudo bajar la foto. Revisa la conexión.')
    aviso('ok', '✓ Foto bajada')
  })

  const tieneFoto = fotosDe(producto).length > 0
  const base = 'min-w-0 min-h-14 rounded-lg bg-slate-50 ring-1 ring-slate-200 text-slate-700 text-[11px] leading-tight font-semibold grid grid-rows-[auto_auto] place-content-center justify-items-center gap-1 px-1 py-1.5 active:bg-slate-100 cursor-pointer'
  const boton = `${base} ${ocupado ? 'opacity-40' : ''}`
  return (
    <div className="col-span-full min-w-0">
      <button type="button" onClick={onToggle} aria-expanded={abierto}
        className="w-full min-h-8 text-xs text-slate-400 text-center active:text-slate-600">
        {abierto ? 'Cerrar acciones ▴' : 'Acciones ▾'}
      </button>
      {abierto && (
        <div className="space-y-1.5">
          <div className="grid grid-cols-3 gap-2 w-full">
            <label className={boton}>
              <span aria-hidden="true">📷</span><span>Foto</span>
              <input type="file" accept="image/*" capture="environment" className="hidden" onChange={desdeArchivo} disabled={ocupado} />
            </label>
            <label className={boton}>
              <span aria-hidden="true">🖼️</span><span>Subir</span>
              <input type="file" accept="image/*" className="hidden" onChange={desdeArchivo} disabled={ocupado} />
            </label>
            <button type="button" onClick={pegar} disabled={ocupado} className={boton}>
              <span aria-hidden="true">📋</span><span>Pegar</span>
            </button>
            <a href={enlaceGoogle(producto)} target="_blank" rel="noopener noreferrer" className={base}>
              <span aria-hidden="true">🔎</span><span>Google</span>
            </a>
            <button type="button" onClick={onEditar} className={base}>
              <span aria-hidden="true">✏️</span><span>Editar</span>
            </button>
            <button type="button" onClick={bajar} disabled={ocupado || !tieneFoto} className={`${base} ${ocupado || !tieneFoto ? 'opacity-40' : ''}`}>
              <span aria-hidden="true">⬇️</span><span>Bajar</span>
            </button>
          </div>
          {msg.texto && <p className={`text-xs text-center break-words ${msg.tipo === 'error' ? 'text-red-600' : 'text-slate-500'}`}>{msg.texto}</p>}
        </div>
      )}
    </div>
  )
}
