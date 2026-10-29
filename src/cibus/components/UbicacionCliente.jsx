// Ubicar la puerta del cliente UNA vez: escribe su dirección, la ve en el mapa (o usa el GPS del celular), mueve el pin hasta su puerta y confirma.
// Entrega { direccion, lat, lng }. Si el mapa no está disponible deja seguir solo con la dirección escrita.
import { lazy, Suspense, useState } from 'react'
import { llamarDomicilio } from '../../lib/domicilio'
import { claseInput } from '../lib/estilos'
import { Campo } from './Modal'
import Icono from './Iconos'

const MapaPin = lazy(() => import('../../tienda/MapaPin'))

export default function UbicacionCliente({ slug, inicial = null, onConfirmar, onVolver = null, etiquetaBoton = 'Confirmar mi ubicación', ocupadoFuera = false }) {
  const [dir, setDir] = useState(inicial?.direccion ?? '')
  const [fase, setFase] = useState('inicio')               // inicio · buscando · mapa
  const [cands, setCands] = useState([])
  const [centro, setCentro] = useState(null)
  const [pin, setPin] = useState(null)
  const [tocado, setTocado] = useState(false)
  const [msg, setMsg] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [sinMapa, setSinMapa] = useState(false)             // el mapa falló: se permite seguir con la dirección escrita
  const dirOk = dir.trim().length >= 6

  const abrirMapa = (lista, c, aviso = '') => {
    setCands(lista); setCentro(c || null); setTocado(false)
    setPin(lista[0] ? { lat: lista[0].lat, lng: lista[0].lng, etiqueta: lista[0].etiqueta } : c ? { lat: c.lat, lng: c.lng } : null)
    setMsg(aviso); setFase('mapa')
  }

  const buscar = async () => {
    if (!dirOk) { setMsg('Escribe tu dirección completa: calle, número y barrio.'); return }
    setOcupado(true); setMsg(''); setFase('buscando')
    const r = await llamarDomicilio({ accion: 'buscar', slug, texto: dir.trim() })
    setOcupado(false)
    if (r.estado === 'ok') { abrirMapa(r.candidatos || [], r.centro); return }
    if (r.estado === 'texto_corto') { setFase('inicio'); setMsg(r.mensaje); return }
    setSinMapa(true)
    abrirMapa([], r.centro, r.estado === 'no_encontrada' ? 'No encontramos esa dirección exacta. Toca el mapa donde está tu puerta.' : 'Toca el mapa donde está tu puerta o usa tu ubicación actual.')
  }

  const usarMiUbicacion = () => {
    if (!navigator.geolocation) { setMsg('Tu celular no permite ver la ubicación. Toca el mapa donde está tu puerta.'); if (fase === 'inicio') abrirMapa([], null); return }
    setOcupado(true); setMsg('')
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const p = { lat: Number(pos.coords.latitude.toFixed(6)), lng: Number(pos.coords.longitude.toFixed(6)) }
        setOcupado(false); setPin({ ...p, etiqueta: 'Tu ubicación actual' }); setTocado(true)
        if (fase !== 'mapa') { setCands([]); setCentro(p); setFase('mapa') }
      },
      () => { setOcupado(false); setMsg('No pudimos ver tu ubicación. Revisa el permiso del celular o toca el mapa donde está tu puerta.'); if (fase === 'inicio') abrirMapa([], null) },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 })
  }

  const moverPin = (lat, lng) => { setPin({ lat, lng, etiqueta: null }); setTocado(true) }
  const puede = dirOk && !!pin && (cands.length > 0 || tocado)
  const dudosa = !tocado && pin && cands[0]?.dudosa

  return (
    <div className="space-y-3">
      <Campo etiqueta="Dirección de entrega *">
        <input value={dir} onChange={e => { setDir(e.target.value); setMsg('') }} maxLength={160} autoComplete="street-address"
          placeholder="Calle 10 # 5-20, barrio, ciudad" className={claseInput} />
      </Campo>

      {fase !== 'mapa' && (
        <>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={buscar} disabled={ocupado || !dirOk}
              className="min-h-14 rounded-xl bg-cibus text-white text-base font-semibold px-2 leading-tight grid grid-cols-[auto_1fr] gap-2 items-center justify-items-center disabled:opacity-40 active:opacity-80">
              <Icono nombre="buscar" className="h-5 w-5" /><span>{fase === 'buscando' ? 'Buscando…' : 'Buscar en el mapa'}</span>
            </button>
            <button type="button" onClick={usarMiUbicacion} disabled={ocupado}
              className="min-h-14 rounded-xl bg-white ring-1 ring-slate-300 text-slate-700 text-base font-semibold px-2 leading-tight grid grid-cols-[auto_1fr] gap-2 items-center justify-items-center disabled:opacity-40 active:bg-slate-100">
              <Icono nombre="pin" className="h-5 w-5" /><span>Usar mi ubicación</span>
            </button>
          </div>
          <p className="text-sm text-slate-600">Escribe tu dirección y la buscamos en el mapa. Tú marcas tu puerta una sola vez y queda guardada para siempre.</p>
        </>
      )}
      {msg && <p role="status" className="text-base rounded-lg px-3 py-2 bg-champagne/30 text-negro break-words">{msg}</p>}

      {fase === 'mapa' && (
        <div className="space-y-3">
          <p className="text-lg font-bold text-slate-800">{cands.length === 0 ? 'Toca el mapa donde está tu puerta' : 'Ubica tu puerta en el mapa'}</p>
          <p className="text-base text-slate-600">Toca el mapa o arrastra el pin hasta tu casa. Con los botones + y − lo acercas para ser más exacto.</p>
          <Suspense fallback={<p className="py-10 text-center text-base text-slate-500">Cargando el mapa…</p>}>
            <MapaPin centro={centro} pin={pin} onPin={moverPin} alto={300} />
          </Suspense>
          {!tocado && pin?.etiqueta && <p className="break-words rounded-xl bg-slate-50 p-3 text-base leading-snug">Pin en: {pin.etiqueta}</p>}
          {dudosa && <p className="text-base font-semibold text-amber-800">{cands[0]?.aproximada ? 'Solo pudimos ubicar tu barrio: mueve el pin hasta tu puerta para un cobro exacto.' : 'No estamos seguros de esta ubicación: mueve el pin hasta tu puerta.'}</p>}
          <button type="button" disabled={!puede || ocupado || ocupadoFuera} onClick={() => onConfirmar({ direccion: dir.trim(), lat: pin.lat, lng: pin.lng })}
            className="w-full min-h-14 rounded-xl bg-negro text-champagne text-lg font-semibold disabled:opacity-40 active:opacity-90">
            {ocupadoFuera ? 'Guardando…' : etiquetaBoton}
          </button>
          {!puede && <p className="text-sm text-slate-500">{!dirOk ? 'Escribe arriba tu dirección para poder confirmar.' : 'Toca el mapa para poner el pin y poder confirmar.'}</p>}
          {cands.length > 1 && (
            <div className="space-y-2">
              <p className="text-base font-semibold text-slate-700">Otras coincidencias</p>
              {cands.slice(1).map(c => (
                <button key={c.etiqueta} type="button" onClick={() => { setPin({ lat: c.lat, lng: c.lng, etiqueta: c.etiqueta }); setTocado(false) }}
                  className="min-h-14 w-full rounded-xl ring-1 ring-slate-200 bg-white px-4 py-2 text-left text-base leading-snug break-words active:bg-slate-100">{c.etiqueta}</button>
              ))}
            </div>
          )}
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => { setFase('inicio'); setMsg('') }}
              className="min-h-12 rounded-xl bg-slate-100 text-slate-600 text-base font-medium active:bg-slate-200">← Volver</button>
            <button type="button" onClick={usarMiUbicacion} disabled={ocupado}
              className="min-h-12 rounded-xl bg-white ring-1 ring-slate-300 text-slate-700 text-base font-semibold px-2 leading-tight disabled:opacity-40 active:bg-slate-100">Usar mi ubicación</button>
          </div>
          {sinMapa && dirOk && (
            <button type="button" onClick={() => onConfirmar({ direccion: dir.trim(), lat: null, lng: null })} disabled={ocupadoFuera}
              className="w-full min-h-12 rounded-xl text-base font-semibold text-oro-oscuro underline">Seguir solo con la dirección escrita</button>
          )}
        </div>
      )}
      {onVolver && fase !== 'mapa' && (
        <button type="button" onClick={onVolver} className="w-full min-h-12 rounded-xl bg-slate-100 text-slate-600 text-base font-medium active:bg-slate-200">← Volver</button>
      )}
    </div>
  )
}
