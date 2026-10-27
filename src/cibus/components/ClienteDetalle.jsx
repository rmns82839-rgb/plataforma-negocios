import { useCallback, useEffect, useMemo, useState } from 'react'
import { usePersistido, borrarBorradores, TREINTA_MIN } from '../lib/usePersistido'
import { supabase } from '../lib/supabase'
import { dinero, aNumero, fechaHora, fechaSolo } from '../lib/formato'
import { claseInput } from '../lib/estilos'
import { METODOS_ABONO, textoMetodo } from '../lib/pagos'
import { diasDesde, estaVencido, facturasPendientes, repartoAbonos, yaVencio, desgloseDeuda, actividadCliente } from '../lib/cartera'
import Modal from './Modal'
import ClienteForm from './ClienteForm'
import PrestamoRapido from './PrestamoRapido'
import PrepagoCliente from './PrepagoCliente'
import ComprasCliente from './ComprasCliente'
import { Desplegable } from './BarraFija'
import CorregirMovimiento from './CorregirMovimiento'
import { alCambiarCola, encolarAccion, listarCola, registrarAccionSegura } from '../lib/sincronizar'
import { esErrorDeRed, idNuevo } from '../lib/offline'
import { numeroFactura } from '../lib/factura'
import { destinatariosCobro } from '../lib/cobro'
import { useDueno } from '../context/rol'
import { useConfig } from '../lib/config'

// Ficha de un cliente con fiado: datos, facturas pendientes, abonos y movimientos.
// Se usa desde Fiados y desde Pagos.
export default function ClienteDetalle({ cliente: inicial, onCerrar, onCambio }) {
  const [cliente, setCliente] = useState(inicial)
  const base = `cliente:${inicial.id}:`          // lo escrito sobrevive a recargar la página
  const [movs, setMovs] = useState([])
  const [editar, setEditar] = usePersistido(base + 'editar', false, true, TREINTA_MIN)
  const [abono, setAbono] = usePersistido(base + 'abono', '')
  const [metodo, setMetodo] = usePersistido(base + 'metodo', 'efectivo')
  const [errorAbono, setErrorAbono] = useState('')
  const [abonando, setAbonando] = useState(false)
  const [anterior, setAnterior] = usePersistido(base + 'anterior', false)          // formulario "Saldo anterior" abierto
  const [saldoAnt, setSaldoAnt] = usePersistido(base + 'saldoAnt', '')
  const [fechaAnt, setFechaAnt] = usePersistido(base + 'fechaAnt', '')
  const [errorAnt, setErrorAnt] = useState('')
  const [guardandoAnt, setGuardandoAnt] = useState(false)
  const dueno = useDueno()
  const cfg = useConfig()
  const [mora, setMora] = useState(null)       // { vencido, dias_atraso, recargo } si hay deuda vencida
  const [cobrandoMora, setCobrandoMora] = useState(false)
  const [errorMora, setErrorMora] = useState('')
  const [numeros, setNumeros] = useState({})          // venta_id → número de factura
  const [pagando, setPagando] = usePersistido(base + 'pagando', null)         // factura (cargo) a la que se le va a pagar { id, pendiente }
  const [pagoTxt, setPagoTxt] = usePersistido(base + 'pagoTxt', '')
  const [pagoMetodo, setPagoMetodo] = usePersistido(base + 'pagoMetodo', 'efectivo')
  const [sel, setSel] = usePersistido(base + 'sel', [])                       // facturas marcadas para pagar juntas
  const [selMetodo, setSelMetodo] = usePersistido(base + 'selMetodo', 'efectivo')
  const [errorSel, setErrorSel] = useState('')
  const [pagandoSel, setPagandoSel] = useState(false)
  const [corrigiendoId, setCorrigiendoId] = usePersistido(base + 'corrigiendo', null, true, TREINTA_MIN)   // movimiento que el dueño está corrigiendo
  const cerrar = () => { borrarBorradores(base); onCerrar() }
  // si la ficha se reabrió tras recargar, el saldo se vuelve a leer para que no quede desactualizado
  useEffect(() => {
    supabase.from('clientes_saldo').select('*').eq('id', inicial.id).maybeSingle().then(({ data }) => { if (data) setCliente(data) })
  }, [inicial.id])
  const [errorPago, setErrorPago] = useState('')
  const [guardandoPago, setGuardandoPago] = useState(false)
  const [prestando, setPrestando] = usePersistido(base + 'prestando', false, true, TREINTA_MIN)    // ventana del préstamo rápido

  // Abonos y préstamos hechos sin internet que todavía no se suben: se descuentan del saldo que se ve
  const [cola, setCola] = useState([])
  useEffect(() => { listarCola().then(setCola); return alCambiarCola(setCola) }, [])
  const enCola = cola.filter(x => x.tipo === 'accion' && x.clienteId === inicial.id)
  const ajusteCola = enCola.reduce((s, x) => s + x.signo * Number(x.monto), 0)
  const saldoVisible = Math.max(Number(cliente.saldo) + ajusteCola, 0)
  const [avisoOff, setAvisoOff] = useState('')
  const hacerAccion = async (rpc, args, signo, monto, etiqueta) => {
    const clave = idNuevo(), hora = new Date().toISOString()
    const r = await registrarAccionSegura(rpc, args, clave, hora)
    if (r.error && esErrorDeRed(r.error)) {
      await encolarAccion(rpc, args, { clienteId: cliente.id, monto, signo, etiqueta }, clave, hora)
      setAvisoOff(`${etiqueta} guardado sin internet: se sube solo cuando vuelva la conexión.`)
      return { pendiente: true }
    }
    return { error: r.error }
  }
  const nombreMov = (m) => m.tipo === 'cargo'
    ? (m.concepto === 'prestamo' ? 'Préstamo rápido' : m.nota?.startsWith('Saldo inicial') ? 'Saldo anterior' : 'Fiado')
    : 'Abono'
  // Nombre de un cargo con su factura: "Fiado · Factura N.º 00297"; y a qué factura fue cada abono
  const etiquetaCargo = (c) => c.concepto === 'prestamo' ? 'Préstamo rápido'
    : c.nota?.startsWith('Saldo inicial') ? 'Saldo anterior'
    : numeros[c.venta_id] != null ? `Fiado · Factura N.º ${numeroFactura(numeros[c.venta_id])}` : 'Fiado'
  const destinoAbono = (m) => {
    if (!m.aplica_a) return ''
    const c = movs.find(x => x.id === m.aplica_a)
    if (!c) return ' a una factura'
    if (c.concepto === 'prestamo') return ' a un préstamo'
    if (c.nota?.startsWith('Saldo inicial')) return ' al saldo anterior'
    return numeros[c.venta_id] != null ? ` a la Factura N.º ${numeroFactura(numeros[c.venta_id])}` : ` al fiado del ${fechaHora(c.fecha)}`
  }
  const reparto = useMemo(() => repartoAbonos(movs), [movs])
  const porId = useMemo(() => new Map(movs.map(m => [m.id, m])), [movs])
  const nombreCorto = (c) => !c ? 'una factura' : c.concepto === 'prestamo' ? 'el préstamo'
    : c.nota?.startsWith('Saldo inicial') ? 'el saldo anterior'
    : numeros[c.venta_id] != null ? `la Factura N.º ${numeroFactura(numeros[c.venta_id])}` : `el fiado del ${fechaSolo(c.fecha)}`
  // Texto bajo cada movimiento: en qué estado está ese fiado, o a qué se aplicó ese abono
  const detalleMov = (m) => {
    if (m.tipo === 'cargo') {
      const p = pendientes.find(f => f.id === m.id)
      if (!p) return '✓ Pagado completo'
      return p.pendiente < p.monto ? `Debe ${dinero(p.pendiente)} de ${dinero(p.monto)}` : 'Sin pagar'
    }
    return (reparto.get(m.id) ?? []).map(x => {
      const c = porId.get(x.cargoId)
      const de = `${nombreCorto(c)} (era de ${dinero(c?.monto)})`
      return x.restante <= 0 ? `Pagó ${de} completo` : `Abonó ${dinero(x.aplicado)} a ${de} · quedó debiendo ${dinero(x.restante)}`
    })
  }
  const corregible = (m) => dueno === true && !m.venta_id          // lo que viene de una venta se corrige anulando la venta
  const corrigiendo = movs.find(m => m.id === corrigiendoId)

  const cargarMovs = useCallback(async () => {
    const { data } = await supabase
      .from('fiado_movimientos').select('*').eq('cliente_id', inicial.id)
      .order('fecha', { ascending: false }).range(0, 999)
    setMovs(data ?? [])
    const ids = [...new Set((data ?? []).map(m => m.venta_id).filter(Boolean))]
    if (ids.length > 0) {
      const { data: vs } = await supabase.from('ventas').select('id, numero').in('id', ids)
      setNumeros(Object.fromEntries((vs ?? []).map(v => [v.id, v.numero])))
    }
  }, [inicial.id])
  useEffect(() => { cargarMovs() }, [cargarMovs])
  const cargarMora = useCallback(async () => {
    const { data } = await supabase.from('clientes_mora').select('vencido, dias_atraso, recargo').eq('cliente_id', inicial.id).maybeSingle()
    setMora(data ?? null)
  }, [inicial.id])
  useEffect(() => { cargarMora() }, [cargarMora, movs.length])

  const cobrarRecargo = async () => {
    setCobrandoMora(true); setErrorMora('')
    const { error } = await supabase.rpc('cobrar_recargo_mora', { p_cliente_id: cliente.id })
    setCobrandoMora(false)
    if (error) return setErrorMora(error.message)
    const { data } = await supabase.from('clientes_saldo').select('*').eq('id', cliente.id).single()
    if (data) setCliente(data)
    await cargarMovs(); onCambio?.()
  }

  const pendientes = useMemo(
    () => facturasPendientes(movs, cliente.dias_credito), [movs, cliente.dias_credito])

  // Saldo anterior (lo que debía antes de usar la app) separado de la deuda hecha en esta app
  const esAnterior = (f) => String(f.nota ?? '').startsWith('Saldo inicial')
  const deudaAnterior = pendientes.filter(esAnterior).reduce((t, f) => t + f.pendiente, 0)
  const enApp = Math.max(saldoVisible - deudaAnterior, 0)
  const idsAnterior = pendientes.filter(esAnterior).map(f => f.id)
  const idsApp = pendientes.filter(f => !esAnterior(f)).map(f => f.id)
  const marcadas = pendientes.filter(f => sel.includes(f.id))
  const totalMarcado = marcadas.reduce((t, f) => t + f.pendiente, 0)
  const alternar = (id) => setSel(a => (a.includes(id) ? a.filter(x => x !== id) : [...a, id]))
  // Estado de cada venta fiada, para colorear el historial de compras (debe / pagado)
  const estadosVenta = useMemo(() => {
    const m = new Map()
    for (const c of movs) if (c.tipo === 'cargo' && c.venta_id) m.set(c.venta_id, { fiado: true, debe: 0 })
    for (const f of pendientes) if (f.venta_id) m.set(f.venta_id, { fiado: true, debe: f.pendiente })
    return m
  }, [movs, pendientes])

  // Paga de una vez las facturas marcadas (cada una completa), de la más vieja a la más nueva
  const pagarMarcadas = async () => {
    if (marcadas.length === 0) return
    setPagandoSel(true); setErrorSel('')
    let hechas = 0
    for (const f of marcadas) {
      const { error } = await hacerAccion('registrar_abono_factura', {
        p_cargo_id: f.id, p_monto: f.pendiente, p_metodo: selMetodo,
      }, -1, f.pendiente, `Pago ${dinero(f.pendiente)} de ${cliente.nombre}`)
      if (error) { setErrorSel(`Se pagaron ${hechas} de ${marcadas.length}. ${error.message}`); break }
      hechas++
      setSel(a => a.filter(x => x !== f.id))
    }
    setPagandoSel(false)
    const { data } = await supabase.from('clientes_saldo').select('*').eq('id', cliente.id).single()
    if (data) setCliente(data)
    await cargarMovs(); onCambio?.()
  }

  const registrarAbono = async () => {
    const monto = aNumero(abono)
    if (monto <= 0) return setErrorAbono('Escribe el valor del abono')
    if (monto > saldoVisible) {
      return setErrorAbono(`El abono no puede ser mayor que la deuda (${dinero(saldoVisible)})`)
    }
    setAbonando(true); setErrorAbono('')
    const { error, pendiente } = await hacerAccion('registrar_abono', {
      p_cliente_id: cliente.id, p_monto: monto, p_metodo: metodo,
    }, -1, monto, `Abono ${dinero(monto)} de ${cliente.nombre}`)
    setAbonando(false)
    if (error) return setErrorAbono(error.message)
    if (pendiente) { setAbono(''); return }
    onCambio?.()
    cerrar()
  }

  const abrirPago = (f) => { setPagando(f); setPagoTxt(String(f.pendiente)); setPagoMetodo('efectivo'); setErrorPago('') }
  const pagarFactura = async () => {
    const monto = aNumero(pagoTxt)
    if (monto <= 0) return setErrorPago('Escribe cuánto paga')
    if (monto > pagando.pendiente) return setErrorPago(`Esa factura solo debe ${dinero(pagando.pendiente)}`)
    setGuardandoPago(true); setErrorPago('')
    const { error, pendiente } = await hacerAccion('registrar_abono_factura', {
      p_cargo_id: pagando.id, p_monto: monto, p_metodo: pagoMetodo,
    }, -1, monto, `Pago ${dinero(monto)} de ${cliente.nombre}`)
    setGuardandoPago(false)
    if (error) return setErrorPago(error.message)
    setPagando(null); setPagoTxt('')
    if (pendiente) return
    const { data } = await supabase.from('clientes_saldo').select('*').eq('id', cliente.id).single()
    if (data) setCliente(data)
    await cargarMovs(); onCambio?.()
  }

  const agregarSaldoAnterior = async () => {
    const monto = aNumero(saldoAnt)
    if (monto <= 0) return setErrorAnt('Escribe cuánto debía')
    setGuardandoAnt(true); setErrorAnt('')
    const { error } = await supabase.rpc('registrar_saldo_anterior', {
      p_cliente_id: cliente.id, p_monto: monto, p_fecha: fechaAnt || null,
    })
    setGuardandoAnt(false)
    if (error) return setErrorAnt(error.message)
    onCambio?.()
    cerrar()
  }

  if (editar) {
    return (
      <ClienteForm
        cliente={cliente}
        onCerrar={() => setEditar(false)}
        onGuardado={async (c) => {
          setEditar(false)
          const { data } = await supabase.from('clientes_saldo').select('*').eq('id', c.id).single()
          if (data) setCliente(data)
          onCambio?.()
        }}
      />
    )
  }

  const vencido = estaVencido(cliente)
  const avisos = destinatariosCobro(cliente)
  const documento = cliente.documento ? `${cliente.tipo_documento ?? ''} ${cliente.documento}`.trim() : ''

  return (
    <Modal titulo={cliente.nombre} onCerrar={cerrar}>
      <div className="space-y-2">
        <div className={`rounded-2xl p-4 ring-1 ${vencido ? 'bg-red-50 ring-red-200' : 'bg-orange-50 ring-orange-200'}`}>
          <p className="text-base font-medium text-slate-700">Total que debe</p>
          <p className={`text-3xl font-bold ${vencido ? 'text-red-600' : 'text-orange-700'}`}>{dinero(saldoVisible)}</p>
          {vencido && <p className="text-base font-semibold text-red-600">Tiene deuda vencida</p>}
          {actividadCliente(cliente, dinero) && <p className="text-sm text-slate-600">{actividadCliente(cliente, dinero)}</p>}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-2xl bg-violet-50 ring-1 ring-violet-200 p-3 min-w-0">
            <p className="text-sm font-medium text-violet-900 break-words">Saldo anterior</p>
            <p className="text-xl font-bold text-violet-700">{dinero(deudaAnterior)}</p>
            <p className="text-xs text-violet-800/80 break-words">Lo que debía antes de usar esta app</p>
          </div>
          <div className="rounded-2xl bg-orange-50 ring-1 ring-orange-200 p-3 min-w-0">
            <p className="text-sm font-medium text-orange-900 break-words">Deuda en esta app</p>
            <p className="text-xl font-bold text-orange-700">{dinero(enApp)}</p>
            <p className="text-xs text-orange-800/80 break-words">
              {desgloseDeuda(cliente).hay ? `Fiado ${dinero(desgloseDeuda(cliente).fiado)} · Préstamo ${dinero(desgloseDeuda(cliente).prestamo)}` : 'Compras fiadas aquí'}
            </p>
          </div>
        </div>
        {enCola.length > 0 && (
          <p className="text-sm text-amber-800 bg-amber-50 rounded-lg px-3 py-2">
            {enCola.length} movimiento(s) guardado(s) sin internet, pendientes por subir. Este saldo ya los descuenta.
          </p>
        )}
        {avisoOff && <p className="text-sm text-marca bg-lima/20 rounded-lg px-3 py-2">{avisoOff}</p>}
      </div>
      <PrepagoCliente cliente={cliente} onCambio={onCambio} />
      <Desplegable titulo="Historial de compras" nota="Productos, fecha y hora de cada compra">
        <ComprasCliente cliente={cliente} estados={estadosVenta} />
      </Desplegable>
      {avisos.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs font-medium text-slate-500">Recordar el cobro por WhatsApp{avisos.length > 1 ? ' (a los dos)' : ''}</p>
          <div className={`grid gap-2 ${avisos.length > 1 ? 'grid-cols-2' : 'grid-cols-1'}`}>
            {avisos.map(a => (
              <a key={a.clave} href={a.href} target="_blank" rel="noreferrer"
                 className="min-h-11 py-2 rounded-xl bg-lima/20 text-marca text-sm font-semibold grid place-items-center text-center leading-tight px-2">
                A {a.etiqueta}
              </a>
            ))}
          </div>
        </div>
      )}

      <div className="rounded-xl bg-slate-50 p-3 grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
        <Dato titulo="Documento" valor={documento} />
        <Dato titulo="Teléfono" valor={cliente.telefono} />
        {(cliente.telefono2 || cliente.contacto2) && (
          <Dato titulo={`Segundo contacto${cliente.contacto2 ? ` · ${cliente.contacto2}` : ''}`} valor={cliente.telefono2} />
        )}
        <Dato titulo="Correo" valor={cliente.email} />
        <Dato titulo="Dirección" valor={cliente.direccion} />
        <Dato titulo="Cupo de crédito" valor={Number(cliente.cupo_credito) > 0 ? dinero(cliente.cupo_credito) : 'Sin límite'} />
        <Dato titulo="Plazo" valor={Number(cliente.dias_credito) > 0 ? `${cliente.dias_credito} días` : 'Sin plazo'} />
        <Dato titulo="Tipo de cliente" valor={cliente.tipo_cliente === 'mayorista' ? 'Mayorista' : 'Normal'} />
        <Dato titulo="Recargo por mora" valor={cfg.mora > 0 ? `${cfg.mora} % mensual` : 'No se cobra'} />
      </div>
      {mora && Number(mora.vencido) > 0 && (
        <div className="rounded-xl bg-red-50 p-3 space-y-2">
          <p className="text-sm text-red-600 font-medium">
            En mora: {dinero(mora.vencido)} vencidos hace {mora.dias_atraso} {mora.dias_atraso === 1 ? 'día' : 'días'}.
            {Number(mora.recargo) > 0 ? ` Recargo por mora: ${dinero(mora.recargo)}.` : ''}
          </p>
          {dueno === true && Number(mora.recargo) > 0 && (
            <button onClick={cobrarRecargo} disabled={cobrandoMora}
              className="w-full h-10 rounded-xl bg-red-600 text-white text-sm font-semibold disabled:opacity-40 active:bg-red-700">
              {cobrandoMora ? 'Cobrando…' : `Cobrar recargo ${dinero(mora.recargo)}`}
            </button>
          )}
          {errorMora && <p className="text-xs text-red-600">{errorMora}</p>}
        </div>
      )}
      <button onClick={() => setEditar(true)}
        className="w-full h-10 rounded-xl bg-slate-100 text-slate-600 text-sm font-medium active:bg-slate-200">
        Editar datos del cliente
      </button>

      {dueno === true && (
        <div className="space-y-2">
          {!anterior ? (
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => setPrestando(true)}
                className="min-h-10 py-2 rounded-xl bg-negro text-champagne text-sm font-semibold active:opacity-90">
                Préstamo rápido
              </button>
              <button onClick={() => setAnterior(true)}
                className="min-h-10 py-2 rounded-xl bg-slate-100 text-slate-600 text-sm font-medium active:bg-slate-200 leading-tight">
                Saldo anterior (otra app)
              </button>
            </div>
          ) : (
            <div className="rounded-2xl bg-slate-50 ring-1 ring-slate-200 p-3 space-y-2">
              <p className="text-xs font-medium text-slate-500">Saldo anterior · lo que ya debía antes de usar esta app</p>
              <div className="grid grid-cols-2 gap-2">
                <input value={saldoAnt} onChange={e => setSaldoAnt(e.target.value)} inputMode="numeric" placeholder="Valor $" className={claseInput} />
                <input type="date" value={fechaAnt} onChange={e => setFechaAnt(e.target.value)} aria-label="Debe desde" className={claseInput} />
              </div>
              <p className="text-[11px] text-slate-400">La fecha es opcional (desde cuándo debe). No cuenta como una venta de hoy.</p>
              {errorAnt && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{errorAnt}</p>}
              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => { setAnterior(false); setErrorAnt('') }}
                  className="h-11 rounded-xl bg-slate-100 text-slate-600 text-sm font-medium active:bg-slate-200">Volver</button>
                <button onClick={agregarSaldoAnterior} disabled={guardandoAnt}
                  className="h-11 rounded-xl bg-marca text-white text-sm font-semibold disabled:opacity-40 active:bg-marca-oscuro">
                  {guardandoAnt ? '…' : 'Agregar saldo'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {saldoVisible > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-slate-500">Registrar pago o abono</p>
          <div className="grid grid-cols-[1fr_auto] gap-2">
            <input value={abono} onChange={e => setAbono(e.target.value)}
                   inputMode="numeric" placeholder="Monto" className={claseInput} />
            <button onClick={() => setAbono(String(saldoVisible))}
              className="h-12 px-4 rounded-xl bg-slate-100 text-slate-600 text-sm font-medium active:bg-slate-200">
              Pagar todo
            </button>
          </div>
          <div className="grid grid-cols-[1fr_auto] gap-2">
            <select value={metodo} onChange={e => setMetodo(e.target.value)} className={claseInput}>
              {METODOS_ABONO.map(m => <option key={m.id} value={m.id}>{m.texto}</option>)}
            </select>
            <button onClick={registrarAbono} disabled={abonando}
              className="h-12 px-6 rounded-xl bg-marca text-white font-semibold disabled:opacity-40 active:bg-marca-oscuro">
              {abonando ? '…' : 'Abonar'}
            </button>
          </div>
          {errorAbono && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{errorAbono}</p>}
        </div>
      )}

      {pendientes.length > 0 && (
        <div className="space-y-2">
          <p className="text-base font-semibold text-slate-700">Facturas pendientes</p>
          <p className="text-sm text-slate-500">Marca las que quieras pagar juntas, o usa los botones de abajo.</p>
          <div className="grid grid-cols-2 gap-2">
            {[['Saldo anterior', idsAnterior, 'violet'], ['Deuda de esta app', idsApp, 'orange'], ['Todo lo que debe', [...idsAnterior, ...idsApp], 'red'], ['Quitar marcas', [], 'slate']].map(([t, ids, c]) => (
              <button key={t} onClick={() => setSel(ids)} disabled={t !== 'Quitar marcas' && ids.length === 0}
                className={`min-h-11 rounded-xl px-2 text-sm font-semibold leading-tight disabled:opacity-40 ${
                  c === 'violet' ? 'bg-violet-100 text-violet-800' : c === 'orange' ? 'bg-orange-100 text-orange-800' : c === 'red' ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-600'}`}>
                {t}
              </button>
            ))}
          </div>
          <ul className="space-y-2">
            {pendientes.map(f => {
              const vencida = yaVencio(f.limite)
              const anterior_ = esAnterior(f)
              const etiqueta = f.concepto === 'prestamo'
                ? `Préstamo${f.nota && f.nota !== 'Préstamo rápido' ? ` · ${f.nota}` : ''}`
                : numeros[f.venta_id] != null ? `Factura N.º ${numeroFactura(numeros[f.venta_id])}`
                : anterior_ ? 'Saldo anterior' : 'Fiado'
              const abierta = pagando?.id === f.id
              const marcada = sel.includes(f.id)
              const tono = vencida ? 'red' : anterior_ ? 'violet' : 'orange'
              const caja = { red: 'border-red-500 bg-red-50/60', violet: 'border-violet-400 bg-violet-50/60', orange: 'border-orange-400 bg-orange-50/60' }[tono]
              const num = { red: 'text-red-600', violet: 'text-violet-700', orange: 'text-orange-700' }[tono]
              return (
                <li key={f.id} className={`rounded-xl border-l-4 p-3 space-y-2 ${caja} ${marcada ? 'ring-2 ring-negro' : ''}`}>
                  <div className="grid grid-cols-[auto_1fr_auto] gap-3 items-start">
                    <input type="checkbox" checked={marcada} onChange={() => alternar(f.id)} aria-label={`Marcar ${etiqueta}`}
                      className="mt-1 h-6 w-6 accent-[#0b0b0b]" />
                    <div className="min-w-0">
                      <p className="text-base text-slate-800 font-semibold break-words">{etiqueta}</p>
                      <p className="text-sm text-slate-600">{fechaSolo(f.fecha)} · {diasDesde(f.fecha)} días</p>
                      <p className={`text-sm ${vencida ? 'text-red-600 font-semibold' : 'text-slate-500'}`}>
                        {f.limite ? `${vencida ? 'Venció' : 'Fecha límite'}: ${fechaSolo(f.limite)}` : 'Sin fecha límite'}
                        {f.pendiente < f.monto ? ` · de ${dinero(f.monto)}` : ''}
                      </p>
                    </div>
                    <div className="grid justify-items-end gap-1">
                      <span className={`text-lg font-bold ${num}`}>{dinero(f.pendiente)}</span>
                      {corregible(f) && (
                        <button onClick={() => setCorrigiendoId(f.id)} className="text-sm text-slate-600 underline">Corregir</button>
                      )}
                    </div>
                  </div>
                  <button onClick={() => (abierta ? setPagando(null) : abrirPago(f))}
                    className={`w-full min-h-11 rounded-lg text-sm font-semibold ${abierta ? 'bg-slate-200 text-slate-700' : 'bg-negro text-champagne active:opacity-90'}`}>
                    {abierta ? 'Cerrar' : 'Pagar solo esta (o una parte)'}
                  </button>
                  {abierta && (
                    <div className="rounded-xl bg-white p-3 space-y-2 ring-1 ring-slate-200">
                      <p className="text-sm font-medium text-slate-600">Pagar solo esta factura</p>
                      <div className="grid grid-cols-[1fr_auto] gap-2">
                        <input value={pagoTxt} onChange={e => setPagoTxt(e.target.value.replace(/[^\d]/g, ''))}
                               inputMode="numeric" placeholder="Valor" className={claseInput} />
                        <button onClick={() => setPagoTxt(String(f.pendiente))}
                          className="h-12 px-4 rounded-xl bg-white ring-1 ring-slate-200 text-slate-600 text-sm font-medium active:bg-slate-100">
                          Toda
                        </button>
                      </div>
                      <select value={pagoMetodo} onChange={e => setPagoMetodo(e.target.value)} className={claseInput}>
                        {METODOS_ABONO.map(m => <option key={m.id} value={m.id}>{textoMetodo(m.id)}</option>)}
                      </select>
                      {errorPago && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{errorPago}</p>}
                      <div className="grid grid-cols-2 gap-2">
                        <button onClick={() => setPagando(null)}
                          className="h-11 rounded-xl bg-white ring-1 ring-slate-200 text-slate-600 text-sm font-medium active:bg-slate-100">Volver</button>
                        <button onClick={pagarFactura} disabled={guardandoPago}
                          className="h-11 rounded-xl bg-marca text-white text-sm font-semibold disabled:opacity-40 active:bg-marca-oscuro">
                          {guardandoPago ? '…' : 'Registrar pago'}
                        </button>
                      </div>
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
          {marcadas.length > 0 && (
            <div className="sticky bottom-0 z-10 rounded-2xl bg-white ring-2 ring-negro shadow-xl p-3 space-y-2">
              <div className="grid grid-cols-[1fr_auto] gap-3 items-baseline">
                <span className="text-base text-slate-700">{marcadas.length} {marcadas.length === 1 ? 'factura marcada' : 'facturas marcadas'}</span>
                <span className="text-2xl font-bold text-slate-900">{dinero(totalMarcado)}</span>
              </div>
              <div className="grid grid-cols-[1fr_auto] gap-2">
                <select value={selMetodo} onChange={e => setSelMetodo(e.target.value)} className={claseInput} aria-label="Cómo paga">
                  {METODOS_ABONO.map(m => <option key={m.id} value={m.id}>{textoMetodo(m.id)}</option>)}
                </select>
                <button onClick={() => setSel([])} className="h-12 px-4 rounded-xl bg-slate-100 text-slate-600 text-sm font-medium active:bg-slate-200">Quitar</button>
              </div>
              {errorSel && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2 break-words">{errorSel}</p>}
              <button onClick={pagarMarcadas} disabled={pagandoSel}
                className="w-full h-14 rounded-xl bg-emerald-600 text-white text-lg font-semibold disabled:opacity-50 active:bg-emerald-700">
                {pagandoSel ? 'Registrando…' : `Pagar ${dinero(totalMarcado)}`}
              </button>
            </div>
          )}
        </div>
      )}

      <div className="space-y-1">
        <p className="text-base font-semibold text-slate-700">Historial de movimientos</p>
        <p className="text-sm text-slate-500"><span className="font-semibold text-orange-700">DEBE</span> = falta pagar · <span className="font-semibold text-emerald-700">PAGADA / PAGÓ</span> = ya está pago. «Corregir» solo aparece en saldos anteriores, préstamos y abonos escritos a mano; las facturas de una venta se corrigen anulando la venta.</p>
        {movs.length === 0 ? (
          <p className="text-sm text-slate-400">Sin movimientos</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {movs.map(m => {
              const debe = m.tipo === 'cargo' && pendientes.some(f => f.id === m.id)
              const pagadoCompleto = m.tipo === 'cargo' && !debe
              const caja = m.tipo === 'abono' ? 'border-emerald-500 bg-emerald-50/60' : debe ? 'border-orange-400 bg-orange-50/60' : 'border-emerald-300 bg-emerald-50/30'
              return (
              <li key={m.id} className={`rounded-xl border-l-4 p-3 grid grid-cols-[1fr_auto] gap-3 text-sm ${caja}`}>
                <span className="text-slate-600 min-w-0 break-words">
                  <span className={`inline-block mb-1 mr-2 rounded-full px-2 py-0.5 text-xs font-bold ${m.tipo === 'abono' ? 'bg-emerald-100 text-emerald-800' : debe ? 'bg-orange-100 text-orange-800' : 'bg-emerald-100 text-emerald-800'}`}>
                    {m.tipo === 'abono' ? 'PAGÓ' : debe ? 'DEBE' : 'PAGADA'}
                  </span>
                  {m.tipo === 'cargo'
                    ? etiquetaCargo(m)
                    : `Abono (${textoMetodo(m.metodo)})${destinoAbono(m)}`} · {fechaHora(m.fecha)}
                  {m.concepto === 'prestamo' && m.nota && m.nota !== 'Préstamo rápido' && <span className="block text-sm text-slate-500">{m.nota}</span>}
                  {[].concat(detalleMov(m)).map((t, i) => <span key={i} className="block text-sm text-slate-500">{t}</span>)}
                </span>
                <span className="grid justify-items-end gap-1">
                  <span className={`text-base font-bold ${m.tipo === 'abono' || pagadoCompleto ? 'text-emerald-700' : 'text-orange-700'}`}>
                    {m.tipo === 'cargo' ? '+' : '−'}{dinero(m.monto)}
                  </span>
                  {corregible(m) && (
                    <button onClick={() => setCorrigiendoId(m.id)} className="text-sm text-slate-600 underline">Corregir</button>
                  )}
                </span>
              </li>
              )
            })}
          </ul>
        )}
      </div>
      {corrigiendo && (
        <CorregirMovimiento mov={corrigiendo} titulo={nombreMov(corrigiendo)} onCerrar={() => setCorrigiendoId(null)}
          onHecho={async () => {
            setCorrigiendoId(null)
            const { data } = await supabase.from('clientes_saldo').select('*').eq('id', cliente.id).single()
            if (data) setCliente(data)
            await cargarMovs(); onCambio?.()
          }} />
      )}
      {prestando && (
        <PrestamoRapido cliente={cliente} onCerrar={() => setPrestando(false)}
          onHecho={async () => {
            setPrestando(false)
            const { data } = await supabase.from('clientes_saldo').select('*').eq('id', cliente.id).single()
            if (data) setCliente(data)
            await cargarMovs(); onCambio?.()
          }} />
      )}
    </Modal>
  )
}

function Dato({ titulo, valor }) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] text-slate-400">{titulo}</p>
      <p className="text-slate-700 break-words">{valor || '—'}</p>
    </div>
  )
}
