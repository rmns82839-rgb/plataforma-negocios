// Reportes del dueño: cuánto se vendió, cuánto se ganó, qué se vende más, cartera e inventario.
// Los números los calcula la base de datos (función tablero); aquí solo se muestran.
import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { mensajeError } from '../lib/errores'
import { cop } from '../lib/pedido'
import { PERIODOS, rangoPeriodo, variacion } from '../lib/caja'
import { Volver, Aviso } from '../tienda/ui'
import { Titulo, Seccion, Opciones, SoloLectura } from './piezas'

const num = (v) => Number(v || 0)
const dia = (d) => { const [, m, dd] = String(d).split('-'); return `${dd}/${m}` }
const hora = (h) => `${h % 12 === 0 ? 12 : h % 12}${h < 12 ? ' a. m.' : ' p. m.'}`

function Variacion({ actual, anterior }) {
  const v = variacion(actual, anterior)
  if (v === null) return null
  return <span className={`text-base font-bold ${v >= 0 ? 'text-green-800' : 'text-red-700'}`}>{v >= 0 ? '▲' : '▼'} {Math.abs(v)} % vs. antes</span>
}

function Barras({ filas, formato = cop }) {
  const max = Math.max(...filas.map((f) => num(f.valor)), 1)
  return (
    <ul className="space-y-3">
      {filas.map((f) => (
        <li key={f.clave}>
          <div className="flex items-baseline justify-between gap-3 text-lg"><span className="break-words">{f.nombre}</span><span className="shrink-0 font-bold">{formato(f.valor)}</span></div>
          <div className="mt-1 h-3 overflow-hidden rounded-full bg-black/10"><div className="h-full rounded-full bg-principal" style={{ width: `${Math.max((num(f.valor) / max) * 100, 2)}%` }} /></div>
          {f.sub && <p className="text-base text-tinta/60">{f.sub}</p>}
        </li>
      ))}
    </ul>
  )
}

export default function Reportes({ ctx, volver }) {
  const nid = ctx.neg.negocio_id
  const [per, setPer] = useState('7d')
  const [t, setT] = useState(null)
  const [error, setError] = useState('')

  const cargar = useCallback(async () => {
    const r = rangoPeriodo(per)
    const { data, error: e } = await supabase.rpc('tablero', { p_negocio_id: nid, p_desde: r.desde, p_hasta: r.hasta })
    if (e) setError(mensajeError(e)); else { setError(''); setT(data) }
  }, [nid, per])
  useEffect(() => { setT(null); cargar() }, [cargar])

  if (!ctx.esDueno && !ctx.soloLectura) return <div><Volver onClick={volver} texto="Volver al panel" /><Aviso>Los reportes son solo para el dueño.</Aviso></div>

  const utilidad = t ? num(t.ganancia) - num(t.gastos) : 0
  const ticket = t && t.ventas > 0 ? Math.round(num(t.vendido) / t.ventas) : 0
  const mejorDia = t?.por_dia?.length ? [...t.por_dia].sort((a, b) => num(b.vendido) - num(a.vendido))[0] : null
  const horas = t?.por_hora?.length ? [...t.por_hora].sort((a, b) => num(b.vendido) - num(a.vendido)).slice(0, 3) : []
  const maxDia = t ? Math.max(...t.por_dia.map((d) => num(d.vendido)), 1) : 1

  return (
    <div className="pb-6">
      <Volver onClick={volver} texto="Volver al panel" />
      <Titulo sub="Los números del negocio, claros y sin vueltas.">Reportes</Titulo>
      {ctx.soloLectura && <SoloLectura />}
      <div className="mb-5"><Opciones columnas={4} valor={per} opciones={PERIODOS} onChange={setPer} /></div>
      {error && <div className="mb-4"><Aviso tipo="error">{error}</Aviso></div>}
      {!t && !error && <p className="py-8 text-center text-xl text-tinta/60">Calculando…</p>}
      {t && (
        <>
          <div className="mb-5 grid grid-cols-2 gap-3">
            <div className="rounded-2xl border-2 border-black/5 bg-white p-4 text-center"><p className="break-words text-2xl font-bold text-principal">{cop(t.vendido)}</p><p className="text-lg text-tinta/70">Vendido</p><Variacion actual={t.vendido} anterior={t.anterior.vendido} /></div>
            <div className="rounded-2xl border-2 border-black/5 bg-white p-4 text-center"><p className="break-words text-2xl font-bold text-green-800">{cop(t.ganancia)}</p><p className="text-lg text-tinta/70">Ganancia</p><Variacion actual={t.ganancia} anterior={t.anterior.ganancia} /></div>
            <div className="rounded-2xl border-2 border-black/5 bg-white p-4 text-center"><p className="text-2xl font-bold">{t.ventas}</p><p className="text-lg text-tinta/70">Ventas</p><p className="text-base text-tinta/60">Promedio {cop(ticket)}</p></div>
            <div className="rounded-2xl border-2 border-black/5 bg-white p-4 text-center"><p className="break-words text-2xl font-bold">{cop(t.gastos)}</p><p className="text-lg text-tinta/70">Gastos</p></div>
          </div>
          <div className={`mb-5 rounded-2xl border-2 p-4 text-center ${utilidad >= 0 ? 'border-green-300 bg-green-50' : 'border-red-300 bg-red-50'}`}>
            <p className="text-lg text-tinta/70">Ganancia después de gastos</p>
            <p className={`text-4xl font-bold ${utilidad >= 0 ? 'text-green-900' : 'text-red-800'}`}>{cop(utilidad)}</p>
          </div>

          {t.por_dia.length > 1 && (
            <Seccion titulo="Ventas por día">
              <div className="flex h-36 items-end gap-1" role="img" aria-label="Gráfica de ventas por día">
                {t.por_dia.map((d) => <div key={d.dia} title={`${dia(d.dia)}: ${cop(d.vendido)}`} className="flex-1 rounded-t bg-principal" style={{ height: `${Math.max((num(d.vendido) / maxDia) * 100, 3)}%` }} />)}
              </div>
              <div className="mt-1 flex justify-between text-base text-tinta/60"><span>{dia(t.por_dia[0].dia)}</span><span>{dia(t.por_dia[t.por_dia.length - 1].dia)}</span></div>
              {mejorDia && <p className="mt-2 text-lg">Mejor día: <b>{dia(mejorDia.dia)}</b> con {cop(mejorDia.vendido)}.</p>}
            </Seccion>
          )}

          {horas.length > 0 && <Seccion titulo="Horas con más ventas"><Barras filas={horas.map((h) => ({ clave: h.hora, nombre: hora(h.hora), valor: h.vendido, sub: `${h.ventas} ${h.ventas === 1 ? 'venta' : 'ventas'}` }))} /></Seccion>}

          {t.por_pago.length > 0 && <Seccion titulo="Formas de pago"><Barras filas={t.por_pago.map((p) => ({ clave: p.metodo, nombre: p.metodo.charAt(0).toUpperCase() + p.metodo.slice(1), valor: p.monto, sub: `${p.ventas} ${p.ventas === 1 ? 'venta' : 'ventas'}` }))} /></Seccion>}

          {t.top.length > 0 && <Seccion titulo="Lo que más se vende"><Barras filas={t.top.map((p) => ({ clave: p.nombre, nombre: p.nombre, valor: p.venta, sub: `${num(p.cantidad)} vendidos · ganancia ${cop(p.ganancia)}` }))} /></Seccion>}

          {t.categorias.length > 0 && <Seccion titulo="Por categoría"><Barras filas={t.categorias.map((c) => ({ clave: c.categoria, nombre: c.categoria, valor: c.venta, sub: `ganancia ${cop(c.ganancia)}` }))} /></Seccion>}

          {t.clientes.length > 0 && <Seccion titulo="Mejores clientes"><Barras filas={t.clientes.map((c) => ({ clave: c.nombre, nombre: c.nombre, valor: c.vendido, sub: `${c.ventas} ${c.ventas === 1 ? 'compra' : 'compras'}` }))} /></Seccion>}

          <Seccion titulo="Fiados">
            <div className="space-y-2 text-lg">
              <div className="flex justify-between gap-3"><span>Por cobrar</span><b>{cop(t.cartera.por_cobrar)}</b></div>
              <div className="flex justify-between gap-3"><span>Clientes que deben</span><b>{t.cartera.deudores}</b></div>
              <div className="flex justify-between gap-3"><span>Ya vencido</span><b className={num(t.mora.vencido) > 0 ? 'text-red-700' : ''}>{cop(t.mora.vencido)}</b></div>
              <div className="flex justify-between gap-3"><span>Abonos del periodo</span><b>{cop(t.abonos)}</b></div>
            </div>
          </Seccion>

          <Seccion titulo="Inventario">
            <div className="space-y-2 text-lg">
              <div className="flex justify-between gap-3"><span>Plata puesta en mercancía</span><b>{cop(t.inventario.capital)}</b></div>
              <div className="flex justify-between gap-3"><span>Valor a precio de venta</span><b>{cop(t.inventario.valor_venta)}</b></div>
              <div className="flex justify-between gap-3"><span>Productos activos</span><b>{t.inventario.productos}</b></div>
              <div className="flex justify-between gap-3"><span>Con poco stock</span><b className={t.inventario.stock_bajo > 0 ? 'text-amber-800' : ''}>{t.inventario.stock_bajo}</b></div>
              <div className="flex justify-between gap-3"><span>Agotados</span><b className={t.inventario.agotados > 0 ? 'text-red-700' : ''}>{t.inventario.agotados}</b></div>
              {t.inventario.por_vencer > 0 && <div className="flex justify-between gap-3"><span>Por vencer en 30 días</span><b className="text-amber-800">{t.inventario.por_vencer}</b></div>}
            </div>
          </Seccion>

          <Seccion titulo="Otros datos">
            <div className="space-y-2 text-lg">
              <div className="flex justify-between gap-3"><span>Descuentos dados</span><b>{cop(t.descuentos)}</b></div>
              <div className="flex justify-between gap-3"><span>Comisión de datáfono</span><b>{cop(t.comisiones)}</b></div>
              <div className="flex justify-between gap-3"><span>Domicilios cobrados</span><b>{t.domicilios} ({cop(t.envios)})</b></div>
              <div className="flex justify-between gap-3"><span>Ventas anuladas</span><b>{t.anuladas} ({cop(t.anuladas_valor)})</b></div>
            </div>
          </Seccion>
        </>
      )}
    </div>
  )
}
