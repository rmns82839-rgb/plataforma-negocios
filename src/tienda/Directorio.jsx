import { useEffect, useRef, useState } from 'react'
import Icono from '../cibus/components/Iconos'
import { supabase } from '../lib/supabase'
import { ir } from '../lib/ruta'
import { textoDistancia } from '../lib/horario'
import { Btn, Aviso, Logo, InsigniaHorario, clsInput, PiePlataforma } from './ui'
import MarcaMatriz from './MarcaMatriz'

const TIPOS = [['', 'Todas'], ['tienda', 'Tiendas'], ['ropa', 'Ropa'], ['repuestos', 'Repuestos']]
const NOMBRE_TIPO = { tienda: 'Tienda', ropa: 'Ropa', repuestos: 'Repuestos', mixto: 'Tienda y ropa' }

function Tarjeta({ t }) {
  return (
    <article className="flex flex-col gap-3 rounded-2xl border-2 border-black/5 bg-white p-4 shadow-sm">
      <div className="grid grid-cols-[auto_1fr] items-center gap-4">
        <div className="flex h-16 w-16 items-center justify-center"><Logo n={t} tamano={56} /></div>
        <div className="min-w-0">
          <h2 className="break-words text-xl font-bold leading-tight">{t.nombre}</h2>
          {t.eslogan && <p className="break-words text-base text-tinta/70">{t.eslogan}</p>}
        </div>
      </div>
      <InsigniaHorario estado={t.estado_horario} className="self-start" />
      <ul className="space-y-1 text-base text-tinta/80">
        {t.distancia_km != null && <li className="grid grid-cols-[auto_1fr] gap-2 items-start"><Icono nombre="pin" className="h-5 w-5 mt-0.5" /><span><b>{textoDistancia(t.distancia_km)}</b> de ti</span></li>}
        {(t.direccion || t.ciudad) && <li className="grid grid-cols-[auto_1fr] gap-2 items-start break-words"><Icono nombre="negocio" className="h-5 w-5 mt-0.5" /><span>{[t.direccion, t.ciudad].filter(Boolean).join(', ')}</span></li>}
        <li className="grid grid-cols-[auto_1fr] gap-2 items-start">{t.domicilio ? <Icono nombre="moto" className="h-5 w-5 mt-0.5" /> : <span />}<span>{NOMBRE_TIPO[t.tipo] || 'Tienda'}{t.domicilio ? ' · Hace domicilios' : ''}</span></li>
      </ul>
      <Btn onClick={() => ir(`/t/${t.slug}`)}>Ver la tienda</Btn>
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

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-6 text-lg sm:py-10">
      <div className="mb-6 flex justify-center"><MarcaMatriz tamano={56} /></div>
      <h1 className="mb-1 text-center text-3xl font-bold">Tiendas cerca de ti</h1>
      <p className="mb-5 text-center text-tinta/70">Mira cuáles están abiertas ahora y pide desde tu celular.</p>

      <section className="mb-5 grid gap-3 rounded-2xl border-2 border-black/5 bg-white p-4 shadow-sm">
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
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" role="group" aria-label="Tipo de tienda">
          {TIPOS.map(([v, t]) => (
            <button key={v} onClick={() => setTipo(v)} aria-pressed={tipo === v}
              className={`min-h-12 rounded-xl border-2 px-2 text-base font-semibold ${tipo === v ? 'border-principal bg-principal text-white' : 'border-black/15 bg-white'}`}>{t}</button>
          ))}
        </div>
        <label className="flex min-h-12 items-center gap-3 rounded-xl border-2 border-black/15 px-4 text-lg font-semibold">
          <input type="checkbox" className="h-6 w-6 accent-emerald-700" checked={abiertas} onChange={(e) => setAbiertas(e.target.checked)} />
          Solo las que están abiertas ahora
        </label>
      </section>

      {error && <Aviso tipo="error">{error}</Aviso>}
      {lista === null && !error && <p className="py-10 text-center text-xl text-tinta/60">Buscando tiendas…</p>}
      {lista && lista.length === 0 && !error && (
        <Aviso>No encontramos tiendas con esos datos. {abiertas ? 'Prueba quitando «solo las abiertas». ' : ''}{(q || ciudad || tipo) ? 'Prueba con otra búsqueda.' : 'Muy pronto habrá más tiendas.'}</Aviso>
      )}
      <div className="grid gap-4 sm:grid-cols-2">{lista?.map((t) => <Tarjeta key={t.slug} t={t} />)}</div>
      <div className="mt-8 grid"><Btn variante="suave" onClick={() => ir('/')}>← Volver al inicio</Btn></div>
      <PiePlataforma />
    </main>
  )
}
