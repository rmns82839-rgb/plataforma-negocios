// «Ver desglose del domicilio»: dirección, distancia estimada y cómo salió el valor (tarifa base + km extra).
// Con los datos que quedaron guardados en el pedido; si la venta se hizo a mano en la caja, solo muestra dirección y valor.
import { useState } from 'react'
import { dinero, numero } from '../lib/formato'

const redondear = (c, paso) => (paso === 500 || paso === 1000 ? Math.round(c / paso) * paso : Math.round(c))
const km = (n) => `${numero(Math.round(Number(n) * 100) / 100)} km`

function Fila({ a, b, fuerte, suave }) {
  return (
    <p className={`grid grid-cols-[1fr_auto] gap-3 ${fuerte ? 'font-bold text-slate-800 pt-1 border-t border-slate-100' : suave ? 'text-slate-400' : 'text-slate-600'}`}>
      <span className="min-w-0 break-words">{a}</span><span className="tabular-nums text-right">{b}</span>
    </p>
  )
}

/** pedido: fila de pedidos_tienda (o null) · direccion · cobrado: lo que lleva la venta/pedido en este momento */
export default function DesgloseDomicilio({ pedido, direccion, cobrado, abierto = false }) {
  const [ver, setVer] = useState(abierto)
  const t = pedido?.dom_tarifa && pedido.dom_tarifa.modo === 'km' ? pedido.dom_tarifa : null
  const kmRuta = Number(pedido?.dom_km) > 0 ? Number(pedido.dom_km) : null
  const dir = direccion || pedido?.direccion || ''
  const cobradoN = cobrado != null ? Math.round(Number(cobrado) || 0) : null
  const mapa = dir && !/^recoge/i.test(dir) ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(dir)}` : null

  // Cálculo con lo guardado en el pedido
  let calc = null
  if (t && kmRuta != null) {
    const base = Number(t.base) || 0, porKm = Number(t.por_km) || 0
    const incSabido = t.incluidos != null
    let inc = incSabido ? Number(t.incluidos) || 0 : 0
    let extraKm = Math.max(0, kmRuta - inc)
    let extra = Math.round(extraKm * porKm)
    let suma = base + extraKm * porKm
    let final = redondear(suma, Number(t.redondeo))
    let gratis = Number(t.gratis_desde) > 0 && Number(t.costo) === 0
    if (gratis) final = 0
    // pedidos de antes de guardar los km incluidos: si no cuadra con el costo guardado, se muestra solo lo que sobra sobre la base
    const cuadra = Math.abs(final - Number(t.costo)) <= 1
    if (!incSabido && !cuadra) { inc = null; extraKm = null; extra = Math.max(0, Number(t.costo) - base); suma = Number(t.costo); final = Number(t.costo) }
    const aviso = incSabido && !cuadra
    final = Math.round(Number(t.costo))
    calc = { base, porKm, inc, incSabido, extraKm, extra, suma, final, gratis, aviso, redondeo: Number(t.redondeo) || 0, gratisDesde: Number(t.gratis_desde) || 0 }
  }
  const sistema = pedido?.dom_tarifa?.costo != null ? Math.round(Number(pedido.dom_tarifa.costo)) : (pedido && Number(pedido.domicilio) >= 0 && pedido.domicilio != null ? Math.round(Number(pedido.domicilio)) : null)
  const cambiado = cobradoN != null && sistema != null && cobradoN !== sistema
  const consejo = calc && calc.inc === 0 && kmRuta < 1 && calc.final > calc.base

  return (
    <div className="rounded-xl bg-slate-50 ring-1 ring-slate-100">
      <button onClick={() => setVer(v => !v)} aria-expanded={ver}
        className="w-full min-h-11 px-3 py-2 grid grid-cols-[1fr_auto] gap-3 items-center text-left text-sm font-semibold text-slate-700">
        <span className="break-words">Desglose del domicilio</span><span className="text-slate-400">{ver ? '▲' : '▼'}</span>
      </button>
      {ver && (
        <div className="px-3 pb-3 space-y-1.5 text-sm">
          <div className="space-y-0.5">
            <p className="text-xs text-slate-400">Dirección</p>
            <p className="break-words text-slate-800">{dir || 'Sin dirección'}</p>
            {mapa && <a href={mapa} target="_blank" rel="noopener noreferrer" className="inline-block text-xs font-semibold text-marca underline">Ver en el mapa</a>}
          </div>
          {pedido?.dom_por_confirmar && <p className="rounded-lg bg-champagne/30 text-negro px-3 py-2 text-xs break-words">El sistema no pudo medir la ruta: el cliente pidió que la tienda confirme el valor.</p>}
          {kmRuta != null && <Fila a="Distancia estimada por carretera" b={km(kmRuta)} />}
          {calc ? (
            <>
              <Fila a="Tarifa base" b={dinero(calc.base)} />
              {calc.inc != null && calc.inc > 0 && <Fila suave a={`Incluye los primeros ${numero(calc.inc)} km`} b="" />}
              {calc.extraKm != null
                ? <Fila a={`Kilómetros aparte: ${km(calc.extraKm)} × ${dinero(calc.porKm)}`} b={dinero(calc.extra)} />
                : <Fila a="Recargo por distancia" b={dinero(calc.extra)} />}
              {calc.redondeo > 0 && Math.abs(calc.suma - calc.final) >= 1 && <Fila suave a={`Redondeado a ${dinero(calc.redondeo)}`} b={dinero(calc.final)} />}
              {calc.gratis && <Fila suave a={`Envío gratis: la compra llegó a ${dinero(calc.gratisDesde)}`} b={dinero(0)} />}
              {calc.aviso && <p className="text-xs text-slate-500 break-words">La suma no coincide con lo guardado: la tarifa pudo cambiar después de hacer el pedido.</p>}
              <Fila fuerte a="Valor calculado por el sistema" b={calc.final === 0 ? 'Gratis' : dinero(calc.final)} />
            </>
          ) : pedido?.dom_tarifa?.modo === 'fijo' ? (
            <Fila fuerte a="Tarifa fija de domicilio" b={sistema === 0 ? 'Gratis' : dinero(sistema)} />
          ) : (
            <p className="text-xs text-slate-500 break-words">{pedido ? 'Este pedido no guardó el cálculo por distancia.' : 'Este domicilio se puso a mano en la Caja: no tiene cálculo por distancia.'}</p>
          )}
          {cobradoN != null && <Fila fuerte={!calc} a="Cobrado de domicilio" b={cobradoN === 0 ? 'Sin costo' : dinero(cobradoN)} />}
          {cambiado && <p className="rounded-lg bg-champagne/30 text-negro px-3 py-2 text-xs break-words">El valor se cambió a mano: el sistema había calculado {sistema === 0 ? 'gratis' : dinero(sistema)}.</p>}
          {consejo && <p className="rounded-lg bg-slate-100 text-slate-600 px-3 py-2 text-xs break-words">Está a menos de 1 km pero se cobró más que la base. Si quieres que hasta 1 km valga solo la tarifa base, pon «Km incluidos en la tarifa base» = 1 en Negocio → Domicilio por distancia.</p>}
        </div>
      )}
    </div>
  )
}
