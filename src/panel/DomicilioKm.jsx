// Domicilio por kilómetros (panel del dueño): ubicar la tienda, definir las reglas, probar el cálculo y activarlo.
// Cada paso tiene su botón "← Volver". El simulador NO usa el mapa ni gasta cupo; la prueba con dirección real gasta 1 cálculo.
import { lazy, Suspense, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { mensajeError } from '../lib/errores'
import { llamarDomicilio } from '../lib/domicilio'
import { cop } from '../lib/pedido'
import { Btn, Volver, Aviso, Campo, clsInput } from '../tienda/ui'
import { Seccion, Insignia, Interruptor, Opciones } from './piezas'

const MapaPin = lazy(() => import('../tienda/MapaPin'))

const nTxt = (v) => (v === null || v === undefined || v === '' ? '' : String(v).replace('.', ','))
const aNum = (t) => { const s = String(t ?? '').trim().replace(/[$\s]/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.'); return s === '' ? null : Number(s) }

export default function DomicilioKm({ ctx, onCambio }) {
  const nid = ctx.neg.negocio_id, slug = ctx.neg.slug
  const tieneModulo = ctx.modulos.includes('domicilio_km')
  const lectura = ctx.soloLectura
  const [paso, setPaso] = useState('resumen')       // resumen · ubicacion · reglas · probar
  const [cfg, setCfg] = useState(null)
  const [plan, setPlan] = useState(null)
  const [msg, setMsg] = useState(null)
  const [ocupado, setOcupado] = useState(false)

  async function cargar() {
    const [a, b, p] = await Promise.all([
      supabase.from('negocio_config').select('lat,lng,direccion,ciudad').eq('negocio_id', nid).single(),
      supabase.from('negocio_reglas').select('domicilio_modo,domicilio_costo,domicilio_km_incluidos,domicilio_valor_km,domicilio_redondeo,domicilio_radio_max_km,domicilio_tarifa_respaldo,envio_gratis_desde').eq('negocio_id', nid).single(),
      supabase.rpc('mi_plan', { p_negocio_id: nid }),
    ])
    if (a.error || b.error) return setMsg({ tipo: 'error', texto: mensajeError(a.error || b.error) })
    setCfg({ ...a.data, ...b.data }); setPlan(p.data)
  }
  useEffect(() => { if (tieneModulo) cargar() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  if (!tieneModulo) {
    return (
      <Seccion titulo="Domicilio por kilómetros">
        <p className="text-lg">Con este servicio cobras el domicilio según la distancia a la casa del cliente. <b>Tu plan actual no lo incluye.</b> Mira «Mi plan» para ver los planes que lo traen.</p>
      </Seccion>
    )
  }
  if (!cfg) return <Seccion titulo="Domicilio por kilómetros"><p className="text-lg text-tinta/60">Cargando…</p></Seccion>

  const volver = () => { setPaso('resumen'); setMsg(null) }
  const ubicada = cfg.lat != null && cfg.lng != null
  const activo = cfg.domicilio_modo === 'km'

  async function cambiarModo(v) {
    setOcupado(true); setMsg(null)
    const { data, error } = await supabase.from('negocio_reglas').update({ domicilio_modo: v ? 'km' : 'fijo' }).eq('negocio_id', nid).select('negocio_id')
    setOcupado(false)
    if (error) return setMsg({ tipo: 'error', texto: mensajeError(error) })
    if (!data?.length) return setMsg({ tipo: 'error', texto: 'No tienes permiso para cambiar esto.' })
    setCfg({ ...cfg, domicilio_modo: v ? 'km' : 'fijo' }); onCambio?.()
    setMsg({ tipo: 'ok', texto: v ? 'Listo: ahora el domicilio se cobra por kilómetros.' : 'Listo: volviste a la tarifa fija.' })
  }

  const M = () => msg && <div className="mt-3"><Aviso tipo={msg.tipo}>{msg.texto}</Aviso></div>

  // ---------------- Resumen ----------------
  if (paso === 'resumen') {
    const limite = plan?.max_calculos_km_mes
    return (
      <Seccion titulo="Domicilio por kilómetros">
        <p className="mb-4 text-lg leading-snug">El cliente confirma su dirección en el mapa y la plataforma mide la distancia. Se cobra solo lo que pase de los kilómetros incluidos. Si el mapa falla, el pedido sigue con tu tarifa fija.</p>
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <Insignia tono={activo ? 'verde' : 'gris'}>{activo ? 'Cobrando por kilómetros' : 'Cobrando tarifa fija'}</Insignia>
          {plan && <Insignia tono="azul">Este mes: {plan.calculos_km_mes ?? 0}{limite != null ? ` de ${limite}` : ''} cálculos</Insignia>}
        </div>
        <div className="grid gap-3">
          {[
            ['ubicacion', '1. Ubicación de mi tienda', ubicada ? 'Ubicada ✓' : 'Falta ubicarla'],
            ['reglas', '2. Mis reglas de cobro', cfg.domicilio_valor_km > 0 ? `${cop(cfg.domicilio_costo || 0)} + ${cop(cfg.domicilio_valor_km)} por km` : 'Falta definirlas'],
            ['probar', '3. Probar el cálculo', 'No gasta tu cupo'],
          ].map(([k, t, s]) => (
            <button key={k} onClick={() => { setPaso(k); setMsg(null) }} className="flex min-h-[72px] w-full flex-col items-start justify-center rounded-2xl border-2 border-black/10 bg-white px-4 py-3 text-left">
              <span className="text-xl font-bold leading-snug">{t}</span><span className="text-base text-tinta/60">{s}</span>
            </button>
          ))}
        </div>
        <div className="mt-4">
          <Interruptor valor={activo} onChange={cambiarModo} deshabilitado={ocupado || lectura} texto="Cobrar el domicilio por kilómetros" ayuda={ubicada ? 'Apágalo para volver a la tarifa fija.' : 'Primero ubica tu tienda (paso 1).'} />
        </div>
        <M />
      </Seccion>
    )
  }

  // ---------------- 1. Ubicación ----------------
  if (paso === 'ubicacion') return <Ubicacion {...{ cfg, slug, nid, lectura, volver, msg, setMsg, onGuardado: (lat, lng) => { setCfg({ ...cfg, lat, lng }); onCambio?.() } }} />
  // ---------------- 2. Reglas ----------------
  if (paso === 'reglas') return <Reglas {...{ cfg, nid, lectura, volver, msg, setMsg, onGuardado: (c) => { setCfg({ ...cfg, ...c }); onCambio?.() } }} />
  // ---------------- 3. Probar ----------------
  return <Probar {...{ cfg, nid, slug, volver, ubicada }} />
}

// =====================================================================
function Ubicacion({ cfg, slug, nid, lectura, volver, msg, setMsg, onGuardado }) {
  const [texto, setTexto] = useState([cfg.direccion, cfg.ciudad].filter(Boolean).join(', '))
  const [cand, setCand] = useState(null)
  const [centro, setCentro] = useState(cfg.lat != null ? { lat: Number(cfg.lat), lng: Number(cfg.lng) } : null)
  const [pin, setPin] = useState(cfg.lat != null ? { lat: Number(cfg.lat), lng: Number(cfg.lng) } : null)
  const [mapa, setMapa] = useState(cfg.lat != null)       // el mapa se ve de una vez si la tienda ya tiene ubicación
  const [ocupado, setOcupado] = useState(false)

  async function buscar() {
    setOcupado(true); setMsg(null); setCand(null)
    const r = await llamarDomicilio({ accion: 'buscar', slug, texto })
    setOcupado(false)
    if (r.estado === 'ok' || r.estado === 'no_encontrada') {
      const lista = r.candidatos || []
      setCand(lista); setMapa(true)
      if (lista[0]) { setPin({ lat: lista[0].lat, lng: lista[0].lng }); setCentro({ lat: lista[0].lat, lng: lista[0].lng }) }
      else if (r.centro) { setCentro(r.centro) }
      if (r.estado === 'no_encontrada') setMsg({ tipo: 'error', texto: 'No encontramos esa dirección exacta. Toca el mapa donde está tu tienda.' })
    } else setMsg({ tipo: 'error', texto: r.mensaje || 'No pudimos buscar esa dirección. Inténtalo de nuevo en un momento.' })
  }
  function usarMiUbicacion() {
    if (!navigator.geolocation) return setMsg({ tipo: 'error', texto: 'Este equipo no permite ver la ubicación. Toca el mapa donde está tu tienda.' })
    setOcupado(true); setMsg(null)
    navigator.geolocation.getCurrentPosition(
      (pos) => { setOcupado(false); const p = { lat: Number(pos.coords.latitude.toFixed(6)), lng: Number(pos.coords.longitude.toFixed(6)) }; setPin(p); setCentro(p); setMapa(true) },
      () => { setOcupado(false); setMsg({ tipo: 'error', texto: 'No pudimos ver tu ubicación. Revisa el permiso o toca el mapa.' }) },
      { enableHighAccuracy: true, timeout: 12000 },
    )
  }
  async function guardar() {
    if (!pin) return
    setOcupado(true); setMsg(null)
    const { data, error } = await supabase.from('negocio_config').update({ lat: pin.lat, lng: pin.lng }).eq('negocio_id', nid).select('negocio_id')
    setOcupado(false)
    if (error) return setMsg({ tipo: 'error', texto: mensajeError(error) })
    if (!data?.length) return setMsg({ tipo: 'error', texto: 'No tienes permiso para cambiar esto.' })
    onGuardado(pin.lat, pin.lng)
    setMsg({ tipo: 'ok', texto: 'Ubicación guardada. Desde este punto se medirán todos los domicilios.' })
  }

  return (
    <Seccion titulo="1. Ubicación de mi tienda">
      <Volver onClick={volver} texto="Volver a domicilio por kilómetros" />
      <p className="mb-3 text-lg leading-snug">Las distancias se miden desde aquí. Busca tu dirección y luego mueve el pin hasta la puerta de tu tienda.</p>
      <Campo etiqueta="Dirección de la tienda"><input className={clsInput} value={texto} onChange={(e) => setTexto(e.target.value)} maxLength={160} disabled={lectura} /></Campo>
      {!lectura && (
        <div className="mt-3 space-y-3">
          <Btn disabled={ocupado || texto.trim().length < 5} onClick={buscar}>{ocupado && !mapa ? 'Buscando…' : 'Buscar en el mapa'}</Btn>
          <Btn variante="suave" disabled={ocupado} onClick={usarMiUbicacion}>Usar mi ubicación actual</Btn>
        </div>
      )}
      {mapa && (
        <div className="mt-4 space-y-3">
          <p className="text-base text-tinta/70">Toca el mapa o arrastra el pin rojo. Acerca con + y − para más exactitud.</p>
          <Suspense fallback={<p className="py-10 text-center text-lg text-tinta/60">Cargando el mapa…</p>}>
            <MapaPin centro={centro} pin={pin} onPin={lectura ? () => {} : (lat, lng) => setPin({ lat, lng })} />
          </Suspense>
          {cand && cand.length > 1 && (
            <div className="space-y-2">
              <p className="text-lg font-semibold">Otras coincidencias</p>
              {cand.map((c) => (
                <button key={c.etiqueta} type="button" onClick={() => { setPin({ lat: c.lat, lng: c.lng }); setCentro({ lat: c.lat, lng: c.lng }) }}
                  className="min-h-[56px] w-full rounded-2xl border-2 border-black/10 bg-white px-4 py-2 text-left text-lg leading-snug">{c.etiqueta}</button>
              ))}
            </div>
          )}
          {!lectura && <Btn disabled={ocupado || !pin} onClick={guardar}>{ocupado ? 'Guardando…' : 'Esta es mi tienda: guardar ubicación'}</Btn>}
        </div>
      )}
      {msg && <div className="mt-3"><Aviso tipo={msg.tipo}>{msg.texto}</Aviso></div>}
    </Seccion>
  )
}

// =====================================================================
function Reglas({ cfg, nid, lectura, volver, msg, setMsg, onGuardado }) {
  const [f, setF] = useState({
    base: nTxt(cfg.domicilio_costo), incl: nTxt(cfg.domicilio_km_incluidos), valor: nTxt(cfg.domicilio_valor_km),
    redondeo: Number(cfg.domicilio_redondeo ?? 500), radio: nTxt(cfg.domicilio_radio_max_km), respaldo: nTxt(cfg.domicilio_tarifa_respaldo),
  })
  const [ocupado, setOcupado] = useState(false)
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })

  async function guardar() {
    const cambio = {
      domicilio_costo: aNum(f.base) ?? 0, domicilio_km_incluidos: aNum(f.incl) ?? 0, domicilio_valor_km: aNum(f.valor) ?? 0,
      domicilio_redondeo: f.redondeo, domicilio_radio_max_km: aNum(f.radio), domicilio_tarifa_respaldo: aNum(f.respaldo),
    }
    if (Object.values(cambio).some((v) => v !== null && Number.isNaN(v))) return setMsg({ tipo: 'error', texto: 'Revisa los números: solo dígitos y coma.' })
    if (cambio.domicilio_radio_max_km !== null && cambio.domicilio_radio_max_km <= 0) return setMsg({ tipo: 'error', texto: 'El radio máximo debe ser mayor que cero (o déjalo vacío para no poner límite).' })
    setOcupado(true); setMsg(null)
    const { data, error } = await supabase.from('negocio_reglas').update(cambio).eq('negocio_id', nid).select('negocio_id')
    setOcupado(false)
    if (error) return setMsg({ tipo: 'error', texto: mensajeError(error) })
    if (!data?.length) return setMsg({ tipo: 'error', texto: 'No tienes permiso para cambiar esto.' })
    onGuardado(cambio); setMsg({ tipo: 'ok', texto: 'Reglas guardadas. Pruébalas en el paso 3.' })
  }

  return (
    <Seccion titulo="2. Mis reglas de cobro">
      <Volver onClick={volver} texto="Volver a domicilio por kilómetros" />
      <fieldset disabled={lectura} className="space-y-5">
        <Campo etiqueta="Base del domicilio ($)" ayuda="Lo mínimo que cobras. Cubre los primeros kilómetros.">
          <input className={clsInput} inputMode="numeric" value={f.base} onChange={set('base')} />
        </Campo>
        <Campo etiqueta="Kilómetros incluidos en la base" ayuda="Hasta cuántos km no cobras nada más. Ejemplo: 2.">
          <input className={clsInput} inputMode="decimal" value={f.incl} onChange={set('incl')} />
        </Campo>
        <Campo etiqueta="Valor por cada kilómetro de más ($)" ayuda="Se cobra solo el exceso sobre los km incluidos.">
          <input className={clsInput} inputMode="numeric" value={f.valor} onChange={set('valor')} />
        </Campo>
        <div>
          <span className="mb-1 block text-lg font-semibold">Redondear el valor al más cercano de</span>
          <Opciones valor={f.redondeo} onChange={(v) => setF({ ...f, redondeo: v })} columnas={3} opciones={[[0, 'Al peso'], [500, '$500'], [1000, '$1.000']]} />
        </div>
        <Campo etiqueta="Radio máximo de entrega (km)" ayuda="Más lejos de esto no se entrega a domicilio. Vacío = sin límite.">
          <input className={clsInput} inputMode="decimal" value={f.radio} onChange={set('radio')} />
        </Campo>
        <Campo etiqueta="Tarifa fija de respaldo ($)" ayuda="Se cobra si el mapa no puede medir (se acaba el cupo, falla o no encuentra la dirección). Vacío = se usa la base.">
          <input className={clsInput} inputMode="numeric" value={f.respaldo} onChange={set('respaldo')} />
        </Campo>
      </fieldset>
      {!lectura && <div className="mt-4"><Btn disabled={ocupado} onClick={guardar}>{ocupado ? 'Guardando…' : 'Guardar mis reglas'}</Btn></div>}
      {msg && <div className="mt-3"><Aviso tipo={msg.tipo}>{msg.texto}</Aviso></div>}
    </Seccion>
  )
}

// =====================================================================
function Desglose({ s }) {
  return (
    <div className="mt-3 rounded-2xl border-2 border-black/5 bg-white p-4 text-lg leading-snug">
      {s.fuera_de_zona && <Aviso tipo="error">{`Esta distancia queda fuera de tu zona (máximo ${nTxt(s.radio_max_km)} km): el cliente vería el aviso para pedir por WhatsApp o recoger.`}</Aviso>}
      <p className="mt-2"><b>{nTxt(s.km)} km</b> · base {cop(s.base)} · {nTxt(s.km_incluidos)} km incluidos</p>
      <p>Kilómetros de más: {nTxt(s.km_exceso)} × {cop(s.valor_km)} = {cop(Math.round(s.km_exceso * s.valor_km))}</p>
      <p>Antes de redondear: {cop(s.antes_de_redondear)}</p>
      {s.envio_gratis && <p className="font-semibold text-[#0d6b38]">Por el valor de la compra, el domicilio sale gratis.</p>}
      <p className="mt-1 text-2xl font-bold">El cliente paga: {s.costo === 0 ? 'sin costo' : cop(s.costo)}</p>
      <p className="text-base text-tinta/60">Si el mapa fallara, cobrarías la tarifa fija de respaldo: {cop(s.tarifa_respaldo)}.</p>
    </div>
  )
}

function Probar({ cfg, nid, slug, volver, ubicada }) {
  const [km, setKm] = useState('3')
  const [sub, setSub] = useState('20000')
  const [res, setRes] = useState(null)
  const [err, setErr] = useState('')
  const [dir, setDir] = useState('')
  const [cand, setCand] = useState(null)
  const [real, setReal] = useState(null)
  const [ocupado, setOcupado] = useState(false)

  async function simular(kmv, subv) {
    const { data, error } = await supabase.rpc('simular_domicilio', { p_negocio_id: nid, p_km: kmv, p_subtotal: subv })
    if (error) throw error
    return data
  }
  async function probar() {
    setErr(''); setRes(null)
    const k = aNum(km), s = aNum(sub) ?? 0
    if (k === null || Number.isNaN(k) || k < 0 || k > 200) return setErr('Escribe unos kilómetros entre 0 y 200 (ejemplo: 3,5).')
    try { setRes(await simular(k, s)) } catch (e) { setErr(mensajeError(e)) }
  }
  async function buscarReal() {
    setOcupado(true); setErr(''); setCand(null); setReal(null)
    const r = await llamarDomicilio({ accion: 'buscar', slug, texto: dir })
    setOcupado(false)
    if (r.estado === 'ok') setCand(r.candidatos); else setErr(r.mensaje || 'No pudimos buscar esa dirección.')
  }
  async function calcularReal(c) {
    setOcupado(true); setErr(''); setCand(null)
    const r = await llamarDomicilio({ accion: 'calcular', slug, lat: c.lat, lng: c.lng, etiqueta: c.etiqueta })
    try {
      if (r.estado === 'ok') setReal({ r, s: await simular(r.km, aNum(sub) ?? 0), etiqueta: c.etiqueta })
      else setReal({ r })
    } catch (e) { setErr(mensajeError(e)) }
    setOcupado(false)
  }

  return (
    <Seccion titulo="3. Probar el cálculo">
      <Volver onClick={volver} texto="Volver a domicilio por kilómetros" />
      <Aviso tipo="ok">Esta prueba <b>no usa el mapa ni gasta tu cupo</b>: aplica tus reglas a los kilómetros que escribas.</Aviso>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <Campo etiqueta="Kilómetros"><input className={clsInput} inputMode="decimal" value={km} onChange={(e) => setKm(e.target.value)} /></Campo>
        <Campo etiqueta="Compra ($)"><input className={clsInput} inputMode="numeric" value={sub} onChange={(e) => setSub(e.target.value)} /></Campo>
      </div>
      <div className="mt-3"><Btn onClick={probar}>Calcular</Btn></div>
      {err && <div className="mt-3"><Aviso tipo="error">{err}</Aviso></div>}
      {res && <Desglose s={res} />}

      <h4 className="mb-2 mt-8 text-xl font-bold">Prueba con una dirección real</h4>
      {!ubicada ? <Aviso tipo="previa">Primero ubica tu tienda en el paso 1.</Aviso> : (
        <>
          <Aviso tipo="previa">Esta sí usa el mapa y <b>gasta 1 cálculo</b> de tu cupo del mes.</Aviso>
          <div className="mt-3"><Campo etiqueta="Dirección de un cliente de prueba"><input className={clsInput} value={dir} onChange={(e) => setDir(e.target.value)} maxLength={160} /></Campo></div>
          <div className="mt-3"><Btn variante="suave" disabled={ocupado || dir.trim().length < 5} onClick={buscarReal}>{ocupado && !cand ? 'Buscando…' : 'Buscar dirección'}</Btn></div>
          {cand && (
            <div className="mt-3 space-y-3">
              {cand.length === 0 && <Aviso tipo="previa">No encontramos esa dirección.</Aviso>}
              {cand.map((c) => (
                <div key={c.etiqueta} className="rounded-2xl border-2 border-black/10 bg-white p-4">
                  <p className="break-words text-lg leading-snug">{c.etiqueta}</p>
                  <Btn className="mt-3" disabled={ocupado} onClick={() => calcularReal(c)}>{ocupado ? 'Calculando…' : 'Medir hasta aquí (gasta 1)'}</Btn>
                </div>
              ))}
            </div>
          )}
          {real?.s && (<><p className="mt-3 break-words text-lg">{real.etiqueta}</p><Desglose s={real.s} /></>)}
          {real && !real.s && <div className="mt-3"><Aviso tipo={real.r.estado === 'fuera_de_zona' ? 'error' : 'previa'}>{real.r.mensaje}</Aviso></div>}
        </>
      )}
    </Seccion>
  )
}
