// Ofertas: una cinta arriba del catálogo y una ventana promocional que sale una vez por visita.
// La ventana muestra el producto en promoción (con su foto y precio) y los avisos que publica el dueño. Si no hay ofertas (o la migración v7 aún no se ejecutó), no se ve nada.
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import Modal from './Modal'
import { yaVistas, marcarVistas, hastaTexto, mensajeOferta } from '../lib/ofertas'
import { dinero } from '../lib/formato'
import SinFoto from './SinFoto'

function Tarjeta({ o, whatsapp, catalogo, alVer }) {
  const pedir = () =>
    window.open(`https://wa.me/${whatsapp}?text=${encodeURIComponent(mensajeOferta(o, catalogo))}`, '_blank', 'noopener,noreferrer')
  return (
    <article className="rounded-2xl overflow-hidden bg-hueso ring-1 ring-oro/30">
      {o.imagen && (
        <div className="aspect-[16/9] bg-slate-100">
          <img src={o.imagen} alt="" className="w-full h-full object-cover" />
        </div>
      )}
      <div className="p-4 space-y-2">
        <div className="grid grid-cols-[1fr_auto] gap-3 items-start">
          <h3 className="font-display text-xl font-semibold leading-tight text-negro">{o.titulo}</h3>
          {o.etiqueta && (
            <span className="rounded-full bg-negro text-champagne text-xs font-semibold px-3 py-1 whitespace-nowrap">{o.etiqueta}</span>
          )}
        </div>
        {o.detalle && <p className="text-sm text-slate-600 whitespace-pre-line">{o.detalle}</p>}
        {o.hasta && <p className="text-xs font-medium text-oro-oscuro">{hastaTexto(o.hasta)}</p>}
        <div className={`grid gap-2 pt-1 ${whatsapp ? 'grid-cols-2' : 'grid-cols-1'}`}>
          <button onClick={alVer}
            className="h-11 rounded-xl bg-white text-slate-600 text-sm font-medium ring-1 ring-slate-200 active:bg-slate-50">
            Ver catálogo
          </button>
          {whatsapp && (
            <button onClick={pedir}
              className="h-11 rounded-xl bg-negro text-champagne text-sm font-semibold active:opacity-90">
              Pedir por WhatsApp
            </button>
          )}
        </div>
      </div>
    </article>
  )
}

function Destacado({ d, grande, onVer }) {
  return (
    <article className="rounded-2xl overflow-hidden bg-hueso ring-1 ring-oro/30 grid grid-rows-[auto_1fr]">
      <div className={`relative bg-slate-100 ${grande ? 'aspect-[4/3]' : 'aspect-square'}`}>
        {d.imagen ? <img src={d.imagen} alt={d.nombre} className="w-full h-full object-cover" /> : <SinFoto />}
        {d.etiqueta && (
          <span className="absolute top-3 right-3 rounded-full bg-negro text-champagne ring-1 ring-champagne/40 text-xs font-semibold px-3 py-1">{d.etiqueta}</span>
        )}
      </div>
      <div className="p-3 grid gap-2 content-between">
        <div className="space-y-0.5">
          {d.categoria && <p className="text-[10px] uppercase tracking-[0.18em] text-oro break-words">{d.categoria}</p>}
          <h3 className={`font-display font-semibold leading-tight text-negro ${grande ? 'text-xl' : 'text-base'} line-clamp-2`}>{d.nombre}</h3>
          <p className="text-sm font-semibold text-oro-oscuro">
            {d.precio != null ? <>{dinero(d.precio)} <span className="text-xs font-normal text-slate-400 line-through">{dinero(d.antes)}</span></> : (d.nota || '')}
          </p>
        </div>
        <button onClick={onVer} className="h-11 rounded-xl bg-negro text-champagne text-sm font-semibold active:opacity-90">Ver oferta</button>
      </div>
    </article>
  )
}

export default function OfertasPublicas({ tema = 'ropa', catalogo, whatsapp, destacados = [], onVerProducto, onVerTodas, onAbierta }) {
  const [ofertas, setOfertas] = useState([])
  const [abierta, setAbierta] = useState(false)
  const [cargadas, setCargadas] = useState(false)
  const [idx, setIdx] = useState(0)
  useEffect(() => { onAbierta?.(abierta) }, [abierta, onAbierta])          // frase de oferta que se muestra en la cinta

  useEffect(() => {
    const total = destacados.length + ofertas.length
    if (total < 2 || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return undefined
    const t = setInterval(() => setIdx(i => (i + 1) % total), 3500)
    return () => clearInterval(t)
  }, [destacados.length, ofertas.length])

  useEffect(() => {
    let vivo = true
    supabase.from('ofertas_vigentes').select('*').in('catalogo', [catalogo, 'ambos'])
      .order('hasta', { ascending: true, nullsFirst: false }).range(0, 19)
      .then(({ data, error }) => {
        if (!vivo) return
        if (!error && Array.isArray(data)) setOfertas(data)
        setCargadas(true)
      })
    return () => { vivo = false }
  }, [catalogo])

  const todas = useMemo(() => [...ofertas.map(o => ({ id: o.id })), ...destacados.map(d => ({ id: d.id }))], [ofertas, destacados])
  const firmaTodas = todas.map(t => t.id).join(',')
  useEffect(() => {
    if (!cargadas || todas.length === 0) return
    if (!yaVistas(catalogo, todas)) { setAbierta(true); marcarVistas(catalogo, todas) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cargadas, firmaTodas, catalogo])

  if (todas.length === 0) return null
  const n = ofertas.length + destacados.length
  const [primero, ...resto] = destacados
  const extra = resto.slice(0, 4)
  const ver = (id) => { setAbierta(false); onVerProducto?.(id) }
  const lineas = [
    ...destacados.map(d => `${d.nombre}${d.etiqueta ? ` · ${d.etiqueta}` : ''}${d.precio != null ? ` · ${dinero(d.precio)}` : ''}`),
    ...ofertas.map(o => `${o.titulo}${o.etiqueta ? ` · ${o.etiqueta}` : ''}`),
  ]
  const fotos = destacados.filter(d => d.imagen).slice(0, 3).map(d => d.imagen)

  return (
    <>
      <button onClick={() => setAbierta(true)}
        className={`relative w-full overflow-hidden rounded-2xl text-left px-4 py-3 grid grid-cols-[auto_1fr_auto] gap-3 items-center ring-1 ring-champagne/60 shadow-lg active:opacity-90 ${
          tema === 'tienda' ? 'bg-gradient-to-r from-cibus-profundo via-cibus to-cibus-oscuro' : 'bg-gradient-to-r from-negro via-[#232324] to-negro'}`}>
        <span className="brillo" aria-hidden="true" />
        {fotos.length > 0 ? (
          <span className="relative flex -space-x-3" aria-hidden="true">
            {fotos.map((f, i) => <img key={i} src={f} alt="" className="h-11 w-11 rounded-full object-cover ring-2 ring-champagne bg-white" />)}
          </span>
        ) : (
          <span className="relative h-11 w-11 rounded-full bg-champagne text-negro grid place-items-center pulso-suave" aria-hidden="true">
            <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12.5V4h8.5L21 13.5 13.500 21 3 12.500Z" /><circle cx="7.500" cy="8.500" r="1.300" /></svg>
          </span>
        )}
        <span className="relative min-w-0">
          <span className="block text-sm font-semibold text-champagne">{n === 1 ? 'Hay una oferta para ti' : `Hay ${n} ofertas para ti`}</span>
          <span key={idx} className="block text-xs text-hueso/85 break-words oferta-entra">{lineas[idx % lineas.length]}</span>
        </span>
        <span className="relative h-9 px-4 rounded-full bg-champagne text-negro text-xs font-bold inline-flex items-center gap-1.5 pulso-suave">
          Ver <span className="flecha-mueve" aria-hidden="true">→</span>
        </span>
      </button>

      {abierta && (
        <Modal titulo={n === 1 ? 'Oferta' : 'Ofertas para ti'} onCerrar={() => setAbierta(false)} ancho="max-w-md lg:max-w-2xl">
          {primero && <Destacado d={primero} grande onVer={() => ver(primero.id)} />}
          {extra.length > 0 && (
            <div className="grid grid-cols-2 gap-3 [&>article:last-child:nth-child(odd)]:col-span-2">
              {extra.map(d => <Destacado key={d.id} d={d} onVer={() => ver(d.id)} />)}
            </div>
          )}
          {ofertas.length > 0 && (
            <div className="grid gap-4 items-start">
              {ofertas.map(o => <Tarjeta key={o.id} o={o} whatsapp={whatsapp} catalogo={catalogo} alVer={() => setAbierta(false)} />)}
            </div>
          )}
          {destacados.length > 1 && onVerTodas && (
            <button onClick={() => { setAbierta(false); onVerTodas() }}
              className="w-full h-12 rounded-xl bg-white text-negro text-sm font-semibold ring-1 ring-negro/20 active:bg-slate-50">
              Ver más ofertas ({destacados.length})
            </button>
          )}
        </Modal>
      )}
    </>
  )
}
