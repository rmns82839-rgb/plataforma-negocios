// Recibo de una venta: verlo, mandarlo por WhatsApp, imprimirlo o copiarlo.
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { armarRecibo, textoRecibo, htmlRecibo, enlaceWhatsApp, fechaRecibo } from '../lib/recibo'
import { textoCantidad } from '../lib/pesaje'
import { cop } from '../lib/pedido'

export async function cargarRecibo(nid, ventaId, marca, formas) {
  const base = (t, cols) => supabase.from(t).select(cols).eq('negocio_id', nid)
  const [v, it, pg] = await Promise.all([
    base('ventas', 'numero,fecha,total,descuento,dom_costo,anulada,cliente_id').eq('id', ventaId).single(),
    base('venta_items', 'nombre,cantidad,precio_unitario,descuento_linea').eq('venta_id', ventaId),
    base('venta_pagos', 'metodo,monto,recibido').eq('venta_id', ventaId),
  ])
  if (v.error || !v.data) return null
  let cliente = null
  if (v.data.cliente_id) { const c = await base('clientes', 'nombre,telefono').eq('id', v.data.cliente_id).maybeSingle(); cliente = c.data || null }
  const recibo = armarRecibo({ tienda: marca || {}, venta: v.data, items: it.data || [], pagos: pg.data || [], formas, cliente })
  return { recibo, telefono: cliente?.telefono || '' }
}

function imprimir(html) {
  const f = document.createElement('iframe')
  f.setAttribute('aria-hidden', 'true')
  f.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0'
  document.body.appendChild(f)
  const d = f.contentWindow.document
  d.open(); d.write(html); d.close()
  setTimeout(() => { try { f.contentWindow.focus(); f.contentWindow.print() } finally { setTimeout(() => f.remove(), 3000) } }, 250)
}

export default function Recibo({ nid, ventaId, marca, formas }) {
  const [d, setD] = useState(undefined)   // undefined cargando · null no se pudo
  const [copiado, setCopiado] = useState(false)
  useEffect(() => { let vivo = true; cargarRecibo(nid, ventaId, marca, formas).then((r) => vivo && setD(r)); return () => { vivo = false } }, [nid, ventaId]) // eslint-disable-line react-hooks/exhaustive-deps
  if (d === undefined) return <p className="py-4 text-center text-lg text-tinta/60">Preparando el recibo…</p>
  if (d === null) return <p className="py-4 text-center text-lg text-tinta/60">No pudimos cargar el recibo.</p>
  const r = d.recibo
  const texto = textoRecibo(r)
  const copiar = async () => { try { await navigator.clipboard.writeText(texto); setCopiado(true); setTimeout(() => setCopiado(false), 2500) } catch { /* sin permiso */ } }
  const btn = 'flex min-h-[56px] items-center justify-center rounded-2xl border-2 px-2 text-center text-lg font-semibold leading-tight'
  return (
    <div>
      <div className="mb-4 rounded-2xl border-2 border-black/10 bg-white p-4 font-mono text-base leading-snug" aria-label="Recibo">
        <p className="text-center text-lg font-bold">{r.tienda.nombre}</p>
        {r.tienda.nit && <p className="text-center">NIT {r.tienda.nit}</p>}
        <p className="mt-1 text-center">Venta #{r.numero} · {fechaRecibo(r.fecha)}</p>
        {r.cliente && <p className="text-center">Cliente: {r.cliente}</p>}
        <hr className="my-2 border-dashed border-black/30" />
        {r.lineas.map((l, i) => <div key={i} className="flex justify-between gap-3"><span className="break-words">{textoCantidad(l.cantidad)} × {l.nombre}</span><span className="shrink-0">{cop(l.total)}</span></div>)}
        <hr className="my-2 border-dashed border-black/30" />
        {(r.descuento > 0 || r.envio > 0) && <div className="flex justify-between"><span>Subtotal</span><span>{cop(r.subtotal)}</span></div>}
        {r.descuento > 0 && <div className="flex justify-between"><span>Descuento</span><span>−{cop(r.descuento)}</span></div>}
        {r.envio > 0 && <div className="flex justify-between"><span>Domicilio</span><span>{cop(r.envio)}</span></div>}
        <div className="flex justify-between text-xl font-bold"><span>TOTAL</span><span>{cop(r.total)}</span></div>
        {r.pagos.map((p, i) => <div key={i} className="flex justify-between"><span>{p.nombre}</span><span>{cop(p.monto)}</span></div>)}
        {r.cambio > 0 && <div className="flex justify-between"><span>Devuelto</span><span>{cop(r.cambio)}</span></div>}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <a href={enlaceWhatsApp(texto, d.telefono)} target="_blank" rel="noopener noreferrer" className={`${btn} border-[#128C4A] bg-[#128C4A] text-white`}>Enviar por WhatsApp</a>
        <button type="button" onClick={() => imprimir(htmlRecibo(r))} className={`${btn} border-black/15 bg-white`}>Imprimir</button>
        <button type="button" onClick={copiar} className={`${btn} col-span-2 border-black/15 bg-white`}>{copiado ? '✓ Copiado' : 'Copiar el recibo'}</button>
      </div>
    </div>
  )
}
