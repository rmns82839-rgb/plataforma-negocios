// Pie premium de los catálogos: marca, contacto, ubicación, horario, redes y enlaces legales.
// Los datos salen de "Mi negocio" (vista pública); lo que no esté lleno simplemente no se muestra.
import Marca from './Marca'
import { useNegocioPublico, urlRed } from '../lib/useNegocioPublico'
import { soloDigitos } from '../lib/datosCliente'
import { slugActual } from '../lib/enlaces'
import { resumenHorario } from '../../lib/horario'
import LogoTienda from './LogoTienda'
import SelectorVista from '../../tienda/SelectorVista'

const Fila = ({ titulo, children }) => (
  <div className="space-y-1">
    <p className="text-[10px] uppercase tracking-[0.22em] text-champagne/60">{titulo}</p>
    <div className="text-sm text-hueso/90 leading-relaxed">{children}</div>
  </div>
)

const Red = ({ href, children }) => (
  <a href={href} target="_blank" rel="noopener noreferrer"
     className="h-10 px-4 inline-flex items-center rounded-full ring-1 ring-champagne/30 text-champagne text-xs font-medium hover:bg-champagne/10 active:bg-champagne/10">
    {children}
  </a>
)

export default function PiePublico({ whatsapp, tema = 'ropa' }) {
  const n = useNegocioPublico() ?? {}
  const wa = soloDigitos(n.whatsapp) || whatsapp
  const mapa = n.maps_url || (n.direccion ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([n.direccion, n.ciudad].filter(Boolean).join(', '))}` : '')
  const dir = [n.direccion, n.ciudad].filter(Boolean).join(' · ')
  const redes = [
    n.instagram && ['Instagram', urlRed('instagram', n.instagram)],
    n.facebook && ['Facebook', urlRed('facebook', n.facebook)],
    n.tiktok && ['TikTok', urlRed('tiktok', n.tiktok)],
    n.web && ['Sitio web', /^https?:/i.test(n.web) ? n.web : `https://${n.web}`],
  ].filter(Boolean)
  const bloques = [
    dir && <Fila key="d" titulo="Visítanos">
      <p>{dir}</p>
      {mapa && <a href={mapa} target="_blank" rel="noopener noreferrer" className="text-champagne underline underline-offset-4 text-xs">Cómo llegar</a>}
    </Fila>,
    (n.horario_semana || n.horario) && <Fila key="h" titulo="Horario"><p className="whitespace-pre-line">{n.horario_semana ? resumenHorario(n.horario_semana).split(' · ').join('\n') : n.horario}</p></Fila>,
    (n.telefono || n.email || wa) && <Fila key="c" titulo="Contacto">
      {n.telefono && <p><a href={`tel:${soloDigitos(n.telefono)}`}>{n.telefono}</a></p>}
      {n.email && <p className="break-words"><a href={`mailto:${n.email}`}>{n.email}</a></p>}
    </Fila>,
  ].filter(Boolean)

  return (
    <footer id="contacto" className={`${tema === 'tienda' ? 'bg-cibus-profundo' : 'bg-negro'} mt-12 px-4 pt-10 pb-32 text-center scroll-mt-4`}>
      <div className="max-w-md sm:max-w-3xl lg:max-w-6xl mx-auto space-y-8">
        {tema === 'tienda' && n.nombre && <LogoTienda n={n} tam={72} />}
        {n.nombre && <p className="font-display text-xl text-champagne tracking-wide break-words">{n.nombre}</p>}
        <Marca tam="sm" eslogan={false} />
        <p className="text-[10px] uppercase tracking-[0.28em] text-champagne/50">Tienda creada con Matriz</p>

        {bloques.length > 0 && (
          <div className={`grid gap-6 text-center ${bloques.length === 1 ? 'grid-cols-1' : bloques.length === 2 ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1 sm:grid-cols-3'}`}>
            {bloques}
          </div>
        )}

        {(redes.length > 0 || wa) && (
          <div className="flex flex-wrap justify-center gap-2">
            {wa && <Red href={`https://wa.me/${wa}`}>WhatsApp</Red>}
            {redes.map(([t, h]) => <Red key={t} href={h}>{t}</Red>)}
          </div>
        )}

        <div className="border-t border-champagne/15 pt-5 space-y-2">
          <p className="text-xs text-hueso/60 space-x-3">
            <a href={`/t/${slugActual()}/privacidad`} className="underline underline-offset-4">Política de datos</a>
            <a href={`/t/${slugActual()}/terminos`} className="underline underline-offset-4">Términos y condiciones</a>
          </p>
          <p className="text-[11px] text-hueso/40">
            © {new Date().getFullYear()} {n.razon_social || n.nombre || 'Matriz'}{n.nit ? ` · NIT ${n.nit}` : ''}
          </p>
          <SelectorVista oscuro />
        </div>
      </div>
    </footer>
  )
}
