// Total de la venta en grande + desglose (se ve a distancia, también en el celular).
import { dinero, numero } from '../lib/formato'

export default function CajaTotal({ r }) {
  return (
    <div className="rounded-3xl bg-negro p-5 lg:p-6 ring-1 ring-champagne/30 space-y-4">
      <div className="grid grid-cols-2 gap-3 text-[11px] lg:text-xs uppercase tracking-[0.2em] text-champagne/70">
        <span>Total a pagar</span>
        <span className="text-right">{r.productos} {r.productos === 1 ? 'producto' : 'productos'} · {numero(r.unidades)} und</span>
      </div>
      <p className="text-right text-5xl lg:text-6xl xl:text-7xl font-semibold tabular-nums leading-none text-champagne"
         aria-live="polite" data-total={r.total}>
        {dinero(r.total)}
      </p>
      {(r.mayorista !== 0 || r.ajustePrecio !== 0 || r.porProducto > 0 || r.porPromo > 0 || r.general > 0 || r.domicilio > 0) && (
        <dl className="space-y-1.5 text-sm lg:text-base text-hueso/80 border-t border-champagne/20 pt-3">
          <div className="flex justify-between"><dt>Subtotal a precio de lista</dt><dd className="tabular-nums">{dinero(r.lista)}</dd></div>
          {r.mayorista !== 0 && (
            <div className="flex justify-between"><dt>Precio mayorista</dt><dd className="tabular-nums">− {dinero(Math.abs(r.mayorista))}</dd></div>
          )}
          {r.ajustePrecio !== 0 && (
            <div className="flex justify-between"><dt>Cambios de precio</dt><dd className="tabular-nums">{r.ajustePrecio > 0 ? '+' : '−'} {dinero(Math.abs(r.ajustePrecio))}</dd></div>
          )}
          {r.porProducto > 0 && (
            <div className="flex justify-between"><dt>Descuentos por producto</dt><dd className="tabular-nums">− {dinero(r.porProducto)}</dd></div>
          )}
          {r.porPromo > 0 && (
            <div className="flex justify-between"><dt>Promociones</dt><dd className="tabular-nums">− {dinero(r.porPromo)}</dd></div>
          )}
          {r.general > 0 && (
            <div className="flex justify-between"><dt>Descuento general</dt><dd className="tabular-nums">− {dinero(r.general)}</dd></div>
          )}
          {r.domicilio > 0 && (
            <div className="flex justify-between"><dt>Domicilio</dt><dd className="tabular-nums">+ {dinero(r.domicilio)}</dd></div>
          )}
        </dl>
      )}
    </div>
  )
}
