// Calcula el domicilio por kilómetros: el cliente confirma su dirección en el mapa y el SERVIDOR mide la distancia.
// Nunca bloquea el pedido: si el mapa falla, se acaba el cupo o no se encuentra la dirección, sigue con la tarifa fija.
import { lazy, Suspense, useState } from 'react'
import { llamarDomicilio } from '../lib/domicilio'
import { cop, tarifaRespaldo, urlWhatsapp } from '../lib/pedido'
import { Btn, Aviso } from './ui'

const MapaPin = lazy(() => import('./MapaPin'))

const num = (v) => String(v).replace('.', ',')

export default function CalculoDomicilio({ n, slug, subtotal, direccion, calculo, setCalculo, recoger, soloLectura = false }) {
  const [fase, setFase] = useState('inicio')        // inicio · buscando · elegir
  const [candidatos, setCandidatos] = useState([])
  const [centro, setCentro] = useState(null)
  const [pin, setPin] = useState(null)
  const [tocado, setTocado] = useState(false)   // el cliente movió el pin (obligatorio si no hubo coincidencias)
  const [msg, setMsg] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const dirOk = String(direccion || '').trim().length >= 6

  function aplicar(r, etiqueta) {
    setFase('inicio'); setCandidatos([]); setMsg('')
    if (r.estado === 'ok') setCalculo({ estado: 'ok', calculo_id: r.calculo_id, km: r.km, direccion: etiqueta || r.direccion })
    else if (r.estado === 'fuera_de_zona') setCalculo({ estado: 'fuera_de_zona', mensaje: r.mensaje, maximo_km: r.maximo_km })
    else setCalculo({ estado: r.estado, respaldo: true, calculo_id: r.sin_id ? null : r.calculo_id, mensaje: r.mensaje })
  }

  async function buscar() {
    if (!dirOk) return
    setOcupado(true); setMsg(''); setFase('buscando')
    const r = await llamarDomicilio({ accion: 'buscar', slug, texto: direccion })
    setOcupado(false)
    if (r.estado === 'ok') { abrirMapa(r.candidatos || [], r.centro); return }
    if (r.estado === 'texto_corto') { setFase('inicio'); setMsg(r.mensaje); return }
    if (r.respaldo) {                       // sin cupo o mapa caído: seguimos con tarifa fija
      setOcupado(true); const g = await llamarDomicilio({ accion: 'respaldo', slug, motivo: 'manual', etiqueta: direccion }); setOcupado(false)
      aplicar({ ...g, estado: r.estado, mensaje: r.mensaje }); return
    }
    // no se encontró: mapa para que el cliente marque su puerta
    abrirMapa([], r.centro, r.mensaje || 'No encontramos esa dirección exacta.')
  }

  function abrirMapa(cands, c, aviso = '') {
    setCandidatos(cands); setCentro(c || null); setTocado(false)
    setPin(cands[0] ? { lat: cands[0].lat, lng: cands[0].lng, etiqueta: cands[0].etiqueta } : c ? { lat: c.lat, lng: c.lng } : null)
    setMsg(aviso); setFase('elegir')
  }

  async function confirmarPin() {
    if (!pin) return
    setOcupado(true)
    const etiqueta = pin.etiqueta || 'Punto marcado en el mapa'
    const r = await llamarDomicilio({ accion: 'calcular', slug, lat: pin.lat, lng: pin.lng, etiqueta })
    setOcupado(false); aplicar(r, etiqueta)
  }

  function moverPin(lat, lng) { setPin({ lat, lng, etiqueta: null }); setTocado(true) }

  function usarMiUbicacion() {
    if (!navigator.geolocation) { setMsg('Tu celular no permite ver la ubicación. Toca el mapa donde está tu puerta.'); return }
    setOcupado(true); setMsg('')
    navigator.geolocation.getCurrentPosition(
      (pos) => { setOcupado(false); setPin({ lat: Number(pos.coords.latitude.toFixed(6)), lng: Number(pos.coords.longitude.toFixed(6)), etiqueta: 'Ubicación marcada en el mapa' }); setTocado(true) },
      () => { setOcupado(false); setMsg('No pudimos ver tu ubicación. Revisa el permiso del celular o toca el mapa donde está tu puerta.') },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 },
    )
  }

  async function escribirla() {
    setOcupado(true)
    const g = await llamarDomicilio({ accion: 'respaldo', slug, motivo: 'no_encontrada', etiqueta: direccion })
    setOcupado(false); aplicar({ ...g, estado: 'manual', mensaje: 'Listo, usaremos la dirección que escribiste con la tarifa fija de domicilio.' })
  }

  const cambiar = () => { setCalculo(null); setFase('inicio'); setCandidatos([]); setMsg('') }

  // ---- Resultado ya calculado ----
  if (calculo?.estado === 'ok') {
    return (
      <div className="rounded-2xl border-2 border-green-300 bg-green-50 p-4 text-lg leading-snug">
        <p className="text-xl font-bold text-green-900">✓ Dirección confirmada</p>
        <p className="mt-1 break-words">{calculo.direccion}</p>
        <p className="mt-1 font-semibold">Distancia: {num(calculo.km)} km</p>
        <button onClick={cambiar} className="mt-2 min-h-[48px] text-lg font-semibold text-principal underline">Cambiar la dirección</button>
      </div>
    )
  }
  if (calculo?.estado === 'fuera_de_zona') {
    const wa = n.whatsapp ? urlWhatsapp(n.whatsapp, `Hola ${n.nombre}, mi dirección queda fuera de la zona de domicilio (${direccion}). ¿Pueden ayudarme a coordinar el pedido?`) : null
    return (
      <div className="space-y-3">
        <Aviso tipo="error">{calculo.mensaje}</Aviso>
        {wa && <a href={wa} target="_blank" rel="noopener noreferrer"><Btn variante="verde" type="button">Pedir por WhatsApp</Btn></a>}
        <Btn variante="suave" type="button" onClick={recoger}>Mejor lo recojo en la tienda</Btn>
        <button onClick={cambiar} className="min-h-[48px] text-lg font-semibold text-principal underline">← Probar con otra dirección</button>
      </div>
    )
  }
  if (calculo?.respaldo) {
    return (
      <div className="rounded-2xl border-2 border-amber-300 bg-amber-50 p-4 text-lg leading-snug text-amber-950">
        <p className="font-bold">Domicilio con tarifa fija: {tarifaRespaldo(n, subtotal) === 0 ? 'sin costo' : cop(tarifaRespaldo(n, subtotal))}</p>
        <p className="mt-1">{calculo.mensaje}</p>
        <button onClick={cambiar} className="mt-2 min-h-[48px] text-lg font-semibold text-principal underline">Probar de nuevo con el mapa</button>
      </div>
    )
  }

  // ---- Mapa con pin ----
  if (fase === 'elegir') {
    const sinCoincidencias = candidatos.length === 0
    const puedeConfirmar = !!pin && (!sinCoincidencias || tocado)
    const dudosa = !tocado && pin && candidatos[0]?.dudosa
    return (
      <div className="space-y-3">
        <button onClick={cambiar} className="min-h-[48px] text-lg font-semibold text-principal">← Volver a escribir mi dirección</button>
        {msg && <Aviso tipo="previa">{msg}</Aviso>}
        <p className="text-xl font-bold">{sinCoincidencias ? 'Toca el mapa donde está tu puerta' : 'Ubica tu puerta en el mapa'}</p>
        <p className="text-base text-tinta/70">Toca el mapa o arrastra el pin rojo hasta tu casa. Acerca el mapa con los botones + y − para ser más exacto.</p>
        <Suspense fallback={<p className="py-10 text-center text-lg text-tinta/60">Cargando el mapa…</p>}>
          <MapaPin centro={centro} pin={pin} onPin={moverPin} />
        </Suspense>
        {!tocado && pin?.etiqueta && <p className="break-words rounded-2xl bg-white p-3 text-lg leading-snug">Pin en: {pin.etiqueta}</p>}
        {dudosa && <p className="text-base font-semibold text-amber-800">{candidatos[0]?.aproximada ? 'Solo pudimos ubicar tu barrio: mueve el pin hasta tu puerta para un cobro exacto.' : 'No estamos seguros de esta ubicación: mueve el pin hasta tu puerta.'}</p>}
        <Btn type="button" disabled={ocupado || !puedeConfirmar} onClick={confirmarPin}>{ocupado ? 'Calculando…' : 'Confirmar este punto'}</Btn>
        {!puedeConfirmar && <p className="text-base text-tinta/60">Toca el mapa para poner el pin y poder confirmar.</p>}
        {candidatos.length > 1 && (
          <div className="space-y-2">
            <p className="pt-1 text-lg font-semibold">Otras coincidencias</p>
            {candidatos.slice(1).map((c) => (
              <button key={c.etiqueta} type="button" onClick={() => { setPin({ lat: c.lat, lng: c.lng, etiqueta: c.etiqueta }); setTocado(false) }}
                className="min-h-[56px] w-full rounded-2xl border-2 border-black/10 bg-white px-4 py-2 text-left text-lg leading-snug">{c.etiqueta}</button>
            ))}
          </div>
        )}
        <Btn variante="suave" type="button" disabled={ocupado} onClick={usarMiUbicacion}>Usar mi ubicación actual</Btn>
        <Btn variante="suave" type="button" disabled={ocupado} onClick={escribirla}>Seguir con la dirección que escribí</Btn>
        <p className="text-base text-tinta/60">Si sigues con la dirección escrita, el domicilio se cobra con la tarifa fija de la tienda.</p>
      </div>
    )
  }

  // ---- Inicio ----
  return (
    <div className="space-y-3">
      {msg && <Aviso tipo="previa">{msg}</Aviso>}
      <Btn type="button" disabled={!dirOk || ocupado || soloLectura} onClick={buscar}>{fase === 'buscando' ? 'Buscando tu dirección…' : 'Buscar mi dirección en el mapa'}</Btn>
      {!dirOk && <p className="text-base text-tinta/60">Escribe primero tu dirección completa.</p>}
      <p className="text-base text-tinta/60">Así calculamos el domicilio según la distancia. Tú confirmas la dirección antes de seguir.</p>
    </div>
  )
}
