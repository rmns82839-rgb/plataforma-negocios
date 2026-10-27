// Marcador para los productos que no tienen foto: el isotipo de la tienda sobre el fondo de marca.
// Llena el contenedor (que debe ser relative o tener tamaño propio).
export default function SinFoto({ className = '' }) {
  return (
    <div className={`absolute inset-0 grid place-items-center bg-gradient-to-br from-cibus-profundo to-cibus-oscuro ${className}`} aria-hidden="true">
      <img src="/isotipo-oro.png" alt="" width="96" height="96" loading="lazy" className="w-1/3 max-w-[6rem] h-auto opacity-60" />
    </div>
  )
}
