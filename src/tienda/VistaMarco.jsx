// La app dentro de un marco con el ancho del celular, ampliado para llenar la pantalla (para quien tiene el navegador en «modo computador»).
// Dentro del marco todo mide como en un celular, así que las pantallas se ven y funcionan igual que en el modo normal.
import { useEffect, useState } from 'react'

export default function VistaMarco() {
  const [m, setM] = useState(() => medir())
  useEffect(() => {
    const f = () => setM(medir())
    window.addEventListener('resize', f); window.addEventListener('orientationchange', f)
    return () => { window.removeEventListener('resize', f); window.removeEventListener('orientationchange', f) }
  }, [])
  return (
    <iframe title="Matriz" src={window.location.href} allow="camera; microphone; geolocation; clipboard-write; fullscreen"
      style={{ position: 'fixed', top: 0, left: 0, border: 0, width: `${m.ancho}px`, height: `${m.alto}px`, transform: `scale(${m.escala})`, transformOrigin: '0 0', background: '#fff' }} />
  )
}

function medir() {
  const ancho = Math.min(window.screen.width, window.screen.height, 480)       // el ancho de un celular
  const escala = window.innerWidth / ancho
  return { ancho, escala, alto: Math.ceil(window.innerHeight / escala) }
}
