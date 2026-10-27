// Franja con lo que el cliente quiere saber antes de pedir: domicilio, zona y formas de pago.
// Solo muestra lo que el dueño llenó en Más → Mi negocio; si no hay nada, no se ve.
import { dinero } from '../lib/formato'

export default function FranjaConfianza({ negocio, porDistancia = false }) {
  if (!negocio) return null
  const costo = negocio.domicilio_costo != null ? Number(negocio.domicilio_costo) : null
  const gratis = negocio.envio_gratis_desde != null && Number(negocio.envio_gratis_desde) > 0 ? Number(negocio.envio_gratis_desde) : null
  const items = [
    porDistancia && { t: 'Domicilio', v: 'Según tu distancia', n: gratis ? `Gratis desde ${dinero(gratis)}` : 'Lo calculas al pedir' },
    !porDistancia && costo != null && { t: 'Domicilio', v: costo === 0 ? 'Gratis' : dinero(costo), n: gratis ? `Gratis desde ${dinero(gratis)}` : '' },
    negocio.zona_domicilio && { t: 'Zona', v: negocio.zona_domicilio },
    negocio.formas_pago_tienda && { t: 'Pagos', v: negocio.formas_pago_tienda },
  ].filter(Boolean)
  if (items.length === 0) return null
  return (
    <ul aria-label="Información de entrega y pagos" className="flex flex-wrap items-center justify-center gap-x-2 gap-y-0.5 rounded-2xl bg-cibus-profundo ring-1 ring-oro/40 px-3 py-1.5 text-center text-xs text-champagne/80">
      {items.map((i, k) => (
        <li key={i.t} className="flex items-center gap-2 min-w-0">
          {k > 0 && <span aria-hidden="true" className="text-oro/60">·</span>}
          <span><span className="uppercase tracking-[0.14em] text-oro/90 text-[10px]">{i.t}</span> <span className="font-semibold text-champagne">{i.v}</span>{i.n && <span className="text-champagne/60"> · {i.n}</span>}</span>
        </li>
      ))}
    </ul>
  )
}
