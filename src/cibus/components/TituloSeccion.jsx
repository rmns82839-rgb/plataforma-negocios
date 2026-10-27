// Título de sección de los catálogos: siempre la misma cápsula (marca morada, letra dorada).
export default function TituloSeccion({ children, className = '' }) {
  return <h2 className={`inline-block text-xs font-semibold tracking-wide px-3 py-1.5 rounded-full bg-cibus-oscuro text-champagne ${className}`}>{children}</h2>
}
