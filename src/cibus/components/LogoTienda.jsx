// Logo de la tienda en el catálogo público: el suyo si lo subió; si no, la inicial de su nombre sobre su color.
export default function LogoTienda({ n, tam = 96, className = '' }) {
  if (n?.logo) return <img src={n.logo} alt={n.nombre} style={{ height: tam, maxWidth: '80%' }} className={`mx-auto w-auto object-contain ${className}`} />
  return (
    <div aria-hidden="true" style={{ width: tam, height: tam, fontSize: tam * 0.5 }}
      className={`mx-auto grid place-items-center rounded-full bg-cibus font-display font-semibold text-champagne ring-2 ring-champagne/60 ${className}`}>
      {n?.logo_auto?.inicial || (n?.nombre || '?').trim().charAt(0).toUpperCase()}
    </div>
  )
}
