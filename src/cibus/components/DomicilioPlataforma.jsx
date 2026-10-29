// Domicilio por kilómetros en el pedido del catálogo: usa el cálculo de la plataforma (el cliente confirma su puerta en el mapa y el
// SERVIDOR mide la distancia). Le entrega al pedido el mismo tipo de resultado que esperaba Cibus: { clave, estado, km, costo }.
import { useEffect, useRef, useState } from 'react'
import CalculoDomicilio from '../../tienda/CalculoDomicilio'
import { llamarDomicilio } from '../../lib/domicilio'
import { costoDomicilioCalculado, tarifaRespaldo } from '../../lib/pedido'
import { slugActual } from '../lib/enlaces'

// punto: { lat, lng } guardado en la cuenta del cliente → el domicilio se calcula solo, sin que marque nada.
// vigente: el resultado que ya tenía el pedido (para no volver a medir si el cliente va y viene entre pasos).
export default function DomicilioPlataforma({ n, direccion, subtotal, onResultado, onRecoger, punto = null, vigente = null }) {
  const clave = String(direccion ?? '').trim()
  const previo = vigente && vigente.clave === clave && vigente.estado === 'ok' && vigente.calculo_id
    ? { estado: 'ok', calculo_id: vigente.calculo_id, km: vigente.km, direccion: clave } : null
  const [calculo, setCalculoInterno] = useState(previo)
  const claveCalc = useRef(previo ? clave : '')
  const autoHecho = useRef(previo ? clave : '')
  const [midiendo, setMidiendo] = useState(false)
  const setCalculo = (c) => { claveCalc.current = clave; setCalculoInterno(c) }

  useEffect(() => { if (calculo && claveCalc.current !== clave) setCalculoInterno(null) }, [clave]) // eslint-disable-line react-hooks/exhaustive-deps

  // Con el punto guardado se mide una sola vez por dirección; si luego toca «Cambiar la dirección» sigue el camino manual
  useEffect(() => {
    if (!punto || calculo || autoHecho.current === clave) return
    autoHecho.current = clave
    setMidiendo(true)
    llamarDomicilio({ accion: 'calcular', slug: slugActual(), lat: punto.lat, lng: punto.lng, etiqueta: clave }).then((r) => {
      setMidiendo(false)
      if (r.estado === 'ok') setCalculo({ estado: 'ok', calculo_id: r.calculo_id, km: r.km, direccion: clave })
      else if (r.estado === 'fuera_de_zona') setCalculo({ estado: 'fuera_de_zona', mensaje: r.mensaje, maximo_km: r.maximo_km })
      else setCalculo({ estado: r.estado, respaldo: true, calculo_id: r.sin_id ? null : r.calculo_id, mensaje: r.mensaje })
    })
  }, [punto?.lat, punto?.lng, clave, calculo]) // eslint-disable-line react-hooks/exhaustive-deps

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
      {midiendo
        ? <p role="status" className="text-base rounded-lg px-3 py-2 bg-white ring-1 ring-slate-200 text-slate-700">Calculando el domicilio a tu dirección guardada… un momento</p>
        : <CalculoDomicilio n={n} slug={slugActual()} subtotal={subtotal} direccion={direccion} calculo={calculo} setCalculo={setCalculo} recoger={onRecoger} />}
    </div>
  )
}
