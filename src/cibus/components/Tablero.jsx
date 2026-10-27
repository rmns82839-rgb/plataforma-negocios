// Tablero de indicadores del dueño: números grandes, gráficas simples y alertas. Todo se calcula en la base (rpc tablero).
import { useCallback, useEffect, useState } from 'react'
import Cifra from './Cifra'
import { supabase } from '../lib/supabase'
import { useDueno } from '../context/rol'
import { dinero, numero } from '../lib/formato'
import { textoMetodo } from '../lib/pagos'
import { construirExcel, bajarArchivo } from '../lib/exportar'
import { hoyTexto } from '../lib/periodo'
import { diaBogota, etiquetaRango, hojasResumen, pedirTablero, serieDias, serieHoras, textoComparacion, textoVariacion, variacion } from '../lib/tablero'
import FiltroFechas from './FiltroFechas'
import Graficas from './Graficas'
import TableroEnLinea from './TableroEnLinea'

const dineroCorto = (n) => {
  const v = Number(n) || 0
  if (v >= 1e6) return `$${(v / 1e6).toFixed(v >= 1e7 ? 0 : 1).replace('.0', '')} M`
  if (v >= 1e3) return `$${Math.round(v / 1e3)} mil`
  return `$${Math.round(v)}`
}

function Panelito({ titulo, nota, accion, children }) {
  return (
    <section className="bg-white rounded-2xl shadow-sm p-4 space-y-3 min-w-0">
      <div className="grid grid-cols-[1fr_auto] gap-2 items-center">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold leading-snug break-words">{titulo}</h2>
          {nota && <p className="text-[11px] text-slate-400 leading-snug break-words">{nota}</p>}
        </div>
        {accion}
      </div>
      {children}
    </section>
  )
}

function Dato({ titulo, valor, nota, tono }) {
  return (
    <div className="bg-white rounded-2xl shadow-sm p-4 min-w-0 grid content-between gap-1 h-24">
      <p className="text-xs text-slate-400 leading-snug break-words">{titulo}</p>
      <Cifra className={`text-xl font-bold ${tono === 'malo' ? 'text-red-700' : ''}`}>{valor}</Cifra>
      <p className="text-[11px] text-slate-400 leading-snug break-words">{nota ?? ' '}</p>
    </div>
  )
}

// Barras verticales delgadas con detalle al tocar o pasar el mouse. Un solo eje (dinero).
function Barras({ serie, titulo }) {
  const [activo, setActivo] = useState(null)
  const [tabla, setTabla] = useState(false)
  const max = Math.max(...serie.map(s => s.vendido), 0)
  const total = serie.reduce((s, x) => s + x.vendido, 0)
  const sel = activo != null ? serie[activo] : null
  const mejor = max > 0 ? serie.reduce((m, x) => (x.vendido > m.vendido ? x : m), serie[0]) : null
  const marcas = [0, Math.floor((serie.length - 1) / 2), serie.length - 1]
  const boton = (
    <button onClick={() => setTabla(t => !t)} className="h-8 px-3 rounded-lg bg-slate-100 text-[11px] font-medium text-slate-600">
      {tabla ? 'Gráfica' : 'Tabla'}
    </button>
  )
  return (
    <Panelito titulo={titulo} nota={max > 0 ? `Total ${dinero(total)}` : 'Sin ventas en este periodo'} accion={boton}>
      {tabla ? (
        <ul className="divide-y divide-slate-100 max-h-56 overflow-y-auto text-sm">
          {serie.map(s => (
            <li key={s.dia ?? s.hora} className="py-2 grid grid-cols-[1fr_3rem_6rem] gap-2">
              <span className="break-words">{s.etiqueta}</span>
              <span className="text-slate-400 text-center">{s.ventas}</span>
              <span className="text-right font-medium">{dinero(s.vendido)}</span>
            </li>
          ))}
        </ul>
      ) : (
        <>
          <p className="h-5 text-xs text-slate-600 break-words" aria-live="polite">
            {sel ? `${sel.etiqueta} · ${dinero(sel.vendido)} · ${sel.ventas} ${sel.ventas === 1 ? 'venta' : 'ventas'}`
              : mejor ? `Lo mejor: ${mejor.etiqueta} · ${dinero(mejor.vendido)}` : ''}
          </p>
          <div className="grid grid-cols-[2.5rem_1fr] gap-2">
            <div className="h-36 grid content-between text-[10px] text-slate-400 text-right leading-none">
              <span>{dineroCorto(max)}</span><span>$0</span>
            </div>
            <div className="h-36 grid grid-flow-col auto-cols-fr gap-[2px] border-b border-slate-200"
                 onMouseLeave={() => setActivo(null)}>
              {serie.map((s, i) => (
                <button key={s.dia ?? s.hora} type="button" aria-label={`${s.etiqueta}: ${dinero(s.vendido)}`}
                  onMouseEnter={() => setActivo(i)} onFocus={() => setActivo(i)} onClick={() => setActivo(i)}
                  className="h-full flex items-end justify-center min-w-0 px-[1px]">
                  <span className={`block w-full max-w-5 rounded-t-[4px] ${activo === i ? 'bg-champagne' : 'bg-oro'}`}
                        style={{ height: s.vendido > 0 ? `${Math.max(3, (s.vendido / max) * 100)}%` : '0' }} />
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-[2.5rem_1fr] gap-2">
            <span />
            <div className="grid grid-cols-3 text-[10px] text-slate-400">
              <span className="text-left break-words">{serie[marcas[0]].etiqueta}</span>
              <span className="text-center break-words">{serie.length > 2 ? serie[marcas[1]].etiqueta : ''}</span>
              <span className="text-right break-words">{serie.length > 1 ? serie[marcas[2]].etiqueta : ''}</span>
            </div>
          </div>
        </>
      )}
    </Panelito>
  )
}

// Lista con barra horizontal fina bajo cada nombre
function Ranking({ titulo, nota, filas, vacio = 'Sin datos en este periodo' }) {
  const max = Math.max(...filas.map(f => f.valor), 0)
  return (
    <Panelito titulo={titulo} nota={nota}>
      {filas.length === 0 ? <p className="py-6 text-center text-sm text-slate-400">{vacio}</p> : (
        <ul className="space-y-3">
          {filas.map(f => (
            <li key={f.clave} className="grid gap-1">
              <div className="grid grid-cols-[1fr_auto] gap-3 text-sm">
                <span className="break-words">{f.nombre}</span>
                <span className="font-semibold">{dinero(f.valor)}</span>
              </div>
              <div className="h-1.5 rounded-full bg-slate-100">
                <div className="h-full rounded-full bg-oro" style={{ width: `${max ? Math.max(2, (f.valor / max) * 100) : 0}%` }} />
              </div>
              {f.detalle && <p className="text-[11px] text-slate-400 break-words">{f.detalle}</p>}
            </li>
          ))}
        </ul>
      )}
    </Panelito>
  )
}

function Alerta({ titulo, valor, nota, malo }) {
  return (
    <div className={`rounded-2xl p-4 min-h-24 grid gap-1 content-between min-w-0 ${malo ? 'bg-red-50' : 'bg-white shadow-sm'}`}>
      <p className={`text-xs leading-snug break-words ${malo ? 'text-red-700' : 'text-slate-400'}`}>{titulo}</p>
      <Cifra className={`text-xl font-bold leading-tight ${malo ? 'text-red-700' : ''}`}>{valor}</Cifra>
      <p className="text-[11px] text-slate-400 leading-snug break-words">{nota ?? ' '}</p>
    </div>
  )
}

function Vista({ rango }) {
  const [res, setRes] = useState(null)
  const [bajando, setBajando] = useState(false)
  const [aviso, setAviso] = useState('')
  const [pestana, setPestana] = useState('resumen')   // 'resumen' | 'graficas' | 'enlinea'

  const cargar = useCallback(async () => {
    setRes(null)
    setRes(await pedirTablero(supabase, rango))
  }, [rango])
  useEffect(() => { cargar() }, [cargar])

  if (!res) return <p className="text-center text-sm text-slate-400 py-8">Calculando…</p>
  if (res.error) return <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{res.error}</p>

  const d = res.datos
  const n = Number(d.ventas)
  const vendido = Number(d.vendido)
  const ticket = n ? Math.round(vendido / n) : 0
  const neta = Number(d.ganancia) - Number(d.gastos)
  const v = variacion(vendido, d.anterior?.vendido)
  const inv = d.inventario ?? {}
  const dom = d.domicilios_estado ?? {}
  const unDia = diaBogota(rango.desde) === diaBogota(rango.hasta ? new Date(new Date(rango.hasta).getTime() - 1) : new Date())
  const serieA = unDia ? serieHoras(d.por_hora) : serieDias(d.por_dia, rango.desde, rango.hasta)
  const horas = serieHoras(d.por_hora)
  const mora = Number(d.mora?.vencido)

  const bajar = async () => {
    setBajando(true); setAviso('')
    try {
      const blob = await construirExcel(hojasResumen(d, etiquetaRango(rango)))
      bajarArchivo(blob, `Matriz-resumen-${hoyTexto()}.xlsx`)
      setAviso('Listo: el resumen se descargó en Excel.')
    } catch (e) { setAviso(e.message || 'No se pudo exportar') }
    setBajando(false)
  }

  return (
    <>
      <div className="bg-negro rounded-2xl p-5 grid gap-1 lg:grid-cols-[1fr_auto] lg:items-end">
        <div className="grid gap-1 min-w-0">
          <p className="text-xs text-champagne/70">Vendido · {etiquetaRango(rango)}</p>
          <Cifra min={22} className="font-display text-4xl lg:text-5xl font-semibold text-champagne">{dinero(vendido)}</Cifra>
          <p className={`text-xs ${v && !v.nuevo && !v.sube ? 'text-red-300' : 'text-hueso/70'}`}>{textoVariacion(v)}</p>
          {d.comparacion && <p className="text-[11px] text-hueso/60">{textoComparacion(d.comparacion)}</p>}
        </div>
        <p className="text-xs text-hueso/60 mt-2 lg:mt-0 lg:text-right">
          {numero(n)} {n === 1 ? 'venta' : 'ventas'} · ticket promedio {dinero(ticket)}
        </p>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {[['resumen', 'Resumen'], ['graficas', 'Gráficas'], ['enlinea', 'En línea']].map(([id, t]) => (
          <button key={id} onClick={() => setPestana(id)} aria-pressed={pestana === id}
            className={`h-11 rounded-xl text-sm font-medium ${pestana === id ? 'bg-negro text-champagne' : 'bg-white text-slate-600 shadow-sm'}`}>{t}</button>
        ))}
      </div>

      {pestana === 'graficas' && <Graficas d={d} serie={serieA} vendido={vendido} neta={neta} />}
      {pestana === 'enlinea' && <TableroEnLinea rango={rango} />}

      {pestana === 'resumen' && <>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Dato titulo="Ganancia de las ventas" valor={dinero(d.ganancia)} nota={textoVariacion(variacion(d.ganancia, d.anterior?.ganancia)).replace(' que el periodo anterior', '').replace('Sin periodo anterior para comparar', '')} />
        <Dato titulo="Ganancia neta" valor={dinero(neta)} nota="Ganancia − gastos" tono={neta < 0 ? 'malo' : undefined} />
        <Dato titulo="Gastos" valor={dinero(d.gastos)} />
        <Dato titulo="Descuentos dados" valor={dinero(d.descuentos)} nota={`Datáfono ${dinero(d.comisiones)}`} />
        <Dato titulo="Unidades vendidas" valor={numero(d.unidades)} />
        <Dato titulo="Ticket promedio" valor={dinero(ticket)} />
        <Dato titulo="Domicilios" valor={numero(d.domicilios)} nota={`Envíos cobrados ${dinero(d.envios)}`} />
        <Dato titulo="Ventas anuladas" valor={numero(d.anuladas)} nota={Number(d.anuladas) ? dinero(d.anuladas_valor) : null} />
      </div>

      <div className="grid lg:grid-cols-2 gap-3">
        <Barras titulo={unDia ? 'Ventas por hora' : 'Ventas por día'} serie={serieA} />
        {unDia
          ? <Ranking titulo="Formas de pago" nota="Lo recibido por cada una" filas={(d.por_pago ?? []).map(p => ({ clave: p.metodo, nombre: textoMetodo(p.metodo), valor: Number(p.monto), detalle: `${p.ventas} ${p.ventas === 1 ? 'venta' : 'ventas'}` }))} />
          : <Barras titulo="Horas con más ventas" serie={horas} />}
      </div>

      <div className="grid lg:grid-cols-2 gap-3">
        {!unDia && <Ranking titulo="Formas de pago" nota="Lo recibido por cada una" filas={(d.por_pago ?? []).map(p => ({ clave: p.metodo, nombre: textoMetodo(p.metodo), valor: Number(p.monto), detalle: `${p.ventas} ${p.ventas === 1 ? 'venta' : 'ventas'}` }))} />}
        <Ranking titulo="Más vendidos" nota="Por valor vendido"
          filas={(d.top ?? []).map(t => ({ clave: t.nombre, nombre: t.nombre, valor: Number(t.venta), detalle: `×${numero(t.cantidad)} · ganancia ${dinero(t.ganancia)}` }))} />
        <Ranking titulo="Por categoría" nota="Por valor vendido"
          filas={(d.categorias ?? []).map(c => ({ clave: c.categoria, nombre: c.categoria, valor: Number(c.venta), detalle: `ganancia ${dinero(c.ganancia)}` }))} />
        <Ranking titulo="Mejores clientes" nota="Con cliente registrado" vacio="Ninguna venta con cliente registrado"
          filas={(d.clientes ?? []).map(c => ({ clave: c.nombre, nombre: c.nombre, valor: Number(c.vendido), detalle: `${c.ventas} ${c.ventas === 1 ? 'compra' : 'compras'}` }))} />
      </div>

      <div>
        <p className="text-xs font-medium text-slate-500 mb-2">Para estar atento (hoy, sin importar las fechas)</p>
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
          <Alerta titulo="Por cobrar (fiados)" valor={dinero(d.cartera?.por_cobrar)} nota={`${numero(d.cartera?.deudores)} deudores`} />
          <Alerta titulo="En mora" valor={dinero(mora)} malo={mora > 0}
                  nota={mora > 0 ? `${numero(d.mora?.clientes)} clientes · recargo ${dinero(d.mora?.recargo)}` : 'Nadie vencido'} />
          <Alerta titulo="Stock bajo" valor={numero(inv.stock_bajo)} malo={Number(inv.stock_bajo) > 0}
                  nota={`${numero(inv.agotados)} agotados`} />
          <Alerta titulo="Lotes por vencer" valor={numero(inv.por_vencer)} malo={Number(inv.por_vencer) > 0} nota="En los próximos 30 días" />
          <Alerta titulo="Domicilios por entregar" valor={numero(Number(dom.pendientes) + Number(dom.en_camino))}
                  nota={`${numero(dom.pendientes)} pendientes · ${numero(dom.en_camino)} en camino`} />
          <Alerta titulo="Capital en inventario" valor={dinero(inv.capital)} nota={`A precio de venta ${dinero(inv.valor_venta)}`} />
        </div>
      </div>

      </>}

      {aviso && <p className="text-sm text-marca bg-lima/20 rounded-lg px-3 py-2">{aviso}</p>}
      <button onClick={bajar} disabled={bajando}
        className="w-full h-12 rounded-xl bg-marca text-white font-semibold disabled:opacity-40 active:bg-marca-oscuro">
        {bajando ? 'Preparando…' : 'Descargar este resumen en Excel'}
      </button>
    </>
  )
}

export default function Tablero() {
  const dueno = useDueno()
  if (dueno !== true) {
    return <p className="text-sm text-slate-500 bg-white rounded-2xl shadow-sm p-4">Solo el dueño puede ver el tablero.</p>
  }
  return <FiltroFechas inicial="sem">{(rango) => <Vista rango={rango} />}</FiltroFechas>
}
