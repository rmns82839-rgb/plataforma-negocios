// Pie de página completo de la plataforma: rutas importantes, legal, contacto e instalar la app.
import { ir } from '../lib/ruta'
import { WHATSAPP_BONITO, enlaceWhatsApp } from '../lib/contacto'
import { Isotipo } from './MarcaMatriz'
import Instalar from './Instalar'
import SelectorVista from './SelectorVista'

const Enlace = ({ ruta, ancla, children }) => (
  <li><a href={ruta} onClick={(e) => { e.preventDefault(); ir(ruta); if (ancla) setTimeout(() => document.getElementById(ancla)?.scrollIntoView({ behavior: 'smooth' }), 60) }}
    className="inline-flex min-h-[40px] items-center text-base text-white/75 hover:text-champagne-claro">{children}</a></li>
)
const Col = ({ titulo, children }) => (
  <div><h3 className="mb-2 text-sm font-bold uppercase tracking-[0.2em] text-champagne">{titulo}</h3><ul>{children}</ul></div>
)

export default function PieMatriz() {
  return (
    <footer className="bg-negro px-4 pb-28 pt-12 text-white">
      <div className="mx-auto w-full max-w-5xl">
        <div className="mb-8 flex items-center gap-3">
          <Isotipo tamano={40} oscuro />
          <div><p className="font-display text-2xl font-light uppercase tracking-[0.3em] text-champagne">Matriz</p><p className="text-sm text-white/60">El origen de lo bueno</p></div>
        </div>
        <div style={{ display: 'grid', gap: 28, gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))' }}>
          <Col titulo="Explora">
            <Enlace ruta="/">Inicio</Enlace>
            <Enlace ruta="/tiendas">Tiendas cerca de ti</Enlace>
            <Enlace ruta="/" ancla="planes">Planes y precios</Enlace>
            <Enlace ruta="/" ancla="preguntas">Preguntas frecuentes</Enlace>
          </Col>
          <Col titulo="Para negocios">
            <Enlace ruta="/registro">Registrar mi negocio</Enlace>
            <Enlace ruta="/ingreso">Ingresar a mi panel</Enlace>
            <Enlace ruta="/" ancla="beneficios">Beneficios</Enlace>
            <Enlace ruta="/" ancla="nosotros">Misión y visión</Enlace>
          </Col>
          <Col titulo="Legal">
            <Enlace ruta="/privacidad">Política de datos personales</Enlace>
            <Enlace ruta="/terminos">Términos y condiciones</Enlace>
          </Col>
          <div>
            <h3 className="mb-2 text-sm font-bold uppercase tracking-[0.2em] text-champagne">Contacto</h3>
            <p className="text-base text-white/75">WhatsApp</p>
            <a href={enlaceWhatsApp()} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-[44px] items-center text-xl font-bold text-white hover:text-champagne-claro">{WHATSAPP_BONITO}</a>
            <p className="mt-1 text-sm text-white/60">Te respondemos lo más pronto posible.</p>
            <div className="mt-4 max-w-xs"><Instalar texto="Descargar la app" /></div>
          </div>
        </div>
        <div className="mt-10 border-t border-white/10 pt-5 text-center text-sm text-white/50">
          <p>© {new Date().getFullYear()} Matriz · Hecho en Colombia</p>
          <SelectorVista oscuro className="mt-2" />
        </div>
      </div>
    </footer>
  )
}
