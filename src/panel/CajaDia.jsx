// Resumen de caja de un día: lo vendido por forma de pago, abonos, gastos y el efectivo que debería haber.
// El cajero ve esto sin costos ni ganancias. Solo el dueño puede anular una venta.
import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { mensajeError } from '../lib/errores'
import { cop } from '../lib/pedido'
import { diaBogota, aNumero, spansMetodos } from '../lib/caja'
import { Btn, Aviso, Campo, clsInput } from '../tienda/ui'
import { Seccion, Insignia } from './piezas'
import Recibo from './Recibo'

const hora = (t) => new Date(t).toLocaleTimeString('es-CO', { timeZone: 'America/Bogota', hour: 'numeric', minute: '2-digit' })
const sumarDia = (dia, n) => new Date(new Date(`${dia}T12:00:00Z`).getTime() + n * 86400000).toISOString().slice(0, 10)
const textoDia = (dia) => new Date(`${dia}T12:00:00Z`).toLocaleDateString('es-CO', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long' }).replace(/^(.)/, (m) => m.toUpperCase())

export default function CajaDia({ ctx }) {
  const nid = ctx.neg.negocio_id
  const hoy = diaBogota()
  const [dia, setDia] = useState(hoy)
  const [c, setC] = useState(null)
  const [error, setError] = useState('')
  const [contado, setContado] = useState('')
  const [g, setG] = useState({ descripcion: '', monto: '' })
  const [ocupado, setOcupado] = useState(false)
  const [abierta, setAbierta] = useState(null)
  const [formas, setFormas] = useState([])
  const [metodoGasto, setMetodoGasto] = useState('efectivo')
  const [mov, setMov] = useState(null)             // null · {tipo:'retiro'|'ingreso', monto, motivo}
  const [msg, setMsg] = useState('')

  useEffect(() => {
    supabase.from('formas_pago').select('id,nombre,tipo,orden').eq('negocio_id', nid).eq('activa', true).order('orden').then(({ data }) => setFormas(data || []))
  }, [nid])
  const formasGasto = formas.filter((f) => f.tipo !== 'fiado')
  const spansGasto = spansMetodos(formasGasto.length)

  const cargar = useCallback(async () => {
    const { data, error: e } = await supabase.rpc('caja_dia', { p_negocio_id: nid, p_dia: dia })
    if (e) setError(mensajeError(e)); else { setError(''); setC(data) }
  }, [nid, dia])
  useEffect(() => { setC(null); cargar() }, [cargar])

  async function gasto() {
    setError('')
    const monto = aNumero(g.monto)
    if (g.descripcion.trim().length < 3) return setError('Escribe en qué se gastó')
    if (!(monto > 0)) return setError('Escribe cuánto se gastó')
    setOcupado(true)
    const { error: e } = await supabase.from('gastos').insert({ negocio_id: nid, tipo: 'otros', descripcion: g.descripcion.trim(), monto, metodo: metodoGasto })
    setOcupado(false)
    if (e) return setError(mensajeError(e))
    setG({ descripcion: '', monto: '' }); setMetodoGasto('efectivo'); cargar()
  }

  async function movimiento() {
    setError(''); setMsg('')
    const monto = aNumero(mov.monto)
    if (!(monto > 0)) return setError('Escribe cuánto dinero es')
    if (mov.motivo.trim().length < 3) return setError('Escribe el motivo')
    setOcupado(true)
    const { error: e } = await supabase.from('caja_movimientos').insert({ negocio_id: nid, tipo: mov.tipo, monto, motivo: mov.motivo.trim() })
    setOcupado(false)
    if (e) return setError(mensajeError(e))
    setMsg(mov.tipo === 'retiro' ? '✓ Retiro registrado' : '✓ Ingreso registrado'); setMov(null); cargar()
  }

  const dif = contado !== '' && c ? aNumero(contado) - Number(c.efectivo_esperado) : null

  return (
    <div>
      <div className="mb-4 grid grid-cols-[56px_1fr_56px] items-center gap-2">
        <button aria-label="Día anterior" onClick={() => setDia(sumarDia(dia, -1))} className="h-14 rounded-2xl border-2 border-principal/30 bg-white text-2xl font-bold text-principal">←</button>
        <p className="text-center text-lg font-bold leading-tight first-letter:uppercase">{dia === hoy ? 'Hoy · ' : ''}{textoDia(dia)}</p>
        <button aria-label="Día siguiente" disabled={dia >= hoy} onClick={() => setDia(sumarDia(dia, 1))} className="h-14 rounded-2xl border-2 border-principal/30 bg-white text-2xl font-bold text-principal disabled:opacity-30">→</button>
      </div>
      {error && <div className="mb-4"><Aviso tipo="error">{error}</Aviso></div>}
      {!c && !error && <p className="py-8 text-center text-xl text-tinta/60">Cargando la caja…</p>}
      {c && (
        <>
          <div className="mb-5 grid grid-cols-2 gap-3">
            {[['Vendido', cop(c.vendido)], ['Ventas', c.ventas], ['Fiado del día', cop(c.fiado)], ['Abonos recibidos', cop(c.abonos_total)]].map(([k, v]) => (
              <div key={k} className="rounded-2xl border-2 border-black/5 bg-white p-4 text-center">
                <p className="break-words text-2xl font-bold text-principal">{v}</p><p className="text-lg leading-snug text-tinta/70">{k}</p>
              </div>
            ))}
          </div>
          <div className="mb-5 rounded-2xl border-2 border-principal bg-principal/5 p-4 text-center">
            <p className="text-lg text-tinta/70">Efectivo que debe haber en la caja</p>
            <p className="text-4xl font-bold text-principal">{cop(c.efectivo_esperado)}</p>
            <p className="text-base text-tinta/60">Ventas, abonos y recargas en efectivo + ingresos − retiros − gastos y saldos devueltos en efectivo</p>
          </div>

          <Seccion titulo="Contar la caja">
            <Campo etiqueta="¿Cuánto efectivo contaste?"><input className={clsInput} inputMode="numeric" placeholder="$ 0" value={contado} onChange={(e) => setContado(e.target.value)} /></Campo>
            {dif != null && (
              <p className={`mt-3 text-2xl font-bold ${dif === 0 ? 'text-green-800' : dif > 0 ? 'text-amber-800' : 'text-red-700'}`}>
                {dif === 0 ? '✓ La caja cuadra' : dif > 0 ? `Sobran ${cop(dif)}` : `Faltan ${cop(-dif)}`}
              </p>
            )}
          </Seccion>

          <Seccion titulo="¿Cómo pagaron?">
            {c.por_pago.length === 0 && <p className="text-lg text-tinta/60">Todavía no hay ventas este día.</p>}
            <ul className="space-y-2">
              {c.por_pago.map((p) => <li key={p.metodo} className="flex items-baseline justify-between gap-3 text-lg"><span>{p.nombre} <span className="text-tinta/60">({p.ventas})</span></span><span className="font-bold">{cop(p.monto)}</span></li>)}
              {c.recargas?.map((r) => <li key={'r' + r.metodo} className="flex items-baseline justify-between gap-3 text-lg"><span>Recargas de saldo ({r.metodo}) <span className="text-tinta/60">({r.recargas})</span></span><span className="font-bold">{cop(r.monto)}</span></li>)}
              {c.devoluciones?.map((d) => <li key={'d' + d.metodo} className="flex items-baseline justify-between gap-3 text-lg"><span>Saldo devuelto ({d.metodo}) <span className="text-tinta/60">({d.devoluciones})</span></span><span className="font-bold text-red-700">−{cop(d.monto)}</span></li>)}
              {c.abonos.map((a) => <li key={'a' + a.metodo} className="flex items-baseline justify-between gap-3 text-lg"><span>Abonos de fiados ({a.metodo}) <span className="text-tinta/60">({a.abonos})</span></span><span className="font-bold">{cop(a.monto)}</span></li>)}
            </ul>
          </Seccion>

          <Seccion titulo="Retiros e ingresos de dinero">
            {msg && <p className="mb-3 text-lg font-semibold text-green-800">{msg}</p>}
            <ul className="mb-3 space-y-2">
              {c.movimientos?.map((m) => (
                <li key={m.id} className="flex items-baseline justify-between gap-3 text-lg">
                  <span className="break-words"><b>{m.tipo === 'retiro' ? '↓ Retiro' : '↑ Ingreso'}</b> · {m.motivo} <span className="text-tinta/60">({hora(m.fecha)})</span></span>
                  <span className={`shrink-0 font-bold ${m.tipo === 'retiro' ? 'text-red-700' : 'text-green-800'}`}>{m.tipo === 'retiro' ? '−' : '+'}{cop(m.monto)}</span>
                </li>
              ))}
              {(!c.movimientos || c.movimientos.length === 0) && <li className="text-lg text-tinta/60">Sin retiros ni ingresos.</li>}
            </ul>
            {!ctx.soloLectura && dia === hoy && !mov && (
              <div className="grid grid-cols-2 gap-3">
                <Btn variante="suave" onClick={() => { setMsg(''); setMov({ tipo: 'retiro', monto: '', motivo: '' }) }}>Retirar dinero</Btn>
                <Btn variante="suave" onClick={() => { setMsg(''); setMov({ tipo: 'ingreso', monto: '', motivo: '' }) }}>Ingresar dinero</Btn>
              </div>
            )}
            {mov && (
              <div className="space-y-3 rounded-2xl border-2 border-principal/30 p-3">
                <button type="button" onClick={() => setMov(null)} className="min-h-[44px] text-lg font-semibold text-principal">← Volver</button>
                <p className="text-xl font-bold">{mov.tipo === 'retiro' ? 'Retirar dinero de la caja' : 'Ingresar dinero a la caja'}</p>
                <Campo etiqueta="¿Cuánto dinero?"><input className={clsInput} inputMode="numeric" placeholder="$ 0" value={mov.monto} onChange={(e) => setMov({ ...mov, monto: e.target.value })} /></Campo>
                <p className="text-lg font-semibold">¿Por qué?</p>
                <div className="grid grid-cols-2 gap-2" role="group" aria-label="Motivos">
                  {(mov.tipo === 'retiro' ? ['Pago a proveedor', 'Entrega al dueño', 'Compra de mercancía', 'Préstamo'] : ['Base de la caja', 'Cambio', 'Aporte del dueño', 'Devolución']).map((t) => (
                    <button key={t} type="button" aria-pressed={mov.motivo === t} onClick={() => setMov({ ...mov, motivo: t })} className={`min-h-[56px] rounded-2xl border-2 px-2 text-lg font-semibold leading-tight ${mov.motivo === t ? 'border-principal bg-principal text-white' : 'border-black/10 bg-white'}`}>{t}</button>
                  ))}
                </div>
                <Campo etiqueta="O escribe el motivo"><input className={clsInput} maxLength={120} value={mov.motivo} onChange={(e) => setMov({ ...mov, motivo: e.target.value })} /></Campo>
                <Btn disabled={ocupado} onClick={movimiento}>{ocupado ? 'Guardando…' : mov.tipo === 'retiro' ? 'Registrar el retiro' : 'Registrar el ingreso'}</Btn>
              </div>
            )}
          </Seccion>

          <Seccion titulo={`Gastos del día${c.gastos_total > 0 ? ` · ${cop(c.gastos_total)}` : ''}`}>
            <ul className="mb-3 space-y-1">
              {c.gastos.map((x) => <li key={x.id} className="flex items-baseline justify-between gap-3 text-lg"><span className="break-words">{x.descripcion || x.tipo} <span className="text-tinta/60">· {formas.find((f) => f.id === x.metodo)?.nombre || x.metodo || 'Efectivo'}</span></span><span className="font-bold">{cop(x.monto)}</span></li>)}
              {c.gastos.length === 0 && <li className="text-lg text-tinta/60">Sin gastos registrados.</li>}
            </ul>
            {!ctx.soloLectura && dia === hoy && (
              <div className="space-y-3">
                <Campo etiqueta="¿En qué se gastó?"><input className={clsInput} value={g.descripcion} onChange={(e) => setG({ ...g, descripcion: e.target.value })} /></Campo>
                <Campo etiqueta="¿Cuánto?"><input className={clsInput} inputMode="numeric" placeholder="$ 0" value={g.monto} onChange={(e) => setG({ ...g, monto: e.target.value })} /></Campo>
                <div>
                  <p className="mb-2 text-lg font-semibold">¿Con qué se pagó?</p>
                  <div className="grid grid-cols-6 gap-2" role="group" aria-label="Forma de pago del gasto">
                    {formasGasto.map((f, i) => (
                      <button key={f.id} type="button" aria-pressed={metodoGasto === f.id} onClick={() => setMetodoGasto(f.id)}
                        className={`${spansGasto[i]} flex min-h-[60px] items-center justify-center rounded-2xl border-2 px-1 text-center text-base font-bold leading-tight [overflow-wrap:anywhere] ${metodoGasto === f.id ? 'border-principal bg-principal text-white' : 'border-black/10 bg-white'}`}>{f.nombre}</button>
                    ))}
                  </div>
                  <p className="mt-2 text-base text-tinta/60">Solo lo pagado con efectivo baja el efectivo de la caja.</p>
                </div>
                <Btn variante="suave" disabled={ocupado} onClick={gasto}>{ocupado ? 'Guardando…' : 'Registrar el gasto'}</Btn>
              </div>
            )}
          </Seccion>

          <Seccion titulo={`Ventas del día (${c.lista.length})`}>
            {c.lista.length === 0 && <p className="text-lg text-tinta/60">No hay ventas.</p>}
            <div className="space-y-2">
              {c.lista.map((v) => (
                <div key={v.id} className="rounded-2xl border-2 border-black/10 bg-white">
                  <button type="button" onClick={() => setAbierta(abierta === v.id ? null : v.id)} className="flex min-h-[64px] w-full items-center justify-between gap-3 px-4 py-2 text-left">
                    <span><span className="block text-lg font-bold">Venta #{v.numero} · {hora(v.fecha)}</span><span className="block break-words text-base text-tinta/70">{v.cliente || 'Sin cliente'}{v.domicilio ? ' · Domicilio' : ''}</span></span>
                    <span className="text-right"><span className={`block text-xl font-bold ${v.anulada ? 'text-tinta/40 line-through' : ''}`}>{cop(v.total)}</span>{v.anulada && <Insignia tono="rojo">Anulada</Insignia>}</span>
                  </button>
                  {abierta === v.id && <DetalleVenta ctx={ctx} formas={formas} venta={v} alCambiar={() => { setAbierta(null); cargar() }} />}
                </div>
              ))}
            </div>
          </Seccion>
        </>
      )}
    </div>
  )
}

function DetalleVenta({ ctx, venta, alCambiar, formas }) {
  const nid = ctx.neg.negocio_id
  const [items, setItems] = useState(null)
  const [motivo, setMotivo] = useState('')
  const [anulando, setAnulando] = useState(false)
  const [error, setError] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [verRecibo, setVerRecibo] = useState(false)

  useEffect(() => {
    supabase.from('venta_items').select('id,nombre,cantidad,precio_unitario,descuento_linea').eq('negocio_id', nid).eq('venta_id', venta.id)
      .then(({ data }) => setItems(data || []))
  }, [nid, venta.id])

  async function anular() {
    setOcupado(true); setError('')
    const { error: e } = await supabase.rpc('anular_venta', { p_negocio_id: nid, p_venta_id: venta.id, p_motivo: motivo })
    setOcupado(false)
    if (e) return setError(mensajeError(e))
    alCambiar()
  }

  return (
    <div className="border-t border-black/10 px-4 py-3">
      {!items && <p className="text-lg text-tinta/60">Cargando…</p>}
      <ul className="space-y-1">
        {items?.map((i) => <li key={i.id} className="flex items-baseline justify-between gap-3 text-lg"><span className="break-words">{Number(i.cantidad)} × {i.nombre}</span><span className="font-semibold">{cop(Math.round(i.precio_unitario * i.cantidad) - Number(i.descuento_linea || 0))}</span></li>)}
      </ul>
      <div className="mt-3">
        {!verRecibo ? <Btn variante="suave" onClick={() => setVerRecibo(true)}>Ver, enviar o imprimir el recibo</Btn> : <Recibo nid={nid} ventaId={venta.id} marca={ctx.marca} formas={formas} />}
      </div>
      {error && <div className="mt-3"><Aviso tipo="error">{error}</Aviso></div>}
      {ctx.esDueno && !venta.anulada && (
        !anulando ? <button type="button" onClick={() => setAnulando(true)} className="mt-3 min-h-[48px] text-lg font-semibold text-red-700 underline">Anular esta venta</button> : (
          <div className="mt-3 space-y-3">
            <Campo etiqueta="¿Por qué se anula?"><input className={clsInput} value={motivo} onChange={(e) => setMotivo(e.target.value)} /></Campo>
            <div className="grid grid-cols-2 gap-3">
              <Btn variante="suave" onClick={() => setAnulando(false)}>No, volver</Btn>
              <Btn disabled={ocupado || motivo.trim().length < 3} onClick={anular}>{ocupado ? 'Anulando…' : 'Sí, anular'}</Btn>
            </div>
            <p className="text-base text-tinta/60">Se devuelve el inventario y se borra la deuda del fiado de esta venta.</p>
          </div>
        )
      )}
    </div>
  )
}
