import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { avisarCambioEstado } from '../lib/avisosCliente'
import { cop, numeroWhatsapp } from '../lib/pedido'
import { mensajeError } from '../lib/errores'
import { Btn, Volver, Aviso, Campo, clsInput } from '../tienda/ui'
import { aNumero, armarPagos, cambio } from '../lib/caja'
import { Titulo, Seccion, Insignia, Opciones, SoloLectura, fechaHora } from './piezas'

const FILTROS = [['pendiente', 'Pendientes'], ['atendido', 'Atendidos'], ['cancelado', 'Cancelados']]
const SEG = [['recibido', 'Recibido'], ['preparando', 'Preparando'], ['en_camino', 'En camino'], ['entregado', 'Entregado']]
const COLS = 'id,numero,creado_en,nombre,telefono,direccion,nota,total,estado,domicilio,entrega,seguimiento,km_informado,domicilio_tarifa_fija,es_practica,venta_id,cliente_id'

export default function Pedidos({ ctx, volver }) {
  const [filtro, setFiltro] = useState('pendiente')
  const [lista, setLista] = useState(null)
  const [error, setError] = useState('')
  const [abierto, setAbierto] = useState(null)

  const cargar = useCallback(async () => {
    const { data, error: e } = await supabase.from('pedidos_tienda').select(COLS).eq('negocio_id', ctx.neg.negocio_id).eq('estado', filtro).order('creado_en', { ascending: false }).limit(100)
    if (e) setError(mensajeError(e)); else { setError(''); setLista(data) }
  }, [ctx.neg.negocio_id, filtro])

  useEffect(() => { setLista(null); cargar() }, [cargar])
  useEffect(() => { if (abierto) return; const t = setInterval(cargar, 20000); return () => clearInterval(t) }, [cargar, abierto])

  if (abierto) return <Detalle ctx={ctx} pedido={abierto} cerrar={() => { setAbierto(null); cargar() }} />

  return (
    <div>
      <Volver onClick={volver} texto="Volver al panel" />
      <Titulo sub="Se actualiza sola cada 20 segundos.">Pedidos</Titulo>
      <div className="mb-5"><Opciones columnas={3} valor={filtro} opciones={FILTROS} onChange={setFiltro} /></div>
      {error && <div className="mb-4"><Aviso tipo="error">{error}</Aviso></div>}
      {!lista && !error && <p className="py-8 text-center text-xl text-tinta/60">Cargando pedidos…</p>}
      {lista?.length === 0 && <p className="rounded-2xl border-2 border-black/10 bg-white p-6 text-center text-xl">{filtro === 'pendiente' ? 'No tienes pedidos pendientes. Cuando llegue uno, aparece aquí.' : 'No hay pedidos en esta lista.'}</p>}
      <div className="space-y-3">
        {lista?.map((p) => (
          <button key={p.id} onClick={() => setAbierto(p)} className="block w-full rounded-2xl border-2 border-black/5 bg-white p-4 text-left shadow-sm active:scale-[0.99]">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-2xl font-bold">Pedido {p.numero}</span>
              <span className="text-2xl font-bold text-principal">{cop(p.total)}</span>
            </div>
            <p className="break-words text-xl">{p.nombre}</p>
            <p className="mt-1 text-lg text-tinta/70">{fechaHora(p.creado_en)} · {p.entrega === 'recoger' ? 'Recoge en tienda' : 'A domicilio'}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {p.es_practica && <Insignia tono="ambar">Prueba</Insignia>}
              {ctx.modulos.includes('mis_pedidos') && p.estado === 'pendiente' && <Insignia tono="azul">{SEG.find(([k]) => k === p.seguimiento)?.[1] || p.seguimiento}</Insignia>}
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}

function Detalle({ ctx, pedido, cerrar }) {
  const [p, setP] = useState(pedido)
  const [items, setItems] = useState(null)
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState('')
  const [confirmar, setConfirmar] = useState(false)
  const [cobrando, setCobrando] = useState(false)     // elegir cómo pagó el cliente
  const [formas, setFormas] = useState([])
  const [metodo, setMetodo] = useState('efectivo')
  const [recibido, setRecibido] = useState('')
  const [aviso, setAviso] = useState('')
  const [devolviendo, setDevolviendo] = useState(false)
  const [motivo, setMotivo] = useState('')
  const conCaja = ctx.modulos.includes('caja') && !p.es_practica
  const nid = ctx.neg.negocio_id
  const puede = !ctx.soloLectura

  useEffect(() => {
    supabase.from('pedido_tienda_items').select('id,nombre,unidad,cantidad,precio_unitario,descuento,promo').eq('negocio_id', nid).eq('pedido_id', p.id).then(({ data, error: e }) => {
      if (e) setError(mensajeError(e)); else setItems(data)
    })
  }, [nid, p.id])

  async function cambiarEstado(estado) {
    setOcupado(true); setError('')
    const { data, error: e } = await supabase.from('pedidos_tienda').update({ estado }).eq('negocio_id', nid).eq('id', p.id).select(COLS)
    setOcupado(false); setConfirmar(false)
    if (e) return setError(mensajeError(e))
    if (!data?.length) return setError('No se pudo cambiar el pedido. Intenta de nuevo.')
    setP(data[0])
  }

  async function abrirCobro() {
    setCobrando(true); setError('')
    if (formas.length === 0) {
      const { data } = await supabase.from('formas_pago').select('id,nombre,tipo,orden').eq('negocio_id', nid).eq('activa', true).order('orden')
      setFormas(data || [])
    }
  }

  async function atender() {
    setOcupado(true); setError('')
    const f = formas.find((x) => x.id === metodo)
    const r = armarPagos([{ metodo }], p.total, f?.tipo === 'efectivo' ? recibido : '')
    if (r.error) { setOcupado(false); return setError(r.error) }
    if (f?.tipo === 'fiado' && !p.cliente_id) { setOcupado(false); return setError('Este pedido no tiene un cliente para dejarle la deuda. Elige otra forma de pago.') }
    const { data, error: e } = await supabase.rpc('atender_pedido_tienda', { p_negocio_id: nid, p_pedido_id: p.id, p_pagos: r.pagos })
    setOcupado(false)
    if (e) return setError(mensajeError(e))
    setP({ ...p, estado: 'atendido', venta_id: data?.venta_id ?? null })
    setCobrando(false)
    const dev = f?.tipo === 'efectivo' ? cambio(recibido, p.total) : null
    setAviso(`Listo: venta #${data?.numero ?? ''} registrada${dev ? `. Devuelve ${cop(dev)}` : ''}.`)
  }

  async function devolver() {
    setOcupado(true); setError('')
    const { error: e } = await supabase.rpc('deshacer_atencion_pedido', { p_negocio_id: nid, p_pedido_id: p.id, p_motivo: motivo })
    setOcupado(false)
    if (e) return setError(mensajeError(e))
    setDevolviendo(false); setMotivo(''); setAviso('El pedido volvió a pendiente y la venta quedó anulada.')
    setP({ ...p, estado: 'pendiente', venta_id: null })
  }

  async function cambiarSeguimiento(seg) {
    setOcupado(true); setError('')
    const { error: e } = await supabase.rpc('cambiar_seguimiento', { p_negocio_id: nid, p_pedido_id: p.id, p_seguimiento: seg })
    setOcupado(false)
    if (e) return setError(mensajeError(e))
    setP({ ...p, seguimiento: seg })
    avisarCambioEstado(nid, p.id)        // avisa al cliente por su celular, si tiene los avisos activos (no frena nada si falla)
  }

  const wa = numeroWhatsapp(p.telefono)
  const textoWa = `Hola ${p.nombre}, te escribimos de ${ctx.neg.nombre_comercial} por tu pedido #${p.numero}.`
  const subtotal = p.total - p.domicilio

  return (
    <div className="pb-6">
      <Volver onClick={cerrar} texto="Volver a los pedidos" />
      <Titulo sub={fechaHora(p.creado_en)}>Pedido {p.numero}</Titulo>
      {!puede && <SoloLectura />}
      <div className="mb-4 flex flex-wrap gap-2">
        <Insignia tono={p.estado === 'pendiente' ? 'ambar' : p.estado === 'atendido' ? 'verde' : 'rojo'}>{p.estado === 'pendiente' ? 'Pendiente' : p.estado === 'atendido' ? 'Atendido' : 'Cancelado'}</Insignia>
        {p.es_practica && <Insignia tono="ambar">Pedido de prueba</Insignia>}
        {p.venta_id && <Insignia tono="azul">Venta registrada en caja</Insignia>}
      </div>
      {aviso && <div className="mb-4"><Aviso tipo="ok">{aviso}</Aviso></div>}
      {error && <div className="mb-4"><Aviso tipo="error">{error}</Aviso></div>}

      <Seccion titulo="Cliente">
        <p className="break-words text-xl font-semibold">{p.nombre}</p>
        <p className="text-xl">{p.telefono}</p>
        <p className="mt-2 text-lg">{p.entrega === 'recoger' ? 'Lo recoge en la tienda' : p.direccion}</p>
        {p.km_informado != null && p.entrega === 'domicilio' && <p className="text-lg text-tinta/70">Distancia medida con el mapa: {String(p.km_informado).replace('.', ',')} km</p>}
        {p.domicilio_tarifa_fija && p.entrega === 'domicilio' && <p className="text-lg font-semibold text-amber-800">Domicilio con tarifa fija: el mapa no pudo medir la distancia. Confirma la dirección con el cliente.</p>}
        {p.nota && <p className="mt-2 break-words rounded-xl bg-amber-50 p-3 text-lg">Nota: {p.nota}</p>}
        <div className="mt-4 grid grid-cols-2 gap-3">
          <a href={`tel:${p.telefono}`} className="flex min-h-[56px] items-center justify-center rounded-2xl border-2 border-principal/30 text-lg font-semibold text-principal">Llamar</a>
          {wa ? <a href={`https://wa.me/${wa}?text=${encodeURIComponent(textoWa)}`} target="_blank" rel="noopener noreferrer" className="flex min-h-[56px] items-center justify-center rounded-2xl bg-[#128C4A] text-lg font-semibold text-white">WhatsApp</a> : <span />}
        </div>
      </Seccion>

      <Seccion titulo="Productos">
        {!items && !error && <p className="text-lg text-tinta/60">Cargando…</p>}
        <ul className="space-y-2">
          {items?.map((i) => (
            <li key={i.id} className="flex items-baseline justify-between gap-3 text-lg">
              <span className="break-words">{Number(i.cantidad)} × {i.nombre}{i.promo ? ` (oferta ${i.promo})` : ''}</span>
              <span className="font-semibold">{cop(i.precio_unitario * i.cantidad - i.descuento)}</span>
            </li>
          ))}
        </ul>
        <hr className="my-3" />
        <div className="space-y-1 text-lg">
          <div className="flex justify-between"><span>Productos</span><span>{cop(subtotal)}</span></div>
          <div className="flex justify-between"><span>Domicilio</span><span>{p.entrega === 'recoger' ? 'Lo recoge' : p.domicilio > 0 ? cop(p.domicilio) : 'Sin costo'}</span></div>
          <div className="flex justify-between text-2xl font-bold"><span>Total</span><span>{cop(p.total)}</span></div>
        </div>
      </Seccion>

      {ctx.modulos.includes('mis_pedidos') && p.estado === 'pendiente' && (
        <Seccion titulo="¿En qué va el pedido?">
          <p className="mb-3 text-lg text-tinta/70">El cliente lo ve en «Mis pedidos».</p>
          <Opciones valor={p.seguimiento} opciones={SEG} onChange={(v) => puede && !ocupado && cambiarSeguimiento(v)} />
        </Seccion>
      )}

      {puede && (
        <div className="space-y-3">
          {p.estado === 'pendiente' && !confirmar && !cobrando && (
            <>
              <Btn variante="verde" disabled={ocupado} onClick={() => (conCaja ? abrirCobro() : cambiarEstado('atendido'))}>Marcar como atendido</Btn>
              <Btn variante="suave" disabled={ocupado} onClick={() => setConfirmar(true)}>Cancelar este pedido</Btn>
            </>
          )}
          {cobrando && (
            <Seccion titulo="¿Cómo pagó el cliente?">
              <p className="mb-3 text-lg text-tinta/70">Se registra la venta por {cop(p.total)} y se descuenta del inventario.</p>
              <div className="mb-4 grid grid-cols-2 gap-2" role="group" aria-label="Forma de pago">
                {formas.map((f) => (
                  <button key={f.id} type="button" aria-pressed={metodo === f.id} onClick={() => setMetodo(f.id)}
                    className={`min-h-[64px] rounded-2xl border-2 px-2 text-lg font-bold leading-tight ${metodo === f.id ? 'border-principal bg-principal text-white' : 'border-black/10 bg-white'}`}>{f.nombre}</button>
                ))}
              </div>
              {formas.find((f) => f.id === metodo)?.tipo === 'efectivo' && (
                <div className="mb-4">
                  <Campo etiqueta="¿Con cuánto pagó? (opcional)"><input className={clsInput} inputMode="numeric" placeholder="$ 0" value={recibido} onChange={(e) => setRecibido(e.target.value)} /></Campo>
                  {cambio(recibido, p.total) > 0 && <p className="mt-2 text-2xl font-bold text-principal">Devuelve {cop(cambio(recibido, p.total))}</p>}
                </div>
              )}
              {formas.find((f) => f.id === metodo)?.tipo === 'fiado' && <p className="mb-4 text-lg font-semibold text-amber-800">{p.cliente_id ? 'La deuda queda a nombre de este cliente.' : 'Este pedido no tiene cliente: elige otra forma de pago.'}</p>}
              <div className="space-y-3">
                <Btn variante="verde" disabled={ocupado || formas.length === 0} onClick={atender}>{ocupado ? 'Registrando…' : 'Registrar venta y marcar atendido'}</Btn>
                <Btn variante="suave" disabled={ocupado} onClick={() => { setCobrando(false); setError('') }}>← Volver</Btn>
                <button type="button" disabled={ocupado} onClick={() => { setCobrando(false); cambiarEstado('atendido') }} className="min-h-[48px] w-full text-lg font-semibold text-principal underline">Marcar atendido sin registrar la venta</button>
              </div>
            </Seccion>
          )}
          {confirmar && (
            <Seccion titulo="¿Seguro que quieres cancelar este pedido?">
              <div className="grid grid-cols-2 gap-3">
                <Btn variante="suave" onClick={() => setConfirmar(false)}>No, volver</Btn>
                <Btn disabled={ocupado} onClick={() => cambiarEstado('cancelado')}>Sí, cancelar</Btn>
              </div>
            </Seccion>
          )}
          {p.estado !== 'pendiente' && !devolviendo && (
            p.venta_id && p.estado === 'atendido'
              ? (ctx.esDueno
                ? <Btn variante="suave" disabled={ocupado} onClick={() => setDevolviendo(true)}>Volver a pendiente (anula la venta)</Btn>
                : <p className="rounded-2xl border-2 border-black/10 bg-white p-4 text-lg">Este pedido ya tiene una venta registrada. Para devolverlo a pendiente, pídele al dueño que lo haga: así se corrige la caja.</p>)
              : <Btn variante="suave" disabled={ocupado} onClick={() => cambiarEstado('pendiente')}>Volver a pendiente</Btn>
          )}
          {devolviendo && (
            <Seccion titulo="Devolver a pendiente">
              <p className="mb-3 text-lg">Se anula la venta, se devuelve el inventario y se borra la deuda de fiado de este pedido.</p>
              <Campo etiqueta="¿Por qué lo devuelves?"><input className={clsInput} value={motivo} onChange={(e) => setMotivo(e.target.value)} /></Campo>
              <div className="mt-4 grid grid-cols-2 gap-3">
                <Btn variante="suave" onClick={() => setDevolviendo(false)}>No, volver</Btn>
                <Btn disabled={ocupado || motivo.trim().length < 3} onClick={devolver}>{ocupado ? 'Anulando…' : 'Sí, devolver'}</Btn>
              </div>
            </Seccion>
          )}
        </div>
      )}
    </div>
  )
}
