// Franja de arriba de los catálogos públicos: el logo y el nombre de LA TIENDA (no el de Matriz), con su color y si está abierta.
// El botón "Descargar app" aparece solo si el navegador permite instalarla.
import Marca from './Marca'
import InstalarApp from './InstalarApp'
import LogoTienda from './LogoTienda'
import { useNegocioPublico } from '../lib/useNegocioPublico'
import { textoEstado } from '../../lib/horario'

export default function CabeceraPublica({ subtitulo, tema = 'ropa' }) {
  const tienda = tema === 'tienda'
  const n = useNegocioPublico()
  const estado = textoEstado(n?.estado_horario)
  return (
    <header className={`${tienda ? 'bg-gradient-to-b from-cibus-profundo to-cibus-oscuro' : 'bg-negro'} px-4 pt-[calc(1rem+env(safe-area-inset-top))] pb-4 lg:pt-5 lg:pb-5 text-center space-y-2`}>
      {tienda && n ? (
        <div className="space-y-2">
          <LogoTienda n={n} tam={88} />
          <h1 className="font-display text-3xl lg:text-4xl font-semibold text-champagne leading-tight break-words">{n.nombre}</h1>
          {n.eslogan && <p className="text-sm text-hueso/80 break-words">{n.eslogan}</p>}
        </div>
      ) : (
        <Marca tam="md" eslogan />
      )}
      <p className="text-xs lg:text-sm text-champagne/80 tracking-wide">{subtitulo}</p>
      {estado && (
        <p className="flex justify-center">
          <span className={`inline-flex max-w-full items-center gap-2 rounded-full px-4 py-1.5 text-sm font-semibold ${estado.abierto ? 'bg-emerald-100 text-emerald-900' : 'bg-red-100 text-red-900'}`}>
            <span aria-hidden="true" className={`h-2.5 w-2.5 shrink-0 rounded-full ${estado.abierto ? 'bg-emerald-600' : 'bg-red-600'}`} />
            <span className="break-words text-left">{estado.texto}</span>
          </span>
        </p>
      )}
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
