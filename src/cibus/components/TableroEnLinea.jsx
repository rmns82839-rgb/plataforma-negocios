// Pestaña "En línea" del Tablero: pedidos del catálogo de la tienda, dinero, cómo los reciben,
// qué más piden, a qué horas, mostrador contra en línea y visitas contra pedidos.
// Todo viene de la función tablero_en_linea (migracion-v29.sql). Solo el dueño.
import { useEffect, useMemo, useState } from 'react'
import Cifra from './Cifra'
import { supabase } from '../lib/supabase'
import { dinero, numero } from '../lib/formato'
import { PALETA } from '../lib/graficas'
import { diaCorto, diasDelRango, horaTexto } from '../lib/tablero'

const COLOR_A = PALETA[0]   // oro: mostrador · visitantes
const COLOR_B = PALETA[1]   // azul: en línea · pedidos
const pct = (a, b) => (b > 0 ? Math.round((a / b) * 100) : 0)
const dineroCorto = (n) => {
  const v = Number(n) || 0
  if (v >= 1e6) return `$${(v / 1e6).toFixed(v >= 1e7 ? 0 : 1).replace('.0', '')} M`
  if (v >= 1e3) return `$${Math.round(v / 1e3)} mil`
  return `$${Math.round(v)}`
}

function Bloque({ titulo, nota, accion, children }) {
  return (
    <section className="bg-white rounded-2xl shadow-sm p-4 space-y-3 min-w-0">
      <div className="grid grid-cols-[1fr_auto] gap-2 items-center">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold">{titulo}</h2>
          {nota && <p className="text-[11px] text-slate-400">{nota}</p>}
        </div>
        {accion}
      </div>
      {children}
    </section>
  )
}

function Dato({ titulo, valor, nota, tono }) {
  return (
    <div className="bg-white rounded-2xl shadow-sm p-4 min-w-0 grid content-between gap-1 min-h-24">
      <p className="text-xs text-slate-400">{titulo}</p>
      <Cifra className={`text-xl font-bold ${tono === 'malo' ? 'text-red-700' : ''}`}>{valor}</Cifra>
      <p className="text-[11px] text-slate-400">{nota ?? ' '}</p>
    </div>
  )
}

const Vacio = ({ texto }) => <p className="py-6 text-center text-sm text-slate-400">{texto}</p>

function Leyenda({ items }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
      {items.map(i => (
        <li key={i.nombre} className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: i.color }} aria-hidden="true" />{i.nombre}
        </li>
      ))}
    </ul>
  )
}

// Barra partida en dos partes (con su valor y porcentaje escritos, no solo el color)
function Partida({ a, b, formato = numero }) {
  const total = a.valor + b.valor
  return (
    <div className="space-y-2">
      <div className="h-3 rounded-full bg-slate-100 flex gap-[2px] overflow-hidden" role="img"
           aria-label={`${a.nombre}: ${formato(a.valor)}. ${b.nombre}: ${formato(b.valor)}.`}>
        {total > 0 && <span style={{ width: `${(a.valor / total) * 100}%`, background: a.color }} className="block h-full" />}
        {total > 0 && <span style={{ width: `${(b.valor / total) * 100}%`, background: b.color }} className="block h-full" />}
      </div>
      <div className="grid grid-cols-2 gap-3">
        {[a, b].map(x => (
          <div key={x.nombre} className="min-w-0">
            <p className="text-xs text-slate-500 flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm shrink-0" style={{ background: x.color }} aria-hidden="true" />{x.nombre}
            </p>
            <p className="text-base font-bold">{formato(x.valor)}</p>
            <p className="text-[11px] text-slate-400">{pct(x.valor, total)}%{x.nota ? ` · ${x.nota}` : ''}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

/**
 * Barras por día. modo 'apilado': los dos valores se suman en la misma barra (separados por un hueco de 2 px).
 * modo 'pares': dos barras delgadas lado a lado. Al tocar una barra se ve su detalle; hay botón de tabla.
 */
function BarrasDias({ serie, claves, formato, modo, titulo, nota, vacio }) {
  const [activo, setActivo] = useState(null)
  const [tabla, setTabla] = useState(false)
  const valorMax = (s) => (modo === 'apilado' ? claves.reduce((t, c) => t + s[c.k], 0) : Math.max(...claves.map(c => s[c.k])))
  const max = Math.max(...serie.map(valorMax), 0)
  const sel = activo != null ? serie[activo] : null
  const marcas = [0, Math.floor((serie.length - 1) / 2), serie.length - 1]
  const boton = (
    <button onClick={() => setTabla(t => !t)} className="h-8 px-3 rounded-lg bg-slate-100 text-[11px] font-medium text-slate-600">
      {tabla ? 'Gráfica' : 'Tabla'}
    </button>
  )
  return (
    <Bloque titulo={titulo} nota={nota} accion={max > 0 ? boton : null}>
      {max <= 0 ? <Vacio texto={vacio} /> : (
        <>
          <Leyenda items={claves.map(c => ({ nombre: c.nombre, color: c.color }))} />
          {tabla ? (
            <ul className="divide-y divide-slate-100 max-h-56 overflow-y-auto text-sm">
              {serie.map(s => (
                <li key={s.dia} className="py-2 grid grid-cols-[1fr_5rem_5rem] gap-2">
                  <span>{s.etiqueta}</span>
                  {claves.map(c => <span key={c.k} className="text-right font-medium">{formato(s[c.k])}</span>)}
                </li>
              ))}
            </ul>
          ) : (
            <>
              <p className="min-h-5 text-xs text-slate-600" aria-live="polite">
                {sel ? `${sel.etiqueta} · ${claves.map(c => `${c.nombre} ${formato(sel[c.k])}`).join(' · ')}` : ''}
              </p>
              <div className="grid grid-cols-[3.25rem_1fr] gap-2">
                <div className="h-36 grid content-between text-[10px] text-slate-400 text-right leading-none whitespace-nowrap">
                  <span>{formato === dinero ? dineroCorto(max) : numero(max)}</span><span>0</span>
                </div>
                <div className="h-36 grid grid-flow-col auto-cols-fr gap-[2px] border-b border-slate-200" onMouseLeave={() => setActivo(null)}>
                  {serie.map((s, i) => (
                    <button key={s.dia} type="button" aria-label={`${s.etiqueta}: ${claves.map(c => `${c.nombre} ${formato(s[c.k])}`).join(', ')}`}
                      onMouseEnter={() => setActivo(i)} onFocus={() => setActivo(i)} onClick={() => setActivo(i)}
                      className={`h-full min-w-0 px-[1px] flex ${modo === 'pares' ? 'items-end justify-center gap-[2px]' : 'flex-col-reverse items-center justify-start gap-[2px]'} ${activo === i ? 'bg-slate-50' : ''}`}>
                      {claves.map(c => (
                        <span key={c.k} className={`block rounded-t-[3px] ${modo === 'pares' ? 'w-full max-w-3' : 'w-full max-w-5'}`}
                          style={{ background: c.color, height: s[c.k] > 0 ? `${Math.max(3, (s[c.k] / max) * 100)}%` : '0' }} />
                      ))}
                    </button>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-[3.25rem_1fr] gap-2">
                <span />
                <div className="grid grid-cols-3 text-[10px] text-slate-400">
                  <span className="text-left">{serie[marcas[0]].etiqueta}</span>
                  <span className="text-center">{serie.length > 2 ? serie[marcas[1]].etiqueta : ''}</span>
                  <span className="text-right">{serie.length > 1 ? serie[marcas[2]].etiqueta : ''}</span>
                </div>
              </div>
            </>
          )}
        </>
      )}
    </Bloque>
  )
}

// Agrupa por semanas si el rango es muy largo (más de 45 días), igual que el resto del tablero
function armarSerie(dias, mapa, campos) {
  const filas = dias.map(d => ({ dia: d, etiqueta: diaCorto(d), ...Object.fromEntries(campos.map(c => [c, Number(mapa.get(d)?.[c] ?? 0)])) }))
  if (filas.length <= 45) return filas
  const sem = []
  for (let i = 0; i < filas.length; i += 7) {
    const g = filas.slice(i, i + 7)
    sem.push({
      dia: g[0].dia, etiqueta: `${diaCorto(g[0].dia)} – ${diaCorto(g[g.length - 1].dia)}`,
      ...Object.fromEntries(campos.map(c => [c, g.reduce((t, x) => t + x[c], 0)])),
    })
  }
  return sem
}

export default function TableroEnLinea({ rango }) {
  const [res, setRes] = useState(null)
  const cat = 'tienda'   // cada negocio tiene UN catálogo (el de su rubro)

  useEffect(() => {
    let vivo = true
    setRes(null)
    supabase.rpc('tablero_en_linea', { p_desde: rango.desde, p_hasta: rango.hasta }).then(({ data, error }) => {
      if (!vivo) return
      if (error) {
        const falta = /could not find the function|schema cache|does not exist|PGRST202/i.test(`${error.message} ${error.code}`)
        setRes({ error: falta ? 'Falta ejecutar migracion-v29.sql en Supabase.' : error.message })
      } else setRes({ d: data })
    })
    return () => { vivo = false }
  }, [rango])

  const dias = useMemo(() => diasDelRango(rango.desde, rango.hasta), [rango])
  const d = res?.d

  const calc = useMemo(() => {
    if (!d) return null
    const por = (c) => (d.catalogos ?? []).find(x => x.cat === c) ?? { recibidos: 0, atendidos: 0, cancelados: 0, pendientes: 0, valor_recibido: 0, valor_atendido: 0, a_domicilio: 0, a_recoger: 0 }
    const t = por('tienda')
    const suma = (k) => Number(t[k])
    const visitas = (c) => Number((d.visitas ?? []).find(x => x.catalogo === c)?.visitantes ?? 0)
    const mapaCmp = new Map((d.comparacion?.por_dia ?? []).map(x => [x.dia, x]))
    const mapaVis = new Map((d.por_dia ?? []).map(x => [x.dia, x]))
    const horas = Array.from({ length: 24 }, (_, h) => ({ hora: h, pedidos: Number((d.por_hora ?? []).find(x => x.hora === h)?.pedidos ?? 0) }))
    return {
      t, suma, visitas, horas,
      serieCmp: armarSerie(dias, mapaCmp, ['mostrador', 'en_linea']),
      serieVis: (c) => armarSerie(dias, new Map([...mapaVis].map(([k, v]) => [k, { visitas: v[`visitas_${c}`], pedidos: v[`pedidos_${c}`] }])), ['visitas', 'pedidos']),
    }
  }, [d, dias])

  if (!res) return <p className="text-center text-sm text-slate-400 py-8">Calculando…</p>
  if (res.error) return <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{res.error}</p>

  const { t, suma, visitas, horas } = calc
  const recibidos = suma('recibidos')
  const maxHora = Math.max(...horas.map(h => h.pedidos), 0)
  const mejorHora = maxHora > 0 ? horas.reduce((m, h) => (h.pedidos > m.pedidos ? h : m), horas[0]) : null
  const cmp = d.comparacion ?? {}
  const mostrador = Number(cmp.mostrador ?? 0)
  const enLinea = Number(cmp.en_linea ?? 0)
  const top = d.top ?? []
  const maxTop = Math.max(...top.map(x => Number(x.cantidad)), 0)
  const desdeVisitas = d.visitas_desde
  const nVis = visitas(cat)
  const nPed = Number(t.recibidos)
  const aDom = suma('a_domicilio'); const aRec = suma('a_recoger')

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Dato titulo="Pedidos recibidos" valor={numero(recibidos)} nota="Desde tu catálogo en línea" />
        <Dato titulo="Atendidos" valor={numero(suma('atendidos'))} nota={recibidos ? `${pct(suma('atendidos'), recibidos)}% de los recibidos` : null} />
        <Dato titulo="Pendientes" valor={numero(suma('pendientes'))} nota="Esperando respuesta" tono={suma('pendientes') > 0 ? 'malo' : undefined} />
        <Dato titulo="Cancelados" valor={numero(suma('cancelados'))} nota={recibidos ? `${pct(suma('cancelados'), recibidos)}% de los recibidos` : null} />
      </div>

      <div className="grid lg:grid-cols-2 gap-3">
        <Bloque titulo="Dinero de los pedidos" nota="Pedidos sin contar los cancelados">
          <div className="grid grid-cols-1 gap-3">
            {[['Tu catálogo', t]].map(([nombre, x]) => (
              <div key={nombre} className="rounded-xl bg-fondo p-3 grid gap-1 content-between min-w-0">
                <p className="text-xs text-slate-400">{nombre}</p>
                <Cifra className="text-lg font-bold">{dinero(x.valor_recibido)}</Cifra>
                <p className="text-[11px] text-slate-400">Ya atendido: {dinero(x.valor_atendido)}</p>
                <p className="text-[11px] text-slate-400">{x.recibidos} {x.recibidos === 1 ? 'pedido' : 'pedidos'}</p>
              </div>
            ))}
          </div>
        </Bloque>

        <Bloque titulo="Cómo lo reciben" nota="Pedidos sin contar los cancelados">
          {aDom + aRec === 0 ? <Vacio texto="Sin pedidos en este periodo" /> : (
            <>
              <Partida a={{ nombre: 'A domicilio', valor: aDom, color: COLOR_A }} b={{ nombre: 'Recoger en tienda', valor: aRec, color: COLOR_B }} />
              <p className="text-[11px] text-slate-400">{t.a_domicilio} a domicilio · {t.a_recoger} a recoger.</p>
            </>
          )}
        </Bloque>
      </div>

      <div className="grid lg:grid-cols-2 gap-3">
        <Bloque titulo="Lo más pedido en línea" nota="Por unidades pedidas">
          {top.length === 0 ? <Vacio texto="Sin pedidos en este periodo" /> : (
            <ul className="space-y-3">
              {top.map(x => (
                <li key={x.nombre} className="grid gap-1">
                  <div className="grid grid-cols-[1fr_auto] gap-3 text-sm">
                    <span className="break-words">{x.nombre}</span>
                    <span className="font-semibold">×{numero(x.cantidad)}</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-slate-100">
                    <div className="h-full rounded-full bg-oro" style={{ width: `${maxTop ? Math.max(3, (Number(x.cantidad) / maxTop) * 100) : 0}%` }} />
                  </div>
                  <p className="text-[11px] text-slate-400">{dinero(x.valor)} pedidos</p>
                </li>
              ))}
            </ul>
          )}
        </Bloque>

        <Bloque titulo="Horas con más pedidos" nota={mejorHora ? `Lo más movido: ${horaTexto(mejorHora.hora)} · ${mejorHora.pedidos} ${mejorHora.pedidos === 1 ? 'pedido' : 'pedidos'}` : 'Sin pedidos en este periodo'}>
          {maxHora <= 0 ? <Vacio texto="Sin pedidos en este periodo" /> : (
            <>
              <div className="h-32 grid grid-flow-col auto-cols-fr gap-[2px] border-b border-slate-200">
                {horas.map(h => (
                  <span key={h.hora} title={`${horaTexto(h.hora)}: ${h.pedidos}`} className="h-full flex items-end justify-center min-w-0">
                    <span className="block w-full max-w-3 rounded-t-[3px]"
                      style={{ background: COLOR_B, height: h.pedidos > 0 ? `${Math.max(4, (h.pedidos / maxHora) * 100)}%` : '0' }} />
                  </span>
                ))}
              </div>
              <div className="grid grid-cols-4 text-[10px] text-slate-400">
                {[0, 6, 12, 18].map(h => <span key={h}>{horaTexto(h)}</span>)}
              </div>
            </>
          )}
        </Bloque>
      </div>

      <Bloque titulo="Mostrador contra en línea" nota="Ventas registradas, sin contar domicilios ni anuladas">
        {mostrador + enLinea <= 0 ? <Vacio texto="Sin ventas en este periodo" /> : (
          <Partida
            a={{ nombre: 'Mostrador', valor: mostrador, color: COLOR_A, nota: `${cmp.ventas_mostrador ?? 0} ventas` }}
            b={{ nombre: 'En línea', valor: enLinea, color: COLOR_B, nota: `${cmp.ventas_en_linea ?? 0} ventas` }}
            formato={dinero} />
        )}
        <p className="text-[11px] text-slate-400">
          Una venta cuenta como “en línea” cuando se cobró desde un pedido (Cobrar en Caja o Registrar venta). Los pedidos de la tienda atendidos antes de esta actualización no se pueden ligar a su venta y quedan en mostrador.
        </p>
      </Bloque>

      <BarrasDias titulo="Ventas por día" nota="Mostrador y en línea en la misma barra" modo="apilado" formato={dinero}
        serie={calc.serieCmp} vacio="Sin ventas en este periodo"
        claves={[{ k: 'mostrador', nombre: 'Mostrador', color: COLOR_A }, { k: 'en_linea', nombre: 'En línea', color: COLOR_B }]} />

      <div className="grid grid-cols-3 gap-3">
        <Dato titulo="Visitantes" valor={numero(nVis)} nota="Equipos únicos" />
        <Dato titulo="Pedidos" valor={numero(nPed)} nota="Recibidos" />
        <Dato titulo="Conversión" valor={nVis > 0 ? `${numero(Math.round((nPed / nVis) * 100))} %` : '—'} nota="Visitas que piden" />
      </div>

      <BarrasDias titulo="Visitas y pedidos" nota="Cuánta gente entra y cuántos terminan pidiendo" modo="pares" formato={numero}
        serie={calc.serieVis(cat)} vacio="Aún no hay visitas ni pedidos en este periodo"
        claves={[{ k: 'visitas', nombre: 'Visitantes', color: COLOR_A }, { k: 'pedidos', nombre: 'Pedidos', color: COLOR_B }]} />
      <p className="text-[11px] text-slate-400">
        {desdeVisitas
          ? `Las visitas se cuentan desde el ${diaCorto(desdeVisitas)}: un visitante es un equipo distinto por día, sin datos personales. No incluye al personal con sesión iniciada ni a los robots.`
          : 'Todavía no hay visitas guardadas: se empiezan a contar desde que se instala esta actualización.'}
      </p>
    </div>
  )
}
