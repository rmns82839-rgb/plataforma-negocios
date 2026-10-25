// Vender en el mostrador: elegir productos → cobrar → listo. El total lo calcula el servidor (promociones, mayorista…).
import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { mensajeError } from '../lib/errores'
import { cop } from '../lib/pedido'
import { armarPagos, cambio, subtotalLista, aNumero } from '../lib/caja'
import { Btn, Volver, Aviso, Campo, Cantidad, BarraFija, clsInput } from '../tienda/ui'
import { Titulo, Seccion } from './piezas'
import ClienteSelector from './ClienteSelector'

export default function CajaVender({ ctx, irAlDia }) {
  const nid = ctx.neg.negocio_id
  const sim = ctx.soloLectura            // soporte: recorre todo, pero la venta es simulada
  const [productos, setProductos] = useState(null)
  const [formas, setFormas] = useState([])
  const [q, setQ] = useState('')
  const [carrito, setCarrito] = useState({})
  const [paso, setPaso] = useState('armar')   // armar · cobrar · listo
  const [cliente, setCliente] = useState(null)
  const [descuento, setDescuento] = useState('')
  const [filas, setFilas] = useState([{ metodo: 'efectivo', monto: '' }])
  const [dividir, setDividir] = useState(false)
  const [recibido, setRecibido] = useState('')
  const [total, setTotal] = useState(null)
  const [errTotal, setErrTotal] = useState('')
  const [calculando, setCalculando] = useState(false)
  const [error, setError] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [hecha, setHecha] = useState(null)
  const seq = useRef(0)

  useEffect(() => {
    supabase.from('productos').select('id,codigo,nombre,unidad,categoria,precio_venta,stock,es_kit').eq('negocio_id', nid).eq('activo', true).order('nombre').limit(1000)
      .then(({ data, error: e }) => { if (e) setError(mensajeError(e)); else setProductos(data || []) })
    supabase.from('formas_pago').select('id,nombre,tipo,orden').eq('negocio_id', nid).eq('activa', true).order('orden')
      .then(({ data }) => setFormas(data || []))
  }, [nid])

  const lineas = useMemo(() => Object.entries(carrito).map(([id, cantidad]) => ({ producto: productos?.find((p) => p.id === id), cantidad })).filter((l) => l.producto && l.cantidad > 0), [carrito, productos])
  const lista = subtotalLista(lineas)
  const desc = aNumero(descuento)
  const nombresPago = useMemo(() => Object.fromEntries(formas.map((f) => [f.id, f])), [formas])

  // El servidor dice cuánto vale de verdad (promociones, precio por mayor…). Se pide al cambiar el carrito, el cliente o el descuento.
  useEffect(() => {
    if (lineas.length === 0) { setTotal(null); setErrTotal(''); return }
    const mi = ++seq.current
    setCalculando(true)
    const t = setTimeout(async () => {
      const { data, error: e } = await supabase.rpc('previsualizar_venta', {
        p_negocio_id: nid, p_items: lineas.map((l) => ({ producto_id: l.producto.id, cantidad: l.cantidad })), p_cliente_id: cliente?.id ?? null, p_descuento: desc,
      })
      if (mi !== seq.current) return
      setCalculando(false)
      if (e) { setTotal(null); setErrTotal(mensajeError(e)) } else { setTotal(Number(data.total)); setErrTotal('') }
    }, 350)
    return () => clearTimeout(t)
  }, [lineas, cliente, desc, nid])

  const visibles = useMemo(() => {
    if (!productos) return []
    const t = q.trim().toLowerCase()
    if (!t) return productos.slice(0, 40)
    return productos.filter((p) => p.nombre.toLowerCase().includes(t) || (p.codigo || '') === t || (p.categoria || '').toLowerCase().includes(t)).slice(0, 40)
  }, [productos, q])

  const mover = (id, c) => setCarrito((prev) => { const s = { ...prev }; if (c <= 0) delete s[id]; else s[id] = Math.min(c, 9999); return s })
  const alEscribir = (e) => {
    if (e.key !== 'Enter') return
    const exacto = productos?.find((p) => p.codigo && p.codigo === q.trim())
    if (exacto) { mover(exacto.id, (carrito[exacto.id] || 0) + 1); setQ('') }
  }

  const items = lineas.reduce((s, l) => s + Number(l.cantidad), 0)
  const pagosOk = total ? armarPagos(filas, total, filas.length === 1 && nombresPago[filas[0].metodo]?.tipo === 'efectivo' ? recibido : '') : { error: '' }
  const usaFiado = filas.some((f) => nombresPago[f.metodo]?.tipo === 'fiado')
  const unEfectivo = filas.length === 1 && nombresPago[filas[0].metodo]?.tipo === 'efectivo'

  async function registrar() {
    setError('')
    if (pagosOk.error) return setError(pagosOk.error)
    if (usaFiado && !cliente) return setError('Para fiar debes elegir un cliente')
    setOcupado(true)
    if (sim) { setOcupado(false); setHecha({ numero: 'PRUEBA', total, cambio: unEfectivo ? cambio(recibido, total) : null, simulada: true }); setPaso('listo'); return }
    const { data: id, error: e } = await supabase.rpc('registrar_venta', {
      p_negocio_id: nid, p_items: lineas.map((l) => ({ producto_id: l.producto.id, cantidad: l.cantidad })), p_pagos: pagosOk.pagos,
      p_cliente_id: cliente?.id ?? null, p_nota: null, p_fecha_limite: null, p_descuento: desc, p_domicilio: null,
    })
    if (e) { setOcupado(false); return setError(mensajeError(e)) }
    const { data: v } = await supabase.from('ventas').select('numero,total').eq('negocio_id', nid).eq('id', id).single()
    setOcupado(false)
    setHecha({ numero: v?.numero ?? '', total: Number(v?.total ?? total), cambio: unEfectivo ? cambio(recibido, total) : null })
    setPaso('listo')
  }

  function nueva() {
    setCarrito({}); setCliente(null); setDescuento(''); setFilas([{ metodo: 'efectivo', monto: '' }]); setDividir(false); setRecibido(''); setTotal(null); setError(''); setHecha(null); setPaso('armar')
    supabase.from('productos').select('id,codigo,nombre,unidad,categoria,precio_venta,stock,es_kit').eq('negocio_id', nid).eq('activo', true).order('nombre').limit(1000).then(({ data }) => data && setProductos(data))
  }

  // ---------- Listo ----------
  if (paso === 'listo' && hecha) {
    return (
      <div className="pb-6">
        <div className="mb-5 rounded-2xl border-2 border-green-300 bg-green-50 p-5 text-center">
          <p className="text-3xl font-bold text-green-900">✓ Venta {hecha.simulada ? 'de prueba' : `#${hecha.numero}`} registrada</p>
          <p className="mt-2 text-4xl font-bold">{cop(hecha.total)}</p>
          {hecha.cambio != null && hecha.cambio > 0 && <p className="mt-3 text-2xl font-bold text-principal">Devuelve {cop(hecha.cambio)}</p>}
          {hecha.simulada && <p className="mt-2 text-lg">Estás en solo lectura: no se guardó nada.</p>}
        </div>
        <div className="space-y-3">
          <Btn variante="verde" onClick={nueva}>Hacer otra venta</Btn>
          <Btn variante="suave" onClick={irAlDia}>Ver el resumen del día</Btn>
        </div>
      </div>
    )
  }

  // ---------- Cobrar ----------
  if (paso === 'cobrar') {
    return (
      <div className="pb-48">
        <Volver onClick={() => { setPaso('armar'); setError('') }} texto="Volver a los productos" />
        <Titulo>Cobrar</Titulo>
        {error && <div className="mb-4"><Aviso tipo="error">{error}</Aviso></div>}
        <Seccion titulo="Cliente">
          <ClienteSelector nid={nid} cliente={cliente} onElegir={setCliente} soloLectura={sim} />
          {usaFiado && !cliente && <p className="mt-2 text-lg font-semibold text-red-700">Para fiar, elige un cliente.</p>}
        </Seccion>
        <Seccion titulo="Descuento (opcional)">
          <input className={clsInput} inputMode="numeric" placeholder="$ 0" value={descuento} onChange={(e) => setDescuento(e.target.value)} />
        </Seccion>
        <Seccion titulo="¿Cómo paga?">
          <div className="grid grid-cols-2 gap-2" role="group" aria-label="Forma de pago">
            {formas.map((f) => (
              <button key={f.id} type="button" aria-pressed={!dividir && filas[0]?.metodo === f.id} onClick={() => { setDividir(false); setFilas([{ metodo: f.id, monto: '' }]) }}
                className={`min-h-[64px] rounded-2xl border-2 px-2 text-lg font-bold leading-tight ${!dividir && filas[0]?.metodo === f.id ? 'border-principal bg-principal text-white' : 'border-black/10 bg-white'}`}>{f.nombre}</button>
            ))}
          </div>
          {unEfectivo && !dividir && (
            <div className="mt-4">
              <Campo etiqueta="¿Con cuánto paga? (opcional)"><input className={clsInput} inputMode="numeric" placeholder="$ 0" value={recibido} onChange={(e) => setRecibido(e.target.value)} /></Campo>
              {cambio(recibido, total) > 0 && <p className="mt-2 text-2xl font-bold text-principal">Devuelve {cop(cambio(recibido, total))}</p>}
            </div>
          )}
          <button type="button" onClick={() => { const v = !dividir; setDividir(v); setFilas(v ? [{ metodo: 'efectivo', monto: '' }, { metodo: formas.find((f) => f.id !== 'efectivo')?.id || '', monto: '' }] : [{ metodo: 'efectivo', monto: '' }]) }}
            className="mt-3 min-h-[48px] text-lg font-semibold text-principal underline">{dividir ? 'Pagar con una sola forma' : 'Dividir el pago en dos formas'}</button>
          {dividir && (
            <div className="mt-3 space-y-3">
              {filas.map((fila, i) => (
                <div key={i} className="grid grid-cols-2 gap-2">
                  <select className={clsInput} value={fila.metodo} onChange={(e) => setFilas(filas.map((x, k) => (k === i ? { ...x, metodo: e.target.value } : x)))}>
                    {formas.map((f) => <option key={f.id} value={f.id}>{f.nombre}</option>)}
                  </select>
                  {i < filas.length - 1
                    ? <input className={clsInput} inputMode="numeric" placeholder="$ valor" value={fila.monto} onChange={(e) => setFilas(filas.map((x, k) => (k === i ? { ...x, monto: e.target.value } : x)))} />
                    : <div className="flex min-h-[56px] items-center rounded-2xl bg-black/5 px-4 text-lg font-semibold">Resto: {cop(Math.max((total || 0) - aNumero(filas[0].monto), 0))}</div>}
                </div>
              ))}
            </div>
          )}
        </Seccion>
        <BarraFija>
          <div className="mb-2 flex items-baseline justify-between"><span className="text-xl">Total a cobrar</span><span className="text-3xl font-bold text-principal">{total != null ? cop(total) : '…'}</span></div>
          <Btn variante="verde" disabled={ocupado || calculando || total == null || !!pagosOk.error || (usaFiado && !cliente)} onClick={registrar}>{ocupado ? 'Registrando…' : 'Registrar venta'}</Btn>
          {pagosOk.error && total != null && <p className="mt-1 text-base font-semibold text-red-700">{pagosOk.error}</p>}
        </BarraFija>
      </div>
    )
  }

  // ---------- Armar la venta ----------
  return (
    <div className="pb-40">
      {error && <div className="mb-4"><Aviso tipo="error">{error}</Aviso></div>}
      <input className={`${clsInput} mb-4`} placeholder="Buscar producto o escanear código" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={alEscribir} />
      {!productos && !error && <p className="py-8 text-center text-xl text-tinta/60">Cargando productos…</p>}
      {productos?.length === 0 && <Aviso>Aún no tienes productos. Créalos en «Productos» para poder vender.</Aviso>}
      <div className="grid grid-cols-1 gap-2">
        {visibles.map((p) => {
          const c = carrito[p.id] || 0
          return (
            <div key={p.id} className={`rounded-2xl border-2 p-3 ${c > 0 ? 'border-principal bg-principal/5' : 'border-black/10 bg-white'}`}>
              <div className="flex items-baseline justify-between gap-3">
                <span className="break-words text-lg font-bold leading-snug">{p.nombre}</span>
                <span className="shrink-0 text-xl font-bold text-principal">{cop(p.precio_venta)}</span>
              </div>
              <p className="text-base text-tinta/60">{p.es_kit ? 'Combo' : `Hay ${Number(p.stock)} ${p.unidad}`}{!p.es_kit && Number(p.stock) <= 0 ? ' · agotado en el sistema' : ''}</p>
              <div className="mt-2">
                {c === 0 ? <Btn variante="suave" type="button" onClick={() => mover(p.id, 1)}>Agregar</Btn>
                  : <Cantidad valor={c} onMenos={() => mover(p.id, c - 1)} onMas={() => mover(p.id, c + 1)} max={9999} />}
              </div>
            </div>
          )
        })}
      </div>
      {productos && visibles.length === 0 && <p className="py-6 text-center text-lg text-tinta/60">No encontramos ese producto.</p>}
      <BarraFija>
        <div className="mb-2 flex items-baseline justify-between">
          <span className="text-xl">{items > 0 ? `${items} ${items === 1 ? 'producto' : 'productos'}` : 'Sin productos'}</span>
          <span className="text-3xl font-bold text-principal">{items === 0 ? '$0' : total != null ? cop(total) : '…'}</span>
        </div>
        {total != null && lista > total && <p className="mb-1 text-base text-green-800">Incluye promociones y descuentos: ahorro de {cop(lista - total)}</p>}
        {errTotal && <p className="mb-1 text-base font-semibold text-red-700">{errTotal}</p>}
        <Btn disabled={items === 0 || total == null || calculando} onClick={() => setPaso('cobrar')}>{calculando ? 'Calculando…' : 'Cobrar'}</Btn>
      </BarraFija>
    </div>
  )
}
