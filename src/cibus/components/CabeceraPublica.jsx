// Franja negra con la marca, arriba de los catálogos públicos.
// El botón "Descargar app" aparece solo si el navegador permite instalarla.
import Marca from './Marca'
import InstalarApp from './InstalarApp'

export default function CabeceraPublica({ subtitulo, tema = 'ropa' }) {
  const tienda = tema === 'tienda'
  return (
    <header className={`${tienda ? 'bg-gradient-to-b from-cibus-profundo to-cibus-oscuro' : 'bg-negro'} px-4 pt-[calc(1rem+env(safe-area-inset-top))] pb-4 lg:pt-5 lg:pb-5 text-center space-y-2`}>
      {tienda ? (
        // Logo de la tienda física (Cibus); los bordes se funden con el fondo de la franja
        <img src="/cibus-logo.webp" alt="Cibus" width="900" height="507" fetchPriority="high"
             className="mx-auto w-full max-w-[17rem] lg:max-w-[22rem] h-auto" />
      ) : (
        <Marca tam="md" eslogan />
      )}
      <p className="text-xs lg:text-sm text-champagne/80 tracking-wide">{subtitulo}</p>
      {tienda && (
        <p className="flex items-center justify-center gap-2 text-[10px] uppercase tracking-[0.28em] text-champagne/60">
          <img src="/isotipo-oro.png" alt="" className="h-4 w-4 object-contain" /> Catálogo en línea Matriz
        </p>
      )}
      <div className="flex justify-center">
        <InstalarApp auto={false} texto="Descargar app" clase="h-9 px-5 rounded-full" icono />
      </div>
    </header>
  )
}
