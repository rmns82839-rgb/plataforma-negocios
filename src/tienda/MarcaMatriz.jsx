// Marca de la plataforma: Matriz — «El origen de lo bueno».
// Paleta: Negro #0B0B0C · Champagne #D8B978 · Oro hondo #A8803A · Esmeralda #0B6B4A (solo el brote) · Hueso #F7F4EC.
// Sobre fondo claro se usa el oro hondo; el degradado champagne solo va sobre negro (norma de la marca).
import { useId } from 'react'

export function Isotipo({ tamano = 64, oscuro = false, className = '' }) {
  const id = useId().replace(/:/g, '')
  const a = oscuro ? '#E9D29B' : '#B98E45'
  const b = oscuro ? '#D8B978' : '#A8803A'
  const c = oscuro ? '#A8803A' : '#8C6A2B'
  return (
    <svg width={tamano} height={tamano} viewBox="0 0 100 100" role="img" aria-label="Matriz" className={className}>
      <defs>
        <linearGradient id={`g${id}`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor={a} /><stop offset=".55" stopColor={b} /><stop offset="1" stopColor={c} /></linearGradient>
        <mask id={`m${id}`} maskUnits="userSpaceOnUse" x="0" y="0" width="100" height="100">
          <rect width="100" height="100" fill="#fff" />
          <polygon points="50,52 46,0 78,0" fill="#000" />
        </mask>
      </defs>
      <path mask={`url(#m${id})`} fill={`url(#g${id})`} fillRule="evenodd" d="M50 12a40 40 0 1 1 0 80a40 40 0 1 1 0-80zM47 18a34 34 0 1 0 0 68a34 34 0 1 0 0-68z" />
      <path fill={`url(#g${id})`} d="M56 27C68 41 66 62 44 77C36 58 42 38 56 27Z" />
      <path fill="#0B6B4A" d="M58 33C62 27 69 25 76 26C74 33 67 37 58 37Z" />
    </svg>
  )
}

// Marca completa: isotipo + MATRIZ + eslogan
export default function MarcaMatriz({ oscuro = false, tamano = 72, eslogan = true }) {
  const tinta = oscuro ? 'text-[#D8B978]' : 'text-[#1B1B1F]'
  const suave = oscuro ? 'text-[#D8B978]/80' : 'text-[#A8803A]'
  return (
    <div className="flex flex-col items-center text-center">
      <Isotipo tamano={tamano} oscuro={oscuro} />
      <p className={`mt-2 font-serif text-4xl font-light leading-none tracking-[0.34em] ${tinta}`} style={{ paddingLeft: '0.34em' }}>MATRIZ</p>
      {eslogan && <p className={`mt-2 text-xs font-light uppercase tracking-[0.3em] ${suave}`} style={{ paddingLeft: '0.3em' }}>El origen de lo bueno</p>}
    </div>
  )
}
