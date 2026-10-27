import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { comprimirImagen } from '../lib/imagen'
import { MAX_FOTOS } from '../lib/fotos'

// Un toque: abre la cámara, y la foto queda guardada en ese producto (sin entrar al formulario).
// Se puede tocar varias veces para sumar fotos al carrusel (hasta el máximo). Nunca reemplaza ni quita fotos que ya estaban.
export default function FotoRapida({ producto, nuevas = 0, onHecho }) {
  const [estado, setEstado] = useState('')       // '' | 'subiendo' | mensaje de error
  const subir = async (e) => {
    const archivo = e.target.files?.[0]; e.target.value = ''
    if (!archivo) return
    setEstado('subiendo')
    try {
      const { data: actual } = await supabase.from('productos').select('imagenes, imagen_url').eq('id', producto.id).maybeSingle()
      const previas = actual?.imagenes?.length ? actual.imagenes : (actual?.imagen_url ? [actual.imagen_url] : [])
      // si ya tenía fotos que NO son de esta sesión (alguien las subió mientras tanto), no se toca nada
      if (previas.length > nuevas) { setEstado(''); return onHecho(producto, previas, 0) }
      if (previas.length >= MAX_FOTOS) { setEstado(`Ya tiene ${MAX_FOTOS} fotos`); return }
      const blob = await comprimirImagen(archivo, 1000, 0.8)
      const ruta = `productos/${crypto.randomUUID()}.jpg`
      const { error: e1 } = await supabase.storage.from('prendas').upload(ruta, blob, { contentType: 'image/jpeg' })
      if (e1) throw e1
      const url = supabase.storage.from('prendas').getPublicUrl(ruta).data.publicUrl
      const todas = [...previas, url]
      const { error: e2 } = await supabase.from('productos').update({ imagenes: todas }).eq('id', producto.id)
      if (e2) throw e2
      setEstado(''); onHecho(producto, todas, nuevas + 1)
    } catch (err) {
      setEstado('No se pudo: ' + (err?.message || 'intenta de nuevo'))
    }
  }
  return (
    <label className={`h-10 px-3 rounded-lg text-xs font-semibold grid place-items-center cursor-pointer whitespace-nowrap ${
      estado && estado !== 'subiendo' ? 'bg-red-50 text-red-600' : nuevas > 0 ? 'bg-esmeralda/15 text-esmeralda' : 'bg-lima/20 text-marca active:bg-lima/30'}`}>
      {estado === 'subiendo' ? 'Subiendo…' : estado ? 'Reintentar' : nuevas > 0 ? `✓ ${nuevas} · 📷 +` : '📷 Foto'}
      <input type="file" accept="image/*" capture="environment" className="hidden" onChange={subir} disabled={estado === 'subiendo'} />
    </label>
  )
}
