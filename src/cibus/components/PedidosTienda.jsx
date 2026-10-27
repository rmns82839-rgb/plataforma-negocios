// Pedidos que los clientes envían desde /tienda. Se atienden por WhatsApp y se cobran en la caja como siempre.
import { etapaDe } from '../lib/etapaPedido'
import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import BarraFija from './BarraFija'
import { dinero, numero } from '../lib/formato'
import { enlaceWhatsApp } from '../lib/datosCliente'
import { enviarAviso } from '../lib/avisosPush'
import { confirmar } from '../lib/confirmar'
import { alCambiarCola, listarCola } from '../lib/sincronizar'
import { leerBorrador, guardarBorrador, DOCE_HORAS } from '../lib/borrador'
import { usePersistido, TREINTA_MIN } from '../lib/usePersistido'
import PedidoDetalle from './PedidoDetalle'

const CLAVE_CAJA = 'borrador-caja'

const ESTADOS = [
  { id: 'pendiente', texto: 'Pendientes' },
  { id: 'atendido', texto: 'Atendidos' },
  { id: 'cancelado', texto: 'Cancelados' },
]
const hace = (iso) => {
  const m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000))
  if (m < 1) return 'ahora'
  if (m < 60) return `hace ${m} min`
  if (m < 1440) return `hace ${Math.round(m / 60)} h`
  return new Date(iso).toLocaleDateString('es-CO', { day: 'numeric', month: 'short' })
}

export default function PedidosTienda({ onCobrar }) {
  // Pedidos ya cobrados sin internet y todavía por subir: no se pueden cobrar de nuevo
  const [cobradosOff, setCobradosOff] = useState(new Set())
  useEffect(() => {
    const poner = (l) => setCobradosOff(new Set(l.filter(x => x.tipo === 'venta' && x.pedidoId).map(x => x.pedidoId)))
    listarCola().then(poner)
    return alCambiarCola(poner)
  }, [])
  const [estado, setEstado] = useState('pendiente')
  const [lista, setLista] = useState([])
  const [cuentas, setCuentas] = useState({})
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [recibiendo, setRecibiendo] = usePersistido('pedidostienda:recibiendo', null, true, TREINTA_MIN)   // id del pedido con el detalle abierto

  const cargar = useCallback(async () => {
    setCargando(true)
    const { data, error: err } = await supabase.from('pedidos_tienda').select('*, pedido_tienda_items(*)')
      .eq('estado', estado).order('creado_en', { ascending: false }).range(0, 99)
    setError(err ? (/pedidos_tienda|schema cache|does not exist/i.test(err.message) ? 'Falta ejecutar migracion-v12.sql en Supabase.' : err.message) : '')
    setLista(data ?? [])
    const { data: todos } = await supabase.from('pedidos_tienda').select('estado').range(0, 999)
    const c = {}
    for (const x of todos ?? []) c[x.estado] = (c[x.estado] ?? 0) + 1
    setCuentas(c)
    setCargando(false)
  }, [estado])
  useEffect(() => { cargar() }, [cargar])

  // Seguimiento para el cliente (va en camino / entregado). El estado de siempre no cambia.
  const seguimiento = async (p, valor) => {
    const { error: err } = await supabase.from('pedidos_tienda').update({ seguimiento: valor }).eq('id', p.id)
    if (err) return setError(/seguimiento|schema cache/i.test(err.message) ? 'Falta ejecutar migracion-v41.sql en Supabase.' : err.message)
    setError(''); cargar()
    // Aviso al celular del cliente (si tiene la app y activó los avisos). Si falla, no pasa nada.
    if (valor && p.user_id) {
      const n = p.numero ? `N.º ${p.numero} ` : ''
      enviarAviso({ usuario: p.user_id, tag: `pedido-${p.id}`, titulo: valor === 'en_camino' ? '🛵 Tu pedido va en camino' : '✅ Tu pedido fue entregado',
        cuerpo: valor === 'en_camino' ? `Tu pedido ${n}ya salió hacia tu dirección.` : `Tu pedido ${n}fue entregado. ¡Gracias por tu compra!` }).catch(() => {})
    }
  }
  const cambiar = async (p, nuevo, pregunta) => {
    if (pregunta && !(await confirmar({ titulo: pregunta, si: 'Sí, continuar' }))) return
    const { error: err } = await supabase.from('pedidos_tienda').update({ estado: nuevo }).eq('id', p.id)
    if (err) return setError(err.message)
    cargar()
  }

  // Pasa el pedido a la Caja: productos, cliente y domicilio ya cargados; solo falta elegir la forma de pago
  const cobrarEnCaja = (p, costoElegido) => {
    setRecibiendo(null)
    const g = leerBorrador(CLAVE_CAJA, DOCE_HORAS)
    if ((g?.lineas ?? []).length > 0) return setError('En Caja hay una venta sin terminar. Termínala o ponla en espera y vuelve a intentar.')
    const lineas = (p.pedido_tienda_items ?? []).filter(it => it.producto_id).map(it => ({ id: it.producto_id, cantidad: Number(it.cantidad) }))
    if (lineas.length === 0) return setError('Este pedido no tiene productos para cobrar.')
    const domicilio = p.entrega !== 'recoger' && String(p.direccion ?? '').trim().length >= 5
    guardarBorrador(CLAVE_CAJA, {
      lineas, clienteId: p.cliente_id ?? '', descuentoTxt: '',
      dom: { on: domicilio, direccion: domicilio ? String(p.direccion).trim() : '', telefono: p.telefono ?? '', costoTxt: domicilio ? String(costoElegido ?? Math.round(Number(p.domicilio) || 0)) : '' },
      pedido: { id: p.id, numero: p.numero },
    })
    setError('')
    onCobrar?.()
  }

  return (
    <div className="space-y-4">
      <BarraFija nivel={0}>
      <div className="grid grid-cols-3 gap-2">
        {ESTADOS.map(e => (
          <button key={e.id} onClick={() => setEstado(e.id)}
            className={`h-10 rounded-xl text-xs font-medium ${estado === e.id ? 'bg-marca text-white' : 'bg-white text-slate-600 shadow-sm'}`}>
            {e.texto}{cuentas[e.id] ? ` (${cuentas[e.id]})` : ''}
          </button>
        ))}
      </div>
      </BarraFija>
      {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
      {estado === 'pendiente' && lista.some(p => p.entrega !== 'recoger' && p.dom_por_confirmar) && (
        <p className="rounded-2xl bg-red-600 text-white px-4 py-3 text-base font-semibold break-words">
          ⚠ {lista.filter(p => p.entrega !== 'recoger' && p.dom_por_confirmar).length === 1 ? 'Hay 1 pedido' : `Hay ${lista.filter(p => p.entrega !== 'recoger' && p.dom_por_confirmar).length} pedidos`} con el domicilio por confirmar. Avísale al cliente cuánto cuesta.
        </p>
      )}
      {cargando ? <p className="text-center text-sm text-slate-400 py-8">Cargando…</p>
        : lista.length === 0 ? <p className="text-center text-sm text-slate-400 py-8">{estado === 'pendiente' ? 'No hay pedidos pendientes. Llegan cuando un cliente envía su pedido desde /tienda.' : 'Nada por aquí.'}</p>
        : (
        <ul className="grid gap-3 lg:grid-cols-2 lg:[&>li:last-child:nth-child(odd)]:col-span-2">
          {lista.map(p => {
            const wa = enlaceWhatsApp(p.telefono, `Hola ${String(p.nombre ?? '').split(' ')[0]}, te escribimos por tu pedido N.º ${p.numero}.`)
            return (
              <li key={p.id} className="bg-white rounded-2xl shadow-sm p-4 space-y-3">
                <div className="grid grid-cols-[1fr_auto] gap-3 items-start">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold break-words">Pedido N.º {p.numero} · {p.nombre}</p>
                    <p className="text-xs text-slate-400">{hace(p.creado_en)} · {p.telefono}</p>
                    <p className="text-xs text-slate-400 break-words">{p.direccion}{p.nota ? ` · ${p.nota}` : ''}</p>
                    <p className="pt-1">
                      <span className={`inline-block text-[11px] font-semibold px-2.5 py-0.5 rounded-full ${p.entrega === 'recoger' ? 'bg-oro/20 text-oro-oscuro' : 'bg-marca text-champagne'}`}>
                        {p.entrega === 'recoger' ? 'Recoge en tienda' : 'A domicilio'}
                      </span>
                    </p>
                    {p.estado === 'pendiente' && p.entrega !== 'recoger' && p.dom_por_confirmar && (
                      <p className="pt-1.5"><span className="inline-block text-xs font-bold px-3 py-1 rounded-full bg-red-600 text-white">⚠ Domicilio por confirmar</span></p>
                    )}
                  </div>
                  <p className="text-base font-bold">{dinero(p.total)}</p>
                </div>
                <ul className="text-sm text-slate-600 space-y-0.5">
                  {p.pedido_tienda_items.map(it => (
                    <li key={it.id} className="grid grid-cols-[1fr_auto] gap-2">
                      <span className="min-w-0">{numero(it.cantidad)}{it.unidad === 'und' ? '×' : ' ' + it.unidad} {it.nombre}{it.promo ? <span className="text-xs text-oro-oscuro"> · {it.promo}</span> : null}</span>
                      <span className="text-sm text-slate-800 tabular-nums">{dinero(Math.round(Number(it.precio_unitario) * Number(it.cantidad)) - Number(it.descuento ?? 0))}</span>
                    </li>
                  ))}
                </ul>
                <div className="border-t border-slate-100 pt-2 space-y-0.5 text-xs text-slate-500">
                  {p.estado === 'pendiente' && p.entrega !== 'recoger' && p.dom_por_confirmar && (
                    <p className="rounded-lg bg-red-50 text-red-700 px-3 py-2 text-sm font-semibold break-words">El total NO incluye el domicilio. Confírmalo con el cliente por WhatsApp y súmalo al cobrar.</p>
                  )}
                  {(p.entrega === 'recoger' || Number(p.domicilio) > 0) && (
                    <>
                      <p className="grid grid-cols-[1fr_auto]"><span>Productos</span><span>{dinero(Number(p.total) - Number(p.domicilio ?? 0))}</span></p>
                      <p className="grid grid-cols-[1fr_auto]"><span>Domicilio</span><span>{p.entrega === 'recoger' ? 'No aplica' : dinero(p.domicilio)}</span></p>
                    </>
                  )}
                  <p className="grid grid-cols-[1fr_auto] text-sm font-bold text-slate-800"><span>Total</span><span>{dinero(p.total)}</span></p>
                </div>
                {p.estado === 'atendido' && (
                  <div className="space-y-2 rounded-xl bg-slate-50 p-3">
                    <p className="text-sm text-slate-600">El cliente ve: <b className="text-slate-800">{etapaDe(p).texto}</b></p>
                    <div className="grid grid-cols-2 gap-2">
                      {p.entrega !== 'recoger'
                        ? <button onClick={() => seguimiento(p, 'en_camino')} disabled={p.seguimiento === 'en_camino'} className="min-h-12 rounded-xl bg-champagne text-negro text-sm font-semibold disabled:opacity-40">Va en camino</button>
                        : <span aria-hidden="true" />}
                      <button onClick={() => seguimiento(p, 'entregado')} disabled={p.seguimiento === 'entregado'} className="min-h-12 rounded-xl bg-marca text-white text-sm font-semibold disabled:opacity-40">Entregado</button>
                    </div>
                    {p.seguimiento && <button onClick={() => seguimiento(p, null)} className="w-full text-sm text-slate-500 underline">Quitar esta marca</button>}
                  </div>
                )}
                {p.estado === 'pendiente' && cobradosOff.has(p.id) && (
                  <p className="text-sm text-amber-800 bg-amber-50 rounded-xl px-3 py-2">Cobrado sin internet: se marca como atendido cuando se suba la venta.</p>
                )}
                {p.estado === 'pendiente' && !cobradosOff.has(p.id) && (
                  <div className="grid gap-2">
                  {onCobrar && <button onClick={() => { setError(''); setRecibiendo(p.id) }} className="h-12 rounded-xl bg-champagne text-negro text-sm font-semibold active:opacity-90">Recibir pedido</button>}
                  <div className="grid grid-cols-3 gap-2">
                    {wa ? <a href={wa} target="_blank" rel="noopener noreferrer" className="h-11 rounded-xl bg-slate-100 text-slate-600 text-xs font-medium grid place-items-center">WhatsApp</a>
                        : <span className="h-11 rounded-xl bg-slate-50 text-slate-300 text-xs font-medium grid place-items-center">Sin teléfono</span>}
                    <button onClick={() => cambiar(p, 'cancelado', `¿Cancelar el pedido N.º ${p.numero}?`)} className="h-11 rounded-xl bg-red-50 text-red-600 text-xs font-medium">Cancelar</button>
                    <button onClick={() => cambiar(p, 'atendido')} className="h-11 rounded-xl bg-marca text-white text-xs font-semibold active:bg-marca-oscuro">Marcar atendido</button>
                  </div>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
      {recibiendo && lista.find(x => x.id === recibiendo) && (
        <PedidoDetalle pedido={lista.find(x => x.id === recibiendo)} onCerrar={() => setRecibiendo(null)} onCobrar={cobrarEnCaja} onCambio={cargar} />
      )}
    </div>
  )
}
