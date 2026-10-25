// Fiados: quién debe, cuánto, abonos, recordatorio por WhatsApp y recargo por mora.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { mensajeError } from '../lib/errores'
import { cop, numeroWhatsapp } from '../lib/pedido'
import { aNumero, mensajeCobro, soloDigitos } from '../lib/caja'
import { Btn, Volver, Aviso, Campo, clsInput } from '../tienda/ui'
import { Titulo, Seccion, Insignia, Opciones, SoloLectura, fechaHora } from './piezas'

const METODOS = [['efectivo', 'Efectivo'], ['nequi', 'Nequi'], ['transferencia', 'Transferencia'], ['daviplata', 'Daviplata'], ['datafono', 'Datáfono']]

export default function Fiados({ ctx, volver }) {
  const nid = ctx.neg.negocio_id
  const [clientes, setClientes] = useState(null)
  const [mora, setMora] = useState({})
  const [q, setQ] = useState('')
  const [solo, setSolo] = useState('deuda')
  const [error, setError] = useState('')
  const [abierto, setAbierto] = useState(null)
  const [nuevo, setNuevo] = useState(false)

  const cargar = useCallback(async () => {
    const [a, b] = await Promise.all([
      supabase.from('clientes_saldo').select('id,nombre,telefono,saldo,cupo_credito,dias_credito,deuda_desde,vence_el').eq('negocio_id', nid).order('nombre').limit(1000),
      supabase.from('clientes_mora').select('cliente_id,vencido,dias_atraso,recargo').eq('negocio_id', nid),
    ])
    if (a.error) return setError(mensajeError(a.error))
    setError(''); setClientes(a.data || [])
    setMora(Object.fromEntries((b.data || []).map((m) => [m.cliente_id, m])))
  }, [nid])
  useEffect(() => { cargar() }, [cargar])

  const lista = useMemo(() => {
    if (!clientes) return []
    const t = q.trim().toLowerCase(), d = soloDigitos(q)
    return clientes
      .filter((c) => (solo === 'deuda' ? Number(c.saldo) > 0 : true))
      .filter((c) => !t || c.nombre.toLowerCase().includes(t) || (d.length >= 3 && soloDigitos(c.telefono).includes(d)))
      .sort((x, y) => Number(y.saldo) - Number(x.saldo) || x.nombre.localeCompare(y.nombre))
      .slice(0, 150)
  }, [clientes, q, solo])
  const porCobrar = (clientes || []).reduce((s, c) => s + Math.max(Number(c.saldo), 0), 0)
  const deudores = (clientes || []).filter((c) => Number(c.saldo) > 0).length
  const vencido = Object.values(mora).reduce((s, m) => s + Number(m.vencido || 0), 0)

  if (abierto) return <Detalle ctx={ctx} cliente={clientes.find((c) => c.id === abierto) || { id: abierto }} mora={mora[abierto]} cerrar={() => { setAbierto(null); cargar() }} />
  if (nuevo) return <NuevoCliente ctx={ctx} cerrar={(id) => { setNuevo(false); cargar(); if (id) setAbierto(id) }} />

  return (
    <div>
      <Volver onClick={volver} texto="Volver al panel" />
      <Titulo sub="Quién te debe y cuánto.">Fiados</Titulo>
      {ctx.soloLectura && <SoloLectura />}
      {error && <div className="mb-4"><Aviso tipo="error">{error}</Aviso></div>}
      {!clientes && !error && <p className="py-8 text-center text-xl text-tinta/60">Cargando…</p>}
      {clientes && (
        <>
          <div className="mb-5 grid grid-cols-2 gap-3">
            <div className="rounded-2xl border-2 border-principal bg-principal/5 p-4 text-center"><p className="break-words text-2xl font-bold text-principal">{cop(porCobrar)}</p><p className="text-lg text-tinta/70">Por cobrar</p></div>
            <div className="rounded-2xl border-2 border-black/5 bg-white p-4 text-center"><p className="text-3xl font-bold">{deudores}</p><p className="text-lg text-tinta/70">{deudores === 1 ? 'Cliente debe' : 'Clientes deben'}</p></div>
            {vencido > 0 && <div className="col-span-2 rounded-2xl border-2 border-red-200 bg-red-50 p-3 text-center"><p className="text-2xl font-bold text-red-800">{cop(vencido)} vencido</p><p className="text-base text-red-900">Ya pasó la fecha para pagar.</p></div>}
          </div>
          <input className={`${clsInput} mb-3`} placeholder="Buscar por nombre o celular" value={q} onChange={(e) => setQ(e.target.value)} />
          <div className="mb-4"><Opciones valor={solo} opciones={[['deuda', 'Los que deben'], ['todos', 'Todos los clientes']]} onChange={setSolo} /></div>
          {lista.length === 0 && <p className="rounded-2xl border-2 border-black/10 bg-white p-6 text-center text-xl">{solo === 'deuda' ? 'Nadie te debe por ahora. 🎉' : 'No hay clientes con ese dato.'}</p>}
          <div className="space-y-2">
            {lista.map((c) => {
              const m = mora[c.id]
              return (
                <button key={c.id} onClick={() => setAbierto(c.id)} className="block w-full rounded-2xl border-2 border-black/5 bg-white p-4 text-left shadow-sm active:scale-[0.99]">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="break-words text-xl font-bold">{c.nombre}</span>
                    <span className={`shrink-0 text-xl font-bold ${Number(c.saldo) > 0 ? 'text-principal' : 'text-tinta/50'}`}>{cop(c.saldo)}</span>
                  </div>
                  {m?.vencido > 0 && <div className="mt-1"><Insignia tono="rojo">Vencido hace {m.dias_atraso} {m.dias_atraso === 1 ? 'día' : 'días'}</Insignia></div>}
                </button>
              )
            })}
          </div>
          {!ctx.soloLectura && <div className="mt-5"><Btn onClick={() => setNuevo(true)}>Nuevo cliente</Btn></div>}
        </>
      )}
    </div>
  )
}

function NuevoCliente({ ctx, cerrar }) {
  const nid = ctx.neg.negocio_id
  const [f, setF] = useState({ nombre: '', telefono: '', cupo: '', dias: '' })
  const [error, setError] = useState('')
  const [ocupado, setOcupado] = useState(false)
  async function guardar() {
    setError('')
    if (f.nombre.trim().length < 3) return setError('Escribe el nombre completo')
    let tel = soloDigitos(f.telefono); if (tel.length === 12 && tel.startsWith('57')) tel = tel.slice(2)
    if (tel && tel.length !== 10) return setError('El celular debe tener 10 dígitos (o déjalo vacío)')
    setOcupado(true)
    const fila = { negocio_id: nid, nombre: f.nombre.trim(), telefono: tel || null }
    if (ctx.esDueno) { fila.cupo_credito = aNumero(f.cupo); fila.dias_credito = Math.min(aNumero(f.dias), 365) }
    const { data, error: e } = await supabase.from('clientes').insert(fila).select('id').single()
    setOcupado(false)
    if (e) return setError(mensajeError(e))
    cerrar(data.id)
  }
  return (
    <div>
      <Volver onClick={() => cerrar(null)} texto="Volver a los fiados" />
      <Titulo>Nuevo cliente</Titulo>
      {error && <div className="mb-4"><Aviso tipo="error">{error}</Aviso></div>}
      <div className="space-y-5">
        <Campo etiqueta="Nombre completo"><input className={clsInput} value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} /></Campo>
        <Campo etiqueta="Celular (opcional)" ayuda="Para recordarle su cuenta por WhatsApp."><input className={clsInput} inputMode="tel" value={f.telefono} onChange={(e) => setF({ ...f, telefono: e.target.value })} /></Campo>
        {ctx.esDueno && (
          <>
            <Campo etiqueta="Hasta cuánto le fías (opcional)" ayuda="Déjalo vacío si no quieres poner tope."><input className={clsInput} inputMode="numeric" placeholder="$ 0" value={f.cupo} onChange={(e) => setF({ ...f, cupo: e.target.value })} /></Campo>
            <Campo etiqueta="Días para pagar (opcional)" ayuda="Pasado ese plazo, la deuda aparece como vencida."><input className={clsInput} inputMode="numeric" placeholder="0" value={f.dias} onChange={(e) => setF({ ...f, dias: e.target.value })} /></Campo>
          </>
        )}
        <Btn disabled={ocupado} onClick={guardar}>{ocupado ? 'Guardando…' : 'Guardar cliente'}</Btn>
      </div>
    </div>
  )
}

function Detalle({ ctx, cliente, mora, cerrar }) {
  const nid = ctx.neg.negocio_id
  const puede = !ctx.soloLectura
  const [c, setC] = useState(cliente)
  const [movs, setMovs] = useState(null)
  const [monto, setMonto] = useState('')
  const [metodo, setMetodo] = useState('efectivo')
  const [msg, setMsg] = useState(null)
  const [ocupado, setOcupado] = useState(false)
  const [ant, setAnt] = useState({ abierto: false, monto: '', nota: '' })
  const [cond, setCond] = useState({ cupo: String(cliente.cupo_credito || ''), dias: String(cliente.dias_credito || '') })

  const recargar = useCallback(async () => {
    const [a, b] = await Promise.all([
      supabase.from('clientes_saldo').select('id,nombre,telefono,saldo,cupo_credito,dias_credito').eq('negocio_id', nid).eq('id', cliente.id).single(),
      supabase.from('fiado_movimientos').select('id,tipo,monto,metodo,nota,fecha,venta_id,fecha_limite').eq('negocio_id', nid).eq('cliente_id', cliente.id).order('fecha', { ascending: false }).limit(40),
    ])
    if (a.data) setC(a.data)
    setMovs(b.data || [])
  }, [nid, cliente.id])
  useEffect(() => { recargar() }, [recargar])

  const saldo = Number(c.saldo || 0)
  async function accion(fn, ok) {
    setOcupado(true); setMsg(null)
    const { error } = await fn()
    setOcupado(false)
    if (error) return setMsg({ tipo: 'error', texto: mensajeError(error) })
    setMsg({ tipo: 'ok', texto: ok }); recargar()
  }
  const abonar = () => {
    const m = aNumero(monto)
    if (!(m > 0)) return setMsg({ tipo: 'error', texto: 'Escribe cuánto abona' })
    if (m > saldo) return setMsg({ tipo: 'error', texto: `Debe ${cop(saldo)}: el abono no puede ser mayor` })
    accion(() => supabase.rpc('registrar_abono', { p_negocio_id: nid, p_cliente_id: c.id, p_monto: m, p_metodo: metodo, p_nota: null }), `Abono de ${cop(m)} registrado.`).then(() => setMonto(''))
  }
  const wa = numeroWhatsapp(c.telefono)

  return (
    <div className="pb-6">
      <Volver onClick={cerrar} texto="Volver a los fiados" />
      <Titulo sub={c.telefono || 'Sin celular'}>{c.nombre}</Titulo>
      {!puede && <SoloLectura />}
      {msg && <div className="mb-4"><Aviso tipo={msg.tipo}>{msg.texto}</Aviso></div>}
      <div className="mb-5 rounded-2xl border-2 border-principal bg-principal/5 p-5 text-center">
        <p className="text-lg text-tinta/70">Debe</p>
        <p className="text-5xl font-bold text-principal">{cop(Math.max(saldo, 0))}</p>
        {Number(c.cupo_credito) > 0 && <p className="mt-1 text-lg text-tinta/70">Cupo: {cop(c.cupo_credito)}</p>}
        {mora?.vencido > 0 && <div className="mt-2"><Insignia tono="rojo">{cop(mora.vencido)} vencido hace {mora.dias_atraso} días</Insignia></div>}
      </div>

      {saldo > 0 && puede && (
        <Seccion titulo="Registrar un abono">
          <Campo etiqueta="¿Cuánto abona?"><input className={clsInput} inputMode="numeric" placeholder="$ 0" value={monto} onChange={(e) => setMonto(e.target.value)} /></Campo>
          <button type="button" onClick={() => setMonto(String(saldo))} className="mt-1 min-h-[48px] text-lg font-semibold text-principal underline">Paga todo ({cop(saldo)})</button>
          <p className="mb-2 mt-2 text-lg font-semibold">¿Con qué paga?</p>
          <div className="mb-4"><Opciones valor={metodo} opciones={METODOS} onChange={setMetodo} /></div>
          <Btn variante="verde" disabled={ocupado} onClick={abonar}>{ocupado ? 'Guardando…' : 'Registrar el abono'}</Btn>
        </Seccion>
      )}

      {saldo > 0 && wa && (
        <div className="mb-5"><a href={`https://wa.me/${wa}?text=${encodeURIComponent(mensajeCobro({ nombre: c.nombre, saldo, tienda: ctx.neg.nombre_comercial }))}`} target="_blank" rel="noopener noreferrer" className="flex min-h-[56px] items-center justify-center rounded-2xl bg-[#128C4A] text-lg font-semibold text-white">Recordarle por WhatsApp</a></div>
      )}

      {ctx.esDueno && mora?.recargo > 0 && (
        <Seccion titulo="Recargo por mora">
          <p className="mb-3 text-lg">Por los días de atraso le corresponde un recargo de <b>{cop(mora.recargo)}</b>. Se suma a su deuda.</p>
          <Btn variante="suave" disabled={ocupado} onClick={() => accion(() => supabase.rpc('cobrar_recargo_mora', { p_negocio_id: nid, p_cliente_id: c.id }), 'Recargo sumado a la deuda.')}>Cobrar el recargo</Btn>
        </Seccion>
      )}

      {ctx.esDueno && (
        <Seccion titulo="Condiciones de crédito">
          <div className="space-y-4">
            <Campo etiqueta="Hasta cuánto le fías" ayuda="0 = sin tope."><input className={clsInput} inputMode="numeric" value={cond.cupo} onChange={(e) => setCond({ ...cond, cupo: e.target.value })} /></Campo>
            <Campo etiqueta="Días para pagar" ayuda="0 = sin plazo."><input className={clsInput} inputMode="numeric" value={cond.dias} onChange={(e) => setCond({ ...cond, dias: e.target.value })} /></Campo>
            <Btn variante="suave" disabled={ocupado} onClick={() => accion(() => supabase.from('clientes').update({ cupo_credito: aNumero(cond.cupo), dias_credito: Math.min(aNumero(cond.dias), 365) }).eq('negocio_id', nid).eq('id', c.id), 'Condiciones guardadas.')}>Guardar condiciones</Btn>
          </div>
        </Seccion>
      )}

      {ctx.esDueno && (
        <Seccion titulo="Deuda de antes">
          {!ant.abierto ? <Btn variante="suave" onClick={() => setAnt({ ...ant, abierto: true })}>Anotar una deuda del cuaderno</Btn> : (
            <div className="space-y-4">
              <Campo etiqueta="¿Cuánto debía?"><input className={clsInput} inputMode="numeric" placeholder="$ 0" value={ant.monto} onChange={(e) => setAnt({ ...ant, monto: e.target.value })} /></Campo>
              <Campo etiqueta="Nota (opcional)"><input className={clsInput} value={ant.nota} onChange={(e) => setAnt({ ...ant, nota: e.target.value })} /></Campo>
              <div className="grid grid-cols-2 gap-3">
                <Btn variante="suave" onClick={() => setAnt({ abierto: false, monto: '', nota: '' })}>No, volver</Btn>
                <Btn disabled={ocupado} onClick={() => aNumero(ant.monto) > 0 ? accion(() => supabase.rpc('registrar_saldo_anterior', { p_negocio_id: nid, p_cliente_id: c.id, p_monto: aNumero(ant.monto), p_fecha: null, p_nota: ant.nota.trim() || null }), 'Deuda anotada.').then(() => setAnt({ abierto: false, monto: '', nota: '' })) : setMsg({ tipo: 'error', texto: 'Escribe cuánto debía' })}>Anotar</Btn>
              </div>
            </div>
          )}
        </Seccion>
      )}

      <Seccion titulo="Movimientos">
        {!movs && <p className="text-lg text-tinta/60">Cargando…</p>}
        {movs?.length === 0 && <p className="text-lg text-tinta/60">Sin movimientos todavía.</p>}
        <ul className="space-y-3">
          {movs?.map((m) => (
            <li key={m.id} className="flex items-baseline justify-between gap-3 border-b border-black/5 pb-2 text-lg">
              <span><span className="block font-semibold">{m.tipo === 'abono' ? `Abonó (${m.metodo})` : m.nota || (m.venta_id ? 'Compra a fiado' : 'Cargo')}</span><span className="block text-base text-tinta/60">{fechaHora(m.fecha)}</span></span>
              <span className={`shrink-0 text-xl font-bold ${m.tipo === 'abono' ? 'text-green-800' : 'text-principal'}`}>{m.tipo === 'abono' ? '−' : '+'}{cop(m.monto)}</span>
            </li>
          ))}
        </ul>
      </Seccion>
    </div>
  )
}
