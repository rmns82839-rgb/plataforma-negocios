// Factura / comprobante de venta en tamaño carta. Se ve en pantalla y se imprime con
// cualquier impresora (Imprimir → elegir la impresora → listo).
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '../lib/supabase'
import { dinero, numero, fechaSolo } from '../lib/formato'
import { textoMetodo } from '../lib/pagos'
import { numeroFactura, fechaFactura, documentoCliente, subtotalVenta } from '../lib/factura'

const NOMBRE_TIENDA = import.meta.env.VITE_NOMBRE_TIENDA || 'Matriz'

function Hoja({ venta, negocio }) {
  const cli = venta.clientes
  const doc = documentoCliente(cli)
  const cargo = (venta.fiado_movimientos ?? []).find(m => m.tipo === 'cargo')
  const descuento = Number(venta.descuento || 0)
  const pagos = venta.venta_pagos ?? []
  const conDescuento = venta.venta_items.some(it => Number(it.descuento_linea) > 0)
  const valorLinea = (it) => Math.round(Number(it.precio_unitario) * Number(it.cantidad)) - Number(it.descuento_linea || 0)
  // Pago único en efectivo con lo recibido: se muestra el cambio. En pagos divididos se muestra cada parte.
  const efectivo = pagos.length === 1 ? pagos[0] : null
  const recibido = efectivo?.recibido ?? (pagos.length === 0 ? venta.recibido : null)
  const cambio = recibido ? Number(recibido) - Number(venta.total) : 0
  const nombre = negocio?.nombre?.trim() || NOMBRE_TIENDA
  const lineasNegocio = [
    negocio?.nit && `NIT ${negocio.nit}`,
    [negocio?.direccion, negocio?.ciudad].filter(Boolean).join(' · '),
    negocio?.telefono && `Tel. ${negocio.telefono}`,
    negocio?.email,
    negocio?.web,
  ].filter(Boolean)

  return (
    <div id="hoja-factura"
         className="relative bg-white text-slate-900 mx-auto w-full min-w-[640px] max-w-[820px]
                    p-8 shadow-lg text-[13px] leading-snug
                    print:shadow-none print:p-0 print:max-w-none print:min-w-0 print:absolute print:inset-x-0 print:top-0">
      {venta.anulada && (
        <div className="pointer-events-none absolute inset-0 grid place-items-center overflow-hidden">
          <span className="-rotate-[20deg] text-7xl font-black tracking-widest text-red-500/20 border-8 border-red-500/20 px-8 py-2 rounded-2xl">
            ANULADA
          </span>
        </div>
      )}

      {/* Encabezado */}
      <div className="grid grid-cols-[1fr_16rem] gap-6 items-start">
        <div className="flex gap-4 items-start min-w-0">
          {negocio?.ver_logo && negocio?.logo && (
            <img src={negocio.logo} alt="" className="h-20 w-auto max-w-[9rem] object-contain shrink-0" />
          )}
          <div className="min-w-0 space-y-0.5">
            <p className="text-xl font-bold leading-tight">{nombre}</p>
            {lineasNegocio.map((l, i) => <p key={i} className="text-slate-600">{l}</p>)}
          </div>
        </div>
        <div className="border-2 border-slate-800 rounded-xl p-3 text-center space-y-1">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-600">
            {venta.provisional ? 'Comprobante provisional' : (negocio?.titulo_factura || 'Comprobante de venta')}
          </p>
          {venta.provisional
            ? <p className="text-lg font-bold">Sin número aún</p>
            : <p className="text-2xl font-bold">N.º {numeroFactura(venta.numero)}</p>}
          <p className="text-slate-600">{fechaFactura(venta.fecha)}</p>
          {venta.anulada && <p className="text-xs font-bold text-red-600">ANULADA</p>}
        </div>
      </div>

      {/* Cliente */}
      <div className="mt-5 border border-slate-300 rounded-xl p-3 grid grid-cols-2 gap-x-6 gap-y-1">
        <p><span className="text-slate-500">Cliente: </span><b>{cli?.nombre || 'CONSUMIDOR FINAL'}</b></p>
        <p><span className="text-slate-500">Documento: </span>{doc || '—'}</p>
        {cli?.telefono && <p><span className="text-slate-500">Teléfono: </span>{cli.telefono}</p>}
        {cli?.direccion && <p><span className="text-slate-500">Dirección: </span>{cli.direccion}</p>}
        {cli?.email && <p className="col-span-2"><span className="text-slate-500">Correo: </span>{cli.email}</p>}
      </div>

      {/* Productos */}
      <table className="mt-5 w-full border-collapse">
        <thead>
          <tr className="border-y-2 border-slate-800 text-left text-[11px] uppercase tracking-wide">
            <th className="py-2 w-20">Cant.</th>
            <th className="py-2">Descripción</th>
            <th className="py-2 w-32 text-right">Vr. unitario</th>
            {conDescuento && <th className="py-2 w-28 text-right">Desc.</th>}
            <th className="py-2 w-32 text-right">Valor</th>
          </tr>
        </thead>
        <tbody>
          {venta.venta_items.map((it, i) => (
            <tr key={i} className="border-b border-slate-200 align-top">
              <td className="py-1.5">{numero(it.cantidad)}</td>
              <td className="py-1.5">{it.nombre}{it.promo && <span className="block text-[11px] text-slate-500">Promoción: {it.promo}</span>}</td>
              <td className="py-1.5 text-right">{dinero(it.precio_unitario)}</td>
              {conDescuento && <td className="py-1.5 text-right">{Number(it.descuento_linea) > 0 ? `− ${dinero(it.descuento_linea)}` : ''}</td>}
              <td className="py-1.5 text-right">{dinero(valorLinea(it))}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Totales y pago */}
      <div className="mt-4 grid grid-cols-2 gap-6 items-start">
        <div className="space-y-1">
          {pagos.length > 1 ? (
            <div className="space-y-0.5">
              <p className="text-slate-500">Formas de pago:</p>
              {pagos.map((p, i) => (
                <p key={i} className="grid grid-cols-[1fr_auto] gap-4">
                  <span><b>{textoMetodo(p.metodo)}</b>{p.recibido ? ` · recibido ${dinero(p.recibido)}, cambio ${dinero(Number(p.recibido) - Number(p.monto))}` : ''}</span>
                  <span>{dinero(p.monto)}</span>
                </p>
              ))}
            </div>
          ) : (
            <p><span className="text-slate-500">Forma de pago: </span><b>{textoMetodo(venta.metodo)}</b></p>
          )}
          {recibido && pagos.length <= 1 && (
            <p className="text-slate-600">
              Recibido {dinero(recibido)} · Cambio {dinero(cambio)}
            </p>
          )}
          {(venta.metodo === 'fiado' || pagos.some(p => p.metodo === 'fiado')) && (
            <p className="text-slate-600">
              Venta a crédito{cargo?.fecha_limite ? ` · pagar antes del ${fechaSolo(cargo.fecha_limite)}` : ''}
            </p>
          )}
          {venta.domicilio && <p className="text-slate-600">Domicilio a: {venta.dom_direccion}{venta.dom_telefono ? ` · Tel. ${venta.dom_telefono}` : ''}</p>}
          {venta.nota && <p className="text-red-600 font-medium">Nota: {venta.nota}</p>}
        </div>
        <div className="space-y-1">
          {(descuento > 0 || Number(venta.dom_costo) > 0) && (
            <p className="grid grid-cols-2"><span className="text-slate-500">Subtotal</span><span className="text-right">{dinero(subtotalVenta(venta))}</span></p>
          )}
          {descuento > 0 && (
            <p className="grid grid-cols-2"><span className="text-slate-500">Descuento</span><span className="text-right">− {dinero(descuento)}</span></p>
          )}
          {Number(venta.dom_costo) > 0 && (
            <p className="grid grid-cols-2"><span className="text-slate-500">Domicilio</span><span className="text-right">{dinero(venta.dom_costo)}</span></p>
          )}
          <p className="grid grid-cols-2 border-t-2 border-slate-800 pt-1 text-lg font-bold">
            <span>TOTAL</span><span className="text-right">{dinero(venta.total)}</span>
          </p>
        </div>
      </div>

      {venta.provisional && (
        <p className="mt-6 text-center text-slate-600">Venta hecha sin internet: recibe su número de factura cuando se sube al sistema.</p>
      )}

      {negocio?.nota_pie && (
        <p className="mt-8 pt-3 border-t border-slate-200 text-center text-slate-600 whitespace-pre-line">
          {negocio.nota_pie}
        </p>
      )}
    </div>
  )
}

export default function Factura({ ventaId, provisional = null, onCerrar }) {
  const [venta, setVenta] = useState(null)
  const [negocio, setNegocio] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let vivo = true
    if (provisional) {       // venta hecha sin internet: se arma con lo que hay en el equipo
      supabase.from('negocio').select('*').eq('id', 1).maybeSingle().then(({ data }) => { if (vivo) { setVenta(provisional); setNegocio(data ?? null) } })
      return () => { vivo = false }
    }
    Promise.all([
      supabase.from('ventas')
        .select('*, clientes(nombre, tipo_documento, documento, telefono, direccion, email), venta_items(nombre, cantidad, precio_unitario, descuento_linea, promo), venta_pagos(metodo, monto, recibido), fiado_movimientos(tipo, fecha_limite)')
        .eq('id', ventaId).single(),
      supabase.from('negocio').select('*').eq('id', 1).maybeSingle(),
    ]).then(([v, n]) => {
      if (!vivo) return
      if (v.error) return setError(v.error.message)
      setVenta(v.data)
      setNegocio(n.data ?? null)
    })
    return () => { vivo = false }
  }, [ventaId, provisional])

  // El visor va fuera de #root para que al imprimir salga solo la factura
  return createPortal(
    <div className="visor-factura fixed inset-0 z-[60] bg-slate-300 overflow-auto
                    print:static print:overflow-visible print:bg-white">
      <div className="print:hidden sticky top-0 z-10 bg-white border-b border-slate-200 pt-[env(safe-area-inset-top)]">
        <div className="max-w-md mx-auto h-14 px-4 grid grid-cols-2 gap-3 items-center">
          <button onClick={onCerrar}
            className="h-10 rounded-xl bg-slate-100 text-slate-600 text-sm font-medium active:bg-slate-200">
            Cerrar
          </button>
          <button onClick={() => window.print()} disabled={!venta}
            className="h-10 rounded-xl bg-marca text-white text-sm font-semibold disabled:opacity-40 active:bg-marca-oscuro">
            Imprimir
          </button>
        </div>
      </div>

      <div className="p-4 print:p-0">
        {error && <p className="max-w-md mx-auto text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
        {!venta && !error && <p className="text-center text-sm text-slate-500 py-12">Cargando…</p>}
        {venta && <Hoja venta={venta} negocio={negocio} />}
      </div>
    </div>,
    document.body,
  )
}
