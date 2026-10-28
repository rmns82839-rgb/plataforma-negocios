// Domicilio por kilómetros en el pedido del catálogo: usa el cálculo de la plataforma (el cliente confirma su puerta en el mapa y el
// SERVIDOR mide la distancia). Le entrega al pedido el mismo tipo de resultado que esperaba Cibus: { clave, estado, km, costo }.
import { useEffect, useRef, useState } from 'react'
import CalculoDomicilio from '../../tienda/CalculoDomicilio'
import { costoDomicilioCalculado, tarifaRespaldo } from '../../lib/pedido'
import { slugActual } from '../lib/enlaces'

export default function DomicilioPlataforma({ n, direccion, subtotal, onResultado, onRecoger }) {
  const clave = String(direccion ?? '').trim()
  const [calculo, setCalculoInterno] = useState(null)
  const claveCalc = useRef('')
  const setCalculo = (c) => { claveCalc.current = clave; setCalculoInterno(c) }

  useEffect(() => { if (calculo && claveCalc.current !== clave) setCalculoInterno(null) }, [clave]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!calculo) return
    const c = claveCalc.current
    if (calculo.estado === 'fuera_de_zona') return onResultado({ clave: c, estado: 'fuera', maxKm: calculo.maximo_km, mensaje: calculo.mensaje })
    if (calculo.respaldo) return onResultado({ clave: c, estado: 'ok', respaldo: true, costo: tarifaRespaldo(n, subtotal), calculo_id: calculo.calculo_id ?? null })
    const costo = costoDomicilioCalculado(n, subtotal, calculo)
    onResultado({ clave: c, estado: 'ok', km: Number(calculo.km), costo: costo ?? 0, calculo_id: calculo.calculo_id ?? null })
  }, [calculo, subtotal]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="rounded-2xl bg-slate-50 p-3 space-y-3" aria-live="polite">
      <p className="text-base font-semibold text-slate-700 break-words">Valor del domicilio</p>
      <CalculoDomicilio n={n} slug={slugActual()} subtotal={subtotal} direccion={direccion} calculo={calculo} setCalculo={setCalculo} recoger={onRecoger} />
    </div>
  )
}
