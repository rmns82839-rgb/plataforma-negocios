import { useState } from 'react'
import { fotosDe } from '../lib/fotos'

// Foto pequeña de un producto (la primera del catálogo). Sin foto o si falla al cargar: un cuadro con la inicial.
export default function Miniatura({ producto, tam = 'h-12 w-12' }) {
  const [fallo, setFallo] = useState(false)
  const src = fotosDe(producto)[0]
  const caja = `${tam} shrink-0 rounded-xl overflow-hidden bg-slate-100 grid place-items-center`
  if (!src || fallo) {
    return <div className={`${caja} text-slate-400 font-semibold`} aria-hidden="true">{(producto?.nombre ?? '?').trim().charAt(0).toUpperCase()}</div>
  }
  return (
    <div className={caja}>
      <img src={src} alt="" loading="lazy" decoding="async" onError={() => setFallo(true)} className="h-full w-full object-cover" />
    </div>
  )
}
