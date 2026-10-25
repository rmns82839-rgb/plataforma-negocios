import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { cop, numeroWhatsapp } from '../lib/pedido'
import { mensajeError } from '../lib/errores'
import { Btn, Volver, Aviso } from '../tienda/ui'
import { Titulo, Seccion, Insignia, Opciones, SoloLectura, fechaHora } from './piezas'

const FILTROS = [['pendiente', 'Pendientes'], ['atendido', 'Atendidos'], ['cancelado', 'Cancelados']]
const SEG = [['recibido', 'Recibido'], ['preparando', 'Preparando'], ['en_camino', 'En camino'], ['entregado', 'Entregado']]
const COLS = 'id,numero,creado_en,nombre,telefono,direccion,nota,total,estado,domicilio,entrega,seguimiento,km_informado,es_practica'

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

  async function cambiarSeguimiento(seg) {
    setOcupado(true); setError('')
    const { error: e } = await supabase.rpc('cambiar_seguimiento', { p_negocio_id: nid, p_pedido_id: p.id, p_seguimiento: seg })
    setOcupado(false)
    if (e) return setError(mensajeError(e))
    setP({ ...p, seguimiento: seg })
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
      </div>
      {error && <div className="mb-4"><Aviso tipo="error">{error}</Aviso></div>}

      <Seccion titulo="Cliente">
        <p className="break-words text-xl font-semibold">{p.nombre}</p>
        <p className="text-xl">{p.telefono}</p>
        <p className="mt-2 text-lg">{p.entrega === 'recoger' ? 'Lo recoge en la tienda' : p.direccion}</p>
        {p.km_informado != null && p.entrega === 'domicilio' && <p className="text-lg text-tinta/70">Distancia que informó: {p.km_informado} km</p>}
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
          {p.estado === 'pendiente' && !confirmar && (
            <>
              <Btn variante="verde" disabled={ocupado} onClick={() => cambiarEstado('atendido')}>Marcar como atendido</Btn>
              <Btn variante="suave" disabled={ocupado} onClick={() => setConfirmar(true)}>Cancelar este pedido</Btn>
            </>
          )}
          {confirmar && (
            <Seccion titulo="¿Seguro que quieres cancelar este pedido?">
              <div className="grid grid-cols-2 gap-3">
                <Btn variante="suave" onClick={() => setConfirmar(false)}>No, volver</Btn>
                <Btn disabled={ocupado} onClick={() => cambiarEstado('cancelado')}>Sí, cancelar</Btn>
              </div>
            </Seccion>
          )}
          {p.estado !== 'pendiente' && <Btn variante="suave" disabled={ocupado} onClick={() => cambiarEstado('pendiente')}>Volver a pendiente</Btn>}
        </div>
      )}
    </div>
  )
}
