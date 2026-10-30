// Barra fija al pie con los 4 destinos importantes. Columnas iguales, botones grandes.
import Icono from '../cibus/components/Iconos'
import { ir } from '../lib/ruta'

const ITEMS = [
  ['/', 'Inicio', 'casa'],
  ['/tiendas', 'Tiendas', 'pin'],
  ['/registro', 'Vender', 'negocio'],
  ['/ingreso', 'Ingresar', 'usuario'],
]

export default function BarraInferior({ activa = '' }) {
  return (
    <nav aria-label="Navegación principal" className="fixed inset-x-0 bottom-0 z-30 border-t-2 border-champagne/40 bg-negro/95 backdrop-blur"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
      <div className="mx-auto grid max-w-3xl grid-cols-4">
        {ITEMS.map(([ruta, texto, icono]) => (
          <button key={ruta} onClick={() => ir(ruta)} aria-current={activa === ruta ? 'page' : undefined}
            className={`flex min-h-[64px] flex-col items-center justify-center gap-0.5 text-sm font-semibold ${activa === ruta ? 'text-champagne' : 'text-white/75 hover:text-champagne-claro'}`}>
            <Icono nombre={icono} className="h-6 w-6" />{texto}
          </button>
        ))}
      </div>
    </nav>
  )
}
