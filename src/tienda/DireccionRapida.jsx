// Pedido en un toque (C5b): la persona registra su dirección UNA vez (ubicación del celular + dirección exacta + seña)
// y después solo confirma "Sí, es aquí". Cada dirección guardada recuerda su punto exacto del mapa.
// El servidor sigue midiendo los km (api/domicilio): aquí solo se le entrega el punto guardado.
import { lazy, Suspense, useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { llamarDomicilio } from '../lib/domicilio'
import { listar, guardar, marcarUso, textoDireccion, validarDireccion, ETIQUETAS, MAX_DIRECCIONES } from '../lib/direcciones'
import CalculoDomicilio from './CalculoDomicilio'
import { Btn, Aviso, Campo, clsInput } from './ui'

const MapaPin = lazy(() => import('./MapaPin'))
const rpc = (...a) => supabase.rpc(...a)

export default function DireccionRapida({ n, slug, sesion, subtotal, datos, setDatos, calculo, setCalculo, soloLectura = false, recoger }) {
  const [cargando, setCargando] = useState(true)
  const [lista, setLista] = useState([])
  const [vista, setVista] = useState('lista')        // lista · ubicar · detalle · buscar
  const [selId, setSelId] = useState(null)
  const [editId, setEditId] = useState(null)
  const [pin, setPin] = useState(null)
  const [form, setForm] = useState({ etiqueta: 'Casa', direccion: '', sena: '' })
  const [guardarSi, setGuardarSi] = useState(true)
  const [ocupado, setOcupado] = useState(false)
  const [msg, setMsg] = useState('')
  const [errores, setErrores] = useState({})
  const hayCuenta = !!sesion

  const cargar = useCallback(async () => {
    const r = await listar(hayCuenta ? {} : null, rpc)
    setLista(r.lista)
    setSelId((id) => (r.lista.some((d) => d.id === id) ? id : r.lista[0]?.id ?? null))
    return r.lista
  }, [hayCuenta])

  useEffect(() => {
    let vivo = true
    setCargando(true)
    cargar().then((l) => { if (vivo) { setVista(l.length ? 'lista' : 'ubicar'); setCargando(false) } })
    return () => { vivo = false }
  }, [cargar])

  function aplicar(r, texto) {
    setMsg('')
    setDatos((d) => ({ ...d, direccion: texto }))
    if (r.estado === 'ok') setCalculo({ estado: 'ok', calculo_id: r.calculo_id, km: r.km, direccion: texto })
    else if (r.estado === 'fuera_de_zona') setCalculo({ estado: 'fuera_de_zona', mensaje: r.mensaje, maximo_km: r.maximo_km })
    else setCalculo({ estado: r.estado, respaldo: true, calculo_id: r.sin_id ? null : r.calculo_id, mensaje: r.mensaje })
  }

  async function usarGuardada(d) {
    setOcupado(true); setMsg('')
    const texto = textoDireccion(d)
    const r = await llamarDomicilio({ accion: 'calcular', slug, lat: Number(d.lat), lng: Number(d.lng), etiqueta: texto })
    setOcupado(false)
    aplicar(r, texto)
    if (r.estado !== 'fuera_de_zona') marcarUso(hayCuenta ? {} : null, rpc, d.id)
  }

  function empezarNueva(conGps) {
    setEditId(null); setPin(null); setErrores({}); setMsg('')
    setForm({ etiqueta: lista.length ? 'Otra' : 'Casa', direccion: '', sena: '' })
    setVista('ubicar')
    if (conGps) gps()
  }

  function editar(d) {
    setEditId(d.id); setPin({ lat: Number(d.lat), lng: Number(d.lng) }); setErrores({}); setMsg('')
    setForm({ etiqueta: d.etiqueta || 'Casa', direccion: d.direccion || '', sena: d.sena || '' })
    setVista('ubicar')
  }

  function gps() {
    if (!navigator.geolocation) { setMsg('Tu celular no permite ver la ubicación. Escribe tu dirección y búscala en el mapa.'); return }
    setOcupado(true); setMsg('')
    navigator.geolocation.getCurrentPosition(
      (pos) => { setOcupado(false); setPin({ lat: Number(pos.coords.latitude.toFixed(6)), lng: Number(pos.coords.longitude.toFixed(6)) }) },
      () => { setOcupado(false); setMsg('No pudimos ver tu ubicación. Revisa que el permiso de ubicación esté activo en tu celular, o escribe tu dirección y búscala en el mapa.') },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 },
    )
  }

  function irADetalle() { setGuardarSi(!hayCuenta); setErrores({}); setVista('detalle') }

  async function confirmar() {
    const e = validarDireccion({ ...form, ...(pin || {}) })
    setErrores(e)
    if (Object.keys(e).length) return
    setOcupado(true); setMsg('')
    const texto = textoDireccion(form)
    const r = await llamarDomicilio({ accion: 'calcular', slug, lat: pin.lat, lng: pin.lng, etiqueta: texto })
    let aviso = ''
    if (guardarSi && !soloLectura && r.estado !== 'fuera_de_zona') {
      const g = await guardar(hayCuenta ? {} : null, rpc, { ...form, id: editId, lat: pin.lat, lng: pin.lng }, true)
      if (g.error) aviso = g.error
      else if (g.dir) { setSelId(g.dir.id); await cargar() }
    }
    setOcupado(false)
    aplicar(r, texto)
    if (aviso) setMsg(`Tu pedido sigue, pero no pudimos guardar la dirección: ${aviso}`)
  }

  // ---- Ya hay resultado (dirección confirmada, fuera de zona o tarifa fija) ----
  if (calculo) {
    return <CalculoDomicilio n={n} slug={slug} subtotal={subtotal} direccion={datos.direccion} calculo={calculo} setCalculo={setCalculo} soloLectura={soloLectura} recoger={recoger} />
  }
  if (cargando) return <p className="py-6 text-center text-lg text-tinta/60">Buscando tus direcciones…</p>

  const sel = lista.find((d) => d.id === selId) || lista[0]

  // ---- Direcciones guardadas: un toque ----
  if (vista === 'lista' && lista.length) {
    return (
      <div className="space-y-3">
        {msg && <Aviso tipo="previa">{msg}</Aviso>}
        <p className="text-xl font-bold leading-snug">¿A dónde llevamos tu pedido?</p>
        <div className="grid grid-cols-1 gap-3" role="group" aria-label="Tus direcciones guardadas">
          {lista.map((d) => (
            <button key={d.id} type="button" aria-pressed={sel?.id === d.id} onClick={() => setSelId(d.id)}
              className={`min-h-[72px] w-full rounded-2xl border-2 px-4 py-3 text-left leading-snug ${sel?.id === d.id ? 'border-principal bg-principal/5' : 'border-black/10 bg-white'}`}>
              <span className="block text-xl font-bold">{sel?.id === d.id ? '✓ ' : ''}{d.etiqueta}</span>
              <span className="block break-words text-lg">{d.direccion}</span>
              {d.sena && <span className="block break-words text-base text-tinta/70">Seña: {d.sena}</span>}
            </button>
          ))}
        </div>
        <Btn type="button" disabled={ocupado || !sel} onClick={() => usarGuardada(sel)}>{ocupado ? 'Calculando…' : `Sí, enviar a ${sel?.etiqueta || 'esta dirección'}`}</Btn>
        <Btn variante="suave" type="button" disabled={ocupado} onClick={() => empezarNueva(true)}>Estoy en otro lugar (usar mi ubicación)</Btn>
        {lista.length < MAX_DIRECCIONES && <Btn variante="suave" type="button" disabled={ocupado} onClick={() => empezarNueva(false)}>Agregar otra dirección</Btn>}
        {sel && <button type="button" onClick={() => editar(sel)} className="min-h-[48px] text-lg font-semibold text-principal underline">Corregir «{sel.etiqueta}»</button>}
      </div>
    )
  }

  // ---- Paso 1: ubicación ----
  if (vista === 'ubicar') {
    return (
      <div className="space-y-3">
        {lista.length > 0 && <button type="button" onClick={() => { setVista('lista'); setMsg('') }} className="min-h-[48px] text-lg font-semibold text-principal">← Volver a mis direcciones</button>}
        {msg && <Aviso tipo="previa">{msg}</Aviso>}
        <p className="text-xl font-bold leading-snug">{editId ? 'Corregir tu ubicación' : lista.length ? '¿Dónde estás?' : 'Tu ubicación (solo esta vez)'}</p>
        {!pin ? (
          <>
            <p className="text-lg leading-snug text-tinta/80">Toca el botón y acepta el permiso del celular. Así llevamos tu pedido a la puerta exacta{lista.length ? '.' : ' y no tendrás que repetirlo.'}</p>
            <Btn type="button" disabled={ocupado} onClick={gps}>{ocupado ? 'Buscando tu ubicación…' : 'Usar mi ubicación'}</Btn>
            <Btn variante="suave" type="button" disabled={ocupado} onClick={() => { setMsg(''); setVista('buscar') }}>Prefiero escribir la dirección y buscarla</Btn>
          </>
        ) : (
          <>
            <p className="text-lg leading-snug text-tinta/80">¿Es aquí tu puerta? Si no, toca el mapa o arrastra el pin rojo hasta ella.</p>
            <Suspense fallback={<p className="py-10 text-center text-lg text-tinta/60">Cargando el mapa…</p>}>
              <MapaPin centro={null} pin={pin} onPin={(lat, lng) => setPin({ lat, lng })} />
            </Suspense>
            <Btn type="button" onClick={irADetalle}>Sí, es aquí</Btn>
            <Btn variante="suave" type="button" disabled={ocupado} onClick={gps}>{ocupado ? 'Buscando…' : 'Volver a tomar mi ubicación'}</Btn>
          </>
        )}
      </div>
    )
  }

  // ---- Paso 2: dirección exacta + seña ----
  if (vista === 'detalle') {
    return (
      <div className="space-y-4">
        <button type="button" onClick={() => setVista('ubicar')} className="min-h-[48px] text-lg font-semibold text-principal">← Volver al mapa</button>
        {msg && <Aviso tipo="previa">{msg}</Aviso>}
        <p className="text-xl font-bold leading-snug">Escribe tu dirección exacta</p>
        <Campo etiqueta="Dirección exacta" error={errores.direccion} ayuda="Calle o carrera, número y barrio. Solo la escribes esta vez.">
          <input className={clsInput} autoComplete="street-address" value={form.direccion} onChange={(e) => setForm({ ...form, direccion: e.target.value })} />
        </Campo>
        <Campo etiqueta="Seña o referencia (opcional)" ayuda="Ejemplo: portón verde, frente al parque.">
          <input className={clsInput} maxLength={120} value={form.sena} onChange={(e) => setForm({ ...form, sena: e.target.value })} />
        </Campo>
        <div>
          <p className="mb-2 text-lg font-semibold">¿Cómo la llamamos?</p>
          <div className="grid grid-cols-3 gap-2" role="group" aria-label="Nombre de la dirección">
            {ETIQUETAS.map((t) => (
              <button key={t} type="button" aria-pressed={form.etiqueta === t} onClick={() => setForm({ ...form, etiqueta: t })}
                className={`min-h-[56px] rounded-2xl border-2 text-lg font-bold ${form.etiqueta === t ? 'border-principal bg-principal text-white' : 'border-black/10 bg-white'}`}>{t}</button>
            ))}
          </div>
        </div>
        {errores.punto && <p className="text-base font-semibold text-red-700">{errores.punto}</p>}
        <label className="flex min-h-[56px] cursor-pointer items-start gap-3 rounded-2xl border-2 border-black/10 bg-white p-3 text-lg leading-snug">
          <input type="checkbox" className="mt-1 h-6 w-6 shrink-0" checked={guardarSi} onChange={(e) => setGuardarSi(e.target.checked)} />
          <span>{hayCuenta ? 'Guardar esta dirección en mi cuenta para mis próximos pedidos. Acepto el tratamiento de mis datos personales.' : 'Guardar esta dirección en este celular para no escribirla otra vez.'}</span>
        </label>
        <Btn type="button" disabled={ocupado} onClick={confirmar}>{ocupado ? 'Calculando…' : 'Confirmar dirección'}</Btn>
      </div>
    )
  }

  // ---- Alternativa: escribirla y buscarla ----
  return (
    <div className="space-y-3">
      <button type="button" onClick={() => { setMsg(''); setVista(lista.length ? 'lista' : 'ubicar') }} className="min-h-[48px] text-lg font-semibold text-principal">← Volver</button>
      <Campo etiqueta="Dirección de entrega" ayuda="Calle o carrera, número, barrio y alguna seña.">
        <input className={clsInput} autoComplete="street-address" value={datos.direccion} onChange={(e) => setDatos({ ...datos, direccion: e.target.value })} />
      </Campo>
      <CalculoDomicilio n={n} slug={slug} subtotal={subtotal} direccion={datos.direccion} calculo={calculo} setCalculo={setCalculo} soloLectura={soloLectura} recoger={recoger} />
    </div>
  )
}
