// Pantalla de espera de los catálogos: isotipo dorado latiendo, línea de latido
// que se dibuja y termina en una percha (ropa) o una bolsa (productos).
const ICONOS = {
  ropa: <path d="M20 11a3.5 3.5 0 1 1 3.5 3.5C21.5 15.5 20 16.5 20 18.5V21M20 21l15 10.5a2 2 0 0 1-1.2 3.6H6.2A2 2 0 0 1 5 31.5z" />,
  tienda: <path d="M9 14h22l2 21H7zM14 18v-3a6 6 0 0 1 12 0v3" />,
}

export default function Espera({ tipo }) {
  return (
    <div className="esp" role="status" aria-label="Cargando">
      <img src="/isotipo-oro.png" alt="" className="esp-iso" />
      <svg viewBox="0 0 260 44" aria-hidden="true" className="esp-svg">
        <path className="esp-linea" d="M0 22H62l7 0 6-14 8 30 7-24 5 8H168" />
        {ICONOS[tipo] && <g className="esp-icono" transform="translate(190 2)">{ICONOS[tipo]}</g>}
      </svg>
      <b className="esp-marca">MATRIZ</b>
      <small className="esp-lema">El origen de lo bueno</small>
    </div>
  )
}
