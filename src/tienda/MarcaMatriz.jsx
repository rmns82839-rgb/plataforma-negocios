// Marca de la plataforma: Matriz — «El origen de lo bueno». Usa los MISMOS archivos que Cibus
// (public/isotipo.png sobre negro, public/isotipo-oro.png sobre claro) y la misma tipografía:
// Cormorant Garamond Light con tracking 340 y Jost Light para el eslogan. No dibujar el logo a mano.
export function Isotipo({ tamano = 64, oscuro = false, className = '' }) {
  return (
    <img src={oscuro ? '/isotipo.png' : '/isotipo-oro.png'} alt="Matriz" width={tamano} height={tamano}
      style={{ width: tamano, height: tamano }} className={`object-contain ${className}`} />
  )
}

// Marca completa: isotipo + MATRIZ + eslogan
export default function MarcaMatriz({ oscuro = false, tamano = 72, eslogan = true }) {
  return (
    <div className="grid justify-items-center gap-2 text-center">
      <Isotipo tamano={tamano} oscuro={oscuro} />
      <p className={`font-display font-light uppercase leading-none tracking-[0.34em] pl-[0.34em] text-4xl ${
        oscuro ? 'bg-gradient-to-b from-champagne-claro via-champagne to-oro bg-clip-text text-transparent' : 'text-oro-oscuro'}`}>Matriz</p>
      {eslogan && <p className={`text-xs font-light uppercase tracking-[0.3em] pl-[0.3em] ${oscuro ? 'text-champagne/70' : 'text-oro'}`}>El origen de lo bueno</p>}
    </div>
  )
}
