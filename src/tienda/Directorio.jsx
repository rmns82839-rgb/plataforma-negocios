import { useEffect, useRef, useState } from 'react'
import Icono from '../cibus/components/Iconos'
import { supabase } from '../lib/supabase'
import { ir } from '../lib/ruta'
import { textoDistancia } from '../lib/horario'
import { Btn, Aviso, Logo, InsigniaHorario, clsInput, PiePlataforma } from './ui'
import MarcaMatriz from './MarcaMatriz'
import MapaTiendas from './MapaTiendas'
import PieMatriz from './PieMatriz'
import BarraInferior from './BarraInferior'
import BotonWhatsApp from './BotonWhatsApp'
import { TIPOS_NEGOCIO } from '../lib/solicitud'

const TIPOS = [['', 'Todas'], ...TIPOS_NEGOCIO.filter((t) => t.clave !== 'mixto').map((t) => [t.clave, t.nombre.split(' o ')[0]])]
const NOMBRE_TIPO = Object.fromEntries([...TIPOS_NEGOCIO.map((t) => [t.clave, t.nombre]), ['mixto', 'Tienda y ropa']])

const celular = (v) => { let d = String(v ?? '').replace(/\D/g, ''); if (d.length === 12 && d.startsWith('57')) d = d.slice(2); return d.length === 10 ? d : '' }
const celularBonito = (v) => { const d = celular(v); return d ? `${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6)}` : '' }
// Enlace a Google Maps: el que puso la tienda, o su punto, o su dirección escrita
const enlaceMapa = (t) => /^https:\/\//.test(t.maps_url || '') ? t.maps_url
  : (t.lat != null && t.lng != null) ? `https://www.google.com/maps/search/?api=1&query=${t.lat},${t.lng}`
  : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([t.direccion, t.ciudad].filter(Boolean).join(', '))}`
const tienePunto = (t) => t.lat != null && t.lng != null && Number.isFinite(Number(t.lat)) && Number.isFinite(Number(t.lng))

function useAncho(min = 960) {
  const [g, setG] = useState(() => typeof window !== 'undefined' && window.innerWidth >= min)
  useEffect(() => { const f = () => setG(window.innerWidth >= min); window.addEventListener('resize', f); return () => window.removeEventListener('resize', f) }, [min])
  return g
}

function Tarjeta({ t, activa = false, onElegir }) {
  return (
    <article id={`tienda-${t.slug}`} onClick={onElegir} className={`flex cursor-pointer flex-col gap-3 rounded-2xl border-2 bg-white p-4 shadow-sm transition ${activa ? 'border-champagne ring-2 ring-champagne/60' : 'border-black/5'}`}>
      <div className="grid grid-cols-[auto_1fr] items-center gap-4">
        {t.externa && t.logo_url
          ? <div className="flex h-16 w-24 items-center justify-center"><img src={t.logo_url} alt={t.nombre} className="max-h-16 w-full object-contain" /></div>
          : <div className="flex h-16 w-16 items-center justify-center"><Logo n={t} tamano={56} /></div>}
        <div className="min-w-0">
          <h2 className="break-words text-xl font-bold leading-tight">{t.nombre}</h2>
          {t.eslogan && <p className="break-words text-base text-tinta/70">{t.eslogan}</p>}
        </div>
      </div>
      <InsigniaHorario estado={t.estado_horario} className="self-start" />
      <ul className="space-y-1 text-base text-tinta/80">
        {t.distancia_km != null && <li className="grid grid-cols-[auto_1fr] gap-2 items-start"><Icono nombre="pin" className="h-5 w-5 mt-0.5" /><span><b>{textoDistancia(t.distancia_km)}</b> de ti</span></li>}
        {(t.direccion || t.ciudad) && (
          <li className="grid grid-cols-[auto_1fr] items-start gap-2 break-words">
            <Icono nombre="negocio" className="mt-0.5 h-5 w-5" />
            <a href={enlaceMapa(t)} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="font-semibold text-principal underline decoration-principal/40 underline-offset-2">
              {[t.direccion, t.ciudad].filter(Boolean).join(', ')}
            </a>
          </li>
        )}
        {celular(t.telefono) && (
          <li className="grid grid-cols-[auto_1fr] items-start gap-2">
            <Icono nombre="usuario" className="mt-0.5 h-5 w-5" />
            <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <a href={`tel:+57${celular(t.telefono)}`} onClick={(e) => e.stopPropagation()} className="font-semibold text-principal underline underline-offset-2">{celularBonito(t.telefono)}</a>
              <a href={`https://wa.me/57${celular(t.telefono)}`} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="rounded-full bg-[#128C4A] px-3 py-0.5 text-sm font-bold text-white">WhatsApp</a>
            </span>
          </li>
        )}
        <li className="grid grid-cols-[auto_1fr] gap-2 items-start">{t.domicilio ? <Icono nombre="moto" className="h-5 w-5 mt-0.5" /> : <span />}<span>{NOMBRE_TIPO[t.tipo] || 'Tienda'}{t.domicilio ? ' · Hace domicilios' : ''}</span></li>
      </ul>
      <Btn onClick={(e) => { e.stopPropagation(); (t.externa && /^https:\/\//.test(t.url || '') ? window.location.assign(t.url) : ir(`/t/${t.slug}`)) }}>Ver la tienda</Btn>
    </article>
  )
}

export default function Directorio() {
  const [lista, setLista] = useState(null)
  const [ciudades, setCiudades] = useState([])
  const [error, setError] = useState('')
  const [q, setQ] = useState('')
  const [qFiltro, setQFiltro] = useState('')
  const [ciudad, setCiudad] = useState('')
  const [tipo, setTipo] = useState('')
  const [abiertas, setAbiertas] = useState(false)
  const [pos, setPos] = useState(null)               // {lat,lng} cuando el cliente deja ver dónde está
  const [ubicando, setUbicando] = useState(false)
  const [avisoUbic, setAvisoUbic] = useState('')
  const pedido = useRef(0)
  const grande = useAncho()
  const [vista, setVista] = useState('lista')
  const [seleccion, setSeleccion] = useState(null)

  useEffect(() => { const t = setTimeout(() => setQFiltro(q.trim()), 350); return () => clearTimeout(t) }, [q])
  useEffect(() => { supabase.rpc('directorio_ciudades').then(({ data }) => setCiudades(Array.isArray(data) ? data : [])) }, [])

  useEffect(() => {
    const mio = ++pedido.current
    setError('')
    supabase.rpc('directorio_tiendas', {
      p_lat: pos?.lat ?? null, p_lng: pos?.lng ?? null, p_busqueda: qFiltro || null,
      p_ciudad: ciudad || null, p_tipo: tipo || null, p_solo_abiertas: abiertas, p_limite: 60,
    }).then(({ data, error: e }) => {
      if (mio !== pedido.current) return
      if (e) { setError('No pudimos cargar las tiendas. Revisa tu internet e intenta otra vez.'); return setLista([]) }
      setLista(data ?? [])
    })
  }, [pos, qFiltro, ciudad, tipo, abiertas])

  function buscarCerca() {
    setAvisoUbic('')
    if (!navigator.geolocation) return setAvisoUbic('Este celular no permite ver tu ubicación. Escoge tu ciudad en la lista.')
    setUbicando(true)
    navigator.geolocation.getCurrentPosition(
      (p) => { setUbicando(false); setPos({ lat: p.coords.latitude, lng: p.coords.longitude }) },
      () => { setUbicando(false); setAvisoUbic('No pudimos ver dónde estás. Permite la ubicación en tu navegador o escoge tu ciudad en la lista.') },
      { enableHighAccuracy: false, timeout: 12000, maximumAge: 300000 },
    )
  }

  const FILTROS = (
    <section className="grid gap-3 rounded-2xl border-2 border-black/5 bg-white p-4 shadow-sm">
      {pos
        ? <div className="grid grid-cols-[1fr_auto] items-center gap-3 rounded-2xl bg-emerald-50 p-3 text-emerald-900"><span className="grid grid-cols-[auto_1fr] gap-2 items-center"><Icono nombre="pin" className="h-5 w-5" />Ordenadas de la más cercana a la más lejana.</span><button onClick={() => setPos(null)} className="min-h-12 rounded-xl border-2 border-emerald-700/30 px-4 font-semibold">Quitar</button></div>
        : <Btn onClick={buscarCerca} disabled={ubicando}>{ubicando ? 'Buscando dónde estás…' : 'Mostrar las más cercanas a mí'}</Btn>}
      {avisoUbic && <Aviso tipo="info">{avisoUbic}</Aviso>}
      <input className={clsInput} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nombre" aria-label="Buscar tienda por nombre" maxLength={60} />
      {ciudades.length > 1 && (
        <select className={clsInput} value={ciudad} onChange={(e) => setCiudad(e.target.value)} aria-label="Ciudad">
          <option value="">Todas las ciudades</option>
          {ciudades.map((c) => <option key={c.ciudad} value={c.ciudad}>{c.ciudad} ({c.tiendas})</option>)}
        </select>
      )}
      <select className={clsInput} value={tipo} onChange={(e) => setTipo(e.target.value)} aria-label="Tipo de tienda">
      {TIPOS.map(([v, t]) => <option key={v} value={v}>{v ? t : 'Todos los tipos de tienda'}</option>)}
    </select>
      <label className="flex min-h-12 items-center gap-3 rounded-xl border-2 border-black/15 px-4 text-lg font-semibold">
        <input type="checkbox" className="h-6 w-6 accent-emerald-700" checked={abiertas} onChange={(e) => setAbiertas(e.target.checked)} />
        Solo las que están abiertas ahora
      </label>
    </section>
  )
  const elegir = (slug, desdeMapa = false) => {
    setSeleccion(slug)
    if (desdeMapa && grande) setTimeout(() => document.getElementById(`tienda-${slug}`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 40)
  }
  const sel = lista?.find((t) => t.slug === seleccion) || null
  const sinPunto = lista ? lista.filter((t) => !tienePunto(t)).length : 0

  const mensajes = (
    <>
      {error && <Aviso tipo="error">{error}</Aviso>}
      {lista === null && !error && <p className="py-10 text-center text-xl text-tinta/60">Buscando tiendas…</p>}
      {lista && lista.length === 0 && !error && (
        <Aviso>No encontramos tiendas con esos datos. {abiertas ? 'Prueba quitando «solo las abiertas». ' : ''}{(q || ciudad || tipo) ? 'Prueba con otra búsqueda.' : 'Muy pronto habrá más tiendas.'}</Aviso>
      )}
    </>
  )
  const tarjetas = lista?.map((t) => <Tarjeta key={t.slug} t={t} activa={t.slug === seleccion} onElegir={() => elegir(t.slug)} />)
  const mapa = (alto) => lista && lista.length > 0 && (
    <div className="grid gap-3">
      <MapaTiendas tiendas={lista} seleccion={seleccion} onSeleccion={(slug) => elegir(slug, true)} pos={pos} alto={alto} />
      {sinPunto > 0 && <p className="text-center text-sm text-tinta/60">{sinPunto === 1 ? '1 tienda no tiene su punto en el mapa' : `${sinPunto} tiendas no tienen su punto en el mapa`}, pero sí salen en la lista.</p>}
    </div>
  )

  return (
    <div className="bg-papel text-tinta">
      {grande ? (
        <main className="mx-auto w-full max-w-[1400px] px-4 pb-24 pt-4 text-lg" style={{ display: 'grid', gap: 20, gridTemplateColumns: '420px 1fr', alignItems: 'start' }}>
          <div className="grid gap-3" style={{ maxHeight: 'calc(100vh - 96px)', overflowY: 'auto', paddingRight: 6, position: 'sticky', top: 16 }}>
            <div className="flex items-center gap-3"><button onClick={() => ir('/')} aria-label="Ir al inicio"><MarcaMatriz tamano={36} eslogan={false} /></button><h1 className="text-2xl font-bold leading-tight">Tiendas cerca de ti</h1></div>
            {FILTROS}
            {mensajes}
            {tarjetas}
          </div>
          <div style={{ position: 'sticky', top: 16 }}>{mapa('calc(100vh - 96px)')}</div>
        </main>
      ) : (
        <main className="mx-auto w-full max-w-3xl px-4 pb-32 pt-6 text-lg">
          <div className="mb-3 flex justify-center"><MarcaMatriz tamano={44} /></div>
          <h1 className="mb-1 text-center text-[clamp(1.7rem,6vw,2.25rem)] font-bold leading-tight">Tiendas cerca de ti</h1>
          <p className="mb-4 text-center text-tinta/70">Mira dónde están, cuáles están abiertas ahora y pide desde tu celular.</p>
          <div className="mb-4">{FILTROS}</div>
          {lista && lista.length > 0 && (
            <div className="mb-4 grid grid-cols-2 gap-2" role="tablist" aria-label="Ver como">
              {[['lista', 'Lista'], ['mapa', 'Mapa']].map(([v, t]) => (
                <button key={v} role="tab" aria-selected={vista === v} onClick={() => setVista(v)}
                  className={`min-h-12 rounded-xl border-2 text-base font-semibold ${vista === v ? 'border-negro bg-negro text-champagne' : 'border-black/15 bg-white'}`}>{t}</button>
              ))}
            </div>
          )}
          {mensajes}
          {vista === 'lista' && <div className="grid gap-3">{tarjetas}</div>}
          {vista === 'mapa' && (
            <div className="grid gap-3">
              {mapa('calc(100vh - 300px)')}
              {sel && <Tarjeta t={sel} activa />}
            </div>
          )}
        </main>
      )}
      <PieMatriz />
      <BotonWhatsApp />
      <BarraInferior activa="/tiendas" />
    </div>
  )
}
