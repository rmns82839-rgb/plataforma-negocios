// Vender ropa desde el panel (mostrador o pedido de WhatsApp). Dos pasos, con botón de volver y el total siempre a la vista:
//  1) Prendas (talla/color y cantidad) · 2) Cliente, forma de pago y cobro.
import { useEffect, useMemo, useRef, useState } from 'react'
import { leerBorrador, guardarBorrador, DOCE_HORAS } from '../lib/borrador'
import { supabase } from '../lib/supabase'
import { dinero, aNumero } from '../lib/formato'
import { claseInput } from '../lib/estilos'
import { useConfig } from '../lib/config'
import { useDueno } from '../context/rol'
import { mejorPromoPrenda, textoGenero } from '../lib/ropa'
import Modal from './Modal'

const nombreVariante = (v) => `${v.talla}${v.color ? ` · ${v.color}` : ''}`

// Barra de total fija abajo (se ve siempre, sin hacer scroll)
function BarraTotal({ total, ahorro, etiqueta, onClick, deshabilitado, cargando }) {
  return (
    <div className="sticky -bottom-5 -mx-5 -mb-5 mt-2 px-5 pt-3 pb-5 bg-gradient-to-t from-white via-white to-white/80">
      <div className="rounded-2xl bg-negro px-4 py-3 grid grid-cols-[1fr_auto] gap-3 items-center ring-1 ring-champagne/30 shadow-xl">
        <div className="min-w-0">
          <p className="text-[11px] text-champagne/70 leading-none">Total a pagar</p>
          <p className="font-display text-2xl font-semibold text-champagne leading-tight">{dinero(total)}</p>
          {ahorro > 0 && <p className="text-[11px] text-hueso/60 leading-none">Ahorro {dinero(ahorro)}</p>}
        </div>
        <button onClick={onClick} disabled={deshabilitado || cargando}
          className="h-12 px-5 rounded-xl bg-champagne text-negro text-sm font-semibold disabled:opacity-40 active:bg-champagne-claro">
          {cargando ? 'Un momento…' : etiqueta}
        </button>
      </div>
    </div>
  )
}

const CLAVE_BORRADOR = 'borrador-ventaropa'

export default function VentaRopa({ pedido = null, onCerrar, onVendido }) {
  const dueno = useDueno()
  const { formas } = useConfig()
  const [paso, setPaso] = useState(1)
  const [prendas, setPrendas] = useState([])
  const [promos, setPromos] = useState([])
  const [cargando, setCargando] = useState(true)
  const [lineas, setLineas] = useState([])           // [{ variante, prenda, cantidad }]
  const [q, setQ] = useState('')
  const [abierta, setAbierta] = useState(null)       // prenda con sus tallas desplegadas
  const [clientes, setClientes] = useState([])
  const [qCliente, setQCliente] = useState('')
  const [cliente, setCliente] = useState(null)
  const [metodo, setMetodo] = useState('efectivo')
  const [recibido, setRecibido] = useState('')
  const [descuento, setDescuento] = useState('')
  const [nota, setNota] = useState('')
  const [error, setError] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [hecha, setHecha] = useState(null)
  // Domicilio: si el pedido de la clienta era a domicilio, la venta lo trae (dirección, teléfono y costo editable)
  const esDomicilio = Boolean(pedido) && pedido.entrega !== 'recoger' && String(pedido.direccion ?? '').trim().length >= 5
  const [envioTxt, setEnvioTxt] = useState(() => String(Math.round(Number(pedido?.domicilio) || 0)))
  const envio = esDomicilio ? Math.max(0, Math.round(aNumero(envioTxt))) : 0
  const [recuperada, setRecuperada] = useState(0)   // prendas de la venta que se recuperó al abrir
  const guardarListo = useRef(false)                 // no se guarda hasta intentar recuperar la anterior

  useEffect(() => {
    Promise.all([
      supabase.from('prendas').select('*, prenda_variantes(*)').eq('activo', true).order('nombre').range(0, 499),
      supabase.from('promociones').select('*').eq('activa', true),
    ]).then(([pr, po]) => {
      const lista = pr.data ?? []
      setPrendas(lista)
      setPromos((po.data ?? []).filter(p => p.prenda_id || p.categoria_ropa || p.genero))
      if (pr.error) setError(pr.error.message)
      if (pedido) {
        // las líneas del pedido de WhatsApp, con el stock de hoy
        const ls = []
        for (const it of pedido.pedido_ropa_items ?? []) {
          const prenda = lista.find(p => p.prenda_variantes.some(v => v.id === it.variante_id))
          const variante = prenda?.prenda_variantes.find(v => v.id === it.variante_id)
          if (variante) ls.push({ variante, prenda, cantidad: it.cantidad })
          else setError('Alguna prenda del pedido ya no está en el catálogo: agrégala a mano.')
        }
        setLineas(ls)
        if (pedido.telefono) setQCliente('')
      } else if (!pr.error) {
        // la venta de mostrador que se estaba armando (se cerró la ventana o se recargó la página)
        const g = leerBorrador(CLAVE_BORRADOR, DOCE_HORAS)
        const ls = []
        for (const it of g?.lineas ?? []) {
          const prenda = lista.find(p => p.prenda_variantes.some(v => v.id === it.vid))
          const variante = prenda?.prenda_variantes.find(v => v.id === it.vid)
          const cantidad = variante ? Math.min(it.cantidad, variante.stock) : 0
          if (cantidad > 0) ls.push({ variante, prenda, cantidad })
        }
        if (ls.length > 0) {
          setLineas(ls); setCliente(g.cliente ?? null); setMetodo(g.metodo ?? 'efectivo')
          setDescuento(g.descuento ?? ''); setNota(g.nota ?? ''); setRecuperada(ls.length)
        } else guardarBorrador(CLAVE_BORRADOR, null)
        guardarListo.current = true
      }
      setCargando(false)
    })
  }, [pedido])

  useEffect(() => {
    const t = qCliente.trim()
    if (t.length < 1) { setClientes([]); return undefined }
    const h = setTimeout(async () => {
      const { data } = await supabase.from('clientes').select('id, nombre, cupo_credito, dias_credito').ilike('nombre', `%${t}%`).order('nombre').limit(5)
      setClientes(data ?? [])
    }, 250)
    return () => clearTimeout(h)
  }, [qCliente])

  // Guardar la venta en curso cada vez que cambia (no se guarda al vender un pedido de WhatsApp)
  useEffect(() => {
    if (!guardarListo.current) return
    guardarBorrador(CLAVE_BORRADOR, lineas.length === 0 || hecha ? null : {
      lineas: lineas.map(l => ({ vid: l.variante.id, cantidad: l.cantidad })),
      cliente, metodo, descuento, nota,
    })
  }, [lineas, cliente, metodo, descuento, nota, hecha])

  const empezarDeNuevo = () => {
    setLineas([]); setCliente(null); setMetodo('efectivo'); setDescuento(''); setNota(''); setRecibido(''); setRecuperada(0)
  }

  const coincidencias = useMemo(() => {
    const t = q.trim().toLowerCase()
    if (t.length < 1) return []
    return prendas.filter(p => p.nombre.toLowerCase().includes(t) || (p.categoria ?? '').toLowerCase().includes(t)).slice(0, 6)
  }, [q, prendas])

  const cuenta = useMemo(() => {
    let bruto = 0, ahorro = 0
    const detalle = lineas.map(l => {
      const b = Number(l.prenda.precio) * l.cantidad
      const m = mejorPromoPrenda(promos, l.prenda, l.cantidad)
      bruto += b; ahorro += m?.descuento ?? 0
      return { ...l, bruto: b, descuento: m?.descuento ?? 0, promo: m?.nombre ?? null }
    })
    const general = dueno ? Math.min(Math.max(0, Math.round(aNumero(descuento))), bruto - ahorro - 1) : 0
    return { detalle, bruto, ahorro, general, total: Math.max(0, bruto - ahorro - general) }
  }, [lineas, promos, descuento, dueno])

  const activas = formas.filter(f => f.activa !== false && f.tipo !== 'prepago')
  const forma = activas.find(f => f.id === metodo)
  const esFiado = forma?.tipo === 'fiado'
  const esEfectivo = forma?.tipo === 'efectivo'
  const totalCobro = cuenta.total + envio
  const cambio = esEfectivo && recibido.trim() ? aNumero(recibido) - totalCobro : null

  const agregar = (prenda, variante) => {
    setError('')
    setLineas(prev => {
      const i = prev.findIndex(l => l.variante.id === variante.id)
      if (i >= 0) {
        const c = [...prev]; c[i] = { ...c[i], cantidad: Math.min(c[i].cantidad + 1, Math.max(variante.stock, 1)) }; return c
      }
      return [...prev, { prenda, variante, cantidad: 1 }]
    })
    setAbierta(null); setQ('')
  }
  const cambiarCant = (id, d) => setLineas(prev => prev
    .map(l => (l.variante.id === id ? { ...l, cantidad: Math.min(l.cantidad + d, Math.max(l.variante.stock, 1)) } : l))
    .filter(l => l.cantidad > 0))

  const sinStock = lineas.find(l => l.variante.stock < l.cantidad)
  const motivoNo = lineas.length === 0 ? 'Agrega al menos una prenda'
    : sinStock ? `Sin stock suficiente de ${sinStock.prenda.nombre} (${sinStock.variante.talla})`
    : paso === 2 && esFiado && !cliente ? 'El fiado necesita un cliente'
    : paso === 2 && esEfectivo && cambio !== null && cambio < 0 ? 'Lo recibido es menor al total' : ''

  const cobrar = async () => {
    setEnviando(true); setError('')
    const pago = { metodo, monto: totalCobro, ...(esEfectivo && recibido.trim() ? { recibido: aNumero(recibido) } : {}) }
    const { data, error: err } = await supabase.rpc('registrar_venta_ropa', {
      p_items: lineas.map(l => ({ variante_id: l.variante.id, cantidad: l.cantidad })),
      p_pagos: [pago],
      p_cliente_id: cliente?.id ?? null,
      p_nota: nota.trim() || null,
      p_descuento: cuenta.general,
      p_pedido_id: pedido?.id ?? null,
      p_domicilio: esDomicilio ? { direccion: String(pedido.direccion).trim(), telefono: pedido.telefono ?? '', costo: envio } : null,
    })
    if (err) {
      setEnviando(false)
      return setError(/could not find the function|schema cache|PGRST202/i.test(`${err.message} ${err.code}`) ? 'Falta ejecutar migracion-v11.sql en Supabase.' : err.message)
    }
    const { data: v } = await supabase.from('ventas').select('numero').eq('id', data).maybeSingle()
    setEnviando(false)
    setHecha({ numero: v?.numero, total: totalCobro, cambio: cambio !== null && cambio > 0 ? cambio : 0 })
  }

  if (hecha) {
    return (
      <Modal titulo="Venta registrada" onCerrar={() => { onVendido?.(); onCerrar() }}>
        <div className="bg-negro rounded-2xl p-5 grid gap-1 text-center">
          <p className="text-xs text-champagne/70">{hecha.numero ? `Venta N.º ${hecha.numero}` : 'Venta lista'}</p>
          <p className="font-display text-4xl font-semibold text-champagne">{dinero(hecha.total)}</p>
          {hecha.cambio > 0 && <p className="text-sm text-hueso/80">Cambio: {dinero(hecha.cambio)}</p>}
        </div>
        <p className="text-xs text-slate-500 text-center">El stock de las tallas ya se descontó{pedido ? ' y el pedido quedó como vendido' : ''}.</p>
        <button onClick={() => { onVendido?.(); onCerrar() }}
          className="w-full h-12 rounded-xl bg-marca text-white font-semibold active:bg-marca-oscuro">Listo</button>
      </Modal>
    )
  }

  return (
    <Modal titulo={pedido ? `Vender pedido N.º ${pedido.numero}` : 'Vender ropa'} onCerrar={onCerrar} ancho="max-w-md lg:max-w-xl">
      <div className="grid grid-cols-2 gap-2 text-center text-xs font-medium">
        {['Prendas', 'Cobro'].map((t, i) => (
          <span key={t} className={`h-9 rounded-xl grid place-items-center ${paso === i + 1 ? 'bg-marca text-white' : 'bg-slate-100 text-slate-500'}`}>{i + 1} · {t}</span>
        ))}
      </div>

      {cargando ? <p className="text-center text-sm text-slate-400 py-8">Cargando…</p> : paso === 1 ? (
        <>
          <div className="space-y-2">
            <input value={q} onChange={e => { setQ(e.target.value); setAbierta(null) }} placeholder="Buscar prenda por nombre o categoría" className={claseInput} />
            {coincidencias.length > 0 && (
              <ul className="rounded-xl border border-slate-200 divide-y divide-slate-100 bg-white">
                {coincidencias.map(p => (
                  <li key={p.id}>
                    <button onClick={() => setAbierta(abierta?.id === p.id ? null : p)}
                      className="w-full min-h-12 px-4 py-2 grid grid-cols-[1fr_auto] gap-3 items-center text-left active:bg-slate-50">
                      <span className="min-w-0">
                        <span className="block text-sm font-medium break-words">{p.nombre}</span>
                        <span className="block text-[11px] text-slate-400 break-words">{textoGenero(p.genero)}{p.categoria ? ` · ${p.categoria}` : ''}</span>
                      </span>
                      <span className="text-sm font-semibold">{dinero(p.precio)}</span>
                    </button>
                    {abierta?.id === p.id && (
                      <div className="px-4 pb-3 grid grid-cols-2 gap-2">
                        {p.prenda_variantes.length === 0 && <p className="col-span-2 text-xs text-slate-400">Esta prenda no tiene tallas cargadas</p>}
                        {p.prenda_variantes.map(v => (
                          <button key={v.id} onClick={() => agregar(p, v)} disabled={v.stock <= 0}
                            className="h-12 rounded-xl text-xs font-medium bg-slate-100 text-slate-700 disabled:opacity-40 disabled:line-through grid content-center">
                            <span>{nombreVariante(v)}</span>
                            <span className="text-[10px] text-slate-400 no-underline">{v.stock} en stock</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {q.trim() && coincidencias.length === 0 && <p className="text-xs text-slate-400 px-1">Sin coincidencias.</p>}
          </div>

          {recuperada > 0 && lineas.length > 0 && (
            <div className="rounded-2xl bg-champagne/25 ring-1 ring-oro/30 p-3 space-y-3">
              <p className="text-sm text-negro">Recuperamos la venta que tenías en curso. El stock y los precios son los de hoy.</p>
              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => setRecuperada(0)}
                  className="h-11 rounded-xl bg-negro text-champagne text-sm font-semibold active:opacity-90">Seguir con esta venta</button>
                <button onClick={empezarDeNuevo}
                  className="h-11 rounded-xl bg-white text-slate-600 text-sm font-medium ring-1 ring-slate-200 active:bg-slate-50">Empezar de nuevo</button>
              </div>
            </div>
          )}

          {cuenta.detalle.length === 0 ? (
            <p className="text-center text-sm text-slate-400 py-6">Busca una prenda y elige su talla.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {cuenta.detalle.map(l => (
                <li key={l.variante.id} className="py-3 grid grid-cols-[1fr_auto] gap-x-3 gap-y-2 items-center">
                  <div className="min-w-0">
                    <p className="text-sm font-medium break-words">{l.prenda.nombre}</p>
                    <p className="text-xs text-slate-400">{nombreVariante(l.variante)} · {dinero(l.prenda.precio)} c/u{l.variante.stock < l.cantidad ? ` · quedan ${l.variante.stock}` : ''}</p>
                  </div>
                  <p className="text-sm font-semibold text-right">{dinero(l.bruto - l.descuento)}</p>
                  <div className="grid grid-cols-[2.5rem_3rem_2.5rem] gap-1 items-center">
                    <button onClick={() => cambiarCant(l.variante.id, -1)} aria-label="Menos" className="h-10 rounded-lg bg-slate-100 text-lg">−</button>
                    <span className="text-center font-semibold">{l.cantidad}</span>
                    <button onClick={() => cambiarCant(l.variante.id, 1)} aria-label="Más" className="h-10 rounded-lg bg-slate-100 text-lg">+</button>
                  </div>
                  <p className="text-xs text-oro-oscuro text-right">{l.promo ? `${l.promo} − ${dinero(l.descuento)}` : ''}</p>
                </li>
              ))}
            </ul>
          )}
          {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
          {motivoNo && lineas.length > 0 && <p className="text-xs text-red-600">{motivoNo}</p>}
          <BarraTotal total={cuenta.total} ahorro={cuenta.ahorro} etiqueta="Siguiente" onClick={() => setPaso(2)} deshabilitado={Boolean(motivoNo)} />
        </>
      ) : (
        <>
          <button onClick={() => { setPaso(1); setError('') }}
            className="h-10 px-4 rounded-xl bg-slate-100 text-slate-600 text-sm font-medium inline-flex items-center gap-2">
            <span aria-hidden="true">‹</span> Volver a las prendas
          </button>

          {esDomicilio && (
            <div className="rounded-2xl bg-slate-50 ring-1 ring-slate-200 p-3 space-y-2">
              <p className="text-xs font-semibold text-slate-600">Domicilio</p>
              <p className="text-sm text-slate-700 break-words">{pedido.direccion}</p>
              <label className="grid grid-cols-[1fr_9rem] gap-3 items-center">
                <span className="text-xs text-slate-500">Costo del domicilio ($)</span>
                <input value={envioTxt} onChange={e => setEnvioTxt(e.target.value)} inputMode="numeric" className={claseInput} />
              </label>
              <p className="text-[11px] text-slate-400">Se suma al total y la venta queda en Más → Domicilios.</p>
            </div>
          )}
          {pedido && pedido.entrega === 'recoger' && (
            <p className="text-xs rounded-xl bg-champagne/25 text-negro px-3 py-2">La clienta recoge en la tienda: sin domicilio.</p>
          )}

          <div className="space-y-2">
            <p className="text-xs font-medium text-slate-500">Cliente {esFiado ? '(obligatorio para fiar)' : '(opcional)'}</p>
            {cliente ? (
              <div className="grid grid-cols-[1fr_auto] gap-2 items-center rounded-xl bg-slate-50 p-3">
                <span className="text-sm font-medium break-words">{cliente.nombre}</span>
                <button onClick={() => setCliente(null)} aria-label="Quitar cliente" className="h-9 w-9 rounded-full bg-slate-200 text-slate-500">✕</button>
              </div>
            ) : (
              <>
                <input value={qCliente} onChange={e => setQCliente(e.target.value)} placeholder={pedido?.nombre ? `Buscar cliente (el pedido es de ${pedido.nombre})` : 'Buscar cliente por nombre'} className={claseInput} />
                {clientes.length > 0 && (
                  <div className="rounded-xl border border-slate-200 divide-y divide-slate-100 bg-white">
                    {clientes.map(c => (
                      <button key={c.id} onClick={() => { setCliente(c); setQCliente(''); setClientes([]) }}
                        className="w-full min-h-11 px-4 text-left text-sm active:bg-slate-50">{c.nombre}</button>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>

          <div className="space-y-2">
            <p className="text-xs font-medium text-slate-500">Forma de pago</p>
            <div className="grid grid-cols-3 gap-2">
              {activas.map(f => (
                <button key={f.id} onClick={() => setMetodo(f.id)}
                  className={`min-h-11 rounded-xl text-xs font-medium px-1 ${metodo === f.id ? 'bg-marca text-white' : 'bg-slate-100 text-slate-600'}`}>
                  {f.nombre}
                </button>
              ))}
            </div>
            {esEfectivo && (
              <div className="grid grid-cols-2 gap-3 items-end">
                <label className="space-y-1">
                  <span className="text-[11px] text-slate-400">Recibido</span>
                  <input value={recibido} onChange={e => setRecibido(e.target.value)} inputMode="numeric" placeholder="0" className={claseInput} />
                </label>
                <div className="h-12 rounded-xl bg-slate-50 px-3 grid content-center">
                  <span className="text-[11px] text-slate-400 leading-none">Cambio</span>
                  <span className={`font-bold ${cambio !== null && cambio < 0 ? 'text-red-600' : ''}`}>{cambio === null ? '—' : dinero(Math.max(cambio, 0))}</span>
                </div>
              </div>
            )}
          </div>

          {dueno && (
            <label className="block space-y-1">
              <span className="text-xs font-medium text-slate-500">Descuento general (opcional)</span>
              <input value={descuento} onChange={e => setDescuento(e.target.value)} inputMode="numeric" placeholder="0" className={claseInput} />
            </label>
          )}
          <label className="block space-y-1">
            <span className="text-xs font-medium text-slate-500">Nota (opcional)</span>
            <input value={nota} onChange={e => setNota(e.target.value)} maxLength={120} className={claseInput} />
          </label>

          {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
          {motivoNo && <p className="text-xs text-red-600">{motivoNo}</p>}
          <BarraTotal total={totalCobro} ahorro={cuenta.ahorro + cuenta.general} etiqueta="Cobrar" onClick={cobrar} deshabilitado={Boolean(motivoNo)} cargando={enviando} />
        </>
      )}
    </Modal>
  )
}
