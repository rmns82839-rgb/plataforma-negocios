import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { comprimirImagen } from '../lib/imagen'
import { MAX_FOTOS, urlFoto } from '../lib/fotos'
import { confirmar } from '../lib/confirmar'

// Subir, quitar y ordenar fotos (la primera es la portada). Se guardan en el bucket "prendas".
export default function FotosEditor({ fotos, onChange, carpeta = '', max = MAX_FOTOS, bucket = 'prendas' }) {
  const [subiendo, setSubiendo] = useState(false)
  const [error, setError] = useState('')

  const subir = async (e) => {
    const archivos = [...(e.target.files ?? [])].slice(0, max - fotos.length)
    e.target.value = ''
    if (!archivos.length) return
    setSubiendo(true); setError('')
    try {
      const nuevas = []
      for (const archivo of archivos) {
        const blob = await comprimirImagen(archivo)
        const ruta = `${carpeta}${crypto.randomUUID()}.jpg`
        const { error: err } = await supabase.storage
          .from(bucket).upload(ruta, blob, { contentType: 'image/jpeg' })
        if (err) throw err
        nuevas.push(supabase.storage.from(bucket).getPublicUrl(ruta).data.publicUrl)
      }
      onChange([...fotos, ...nuevas])
    } catch (err) {
      setError('No se pudo subir la foto: ' + err.message)
    }
    setSubiendo(false)
  }

  const quitar = async (i) => {
    if (!(await confirmar({ titulo: '¿Quitar esta foto?', texto: 'Dejará de verse cuando guardes.' }))) return
    onChange(fotos.filter((_, j) => j !== i))
  }
  const portada = (i) => onChange([fotos[i], ...fotos.filter((_, j) => j !== i)])

  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-slate-500">
        {max === 1 ? 'Foto (opcional)' : `Fotos (${fotos.length}/${max}) · la primera es la portada`}
      </p>
      <div className="grid grid-cols-5 gap-2">
        {fotos.map((src, i) => (
          <div key={src} className="relative aspect-square rounded-lg overflow-hidden bg-slate-100">
            <img src={urlFoto(src)} alt="" className="w-full h-full object-cover" />
            <button onClick={() => quitar(i)} aria-label="Quitar foto"
              className="absolute top-0.5 right-0.5 h-5 w-5 rounded-full bg-black/60 text-white text-[10px]">✕</button>
            {i === 0 ? (
              <span className="absolute bottom-0 inset-x-0 bg-marca/80 text-white text-[9px] text-center py-0.5">Portada</span>
            ) : (
              <button onClick={() => portada(i)} aria-label="Usar como portada"
                className="absolute bottom-0.5 left-0.5 h-5 w-5 rounded-full bg-white/85 text-[11px] text-marca">★</button>
            )}
          </div>
        ))}
        {fotos.length < max && (
          <label className="aspect-square rounded-lg border border-dashed border-marca/40 text-marca text-xl grid place-items-center cursor-pointer active:bg-lima/10">
            {subiendo ? <span className="text-[10px]">…</span> : '+'}
            <input type="file" accept="image/*" multiple onChange={subir} disabled={subiendo} className="hidden" />
          </label>
        )}
      </div>
      {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
    </div>
  )
}
