// Gráficas del tablero (pestaña "Gráficas"): rosca, mosaico, cascada, dispersión, barras al 100 %,
// tendencia e indicadores con meta. Todo en SVG/CSS sin librerías; cada una tiene su "Tabla" para leer los números.
import { useMemo, useState } from 'react'
import { dinero, numero } from '../lib/formato'
import { textoMetodo } from '../lib/pagos'
import { PALETA, conOtros, mosaico, cascada, acumulado, leerMeta, guardarMeta, polar } from '../lib/graficas'

const dineroCorto = (n) => {
  const v = Number(n) || 0
  if (Math.abs(v) >= 1e6) return `$${(v / 1e6).toFixed(Math.abs(v) >= 1e7 ? 0 : 1).replace('.0', '')} M`
  if (Math.abs(v) >= 1e3) return `$${Math.round(v / 1e3)} mil`
  return `$${Math.round(v)}`
}
const pct = (a, b) => (b > 0 ? Math.round((a / b) * 100) : 0)

// Tarjeta con título, línea de detalle (al tocar) y vista de tabla
function Grafica({ titulo, nota, detalle, tabla, ancha, children }) {
  const [verTabla, setVerTabla] = useState(false)
  return (
    <section className={`bg-white rounded-2xl shadow-sm p-4 space-y-3 min-w-0 ${ancha ? 'lg:col-span-2' : ''}`}>
      <div className="grid grid-cols-[1fr_auto] gap-2 items-center">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold leading-snug break-words">{titulo}</h2>
          {nota && <p className="text-[11px] text-slate-400 leading-snug break-words">{nota}</p>}
        </div>
        {tabla && (
          <button onClick={() => setVerTabla(t => !t)} className="h-8 px-3 rounded-lg bg-slate-100 text-[11px] font-medium text-slate-600">
            {verTabla ? 'Gráfica' : 'Tabla'}
          </button>
        )}
      </div>
      {verTabla && tabla ? (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-[11px] text-slate-400 text-left">
              {tabla.cols.map((c, i) => <th key={c} className={`pb-1 font-medium ${i ? 'text-right' : ''}`}>{c}</th>)}
            </tr></thead>
            <tbody className="divide-y divide-slate-100">
              {tabla.filas.map((f, i) => (
                <tr key={i}>{f.map((c, j) => <td key={j} className={`py-1.5 ${j ? 'text-right font-medium' : 'break-words max-w-[10rem]'}`}>{c}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <>
          {detalle !== undefined && <p className="h-5 text-xs text-slate-600 break-words" aria-live="polite">{detalle}</p>}
          {children}
        </>
      )}
    </section>
  )
}
const Vacio = ({ t = 'Sin datos en este periodo' }) => <p className="py-8 text-center text-sm text-slate-400">{t}</p>

// ---------- Rosca (donut) ----------
function Rosca({ titulo, nota, filas, centro }) {
  const [act, setAct] = useState(null)
  const datos = useMemo(() => conOtros(filas), [filas])
  const total = datos.reduce((s, f) => s + f.valor, 0)
  const R = 70, G = 26, C = 2 * Math.PI * R
  const inicios = datos.map((_, i) => datos.slice(0, i).reduce((a, f) => a + (f.valor / total) * C, 0))
  const sel = act != null ? datos[act] : null
  return (
    <Grafica titulo={titulo} nota={nota}
      detalle={sel ? `${sel.nombre} · ${dinero(sel.valor)} · ${pct(sel.valor, total)} %` : ''}
      tabla={{ cols: ['Nombre', 'Monto', '%'], filas: datos.map(f => [f.nombre, dinero(f.valor), `${pct(f.valor, total)} %`]) }}>
      {total <= 0 ? <Vacio /> : (
        <div className="grid grid-cols-[minmax(0,11rem)_1fr] gap-4 items-center">
          <svg viewBox="0 0 200 200" className="w-full" role="img" aria-label={titulo} onMouseLeave={() => setAct(null)}>
            <g transform="rotate(-90 100 100)">
              {datos.map((f, i) => {
                const len = (f.valor / total) * C
                const desde = inicios[i]
                const el = (
                  <circle key={f.nombre} cx="100" cy="100" r={R} fill="none" stroke={f.color} strokeWidth={act === i ? G + 6 : G}
                    strokeDasharray={`${Math.max(0, len - 2)} ${C}`} strokeDashoffset={-desde} className="cursor-pointer transition-all"
                    onMouseEnter={() => setAct(i)} onClick={() => setAct(act === i ? null : i)} />
                )
                return el
              })}
            </g>
            <text x="100" y="96" pointerEvents="none" textAnchor="middle" className="fill-slate-400" fontSize="11">{centro}</text>
            <text x="100" y="116" pointerEvents="none" textAnchor="middle" className="fill-black font-semibold" fontSize="17">{dineroCorto(total)}</text>
          </svg>
          <ul className="space-y-2 min-w-0">
            {datos.map((f, i) => (
              <li key={f.nombre} onMouseEnter={() => setAct(i)} onMouseLeave={() => setAct(null)}
                  className="grid grid-cols-[0.75rem_1fr_auto] gap-2 items-center text-xs">
                <span className="h-3 w-3 rounded-sm" style={{ background: f.color }} />
                <span className="break-words">{f.nombre}</span>
                <span className="font-semibold">{pct(f.valor, total)} %</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Grafica>
  )
}

// ---------- Mosaico (treemap) ----------
function Mosaico({ titulo, nota, filas }) {
  const [act, setAct] = useState(null)
  const datos = useMemo(() => conOtros(filas, 8).map((f, i) => ({ ...f, color: f.nombre === 'Otros' ? f.color : PALETA[i % PALETA.length] })), [filas])
  const cajas = useMemo(() => mosaico(datos), [datos])
  const total = datos.reduce((s, f) => s + f.valor, 0)
  const sel = act != null ? cajas[act] : null
  return (
    <Grafica titulo={titulo} nota={nota} detalle={sel ? `${sel.nombre} · ${dinero(sel.valor)} · ${pct(sel.valor, total)} %` : ''}
      tabla={{ cols: ['Producto', 'Vendido', '%'], filas: datos.map(f => [f.nombre, dinero(f.valor), `${pct(f.valor, total)} %`]) }}>
      {total <= 0 ? <Vacio /> : (
        <div className="relative h-56 rounded-xl overflow-hidden" onMouseLeave={() => setAct(null)}>
          {cajas.map((c, i) => (
            <button key={c.nombre} type="button" onMouseEnter={() => setAct(i)} onClick={() => setAct(act === i ? null : i)}
              aria-label={`${c.nombre}: ${dinero(c.valor)}`}
              className="absolute p-1.5 text-left text-white overflow-hidden outline outline-2 outline-white"
              style={{ left: `${c.x}%`, top: `${c.y}%`, width: `${c.w}%`, height: `${c.h}%`, background: c.color, opacity: act == null || act === i ? 1 : 0.7 }}>
              {c.w > 18 && c.h > 14 && (
                <span className="block text-[11px] font-semibold leading-tight line-clamp-2">{c.nombre}<span className="block font-normal opacity-90">{pct(c.valor, total)} %</span></span>
              )}
            </button>
          ))}
        </div>
      )}
    </Grafica>
  )
}

// ---------- Cascada ----------
function Cascada({ d }) {
  const filas = useMemo(() => cascada(d), [d])
  const max = Math.max(...filas.map(f => f.hasta), 1)
  const min = Math.min(...filas.map(f => f.desde), 0)
  const rango = max - min
  const pos = (v) => ((v - min) / rango) * 100
  const hay = Number(d.vendido) > 0
  return (
    <Grafica titulo="¿A dónde se va el dinero?" nota="De lo vendido a la ganancia neta"
      tabla={{ cols: ['Paso', 'Valor'], filas: filas.map(f => [f.nombre, dinero(f.tipo === 'baja' ? -f.valor : (f.negativo ? -(f.hasta - f.desde) : f.hasta - f.desde))]) }}>
      {!hay ? <Vacio /> : (
        <ul className="space-y-2.5">
          {filas.map(f => {
            const color = f.tipo === 'baja' ? '#D2573B' : f.negativo ? '#D2573B' : f.nombre === 'Vendido' ? '#2F6FB5' : '#0E8A6B'
            return (
              <li key={f.nombre} className="grid gap-1">
                <div className="grid grid-cols-[1fr_auto] gap-3 text-xs">
                  <span className="break-words">{f.nombre}</span>
                  <span className="font-semibold">{f.tipo === 'baja' ? '− ' : ''}{dinero(f.tipo === 'baja' ? f.valor : f.negativo ? f.desde : f.hasta)}</span>
                </div>
                <div className="relative h-3 rounded-full bg-slate-100">
                  <span className="absolute top-0 h-full rounded-full" style={{ left: `${pos(f.desde)}%`, width: `${Math.max(1.5, pos(f.hasta) - pos(f.desde))}%`, background: color }} />
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </Grafica>
  )
}

// ---------- Dispersión ----------
function Dispersion({ filas }) {
  const [act, setAct] = useState(null)
  const pts = filas.filter(f => f.x > 0 || f.y !== 0)
  const W = 300, H = 190, L = 44, B = 26, T = 10, Rr = 12
  const mx = Math.max(...pts.map(p => p.x), 1), my = Math.max(...pts.map(p => p.y), 1)
  const X = (v) => L + (v / mx) * (W - L - Rr), Y = (v) => T + (1 - v / my) * (H - T - B)
  const sel = act != null ? pts[act] : null
  return (
    <Grafica titulo="Qué vende mucho y qué deja más" nota="Cada punto es un producto: unidades vs ganancia"
      detalle={sel ? `${sel.nombre} · ${numero(sel.x)} unid. · ganancia ${dinero(sel.y)}` : ''}
      tabla={{ cols: ['Producto', 'Unidades', 'Ganancia'], filas: pts.map(p => [p.nombre, numero(p.x), dinero(p.y)]) }}>
      {pts.length === 0 ? <Vacio /> : (
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Dispersión de productos" onMouseLeave={() => setAct(null)}>
          {[0, 0.5, 1].map(t => (
            <g key={t}>
              <line x1={L} x2={W - Rr} y1={Y(my * t)} y2={Y(my * t)} stroke="#E7E5E4" strokeWidth="1" />
              <text x={L - 5} y={Y(my * t) + 3} textAnchor="end" fontSize="9" className="fill-slate-400">{dineroCorto(my * t)}</text>
              <text x={X(mx * t)} y={H - 10} textAnchor={t === 0 ? 'start' : t === 1 ? 'end' : 'middle'} fontSize="9" className="fill-slate-400">{numero(Math.round(mx * t))}</text>
            </g>
          ))}
          <text x={(L + W) / 2} y={H - 0.5} textAnchor="middle" fontSize="8" className="fill-slate-400">unidades vendidas →</text>
          {pts.map((p, i) => (
            <g key={p.nombre} onMouseEnter={() => setAct(i)} onClick={() => setAct(act === i ? null : i)} className="cursor-pointer">
              <circle cx={X(p.x)} cy={Y(p.y)} r="14" fill="transparent" />
              <circle cx={X(p.x)} cy={Y(p.y)} r={act === i ? 8 : 6} fill={PALETA[0]} stroke="#fff" strokeWidth="2" />
              {i < 3 && <text x={p.x > mx * 0.6 ? X(p.x) - 9 : X(p.x) + 9} textAnchor={p.x > mx * 0.6 ? 'end' : 'start'} y={Y(p.y) + 3} fontSize="9" className="fill-slate-600">{p.nombre.length > 14 ? p.nombre.slice(0, 13) + '…' : p.nombre}</text>}
            </g>
          ))}
        </svg>
      )}
    </Grafica>
  )
}

// ---------- Barras apiladas al 100 % ----------
function Apiladas({ filas }) {
  const datos = filas.filter(f => f.venta > 0)
  return (
    <Grafica titulo="De cada $100 vendidos, cuánto es ganancia" nota="Por categoría: costo vs ganancia"
      tabla={{ cols: ['Categoría', 'Costo', 'Ganancia'], filas: datos.map(f => [f.nombre, `${pct(f.venta - f.ganancia, f.venta)} %`, `${pct(f.ganancia, f.venta)} %`]) }}>
      {datos.length === 0 ? <Vacio /> : (
        <>
          <div className="flex gap-4 text-[11px] text-slate-600">
            <span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-sm" style={{ background: PALETA[0] }} /> Costo</span>
            <span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-sm" style={{ background: PALETA[2] }} /> Ganancia</span>
          </div>
          <ul className="space-y-3">
            {datos.map(f => {
              const g = Math.min(100, Math.max(0, pct(f.ganancia, f.venta)))
              return (
                <li key={f.nombre} className="grid gap-1">
                  <div className="grid grid-cols-[1fr_auto] gap-3 text-xs"><span className="break-words">{f.nombre}</span><span className="font-semibold">{g} % ganancia</span></div>
                  <div className="grid h-3.5 gap-[2px]" style={{ gridTemplateColumns: `${100 - g}fr ${g}fr` }}>
                    <span className="rounded-l-full" style={{ background: PALETA[0] }} />
                    <span className="rounded-r-full" style={{ background: PALETA[2], minWidth: g > 0 ? 4 : 0 }} />
                  </div>
                </li>
              )
            })}
          </ul>
        </>
      )}
    </Grafica>
  )
}

// ---------- Tendencia (línea con área, acumulado) ----------
function Tendencia({ serie }) {
  const [act, setAct] = useState(null)
  const pts = useMemo(() => acumulado(serie), [serie])
  const W = 600, H = 190, L = 48, B = 22, T = 10, Rr = 12
  const max = Math.max(...pts.map(p => p.acum), 0)
  const X = (i) => L + (pts.length > 1 ? (i / (pts.length - 1)) * (W - L - Rr) : (W - L - Rr) / 2)
  const Y = (v) => T + (1 - (max ? v / max : 0)) * (H - T - B)
  const linea = pts.map((p, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)} ${Y(p.acum).toFixed(1)}`).join(' ')
  const area = pts.length ? `${linea} L${X(pts.length - 1).toFixed(1)} ${Y(0)} L${X(0).toFixed(1)} ${Y(0)} Z` : ''
  const sel = act != null ? pts[act] : null
  const mover = (e) => {
    const r = e.currentTarget.getBoundingClientRect()
    const x = ((e.clientX - r.left) / r.width) * W
    setAct(Math.min(pts.length - 1, Math.max(0, Math.round(((x - L) / (W - L - Rr)) * (pts.length - 1)))))
  }
  return (
    <Grafica ancha titulo="Cómo van sumando las ventas" nota="Total acumulado en el periodo"
      detalle={sel ? `${sel.etiqueta} · día ${dinero(sel.vendido)} · acumulado ${dinero(sel.acum)}` : max > 0 ? `Acumulado: ${dinero(max)}` : ''}
      tabla={{ cols: ['Día', 'Vendido', 'Acumulado'], filas: pts.map(p => [p.etiqueta, dinero(p.vendido), dinero(p.acum)]) }}>
      {max <= 0 ? <Vacio t="Sin ventas en este periodo" /> : (
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Ventas acumuladas"
             onPointerMove={mover} onPointerDown={mover} onPointerLeave={() => setAct(null)} style={{ touchAction: 'pan-y' }}>
          {[0, 0.5, 1].map(t => (
            <g key={t}>
              <line x1={L} x2={W - Rr} y1={Y(max * t)} y2={Y(max * t)} stroke="#E7E5E4" strokeWidth="1" />
              <text x={L - 6} y={Y(max * t) + 3} textAnchor="end" fontSize="10" className="fill-slate-400">{dineroCorto(max * t)}</text>
            </g>
          ))}
          <path d={area} fill={PALETA[0]} opacity="0.14" />
          <path d={linea} fill="none" stroke={PALETA[0]} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
          {sel && <><line x1={X(act)} x2={X(act)} y1={T} y2={H - B} stroke="#A8A29E" strokeDasharray="3 3" /><circle cx={X(act)} cy={Y(sel.acum)} r="5" fill={PALETA[0]} stroke="#fff" strokeWidth="2" /></>}
          <text x={L} y={H - 6} fontSize="10" className="fill-slate-400">{pts[0]?.etiqueta}</text>
          <text x={W - Rr} y={H - 6} textAnchor="end" fontSize="10" className="fill-slate-400">{pts.length > 1 ? pts[pts.length - 1].etiqueta : ''}</text>
        </svg>
      )}
    </Grafica>
  )
}

// ---------- Indicador con meta (medidor) ----------
function Indicador({ clave, titulo, valor }) {
  const [meta, setMeta] = useState(() => leerMeta(clave))
  const [editando, setEditando] = useState(false)
  const [txt, setTxt] = useState('')
  const avance = meta > 0 ? Math.max(0, valor) / meta : 0
  const cumplida = avance >= 1
  const cx = 100, cy = 100, r = 78
  const arco = (g) => { const [x, y] = polar(cx, cy, r, g); return `${x.toFixed(1)} ${y.toFixed(1)}` }
  const fin = -90 + 180 * Math.min(1, avance)
  const color = cumplida ? '#0E8A6B' : avance >= 0.5 ? PALETA[0] : '#D2573B'
  const guardar = () => {
    const n = Number(String(txt).replace(/[^\d]/g, ''))
    guardarMeta(clave, n); setMeta(n > 0 ? n : 0); setEditando(false)
  }
  return (
    <section className="bg-white rounded-2xl shadow-sm p-4 space-y-2 min-w-0">
      <div className="grid grid-cols-[1fr_auto] gap-2 items-center">
        <h2 className="text-sm font-semibold leading-snug break-words">{titulo}</h2>
        {!editando && <button onClick={() => { setTxt(meta ? String(meta) : ''); setEditando(true) }} className="h-8 px-3 rounded-lg bg-slate-100 text-[11px] font-medium text-slate-600">{meta ? 'Cambiar meta' : 'Poner meta'}</button>}
      </div>
      {editando ? (
        <div className="grid grid-cols-[1fr_auto_auto] gap-2">
          <input value={txt} onChange={e => setTxt(e.target.value)} inputMode="numeric" placeholder="Meta en pesos, ej. 5000000" autoFocus
            className="h-11 px-3 rounded-xl border border-slate-300 text-sm outline-none focus:border-marca" />
          <button onClick={() => setEditando(false)} className="h-11 px-3 rounded-xl bg-slate-100 text-sm text-slate-600">← Volver</button>
          <button onClick={guardar} className="h-11 px-4 rounded-xl bg-negro text-champagne text-sm font-semibold">Guardar</button>
        </div>
      ) : meta > 0 ? (
        <div className="grid justify-items-center">
          <svg viewBox="0 0 200 112" className="w-full max-w-[16rem]" role="img" aria-label={`${Math.round(avance * 100)} % de la meta`}>
            <path d={`M ${arco(-90)} A ${r} ${r} 0 0 1 ${arco(90)}`} fill="none" stroke="#E7E5E4" strokeWidth="16" strokeLinecap="round" />
            {avance > 0 && <path d={`M ${arco(-90)} A ${r} ${r} 0 ${fin - -90 > 180 ? 1 : 0} 1 ${arco(fin)}`} fill="none" stroke={color} strokeWidth="16" strokeLinecap="round" />}
            <text x="100" y="86" textAnchor="middle" fontSize="26" fontWeight="700" className="fill-black">{Math.round(avance * 100)} %</text>
            <text x="100" y="104" textAnchor="middle" fontSize="10" className="fill-slate-400">{cumplida ? '¡Meta cumplida!' : `Faltan ${dineroCorto(meta - valor)}`}</text>
          </svg>
          <p className="text-xs text-slate-500">{dinero(valor)} de {dinero(meta)}</p>
        </div>
      ) : (
        <div className="py-5 text-center space-y-1">
          <p className="text-2xl font-bold">{dinero(valor)}</p>
          <p className="text-xs text-slate-400">Pon una meta para ver el avance</p>
        </div>
      )}
    </section>
  )
}

// ---------- Tabla detallada ----------
function TablaProductos({ filas }) {
  return (
    <Grafica ancha titulo="Tabla de productos" nota="Los 10 más vendidos, con su margen">
      {filas.length === 0 ? <Vacio /> : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[30rem]">
            <thead><tr className="text-[11px] text-slate-400 text-left">
              <th className="pb-1 font-medium">Producto</th><th className="pb-1 font-medium text-right">Unid.</th>
              <th className="pb-1 font-medium text-right">Vendido</th><th className="pb-1 font-medium text-right">Ganancia</th><th className="pb-1 font-medium text-right">Margen</th>
            </tr></thead>
            <tbody className="divide-y divide-slate-100">
              {filas.map(f => (
                <tr key={f.nombre}>
                  <td className="py-2 break-words max-w-[12rem]">{f.nombre}</td>
                  <td className="py-2 text-right">{numero(f.cantidad)}</td>
                  <td className="py-2 text-right">{dinero(f.venta)}</td>
                  <td className="py-2 text-right">{dinero(f.ganancia)}</td>
                  <td className={`py-2 text-right font-semibold ${pct(f.ganancia, f.venta) < 10 ? 'text-red-700' : ''}`}>{pct(f.ganancia, f.venta)} %</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Grafica>
  )
}

export default function Graficas({ d, serie, vendido, neta }) {
  const pagos = useMemo(() => (d.por_pago ?? []).map(p => ({ nombre: textoMetodo(p.metodo), valor: Number(p.monto) })), [d.por_pago])
  const cats = useMemo(() => (d.categorias ?? []).map(c => ({ nombre: c.categoria, valor: Number(c.venta), venta: Number(c.venta), ganancia: Number(c.ganancia) })), [d.categorias])
  const top = useMemo(() => (d.top ?? []).map(t => ({ nombre: t.nombre, cantidad: Number(t.cantidad), venta: Number(t.venta), ganancia: Number(t.ganancia) })), [d.top])
  return (
    <div className="grid lg:grid-cols-2 gap-3">
      <Indicador clave="ventas" titulo="Meta de ventas" valor={vendido} />
      <Indicador clave="ganancia" titulo="Meta de ganancia neta" valor={neta} />
      <Rosca titulo="Formas de pago" nota="Cómo te pagaron" filas={pagos} centro="Recibido" />
      <Rosca titulo="Ventas por categoría" nota="Qué familia vende más" filas={cats} centro="Vendido" />
      <Mosaico titulo="Mosaico de productos" nota="El tamaño es lo vendido" filas={top.map(t => ({ nombre: t.nombre, valor: t.venta }))} />
      <Dispersion filas={top.map(t => ({ nombre: t.nombre, x: t.cantidad, y: t.ganancia }))} />
      <Cascada d={d} />
      <Apiladas filas={cats} />
      <Tendencia serie={serie} />
      <TablaProductos filas={top} />
    </div>
  )
}
