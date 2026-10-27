// Calcula el domicilio por distancia (tarifa base + km × valor por km) en el pedido del catálogo.
// La ruta real la mide el servidor (/api/domicilio) y la tarifa la calcula la base de datos con lo que configuró el dueño:
// aquí solo se muestra. Si no se puede calcular, se avisa y el cliente puede pedir que la tienda confirme el domicilio.
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { dinero, numero } from '../lib/formato'

// Pregunta al servidor la distancia; devuelve { km } o { error }
export async function pedirRuta({ direccion, lat, lon }) {
  let r
  try {
    r = await fetch('/api/domicilio', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(lat != null ? { lat, lon } : { direccion }) })
  } catch { return { error: 'No hay conexión con el servicio de mapas' } }
  const j = await r.json().catch(() => null)
  if (!r.ok || !j) return { error: j?.error || 'No se pudo calcular el domicilio' }
  if (!j.ok) return { error: j.mensaje || 'No se pudo calcular el domicilio', motivo: j.motivo }
  return { km: Number(j.km), fuera: Boolean(j.fuera) }
}

// Costo con la configuración vigente (la fórmula vive en la base de datos)
export async function costoPorKm(km, subtotal) {
  const { data, error } = await supabase.rpc('calcular_domicilio', { p_km: km, p_subtotal: subtotal })
  if (error || !data) return { error: 'No se pudo calcular el costo' }
  if (!data.ok) return data.motivo === 'fuera' ? { fuera: true, maxKm: data.max_km } : { error: 'No se pudo calcular el costo' }
  return { costo: Number(data.costo), gratis: Boolean(data.gratis) }
}

export default function DomicilioDistancia({ direccion, subtotal, maxKm, resultado, onResultado }) {
  const clave = String(direccion ?? '').trim()
  const [cargando, setCargando] = useState(false)
  const [proboGPS, setProboGPS] = useState(false)      // la opción "que la tienda confirme" aparece solo después de intentar con la ubicación
  const vigente = resultado && resultado.clave === clave ? resultado : null
  const puedeCalcular = clave.length >= 6 && !cargando

  const aplicar = async (ruta) => {
    if (ruta.motivo === 'sin_servicio' || ruta.motivo === 'limite') return onResultado({ clave, estado: 'manual' })   // sin cálculo automático: la tienda confirma, sin más pasos
    if (ruta.error) return onResultado({ clave, estado: 'error', mensaje: ruta.error })
    if (ruta.fuera) return onResultado({ clave, estado: 'fuera', km: ruta.km, maxKm })
    const c = await costoPorKm(ruta.km, subtotal)
    if (c.fuera) return onResultado({ clave, estado: 'fuera', km: ruta.km, maxKm: c.maxKm ?? maxKm })
    if (c.error) return onResultado({ clave, estado: 'error', mensaje: c.error })
    onResultado({ clave, estado: 'ok', km: ruta.km, costo: c.costo, gratis: c.gratis })
  }

  const calcular = async () => {
    setCargando(true)
    await aplicar(await pedirRuta({ direccion: clave }))
    setCargando(false)
  }

  // El valor aparece solo cuando la persona termina de escribir la dirección (sin tener que buscar un botón)
  const [intentada, setIntentada] = useState('')
  useEffect(() => {
    if (vigente || cargando || clave.length < 10 || intentada === clave) return
    const t = setTimeout(() => { setIntentada(clave); calcular() }, 1800)
    return () => clearTimeout(t)
  }, [clave, vigente, cargando, intentada]) // eslint-disable-line react-hooks/exhaustive-deps

  const usarUbicacion = () => {
    setProboGPS(true)
    if (!navigator.geolocation) return onResultado({ clave, estado: 'error', mensaje: 'Tu navegador no permite usar la ubicación' })
    setCargando(true)
    navigator.geolocation.getCurrentPosition(
      async (pos) => { await aplicar(await pedirRuta({ lat: pos.coords.latitude, lon: pos.coords.longitude })); setCargando(false) },
      () => { setCargando(false); onResultado({ clave, estado: 'error', mensaje: 'No pudimos usar tu ubicación. Escribe tu dirección y toca "Calcular"' }) },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 })
  }

  // Si cambia el total del pedido (envío gratis), se recalcula el costo con los mismos km
  useEffect(() => {
    if (vigente?.estado !== 'ok') return
    let vivo = true
    costoPorKm(vigente.km, subtotal).then(c => {
      if (!vivo || c.error || c.fuera) return
      if (c.costo !== vigente.costo) onResultado({ ...vigente, costo: c.costo, gratis: c.gratis })
    })
    return () => { vivo = false }
  }, [subtotal]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="rounded-2xl bg-slate-50 p-3 space-y-3" aria-live="polite">
      <p className="text-base font-semibold text-slate-700 break-words">Valor del domicilio</p>
      <div className="grid grid-cols-2 gap-2">
        <button onClick={calcular} disabled={!puedeCalcular}
          className="min-h-12 rounded-xl bg-cibus text-white text-base font-semibold px-2 leading-tight disabled:opacity-40 active:opacity-80">
          {cargando ? 'Calculando…' : 'Calcular ahora'}
        </button>
        <button onClick={usarUbicacion} disabled={cargando}
          className="min-h-12 rounded-xl bg-white ring-1 ring-slate-200 text-slate-700 text-base font-semibold px-2 leading-tight disabled:opacity-40 active:bg-slate-100">
          Usar mi ubicación
        </button>
      </div>
      {cargando && <p className="text-base rounded-lg px-3 py-2 bg-white ring-1 ring-slate-200 text-slate-700">Calculando tu domicilio… un momento</p>}
      {!vigente && !cargando && <p className="text-base text-slate-600">Escribe tu dirección completa y el valor del domicilio aparece solo. Si estás en tu casa, también puedes tocar <b>Usar mi ubicación</b>.</p>}

      {vigente?.estado === 'ok' && (
        <div className="rounded-xl bg-white ring-1 ring-slate-200 p-3 grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 items-center">
          <span className="text-sm text-slate-500">Distancia aproximada por carretera</span><span className="text-sm font-semibold text-right">{numero(vigente.km)} km <span className="font-normal text-slate-500">({Math.round(vigente.km * 1000).toLocaleString('es-CO')} metros)</span></span>
          <span className="text-sm text-slate-500">Domicilio</span><span className="text-lg font-bold text-marca">{vigente.costo === 0 ? 'Gratis' : dinero(vigente.costo)}</span>
        </div>
      )}
      {vigente?.estado === 'fuera' && (
        <p className="text-base rounded-lg px-3 py-2 bg-red-50 text-red-600">
          Esa dirección queda a {numero(vigente.km)} km{vigente.maxKm ? ` y solo entregamos hasta ${numero(vigente.maxKm)} km` : ''}. No podemos entregar allí.
        </p>
      )}
      {vigente?.estado === 'error' && (
        <div className="space-y-2">
          <p className="text-base rounded-lg px-3 py-2 bg-champagne/30 text-negro break-words">{vigente.mensaje}</p>
          {!proboGPS && navigator.geolocation ? (
            <>
              <p className="text-base text-slate-700">Muchas direcciones no aparecen en el mapa. Lo más exacto es usar tu ubicación (estando en el lugar de entrega) o escribir el barrio y la ciudad.</p>
              <button onClick={usarUbicacion} disabled={cargando}
                className="w-full min-h-14 rounded-xl bg-cibus text-white text-base font-semibold px-2 leading-tight disabled:opacity-40 active:opacity-80">
                📍 Usar mi ubicación
              </button>
            </>
          ) : (
            <button onClick={() => onResultado({ clave, estado: 'manual' })}
              className="w-full min-h-12 rounded-xl bg-white ring-1 ring-slate-200 text-slate-700 text-base font-semibold px-2 leading-tight active:bg-slate-100">
              Que la tienda me confirme el domicilio
            </button>
          )}
        </div>
      )}
      {vigente?.estado === 'manual' && (
        <p className="text-base rounded-lg px-3 py-2 bg-champagne/30 text-negro">Listo. La tienda te dirá cuánto cuesta el domicilio por WhatsApp antes de llevarte el pedido.</p>
      )}
    </div>
  )
}
