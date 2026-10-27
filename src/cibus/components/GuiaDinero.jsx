import { Desplegable } from './BarraFija'
import { GUIA } from '../lib/guiaDinero'

// **negrita** dentro de una frase
const Texto = ({ children }) => String(children).split(/(\*\*[^*]+\*\*)/g).map((t, i) =>
  t.startsWith('**') ? <b key={i} className="font-semibold text-slate-800">{t.slice(2, -2)}</b> : <span key={i}>{t}</span>)

function Bloque({ b }) {
  if (b.t === 'p') return <p className="text-sm text-slate-600 leading-relaxed"><Texto>{b.texto}</Texto></p>
  if (b.t === 'lista') return (
    <div className="space-y-1">
      {b.titulo && <p className="text-xs font-semibold text-slate-500">{b.titulo}</p>}
      <ul className="space-y-1.5">{b.items.map((i, n) => (
        <li key={n} className="grid grid-cols-[auto_1fr] gap-2 text-sm text-slate-600 leading-relaxed"><span className="text-champagne" aria-hidden="true">•</span><span><Texto>{i}</Texto></span></li>
      ))}</ul>
    </div>
  )
  if (b.t === 'pasos') return (
    <ol className="space-y-2">{b.items.map((i, n) => (
      <li key={n} className="grid grid-cols-[1.75rem_1fr] gap-2 text-sm text-slate-600 leading-relaxed">
        <span className="h-7 w-7 rounded-full bg-negro text-champagne text-xs font-semibold grid place-items-center">{n + 1}</span>
        <span className="pt-0.5"><Texto>{i}</Texto></span>
      </li>
    ))}</ol>
  )
  if (b.t === 'ejemplo') return (
    <div className="rounded-xl bg-slate-50 p-3 space-y-1">
      <p className="text-xs font-semibold text-slate-500">{b.titulo}</p>
      <p className="text-sm text-slate-600 leading-relaxed whitespace-pre-line">{b.texto}</p>
    </div>
  )
  if (b.t === 'tabla') return (
    <ul className="space-y-2">{b.filas.map(f => (
      <li key={f.nombre} className="rounded-xl ring-1 ring-slate-100 p-3 space-y-2">
        <p className="text-sm font-semibold">{f.nombre}</p>
        <div className="grid grid-cols-2 gap-2 text-center">
          <div className="rounded-lg bg-slate-50 py-1.5"><p className="text-[11px] text-slate-400">¿Es venta?</p><p className="text-xs font-semibold">{f.venta}</p></div>
          <div className="rounded-lg bg-slate-50 py-1.5"><p className="text-[11px] text-slate-400">¿Entra plata?</p><p className="text-xs font-semibold">{f.entra}</p></div>
        </div>
        <p className="text-xs text-slate-500"><b className="font-semibold">Se registra:</b> {f.donde}</p>
        <p className="text-xs text-slate-500"><b className="font-semibold">Se ve en:</b> {f.ver}</p>
        <p className="text-xs text-slate-400">{f.nota}</p>
      </li>
    ))}</ul>
  )
  return null
}

// Guía del dinero: cómo se maneja cada entrada. El texto vive en lib/guiaDinero.js.
export default function GuiaDinero() {
  return (
    <div className="space-y-3 lg:max-w-2xl lg:mx-auto">
      <div className="rounded-2xl bg-negro text-hueso p-4 space-y-1">
        <p className="font-display text-lg font-semibold text-champagne">Guía del dinero</p>
        <p className="text-xs text-hueso/70">Cómo se maneja cada forma en que entra plata a la tienda. Es una guía general; tu contador tiene la última palabra.</p>
      </div>
      {GUIA.map((s, i) => (
        <Desplegable key={s.id} titulo={s.titulo} nota={s.nota} abierto={i === 0}>
          {s.bloques.map((b, n) => <Bloque key={n} b={b} />)}
        </Desplegable>
      ))}
    </div>
  )
}
