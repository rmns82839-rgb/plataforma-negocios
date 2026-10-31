// Lista desplegable de ciudades del Atlántico, con «Otra ciudad» para escribir cualquiera. Entrega siempre un texto.
import { useState } from 'react'
import { CIUDADES, ciudadDeLista } from '../lib/ciudades'

export default function SelectorCiudad({ value, onChange, className = '', maxLength = 60 }) {
  const enLista = ciudadDeLista(value)
  const [otra, setOtra] = useState(Boolean(value) && !enLista)
  const seleccion = otra ? '__otra' : (enLista || '')
  return (
    <div className="space-y-2">
      <select value={seleccion} aria-label="Ciudad" className={className}
        onChange={(e) => { const v = e.target.value; if (v === '__otra') { setOtra(true); onChange('') } else { setOtra(false); onChange(v) } }}>
        <option value="">Elige tu ciudad</option>
        {CIUDADES.map((c) => <option key={c} value={c}>{c}</option>)}
        <option value="__otra">Otra ciudad…</option>
      </select>
      {otra && <input value={value} onChange={(e) => onChange(e.target.value)} maxLength={maxLength} placeholder="Escribe tu ciudad" aria-label="Escribe tu ciudad" className={className} />}
    </div>
  )
}
