// Calcula el domicilio por kilómetros: el cliente confirma su dirección en el mapa y el SERVIDOR mide la distancia.
// Nunca bloquea el pedido: si el mapa falla, se acaba el cupo o no se encuentra la dirección, sigue con la tarifa fija.
import { useState } from 'react'
import { llamarDomicilio } from '../lib/domicilio'
import { cop, tarifaRespaldo, urlWhatsapp } from '../lib/pedido'
import { Btn, Aviso } from './ui'

const num = (v) => String(v).replace('.', ',')

export default function CalculoDomicilio({ n, slug, subtotal, direccion, calculo, setCalculo, recoger, soloLectura = false }) {
  const [fase, setFase] = useState('inicio')        // inicio · buscando · elegir
  const [candidatos, setCandidatos] = useState([])
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
    if (r.estado === 'ok') { setCandidatos(r.candidatos || []); setFase('elegir'); return }
    if (r.estado === 'texto_corto') { setFase('inicio'); setMsg(r.mensaje); return }
    if (r.respaldo) {                       // sin cupo o mapa caído: seguimos con tarifa fija
      setOcupado(true); const g = await llamarDomicilio({ accion: 'respaldo', slug, motivo: 'manual', etiqueta: direccion }); setOcupado(false)
      aplicar({ ...g, estado: r.estado, mensaje: r.mensaje }); return
    }
    // no se encontró: se ofrece marcar la ubicación o escribirla
    setFase('elegir'); setCandidatos([]); setMsg(r.mensaje || 'No encontramos esa dirección.')
  }

  async function elegir(c) {
    setOcupado(true)
    const r = await llamarDomicilio({ accion: 'calcular', slug, lat: c.lat, lng: c.lng, etiqueta: c.etiqueta })
    setOcupado(false); aplicar(r, c.etiqueta)
  }

  function marcarUbicacion() {
    if (!navigator.geolocation) { setMsg('Tu celular no permite marcar la ubicación. Puedes seguir con la dirección escrita.'); return }
    setOcupado(true); setMsg('')
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const r = await llamarDomicilio({ accion: 'calcular', slug, lat: pos.coords.latitude, lng: pos.coords.longitude, etiqueta: 'Ubicación marcada en el mapa' })
        setOcupado(false); aplicar(r, 'Ubicación marcada en el mapa')
      },
      () => { setOcupado(false); setMsg('No pudimos ver tu ubicación. Revisa el permiso del celular o sigue con la dirección escrita.') },
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

  // ---- Elegir entre las direcciones encontradas ----
  if (fase === 'elegir') {
    return (
      <div className="space-y-3">
        <button onClick={cambiar} className="min-h-[48px] text-lg font-semibold text-principal">← Volver a escribir mi dirección</button>
        {msg && <Aviso tipo={candidatos.length ? 'info' : 'previa'}>{msg}</Aviso>}
        {candidatos.length > 0 && <p className="text-xl font-bold">¿Cuál es tu dirección?</p>}
        {candidatos.map((c) => (
          <div key={c.etiqueta} className="rounded-2xl border-2 border-black/10 bg-white p-4">
            <p className="break-words text-lg leading-snug">{c.etiqueta}</p>
            {c.dudosa && <p className="mt-1 text-base font-semibold text-amber-800">No estamos seguros de esta ubicación; confírmala solo si es correcta.</p>}
            <Btn className="mt-3" type="button" disabled={ocupado} onClick={() => elegir(c)}>{ocupado ? 'Calculando…' : 'Sí, es esta'}</Btn>
          </div>
        ))}
        <p className="pt-1 text-lg font-semibold">{candidatos.length ? '¿No es ninguna?' : '¿Qué prefieres?'}</p>
        <Btn variante="suave" type="button" disabled={ocupado} onClick={marcarUbicacion}>Marcar mi ubicación actual</Btn>
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
