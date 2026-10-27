// Configuración del domicilio por distancia: tarifa base + valor por km, cobertura, redondeo y origen.
// Todo lo cambia el dueño aquí, sin tocar código. Incluye una prueba real de la ruta para saber si el servicio está conectado.
import { useState } from 'react'
import { claseInput } from '../lib/estilos'
import { dinero, numero } from '../lib/formato'
import { Campo } from './Modal'
import { costoDomicilio } from '../lib/domicilioKm'
import { pedirRuta } from './DomicilioDistancia'

const REDONDEOS = [['0', 'No redondear'], ['500', 'A $500'], ['1000', 'A $1.000']]

export default function DomicilioKmConfig({ f, setF, poner, guardadoKm, conIncluidos = false }) {
  const [dir, setDir] = useState('')
  const [probando, setProbando] = useState(false)
  const [prueba, setPrueba] = useState(null)
  const [avisoUbic, setAvisoUbic] = useState('')
  // Guarda el punto exacto de la tienda (coordenadas) como origen de los domicilios
  const ubicarTienda = () => {
    if (!navigator.geolocation) return setAvisoUbic('Este navegador no permite usar la ubicación')
    setAvisoUbic('Buscando tu ubicación…')
    navigator.geolocation.getCurrentPosition(
      (pos) => { setF(p => ({ ...p, dom_origen: `${pos.coords.latitude.toFixed(6)},${pos.coords.longitude.toFixed(6)}` })); setAvisoUbic('Listo: se guardó el punto exacto de la tienda. Toca Guardar.') },
      () => setAvisoUbic('No se pudo usar la ubicación. Permite el acceso a la ubicación e intenta de nuevo'),
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 })
  }
  const activo = f.dom_modo === 'km'
  const pesos = (t) => String(t ?? '').replace(/\D/g, '')
  const lista = pesos(f.dom_base) !== '' && pesos(f.dom_por_km) !== ''
  const cfg = { base: pesos(f.dom_base), porKm: pesos(f.dom_por_km), redondeo: f.dom_redondeo, incluidos: conIncluidos ? Number(String(f.dom_km_incluidos ?? '0').replace(',', '.')) || 0 : 0 }

  const probar = async () => {
    setProbando(true); setPrueba(null)
    const r = await pedirRuta({ direccion: dir.trim() })
    setPrueba(r.error ? { error: r.error } : { km: r.km, costo: lista ? costoDomicilio(cfg, r.km) : null, fuera: r.fuera })
    setProbando(false)
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm p-4 space-y-4">
      <div>
        <p className="text-sm font-semibold break-words">Domicilio por distancia (tienda en línea)</p>
        <p className="text-xs text-slate-400">Cobra el domicilio según los kilómetros de la ruta: tarifa base + (km × valor por km).</p>
      </div>

      <div className="grid grid-cols-2 gap-2 p-1 rounded-xl bg-slate-100" role="group" aria-label="Cómo se cobra el domicilio">
        {[['fijo', 'Costo fijo'], ['km', 'Por distancia']].map(([v, t]) => (
          <button key={v} onClick={() => setF(p => ({ ...p, dom_modo: v }))}
            className={`h-10 rounded-lg text-sm font-medium ${f.dom_modo === v ? 'bg-white text-marca shadow-sm' : 'text-slate-500'}`}>{t}</button>
        ))}
      </div>

      {!activo && <p className="text-xs text-slate-500">Se usa el "Costo del domicilio" fijo de arriba. Cambia a <b>Por distancia</b> para calcularlo según la ruta.</p>}

      {activo && (
        <>
          <div className="grid grid-cols-2 gap-3">
            <Campo etiqueta="Tarifa base ($)">
              <input value={f.dom_base} onChange={poner('dom_base')} inputMode="numeric" placeholder="Ej. 2000" className={claseInput} />
            </Campo>
            {conIncluidos && (
              <div className="col-span-2">
                <Campo etiqueta="Kilómetros incluidos en la tarifa base">
                  <input value={f.dom_km_incluidos} onChange={poner('dom_km_incluidos')} inputMode="decimal" placeholder="Ej. 1" className={claseInput} />
                </Campo>
                <p className="mt-1 text-sm text-slate-500 break-words">Hasta esa distancia se cobra solo la tarifa base (por ejemplo $1.500 hasta 1 km). Lo que pase de ahí se cobra por kilómetro, también por metros. Con 0, se cobra por kilómetro desde el principio.</p>
              </div>
            )}
            <Campo etiqueta="Valor por kilómetro ($)">
              <input value={f.dom_por_km} onChange={poner('dom_por_km')} inputMode="numeric" placeholder="Ej. 1200" className={claseInput} />
            </Campo>
            <Campo etiqueta="Distancia máxima (km)">
              <input value={f.dom_max_km} onChange={poner('dom_max_km')} inputMode="decimal" placeholder="Ej. 5" className={claseInput} />
            </Campo>
            <Campo etiqueta="Envío gratis desde ($)">
              <input value={f.envio_gratis_desde} onChange={poner('envio_gratis_desde')} inputMode="numeric" placeholder="Vacío = no hay" className={claseInput} />
            </Campo>
          </div>

          <div className="space-y-1.5">
            <p className="text-xs font-medium text-slate-500">Redondear el domicilio</p>
            <div className="grid grid-cols-3 gap-2">
              {REDONDEOS.map(([v, t]) => (
                <button key={v} onClick={() => setF(p => ({ ...p, dom_redondeo: v }))}
                  className={`min-h-10 px-1 rounded-xl text-xs font-semibold leading-tight ${String(f.dom_redondeo) === v ? 'bg-negro text-champagne' : 'bg-slate-100 text-slate-600'}`}>{t}</button>
              ))}
            </div>
          </div>

          <Campo etiqueta="Dirección desde donde salen los domicilios">
            <input value={f.dom_origen} onChange={poner('dom_origen')} maxLength={160} placeholder="Ej. Cra. 9a #15A-31, Puerto Colombia, Atlántico" className={claseInput} />
            <button type="button" onClick={ubicarTienda} className="mt-2 w-full min-h-12 rounded-xl bg-white ring-1 ring-slate-300 text-slate-700 text-base font-semibold px-3 leading-tight active:bg-slate-100">
              Usar mi ubicación actual (estoy en la tienda)
            </button>
            {avisoUbic && <p className="mt-1 text-sm text-slate-600 break-words">{avisoUbic}</p>}
            <p className="mt-1 text-sm text-slate-500 break-words">Lo más exacto es estar en la tienda y tocar el botón: queda guardado el punto exacto. Si no, escribe la dirección con barrio y ciudad.</p>
          </Campo>

          {lista && (
            <div className="rounded-xl bg-slate-50 p-3 space-y-1">
              <p className="text-xs font-semibold text-slate-500">Así quedaría (ejemplos con tu fórmula)</p>
              <div className="grid grid-cols-3 gap-2 text-center">
                {[cfg.incluidos > 0 && cfg.incluidos < 3 ? cfg.incluidos : 1, 3, 5].map(km => (
                  <div key={km} className="rounded-lg bg-white py-2">
                    <p className="text-[11px] text-slate-400">{km} km</p>
                    <p className="text-sm font-bold text-marca">{dinero(costoDomicilio(cfg, km))}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="rounded-xl ring-1 ring-slate-200 p-3 space-y-2">
            <p className="text-xs font-semibold text-slate-600 break-words">Probar la ruta real con una dirección</p>
            <input value={dir} onChange={e => setDir(e.target.value)} placeholder="Ej. Calle 12 # 3-45, Puerto Colombia" className={claseInput} />
            <button onClick={probar} disabled={probando || dir.trim().length < 6 || !guardadoKm}
              className="w-full min-h-11 rounded-xl bg-slate-800 text-white text-sm font-semibold disabled:opacity-40">{probando ? 'Calculando…' : 'Probar'}</button>
            {!guardadoKm && <p className="text-[11px] text-slate-400">Primero guarda los datos para poder probar la ruta.</p>}
            {prueba?.error && <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2 break-words">{prueba.error}</p>}
            {prueba && !prueba.error && (
              <p className="text-sm rounded-lg px-3 py-2 bg-lima/20 text-marca break-words">
                Ruta de <b>{numero(prueba.km)} km</b>{prueba.costo != null ? <> → domicilio <b>{dinero(prueba.costo)}</b></> : null}{prueba.fuera ? ' (fuera de la cobertura)' : ''}. El servicio de mapas está conectado.
              </p>
            )}
          </div>
        </>
      )}
    </div>
  )
}
