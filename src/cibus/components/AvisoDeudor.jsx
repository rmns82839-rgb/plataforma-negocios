import { dinero } from '../lib/formato'
import { diasDesde, estaVencido, desgloseDeuda } from '../lib/cartera'
import Icono from './Iconos'

// Aviso discreto en el cobro: la persona elegida ya le debe al negocio.
// Ámbar si solo debe; rojo si ya tiene deuda vencida.
export default function AvisoDeudor({ cliente, mora, montoFiado = 0, onVer }) {
  const saldo = Number(cliente?.saldo)
  if (!cliente || !(saldo > 0)) return null
  const vencido = Boolean(mora && Number(mora.vencido) > 0) || estaVencido(cliente)
  const dias = cliente.deuda_desde ? diasDesde(cliente.deuda_desde) : null
  const dp = (n) => `${n} ${n === 1 ? 'día' : 'días'}`
  const detalle = mora && Number(mora.vencido) > 0
    ? `vencido ${dinero(mora.vencido)} (${dp(mora.dias_atraso)} de atraso)`
    : dias != null ? `desde hace ${dp(dias)}` : 'pendiente'
  return (
    <div role="status"
      className={`rounded-2xl px-3 py-2.5 grid grid-cols-[auto_1fr_auto] gap-3 items-center ring-1 ${
        vencido ? 'bg-red-50 ring-red-200 text-red-700' : 'bg-champagne/30 ring-oro/40 text-negro'}`}>
      <Icono nombre="alerta" className="h-5 w-5" />
      <div className="min-w-0">
        <p className="text-sm font-semibold leading-tight break-words">{cliente.nombre}</p>
        <p className="text-xs leading-tight">Ya debe <b>{dinero(saldo)}</b> · {detalle}</p>
        {desgloseDeuda(cliente).hay && (
          <p className="text-xs leading-tight opacity-80">
            {desgloseDeuda(cliente).fiado > 0 ? `Fiado ${dinero(desgloseDeuda(cliente).fiado)} + ` : ''}
            préstamo rápido {dinero(desgloseDeuda(cliente).prestamo)}
          </p>
        )}
        {montoFiado > 0 && (
          <p className="text-xs leading-tight font-medium mt-0.5">Con este fiado quedaría debiendo {dinero(saldo + montoFiado)}</p>
        )}
      </div>
      {onVer && (
        <button onClick={onVer}
          className={`h-8 px-3 rounded-lg text-xs font-semibold bg-white ring-1 ${vencido ? 'ring-red-200 text-red-700' : 'ring-oro/40 text-negro'} active:opacity-80`}>
          Ver cuenta
        </button>
      )}
    </div>
  )
}
