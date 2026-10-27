import { useCallback, useEffect, useState } from 'react'
import Cifra from './Cifra'
import { usePersistido, borrarBorradores } from '../lib/usePersistido'
import { supabase } from '../lib/supabase'
import { traerTodo } from '../lib/traerTodo'
import { dinero, numero, aNumero } from '../lib/formato'
import { claseInput } from '../lib/estilos'
import { METODOS_VENTA, textoMetodo } from '../lib/pagos'
import { useConfig } from '../lib/config'
import { fechaFactura, numeroFactura } from '../lib/factura'
import { totalesCaja } from '../lib/cajaMov'
import FiltroFechas from './FiltroFechas'

function Tarjeta({ titulo, valor, destacado }) {
  return (
    <div className={`rounded-2xl p-4 shadow-sm ${destacado ? 'bg-marca text-white' : 'bg-white'}`}>
      <p className={`text-xs ${destacado ? 'text-white/70' : 'text-slate-400'}`}>{titulo}</p>
      <Cifra className="text-xl font-bold mt-1">{valor}</Cifra>
    </div>
  )
}

function Resumen({ rango }) {
  const [datos, setDatos] = useState(null)
  const [error, setError] = useState('')
  const [contado, setContado] = usePersistido('reportes:contado', '')
  const { formas } = useConfig()

  const cargar = useCallback(async () => {
    setDatos(null); setError('')
    const { desde, hasta } = rango
    const entre = (q) => (hasta ? q.gte('fecha', desde).lt('fecha', hasta) : q.gte('fecha', desde))

    const selV8 = 'id, total, descuento, metodo, venta_items(nombre, cantidad, precio_unitario, costo_unitario, descuento_linea), venta_pagos(metodo, monto, comision)'
    const selV7 = 'id, total, descuento, metodo, venta_items(nombre, cantidad, precio_unitario, costo_unitario)'
    const pedirVentas = (sel) => entre(supabase.from('ventas').select(sel).eq('anulada', false)).range(0, 4999)
    const pedirAnuladas = () => supabase.from('ventas')
      .select('id, numero, total, motivo_anulacion, anulada_en, anulada_por, clientes(nombre)')
      .eq('anulada', true).gte('anulada_en', desde).order('anulada_en', { ascending: false }).range(0, 199)

    let [ventas, abonos, gastos, productos, anuladas, prestamos, cajaMov, prepagoMov, prepagoSaldos] = await Promise.all([
      pedirVentas(selV8),
      entre(supabase.from('fiado_movimientos').select('monto, metodo').eq('tipo', 'abono')).range(0, 4999),
      entre(supabase.from('gastos').select('monto')).range(0, 4999),
      traerTodo(() => supabase.from('productos').select('id, stock, stock_minimo').eq('activo', true).order('id')),
      pedirAnuladas(),
      entre(supabase.from('fiado_movimientos').select('monto, metodo').eq('concepto', 'prestamo')).range(0, 4999),   // v30: préstamos rápidos
      entre(supabase.from('caja_movimientos').select('monto, tipo')).range(0, 4999),   // v31: retiros e ingresos de caja
      entre(supabase.from('prepago_movimientos').select('monto, tipo, metodo').in('tipo', ['recarga', 'devolucion', 'bono'])).range(0, 4999),   // v35/v36: saldo prepago
      (async () => {
        const n = await supabase.from('prepago_saldos').select('saldo, saldo_real, bono').gt('saldo', 0).range(0, 4999)
        return n.error ? supabase.from('prepago_saldos').select('saldo').gt('saldo', 0).range(0, 4999) : n      // sin v36: solo hay 'saldo'
      })(),
    ])
    if (ventas.error) ventas = await pedirVentas(selV7)   // todavía sin migracion-v8
    const fallo = ventas.error || abonos.error || gastos.error || productos.error
    if (fallo) return setError(fallo.message)
    const anuladasOk = (anuladas.error ? [] : anuladas.data).filter(a => !hasta || a.anulada_en < hasta)

    const porMetodo = {}
    for (const m of METODOS_VENTA) porMetodo[m.id] = 0
    const top = new Map()
    let total = 0
    let ganancia = 0
    let comisiones = 0
    let descuentos = 0
    for (const v of ventas.data) {
      total += Number(v.total)
      ganancia -= Number(v.descuento || 0)   // lo que se descontó al cliente no es ganancia
      descuentos += Number(v.descuento || 0)
      const pagos = v.venta_pagos?.length ? v.venta_pagos : [{ metodo: v.metodo, monto: v.total, comision: 0 }]
      for (const pg of pagos) {
        porMetodo[pg.metodo] = (porMetodo[pg.metodo] ?? 0) + Number(pg.monto)
        comisiones += Number(pg.comision || 0)
      }
      for (const it of v.venta_items) {
        const c = Number(it.cantidad)
        const dl = Number(it.descuento_linea || 0)
        descuentos += dl
        ganancia += (Number(it.precio_unitario) - Number(it.costo_unitario)) * c - dl
        const t = top.get(it.nombre) ?? { nombre: it.nombre, cantidad: 0, total: 0 }
        t.cantidad += c
        t.total += Number(it.precio_unitario) * c - dl
        top.set(it.nombre, t)
      }
    }
    ganancia -= comisiones
    const abonosTotal = abonos.data.reduce((s, a) => s + Number(a.monto), 0)
    const abonosEfectivo = abonos.data.filter(a => a.metodo === 'efectivo').reduce((s, a) => s + Number(a.monto), 0)
    const gastosTotal = gastos.data.reduce((s, g) => s + Number(g.monto), 0)
    const prest = prestamos.error ? [] : prestamos.data      // sin migracion-v30 aún: no hay préstamos rápidos
    const prestamosTotal = prest.reduce((s, p) => s + Number(p.monto), 0)
    const prestamosEfectivo = prest.filter(p => p.metodo === 'efectivo').reduce((s, p) => s + Number(p.monto), 0)

    // Saldo prepago: la recarga entra a la caja pero NO es una venta; la devolución sale. Lo gastado con saldo ya está en "Vendido".
    const pm = prepagoMov.error ? [] : prepagoMov.data
    const recargas = pm.filter(x => x.tipo === 'recarga')
    const recargasTotal = recargas.reduce((s, x) => s + Number(x.monto), 0)
    const recargasEfectivo = recargas.filter(x => x.metodo === 'efectivo').reduce((s, x) => s + Number(x.monto), 0)
    const devolTotal = pm.filter(x => x.tipo === 'devolucion').reduce((s, x) => s + Number(x.monto), 0)
    const devolEfectivo = pm.filter(x => x.tipo === 'devolucion' && x.metodo === 'efectivo').reduce((s, x) => s + Number(x.monto), 0)
    const ps = prepagoSaldos.error ? [] : prepagoSaldos.data
    const prepagoPorEntregar = ps.reduce((s, x) => s + Number(x.saldo_real ?? x.saldo), 0)       // la plata de los clientes (sin el bono)
    const bonosSinGastar = ps.reduce((s, x) => s + Number(x.bono ?? 0), 0)
    const bonosTotal = pm.filter(x => x.tipo === 'bono').reduce((s, x) => s + Number(x.monto), 0)
    const cm = totalesCaja(cajaMov.error ? [] : cajaMov.data)      // sin migracion-v31 aún: no hay retiros
    setDatos({
      total, ganancia, gastosTotal, comisiones, descuentos, anuladas: anuladasOk,
      cantidadVentas: ventas.data.length,
      porMetodo,
      abonos: abonosTotal, recargasTotal, devolTotal, prepagoPorEntregar, bonosSinGastar, bonosTotal, prestamos: prestamosTotal, prestamosEfectivo, retiros: cm.retiros, ingresos: cm.ingresos,
      efectivoEsperado: porMetodo.efectivo + abonosEfectivo + recargasEfectivo - devolEfectivo - gastosTotal - prestamosEfectivo - cm.retiros + cm.ingresos,
      top: [...top.values()].sort((a, b) => b.cantidad - a.cantidad).slice(0, 8),
      stockBajo: productos.data.filter(p => Number(p.stock) <= Number(p.stock_minimo)).length,
    })
  }, [rango])
  useEffect(() => { cargar() }, [cargar])

  if (error) return <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>
  if (!datos) return <p className="text-center text-sm text-slate-400 py-8">Calculando…</p>

  // formas activas + las que tuvieron ventas aunque se hayan desactivado
  const base = (formas?.length ? formas : METODOS_VENTA.map(m => ({ id: m.id, nombre: m.texto, tipo: m.id === 'fiado' ? 'fiado' : 'digital' })))
  const metodos = [...base.filter(m => m.activa !== false || (datos.porMetodo[m.id] ?? 0) > 0),
    ...Object.keys(datos.porMetodo).filter(id => !base.some(m => m.id === id) && datos.porMetodo[id] > 0)
      .map(id => ({ id, nombre: textoMetodo(id), tipo: 'digital' }))]
  const diferencia = aNumero(contado) - datos.efectivoEsperado

  return (
    <>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Tarjeta titulo={`Vendido (${datos.cantidadVentas} ventas)`} valor={dinero(datos.total)} destacado />
        <Tarjeta titulo="Ganancia de las ventas" valor={dinero(datos.ganancia)} />
        <Tarjeta titulo="Gastos" valor={dinero(datos.gastosTotal)} />
        <Tarjeta titulo="Ganancia neta" valor={dinero(datos.ganancia - datos.gastosTotal)} />
        <Tarjeta titulo="Descuentos dados" valor={dinero(datos.descuentos)} />
        <Tarjeta titulo="Comisión del datáfono" valor={dinero(datos.comisiones)} />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 [&>*:last-child:nth-child(odd)]:col-span-2 lg:[&>*:last-child:nth-child(odd)]:col-span-1">
        {metodos.map(m => (
          <Tarjeta key={m.id} titulo={m.tipo === 'fiado' ? `${m.nombre} (por cobrar)` : m.tipo === 'prepago' ? `${m.nombre} (ya estaba pagado)` : m.nombre}
                   valor={dinero(datos.porMetodo[m.id] ?? 0)} />
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3 [&>*:last-child:nth-child(odd)]:col-span-2">
        <Tarjeta titulo="Abonos recibidos" valor={dinero(datos.abonos)} />
        <Tarjeta titulo="Productos con stock bajo" valor={numero(datos.stockBajo)} />
        {datos.recargasTotal > 0 && <Tarjeta titulo="Recargas de saldo (no son venta)" valor={dinero(datos.recargasTotal)} />}
        {datos.devolTotal > 0 && <Tarjeta titulo="Saldo devuelto a clientes" valor={dinero(datos.devolTotal)} />}
        {datos.bonosTotal > 0 && <Tarjeta titulo="Bonos regalados (no es plata)" valor={dinero(datos.bonosTotal)} />}
        {datos.bonosSinGastar > 0 && <Tarjeta titulo="Bonos sin gastar" valor={dinero(datos.bonosSinGastar)} />}
        {datos.prepagoPorEntregar > 0 && <Tarjeta titulo="Saldos de clientes por entregar" valor={dinero(datos.prepagoPorEntregar)} />}
        {datos.prestamos > 0 && <Tarjeta titulo="Préstamos rápidos entregados" valor={dinero(datos.prestamos)} />}
        {datos.retiros > 0 && <Tarjeta titulo="Retiros de caja" valor={dinero(datos.retiros)} />}
        {datos.ingresos > 0 && <Tarjeta titulo="Ingresos a la caja (base)" valor={dinero(datos.ingresos)} />}
      </div>

      <div className="bg-white rounded-2xl shadow-sm p-4 space-y-3">
        <p className="text-xs font-medium text-slate-500">Cierre de caja (efectivo)</p>
        <div className="grid grid-cols-2 gap-3 items-end">
          <div className="h-12 rounded-xl bg-slate-50 px-3 grid content-center">
            <span className="text-[11px] text-slate-400 leading-none">Debería haber</span>
            <span className="font-bold">{dinero(datos.efectivoEsperado)}</span>
          </div>
          <label className="space-y-1">
            <span className="text-[11px] text-slate-400">Lo que hay contado</span>
            <input value={contado} onChange={e => setContado(e.target.value)}
                   inputMode="numeric" placeholder="0" className={claseInput} />
          </label>
        </div>
        {contado.trim() !== '' && (
          <p className={`text-sm rounded-lg px-3 py-2 ${
            diferencia === 0 ? 'text-marca bg-lima/20'
            : diferencia > 0 ? 'text-marca bg-lima/20' : 'text-red-600 bg-red-50'}`}>
            {diferencia === 0 ? 'La caja cuadra.'
              : diferencia > 0 ? `Sobran ${dinero(diferencia)}.` : `Faltan ${dinero(-diferencia)}.`}
          </p>
        )}
        <p className="text-[11px] text-slate-400">
          Efectivo vendido + abonos en efectivo + recargas de saldo en efectivo − saldo devuelto en efectivo + ingresos − gastos − préstamos rápidos en efectivo − retiros de caja. Para el cierre del día usa "Hoy".
        </p>
      </div>

      <div className="bg-white rounded-2xl shadow-sm">
        <p className="px-4 pt-4 text-xs font-medium text-slate-500">Más vendidos</p>
        {datos.top.length === 0 ? (
          <p className="p-6 text-center text-sm text-slate-400">Sin ventas en este periodo</p>
        ) : (
          <ul className="divide-y divide-slate-100 mt-2">
            {datos.top.map(t => (
              <li key={t.nombre} className="px-4 py-3 grid grid-cols-[1fr_4rem_6rem] gap-2 items-center text-sm">
                <span className="break-words">{t.nombre}</span>
                <span className="text-center text-slate-500">×{numero(t.cantidad)}</span>
                <span className="text-right font-semibold">{dinero(t.total)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="bg-white rounded-2xl shadow-sm">
        <p className="px-4 pt-4 text-xs font-medium text-slate-500">Ventas revertidas ({datos.anuladas.length})</p>
        {datos.anuladas.length === 0 ? (
          <p className="p-6 text-center text-sm text-slate-400">No se revirtió ninguna venta</p>
        ) : (
          <ul className="divide-y divide-slate-100 mt-2">
            {datos.anuladas.map(a => (
              <li key={a.id} className="px-4 py-3 grid grid-cols-[1fr_auto] gap-x-3 gap-y-0.5 text-sm">
                <span className="font-medium break-words">N.º {numeroFactura(a.numero)}{a.clientes?.nombre ? ` · ${a.clientes.nombre}` : ''}</span>
                <span className="text-right font-semibold">{dinero(a.total)}</span>
                <span className="text-xs text-slate-400 break-words">{fechaFactura(a.anulada_en)}{a.anulada_por ? ` · ${a.anulada_por}` : ''}</span>
                <span />
                <span className="text-xs text-slate-500 col-span-2">Motivo: {a.motivo_anulacion}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  )
}

export default function Reportes() {
  return <FiltroFechas>{(rango) => <Resumen rango={rango} />}</FiltroFechas>
}
