import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { dinero, numero, aNumero } from '../lib/formato'
import { claseInput } from '../lib/estilos'
import { usePersistido, borrarBorradores, TREINTA_MIN } from '../lib/usePersistido'
import { enlaceWhatsApp } from '../lib/datosCliente'
import Modal from './Modal'

const hora = (iso) => new Date(iso).toLocaleString('es-CO', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })

// Al recibir un pedido de la tienda en línea: desglose de productos como en la Caja y el valor del domicilio, que se puede poner o cambiar aquí.
export default function PedidoDetalle({ pedido: p, onCerrar, onCobrar, onCambio }) {
  const domicilio = p.entrega !== 'recoger'
  const base = `pedidotienda:${p.id}:`
  const [costoTxt, setCostoTxt] = usePersistido(base + 'costo', String(Math.round(Number(p.domicilio) || 0)), true, TREINTA_MIN)
  const [sugerido, setSugerido] = useState(null)       // costo de domicilio que el dueño configuró en Datos del negocio
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    supabase.from('negocio').select('domicilio_costo').eq('id', 1).maybeSingle()
      .then(({ data }) => setSugerido(data?.domicilio_costo != null ? Number(data.domicilio_costo) : null))
  }, [])

  const items = p.pedido_tienda_items ?? []
  const lineas = items.map(it => {
    const bruto = Math.round(Number(it.precio_unitario) * Number(it.cantidad))
    const desc = Number(it.descuento ?? 0)
    return { ...it, bruto, desc, neto: bruto - desc }
  })
  const productos = Number(p.total) - Number(p.domicilio ?? 0)
  const ahorro = lineas.reduce((s, l) => s + l.desc, 0)
  const costo = domicilio ? Math.max(0, Math.round(aNumero(costoTxt))) : 0
  const total = productos + costo
  const atajos = useMemo(() => [...new Set([0, sugerido, Number(p.domicilio) || 0].filter(v => v != null))].sort((a, b) => a - b).slice(0, 4), [sugerido, p.domicilio])
  const wa = enlaceWhatsApp(p.telefono, `Hola ${String(p.nombre ?? '').split(' ')[0]}, recibimos tu pedido N.º ${p.numero}.${domicilio ? ` El domicilio cuesta ${dinero(costo)} y el total es ${dinero(total)}.` : ` El total es ${dinero(total)}.`}`)

  const seguir = async () => {
    setGuardando(true); setError('')
    if (domicilio && costo !== Math.round(Number(p.domicilio) || 0)) {
      // queda guardado en el pedido; si no se pudo, igual pasa a la Caja con el valor nuevo
      await supabase.from('pedidos_tienda').update({ domicilio: costo, total }).eq('id', p.id)
    }
    setGuardando(false)
    borrarBorradores(base)
    onCobrar(p, costo)
    onCambio?.()
  }

  return (
    <Modal titulo={`Pedido N.º ${p.numero}`} onCerrar={onCerrar}>
      <div className="rounded-2xl bg-slate-50 p-3 space-y-0.5">
        <p className="text-sm font-semibold break-words">{p.nombre}</p>
        <p className="text-xs text-slate-500">{p.telefono} · {hora(p.creado_en)}</p>
        <p className="text-xs text-slate-500 break-words">{domicilio ? p.direccion : 'Recoge en la tienda'}</p>
        {p.nota && <p className="text-xs text-slate-500 break-words">Nota: {p.nota}</p>}
      </div>

      <div className="space-y-1">
        <p className="text-xs font-medium text-slate-500">Productos ({lineas.length})</p>
        <ul className="divide-y divide-slate-100 rounded-xl ring-1 ring-slate-100 px-3">
          {lineas.map(l => (
            <li key={l.id} className="py-2 grid grid-cols-[1fr_auto] gap-x-3 items-start">
              <span className="min-w-0">
                <span className="block text-sm font-medium break-words">{l.nombre}</span>
                <span className="block text-xs text-slate-400">
                  {numero(l.cantidad)}{l.unidad === 'und' ? '' : ' ' + l.unidad} × {dinero(l.precio_unitario)}
                  {l.promo ? <span className="text-oro-oscuro"> · {l.promo}</span> : null}
                </span>
                {l.desc > 0 && <span className="block text-xs text-marca">Descuento − {dinero(l.desc)}</span>}
              </span>
              <span className="text-sm font-semibold tabular-nums">{dinero(l.neto)}</span>
            </li>
          ))}
        </ul>
      </div>

      {domicilio && (
        <div className="rounded-2xl bg-slate-50 p-3 space-y-2">
          <p className="text-sm font-semibold">Valor del domicilio</p>
          {p.dom_por_confirmar && (
            <p className="text-xs rounded-lg px-3 py-2 bg-champagne/30 text-negro break-words">El cliente pidió que tú confirmes el domicilio: no se pudo calcular la ruta. Pon el valor aquí abajo.</p>
          )}
          {Number(p.dom_km) > 0 && (
            <p className="text-xs text-slate-500 break-words">Ruta calculada: {Number(p.dom_km).toLocaleString('es-CO')} km{p.dom_tarifa?.base != null ? ` · tarifa ${dinero(p.dom_tarifa.base)} + ${dinero(p.dom_tarifa.por_km)} por km` : ''}. La tarifa quedó guardada en este pedido.</p>
          )}
          {atajos.length > 0 && (
            <div className={`grid gap-2 ${atajos.length >= 3 ? 'grid-cols-3' : 'grid-cols-2'}`}>
              {atajos.map(v => (
                <button key={v} onClick={() => setCostoTxt(String(v))}
                  className={`h-10 rounded-lg text-xs font-medium ${costo === v ? 'bg-negro text-champagne' : 'bg-white ring-1 ring-slate-200 text-slate-600'}`}>
                  {v === 0 ? 'Sin costo' : dinero(v)}
                </button>
              ))}
            </div>
          )}
          <input value={costoTxt} onChange={e => setCostoTxt(e.target.value)} inputMode="numeric" placeholder="Valor en pesos" className={claseInput} />
          {Number(p.domicilio) > 0 && costo !== Math.round(Number(p.domicilio)) && (
            <p className="text-[11px] text-slate-400">El cliente vio {dinero(p.domicilio)} al pedir.</p>
          )}
        </div>
      )}

      <div className="rounded-2xl bg-white ring-1 ring-slate-100 p-3 space-y-1 text-sm">
        <p className="grid grid-cols-[1fr_auto] text-slate-500"><span>Productos</span><span className="tabular-nums">{dinero(productos)}</span></p>
        {ahorro > 0 && <p className="grid grid-cols-[1fr_auto] text-xs text-marca"><span>Incluye descuentos por</span><span className="tabular-nums">{dinero(ahorro)}</span></p>}
        {domicilio && <p className="grid grid-cols-[1fr_auto] text-slate-500"><span>Domicilio</span><span className="tabular-nums">{costo > 0 ? dinero(costo) : 'Sin costo'}</span></p>}
        <p className="grid grid-cols-[1fr_auto] text-lg font-bold pt-1 border-t border-slate-100"><span>Total</span><span className="tabular-nums">{dinero(total)}</span></p>
      </div>

      {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}

      <div className="grid gap-2">
        <button onClick={seguir} disabled={guardando} className="h-14 rounded-2xl bg-negro text-champagne font-semibold disabled:opacity-50">
          {guardando ? 'Guardando…' : `Pasar a la Caja · ${dinero(total)}`}
        </button>
        <div className="grid grid-cols-[auto_1fr] gap-2">
          <button onClick={onCerrar} className="min-h-11 px-4 rounded-xl bg-slate-100 text-slate-600 text-sm font-medium">Volver</button>
          {wa ? <a href={wa} target="_blank" rel="noopener noreferrer" className="min-h-11 rounded-xl bg-lima/20 text-marca text-sm font-semibold grid place-items-center">Avisar al cliente por WhatsApp</a>
              : <span className="min-h-11 rounded-xl bg-slate-50 text-slate-300 text-sm font-medium grid place-items-center">Sin teléfono</span>}
        </div>
      </div>
    </Modal>
  )
}
