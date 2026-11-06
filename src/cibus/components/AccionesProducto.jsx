import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { comprimirImagen } from '../lib/imagen'
import { MAX_FOTOS } from '../lib/fotos'
import { esGenerica } from '../lib/imagenGenerica'
import { enlaceGoogle } from '../lib/googleImagenes'

// Desplegable sutil debajo de cada producto con lo más usado para ponerle foto: Foto (cámara), Subir (galería), Google y Editar.
// Una foto nueva SOLO se suma: nunca reemplaza ni quita las que ya tiene. Si lo único que tenía era la imagen genérica, la nueva pasa a ser la portada.
export default function AccionesProducto({ producto, abierto, onToggle, onEditar, onHecho }) {
  const [estado, setEstado] = useState('')        // '' | 'subiendo' | mensaje
  const subir = async (e) => {
    const archivo = e.target.files?.[0]; e.target.value = ''
    if (!archivo) return
    setEstado('subiendo')
    try {
      const { data: actual } = await supabase.from('productos').select('imagenes, imagen_url').eq('id', producto.id).maybeSingle()
      const previas = actual?.imagenes?.length ? actual.imagenes : (actual?.imagen_url ? [actual.imagen_url] : [])
      if (previas.length >= MAX_FOTOS) { setEstado(`Ya tiene ${MAX_FOTOS} fotos`); return }
      const blob = await comprimirImagen(archivo, 1000, 0.8)
      const ruta = `productos/${crypto.randomUUID()}.jpg`
      const { error: e1 } = await supabase.storage.from('prendas').upload(ruta, blob, { contentType: 'image/jpeg', cacheControl: '31536000' })
      if (e1) throw e1
      const url = supabase.storage.from('prendas').getPublicUrl(ruta).data.publicUrl
      const soloGenericas = previas.length > 0 && previas.every(esGenerica)
      const todas = soloGenericas ? [url, ...previas] : [...previas, url]
      const { error: e2 } = await supabase.from('productos').update({ imagenes: todas }).eq('id', producto.id)
      if (e2) throw e2
      setEstado('✓ Foto guardada'); onHecho?.(producto, todas)
    } catch (err) {
      setEstado('No se pudo: ' + (err?.message || 'intenta de nuevo'))
    }
  }
  const ocupado = estado === 'subiendo'
  const boton = 'min-h-12 rounded-lg bg-slate-50 ring-1 ring-slate-200 text-slate-700 text-xs font-semibold grid place-items-center gap-0.5 py-1 active:bg-slate-100 cursor-pointer'
  return (
    <div className="sm:col-span-2">
      <button type="button" onClick={onToggle} aria-expanded={abierto}
        className="w-full min-h-8 text-xs text-slate-400 active:text-slate-600">
        {abierto ? 'Cerrar acciones ▴' : 'Acciones ▾'}
      </button>
      {abierto && (
        <div className="space-y-1.5">
          <div className="grid grid-cols-4 gap-2">
            <label className={`${boton} ${ocupado ? 'opacity-40' : ''}`}>
              <span aria-hidden="true">📷</span><span>Foto</span>
              <input type="file" accept="image/*" capture="environment" className="hidden" onChange={subir} disabled={ocupado} />
            </label>
            <label className={`${boton} ${ocupado ? 'opacity-40' : ''}`}>
              <span aria-hidden="true">🖼️</span><span>Subir</span>
              <input type="file" accept="image/*" className="hidden" onChange={subir} disabled={ocupado} />
            </label>
            <a href={enlaceGoogle(producto)} target="_blank" rel="noopener noreferrer" className={boton}>
              <span aria-hidden="true">🔎</span><span>Google</span>
            </a>
            <button type="button" onClick={onEditar} className={boton}>
              <span aria-hidden="true">✏️</span><span>Editar</span>
            </button>
          </div>
          {estado && <p className={`text-xs text-center ${estado.startsWith('No se pudo') || estado.startsWith('Ya tiene') ? 'text-red-600' : 'text-slate-500'}`}>{estado === 'subiendo' ? 'Subiendo…' : estado}</p>}
        </div>
      )}
    </div>
  )
}
