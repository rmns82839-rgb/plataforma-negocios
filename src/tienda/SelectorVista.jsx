// Dos palabras discretas al pie: «Vista: celular · computador». Solo aparece en celulares.
import { useState } from 'react'
import { esCelular, vistaActual, cambiarVista } from '../lib/vistaPantalla'

export default function SelectorVista({ oscuro = false, className = '' }) {
  const [visible] = useState(() => esCelular())
  if (!visible) return null
  const actual = vistaActual()
  const base = oscuro ? 'text-hueso/45' : 'text-slate-400'
  const Op = ({ v, texto }) => (
    <button type="button" onClick={() => actual !== v && cambiarVista(v)} aria-pressed={actual === v}
      className={`min-h-[40px] px-2 ${actual === v ? 'font-semibold underline underline-offset-4' : 'hover:underline'}`}>{texto}</button>
  )
  return (
    <p className={`flex items-center justify-center gap-1 text-xs ${base} ${className}`}>
      <span>Vista:</span><Op v="celular" texto="celular" /><span aria-hidden="true">·</span><Op v="computador" texto="computador" />
    </p>
  )
}
