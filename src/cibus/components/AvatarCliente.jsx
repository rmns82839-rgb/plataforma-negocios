// Avatar redondo de la persona: su foto de Google; si no hay (o no carga), sus iniciales en dorado.
import { useState } from 'react'
import { iniciales } from '../lib/cuentaVista'

export default function AvatarCliente({ nombre, foto, tam = 48, className = '' }) {
  const [falla, setFalla] = useState(false)
  const estilo = { width: tam, height: tam, fontSize: tam * 0.4 }
  if (foto && !falla) {
    return <img src={foto} alt="" referrerPolicy="no-referrer" onError={() => setFalla(true)} style={estilo}
      className={`shrink-0 rounded-full object-cover ring-2 ring-champagne/70 ${className}`} />
  }
  return (
    <span aria-hidden="true" style={estilo}
      className={`shrink-0 grid place-items-center rounded-full bg-gradient-to-b from-champagne-claro to-champagne text-negro font-semibold ring-2 ring-champagne/70 ${className}`}>
      {iniciales(nombre)}
    </span>
  )
}
