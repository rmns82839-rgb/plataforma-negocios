// Panel de cobro: descuento general, cliente, forma(s) de pago, efectivo/cambio y botón Cobrar.
import { useEffect, useState } from 'react'
import { dinero, aNumero } from '../lib/formato'
import { claseInput } from '../lib/estilos'
import { hoyTexto } from '../lib/periodo'
import { yaVencio } from '../lib/cartera'
import { faltaPagar, comisionDe } from '../lib/venta'
import Icono from './Iconos'
import AvisoDeudor from './AvisoDeudor'

const BILLETES = [20000, 50000, 100000]
const PLAZOS = [7, 15, 30]
const PORCENTAJES = [5, 10]

/** Botones de 3 columnas iguales; si la última fila queda incompleta, se reparte completa (simétrico). */
const spanUltimo = (i, n) => (i === n - 1 && n % 3 !== 0 ? { gridColumn: `span ${4 - (n % 3)}` } : undefined)


/** Sección desplegable: el título y el resumen siempre se ven; el contenido solo al abrirla. */
function Seccion({ titulo, resumen, abierto, onToggle, children }) {
  return (
    <div className={`rounded-2xl ${abierto ? 'bg-slate-50' : 'bg-slate-50/70'}`}>
      <button onClick={onToggle} aria-expanded={abierto}
        className="w-full min-h-12 py-2 px-4 grid grid-cols-[6.5rem_1fr_auto] gap-2 items-center text-left active:bg-slate-100 rounded-2xl">
        <span className="text-xs font-medium text-slate-500">{titulo}</span>
        <span className="text-sm font-semibold leading-snug break-words">{resumen}</span>
        <span className="text-slate-400 text-sm">{abierto ? '▴' : '▾'}</span>
      </button>
      {abierto && <div className="px-3 pb-3">{children}</div>}
    </div>
  )
}

/** Botón de volver atrás, igual en todos los pasos. */
function Volver({ onClick, texto }) {
  return (
    <button onClick={onClick}
      className="w-full h-10 rounded-xl bg-white ring-1 ring-slate-200 text-sm font-medium text-slate-600 grid grid-cols-[2rem_1fr_2rem] items-center active:bg-slate-100">
      <span>‹</span><span>{texto}</span><span />
    </button>
  )
}

export default function CajaPago({ c }) {
  const { total, subtotal, formas, tipoDe, metodo, elegirMetodo, mixto, setMixto, filas, setFilas, recibido, setRecibido, parcial, setParcial,
          descuentoTxt, setDescuentoTxt, descuento, descuentoMalo, verDescuento, setVerDescuento,
          cliente, clienteId, quitarCliente, elegirCliente, buscaCliente, setBuscaCliente, coincidencias, qCliente, verCliente, setVerCliente, setNuevoCliente,
          hayFiado, montoFiado, pasaCupo, fechaLimite, setFechaLimite, sumarDias,
          abono, abonoTxt, setAbonoTxt, abonoMalo, formasAbono, abonoForma, setAbonoMetodo, fiadoUnico, parteOn, restante,
          verParte, setVerParte, abonoRecibido, setAbonoRecibido, saldoPrepago, esPrepago, montoPrepago, prepagoDe,
          comision, dueno, pagos, dom, setDom, notaVenta, setNotaVenta, moraCliente, abrirCuenta, puedeCobrar, cobrando, cobrar, motivoBloqueo, resto, } = c
  const [abierto, setAbierto] = useState('pago')   // una sola sección abierta a la vez: así no hay que hacer scroll
  const alternar = (id) => setAbierto(a => (a === id ? null : id))
  useEffect(() => { if (hayFiado && !cliente) setAbierto('cliente') }, [hayFiado, cliente])
  const falta = faltaPagar(total, pagos)
  const cambio = aNumero(recibido) - restante
  const usarFila = (id, cambios) => setFilas(prev => prev.map(f => (f.id === id ? { ...f, ...cambios } : f)))
  const agregarFila = () => {
    const usadas = new Set(filas.map(f => f.metodo))
    const libre = formas.find(f => !usadas.has(f.id)) ?? formas[0]
    setFilas(prev => [...prev, { id: crypto.randomUUID(), metodo: libre.id, txt: falta > 0 ? String(falta) : '' }])
  }

  const nombreForma = mixto ? `Dividido (${filas.length})`
    : `${formas.find(f => f.id === metodo)?.nombre ?? ''}${abono > 0 ? (fiadoUnico ? ` · abona ${dinero(abono)}` : ` + ${formas.find(f => f.id === abonoForma)?.nombre ?? ''}`) : ''}`

  return (
    <div id="pago-caja" className="bg-white rounded-3xl shadow-sm p-3 lg:p-4 space-y-2 scroll-mt-20">
      <button onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
        className="lg:hidden w-full h-10 rounded-xl text-sm font-medium text-slate-500 grid grid-cols-[auto_1fr_auto] items-center px-3 active:bg-slate-50">
        <span>‹</span><span className="text-left pl-2">Volver a los productos</span><span />
      </button>

      {/* Si el cliente elegido ya le debe al negocio, se avisa aquí (sutil, pero a la vista) */}
      <AvisoDeudor cliente={cliente} mora={moraCliente} montoFiado={montoFiado} onVer={abrirCuenta} />

      {/* Atajos de la venta: nota y domicilio (opcionales) */}
      <div className="grid grid-cols-2 gap-2">
        {[
          { id: 'nota', icono: 'nota', titulo: 'Nota', puesto: Boolean(notaVenta.trim()), estado: notaVenta.trim() ? 'Con nota' : 'Opcional' },
          { id: 'domicilio', icono: 'moto', titulo: 'Domicilio', puesto: dom.on,
            estado: dom.on ? (aNumero(dom.costoTxt) > 0 ? dinero(aNumero(dom.costoTxt)) : 'Sin costo') : 'No' },
        ].map(a => (
          <button key={a.id} onClick={() => alternar(a.id)} aria-pressed={abierto === a.id}
            className={`h-14 rounded-2xl px-3 grid grid-cols-[auto_1fr] gap-3 items-center text-left transition ${
              a.puesto ? 'bg-negro text-champagne' : 'bg-slate-50 text-slate-600 ring-1 ring-slate-200 active:bg-slate-100'} ${
              abierto === a.id ? 'ring-2 ring-oro' : ''}`}>
            <Icono nombre={a.icono} className="h-6 w-6" />
            <span className="min-w-0">
              <span className="block text-sm font-semibold leading-tight">{a.titulo}</span>
              <span className={`block text-xs leading-tight ${a.puesto ? 'text-champagne/80' : 'text-slate-400'}`}>{a.estado}</span>
            </span>
          </button>
        ))}
      </div>

      {abierto === 'nota' && (
        <div className="rounded-2xl bg-slate-50 p-3 space-y-2">
          <p className="text-xs font-medium text-slate-500">Nota de esta venta (opcional)</p>
          <textarea value={notaVenta} onChange={e => setNotaVenta(e.target.value)} maxLength={200} rows={3}
                    placeholder="Ej. Lo recoge el sobrino · paga el viernes · producto sin caja"
                    className="w-full px-4 py-3 rounded-xl border border-slate-300 bg-white resize-none focus:border-oro focus:ring-2 focus:ring-oro/25 outline-none" />
          <p className="text-[11px] text-slate-400">Sale en rojo en la lista de ventas y en la factura.</p>
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => setNotaVenta('')} disabled={!notaVenta}
              className="h-10 rounded-xl bg-white ring-1 ring-slate-200 text-sm font-medium text-slate-600 disabled:opacity-40 active:bg-slate-100">
              Quitar nota
            </button>
            <button onClick={() => setAbierto('pago')}
              className="h-10 rounded-xl bg-negro text-champagne text-sm font-semibold active:opacity-90">
              Listo
            </button>
          </div>
        </div>
      )}

      {abierto === 'domicilio' && (
        <div className="rounded-2xl bg-slate-50 p-3 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            {[[false, 'Sin domicilio'], [true, 'Con domicilio']].map(([v, t]) => (
              <button key={t} onClick={() => setDom(d => ({ ...d, on: v }))}
                className={`h-11 rounded-xl text-sm font-medium ${dom.on === v ? 'bg-negro text-champagne' : 'bg-white text-slate-600 ring-1 ring-slate-200'}`}>
                {t}
              </button>
            ))}
          </div>
          {dom.on && (
            <>
              <input value={dom.direccion} onChange={e => setDom(d => ({ ...d, direccion: e.target.value }))}
                     placeholder="Dirección de entrega" className={claseInput} />
              <div className="grid grid-cols-2 gap-2">
                <input value={dom.telefono} onChange={e => setDom(d => ({ ...d, telefono: e.target.value }))}
                       inputMode="tel" placeholder="Teléfono" className={claseInput} />
                <input value={dom.costoTxt} onChange={e => setDom(d => ({ ...d, costoTxt: e.target.value }))}
                       inputMode="numeric" placeholder="Valor del domicilio" className={claseInput} />
              </div>
              {cliente && (cliente.direccion || cliente.telefono) && (
                <button onClick={() => setDom(d => ({ ...d, direccion: cliente.direccion ?? d.direccion, telefono: cliente.telefono ?? d.telefono }))}
                  className="w-full h-10 rounded-xl bg-white ring-1 ring-slate-200 text-xs font-medium text-slate-600 active:bg-slate-100">
                  Usar los datos de {cliente.nombre}
                </button>
              )}
            </>
          )}
          <Volver onClick={() => setAbierto('pago')} texto="Volver al pago" />
        </div>
      )}

      {/* Descuento general (opcional) */}
      <Seccion titulo="Descuento" resumen={descuento > 0 ? `− ${dinero(descuento)}` : 'Ninguno'}
               abierto={abierto === 'descuento'} onToggle={() => { alternar('descuento'); setVerDescuento(true) }}>
        <div className="space-y-2">
          <div className="grid grid-cols-3 gap-2">
            {PORCENTAJES.map(p => {
              const valor = Math.round(subtotal * p / 100)
              return (
                <button key={p} onClick={() => setDescuentoTxt(String(valor))}
                  className={`h-10 rounded-lg text-xs font-medium ${
                    descuento === valor && valor > 0 ? 'bg-negro text-champagne' : 'bg-slate-100 text-slate-600 active:bg-slate-200'}`}>
                  {p} %
                </button>
              )
            })}
            <button onClick={() => { setDescuentoTxt(''); setVerDescuento(false) }}
              className="h-10 rounded-lg bg-slate-100 text-xs font-medium text-slate-600 active:bg-slate-200">
              Quitar
            </button>
          </div>
          <input value={descuentoTxt} onChange={e => setDescuentoTxt(e.target.value)}
                 inputMode="numeric" placeholder="Descuento en pesos" className={claseInput} />
          {descuentoMalo && (
            <p className="text-xs text-red-500">El descuento no puede ser negativo ni igual o mayor que la venta.</p>
          )}
          <Volver onClick={() => setAbierto('pago')} texto="Volver al pago" />
        </div>
      </Seccion>

      {/* Cliente (opcional; obligatorio si hay fiado) */}
      <Seccion titulo="Cliente" resumen={cliente ? `${cliente.nombre}${cliente.tipo_cliente === 'mayorista' ? ' · mayorista' : ''}${moraCliente ? ' · EN MORA' : Number(cliente.saldo) > 0 ? ` · debe ${dinero(cliente.saldo)}` : ''}${saldoPrepago > 0 ? ` · saldo ${dinero(saldoPrepago)}` : ''}` : 'Consumidor final'}
               abierto={abierto === 'cliente'} onToggle={() => { alternar('cliente'); setVerCliente(true) }}>
        {cliente ? (
          <div className="space-y-2">
            <div className="grid grid-cols-[1fr_auto] gap-2 items-center rounded-xl bg-slate-50 p-3">
              <div className="min-w-0">
                <p className="text-sm font-medium break-words">{cliente.nombre}</p>
                <p className="text-xs text-slate-400">
                  {Number(cliente.saldo) > 0 ? `Debe ${dinero(cliente.saldo)}` : 'Sin deuda'}
                  {saldoPrepago > 0 ? ` · saldo prepago ${dinero(saldoPrepago)}` : ''}
                  {hayFiado
                    ? (Number(cliente.cupo_credito) > 0 ? ` · cupo ${dinero(cliente.cupo_credito)}` : ' · sin cupo límite')
                    : ''}
                </p>
              </div>
              <button onClick={quitarCliente} aria-label="Quitar cliente"
                className="h-9 w-9 rounded-full bg-slate-200 text-slate-500">✕</button>
            </div>
            {moraCliente && (
              <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">
                Deuda vencida de {dinero(moraCliente.vencido)} hace {moraCliente.dias_atraso} {moraCliente.dias_atraso === 1 ? 'día' : 'días'}
                {Number(moraCliente.recargo) > 0 ? ` · recargo por mora ${dinero(moraCliente.recargo)}` : ''}.
                {dueno === true ? ' Como dueño puedes fiar igual.' : ' No se le puede fiar más hasta que pague.'}
              </p>
            )}
            <Volver onClick={() => setAbierto('pago')} texto="Volver al pago" />
          </div>
        ) : (
          <div className="space-y-2">
            <div className="grid grid-cols-[1fr_auto] gap-2">
              <input value={buscaCliente} onChange={e => setBuscaCliente(e.target.value)}
                     placeholder="Buscar por nombre, cédula o celular" className={claseInput} />
              <button onClick={() => setNuevoCliente(true)} aria-label="Crear cliente"
                className="h-12 w-12 rounded-xl bg-slate-100 text-xl text-marca">+</button>
            </div>
            {coincidencias.length > 0 && (
              <div className="rounded-xl border border-slate-200 divide-y divide-slate-100">
                {coincidencias.map(x => (
                  <button key={x.id} onClick={() => { elegirCliente(x); setAbierto('pago') }}
                    className="w-full min-h-12 px-4 py-2 grid grid-cols-[1fr_auto] gap-3 items-center text-left active:bg-slate-50">
                    <span className="min-w-0 block">
                      <span className="block text-sm break-words">{x.nombre}</span>
                      <span className="block text-[11px] text-slate-400 break-words">{[x.documento ? `${x.tipo_documento ?? 'CC'} ${x.documento}` : '', x.telefono, x.direccion].filter(Boolean).join(' · ')}</span>
                    </span>
                    <span className="text-xs text-slate-400">{Number(x.saldo) > 0 ? `debe ${dinero(x.saldo)}` : prepagoDe(x.id) > 0 ? `saldo ${dinero(prepagoDe(x.id))}` : ''}</span>
                  </button>
                ))}
              </div>
            )}
            {qCliente && coincidencias.length === 0 && (
              <p className="text-xs text-slate-400 px-1">Sin coincidencias. Usa + para crear el cliente.</p>
            )}
            {!hayFiado && <Volver onClick={() => setAbierto('pago')} texto="Volver al pago" />}
          </div>
        )}
      </Seccion>

      {/* Forma de pago */}
      <Seccion titulo="Forma de pago" resumen={nombreForma} abierto={abierto === 'pago'} onToggle={() => alternar('pago')}>
        <div className="space-y-3">
        {!mixto ? (
          <>
            <div className="grid grid-cols-3 gap-2">
              {formas.map((m, i) => (
                <button key={m.id} onClick={() => elegirMetodo(m.id)} style={spanUltimo(i, formas.length)}
                  className={`min-h-11 py-2 rounded-xl text-sm leading-tight font-medium transition px-2 ${
                    metodo === m.id ? 'bg-negro text-champagne' : 'bg-slate-100 text-slate-600'}`}>
                  {m.nombre}
                </button>
              ))}
            </div>
            {parteOn && (
              <div className="rounded-2xl bg-slate-50 p-3 space-y-3">
                <p className="text-sm font-medium text-slate-700 text-center">
                  {fiadoUnico ? '¿Cuánto abona ahora?' : `¿Cuánto paga con otra forma? (el resto va con ${formas.find(f => f.id === metodo)?.nombre ?? ''})`}
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <button onClick={() => { setAbonoTxt(''); if (!fiadoUnico) setVerParte(false) }}
                    className={`min-h-11 py-2 rounded-xl text-sm font-medium ${abonoTxt === '' && fiadoUnico ? 'bg-negro text-champagne' : 'bg-white text-slate-600 ring-1 ring-slate-200'}`}>
                    {fiadoUnico ? 'Nada' : 'No dividir'}
                  </button>
                  <button onClick={() => setAbonoTxt(String(Math.floor(total / 2)))}
                    className={`min-h-11 py-2 rounded-xl text-sm font-medium ${abonoTxt === String(Math.floor(total / 2)) ? 'bg-negro text-champagne' : 'bg-white text-slate-600 ring-1 ring-slate-200'}`}>
                    La mitad
                  </button>
                </div>
                <label className="block space-y-1">
                  <span className="text-xs font-medium text-slate-500">{fiadoUnico ? 'Otro valor' : 'Valor'}</span>
                  <input value={abonoTxt} onChange={e => setAbonoTxt(e.target.value.replace(/[^\d]/g, ''))}
                         inputMode="numeric" placeholder="0" className={`${claseInput} h-11`} />
                </label>
                <div className="space-y-1">
                  <span className="text-xs font-medium text-slate-500">{fiadoUnico ? 'Abona con' : 'Lo paga con'}</span>
                  <div className="grid grid-cols-3 gap-2">
                    {formasAbono.map((m, i) => (
                      <button key={m.id} onClick={() => setAbonoMetodo(m.id)} style={spanUltimo(i, formasAbono.length)}
                        className={`min-h-11 py-2 px-2 rounded-xl text-sm leading-tight font-medium ${
                          abonoForma === m.id ? 'bg-negro text-champagne' : 'bg-white text-slate-600 ring-1 ring-slate-200'}`}>
                        {m.nombre}
                      </button>
                    ))}
                  </div>
                </div>
                {abono > 0 && tipoDe(abonoForma) === 'efectivo' && (
                  <div className="grid grid-cols-2 gap-3 items-end">
                    <label className="space-y-1">
                      <span className="text-xs font-medium text-slate-500">Recibido en efectivo</span>
                      <input value={abonoRecibido} onChange={e => setAbonoRecibido(e.target.value.replace(/[^\d]/g, ''))}
                             inputMode="numeric" placeholder="0" className={`${claseInput} h-11`} />
                    </label>
                    <div className="h-11 rounded-xl bg-white px-3 grid content-center">
                      <span className="text-[11px] text-slate-400 leading-none">{abonoRecibido && aNumero(abonoRecibido) < abono ? 'Falta' : 'Cambio'}</span>
                      <span className={`font-bold leading-tight ${abonoRecibido && aNumero(abonoRecibido) < abono ? 'text-red-500' : 'text-marca'}`}>
                        {abonoRecibido ? dinero(Math.abs(aNumero(abonoRecibido) - abono)) : '—'}
                      </span>
                    </div>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-2 text-center">
                  <div className="rounded-xl bg-white py-2 px-1">
                    <span className="block text-[11px] leading-tight text-slate-400">{fiadoUnico ? 'Paga hoy' : `Con ${formas.find(f => f.id === abonoForma)?.nombre ?? ''}`}</span>
                    <span className="font-bold text-marca">{dinero(abono)}</span>
                  </div>
                  <div className="rounded-xl bg-white py-2 px-1">
                    <span className="block text-[11px] leading-tight text-slate-400">{fiadoUnico ? 'Queda debiendo' : `Con ${formas.find(f => f.id === metodo)?.nombre ?? ''}`}</span>
                    <span className={`font-bold ${fiadoUnico ? 'text-red-500' : 'text-marca'}`}>{dinero(restante)}</span>
                  </div>
                </div>
                {abonoMalo && <p className="text-xs text-red-500 text-center">Ese valor no puede ser todo el total.</p>}
              </div>
            )}
          </>
        ) : (
          <div className="space-y-3">
            <Volver onClick={() => setMixto(false)} texto="Volver a una sola forma de pago" />
            {filas.map(f => {
              const tipo = tipoDe(f.metodo)
              const monto = aNumero(f.txt)
              const rec = aNumero(f.recibido)
              return (
                <div key={f.id} className="rounded-2xl bg-slate-50 p-3 space-y-2">
                  <div className="grid grid-cols-[1fr_8rem_2.5rem] gap-2 items-center">
                    <select value={f.metodo} onChange={e => usarFila(f.id, { metodo: e.target.value })}
                      aria-label="Forma de pago" className={`${claseInput} h-11`}>
                      {formas.map(m => <option key={m.id} value={m.id}>{m.nombre}</option>)}
                    </select>
                    <input value={f.txt} onChange={e => usarFila(f.id, { txt: e.target.value })}
                           inputMode="numeric" placeholder="Monto" aria-label="Monto" className={`${claseInput} h-11 text-right`} />
                    <button onClick={() => setFilas(prev => prev.filter(x => x.id !== f.id))} disabled={filas.length === 1}
                      aria-label="Quitar forma de pago"
                      className="h-10 w-10 rounded-full bg-slate-200 text-slate-500 disabled:opacity-30">✕</button>
                  </div>
                  {tipo === 'efectivo' && (
                    <div className="grid grid-cols-2 gap-3 items-end">
                      <label className="space-y-1">
                        <span className="text-xs font-medium text-slate-500">Recibido (opcional)</span>
                        <input value={f.recibido ?? ''} onChange={e => usarFila(f.id, { recibido: e.target.value })}
                               inputMode="numeric" placeholder="0" className={`${claseInput} h-11`} />
                      </label>
                      <div className="h-11 rounded-xl bg-white px-3 grid content-center">
                        <span className="text-[11px] text-slate-400 leading-none">{rec && rec < monto ? 'Falta' : 'Cambio'}</span>
                        <span className={`font-bold leading-tight ${rec && rec < monto ? 'text-red-500' : 'text-marca'}`}>
                          {rec ? dinero(Math.abs(rec - monto)) : '—'}
                        </span>
                      </div>
                    </div>
                  )}
                  {tipo === 'datafono' && dueno === true && comision > 0 && monto > 0 && (
                    <p className="text-xs text-slate-500">Comisión del datáfono ({comision} %): {dinero(comisionDe(monto, comision))}, la asume el negocio.</p>
                  )}
                </div>
              )
            })}
            <button onClick={agregarFila} disabled={falta <= 0}
              className="w-full h-11 rounded-xl bg-slate-100 text-sm font-medium text-slate-600 disabled:opacity-40 active:bg-slate-200">
              + Otra forma
            </button>
            <p className={`text-sm font-semibold rounded-xl px-3 py-2 text-center ${
              falta === 0 ? 'bg-esmeralda/10 text-esmeralda' : 'bg-red-50 text-red-600'}`}>
              {falta === 0 ? 'El pago está completo' : falta > 0 ? `Falta ${dinero(falta)}` : `Sobra ${dinero(-falta)}`}
            </p>
          </div>
        )}

        {/* Efectivo (pago único): billetes, recibido y cambio */}
        {!mixto && tipoDe(metodo) === 'efectivo' && (
          <div className="space-y-2">
            <div className="grid grid-cols-4 gap-2">
              <button onClick={() => setRecibido(String(restante))}
                className="h-10 rounded-lg bg-slate-100 text-xs font-medium text-slate-600 active:bg-slate-200">
                Exacto
              </button>
              {BILLETES.map(b => (
                <button key={b} onClick={() => setRecibido(String(b))}
                  className="h-10 rounded-lg bg-slate-100 text-xs font-medium text-slate-600 active:bg-slate-200">
                  {b / 1000} mil
                </button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-3 items-end">
              <label className="space-y-1">
                <span className="text-xs font-medium text-slate-500">Recibido</span>
                <input value={recibido} onChange={e => setRecibido(e.target.value)}
                       inputMode="numeric" placeholder="0" className={`${claseInput} h-11`} />
              </label>
              <div className="h-11 rounded-xl bg-slate-50 px-3 grid content-center">
                <span className="text-[11px] text-slate-400 leading-none">{recibido && cambio < 0 ? 'Falta' : 'Cambio'}</span>
                <span className={`font-bold text-lg leading-tight ${recibido && cambio < 0 ? 'text-red-500' : 'text-marca'}`}>
                  {recibido ? dinero(Math.abs(cambio)) : '—'}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Nequi, transferencia, Daviplata o datáfono: se puede pagar solo una parte y el resto con otra forma */}
        {!mixto && c.esDigital && (
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-3 items-end">
              <label className="space-y-1">
                <span className="text-xs font-medium text-slate-500 break-words">¿Cuánto paga con {formas.find(f => f.id === metodo)?.nombre ?? 'esta forma'}?</span>
                <input value={parcial} onChange={e => setParcial(e.target.value)}
                       inputMode="numeric" placeholder={`${restante}`} className={`${claseInput} h-11`} />
              </label>
              <button onClick={() => setParcial('')} disabled={!parcial}
                className="h-11 rounded-xl bg-slate-100 text-xs font-medium text-slate-600 disabled:opacity-40">Todo con esta forma</button>
            </div>
            <p className="text-[11px] text-slate-400">Déjalo vacío si paga todo con esta forma. Si es menos del total, te preguntamos con qué paga el resto.</p>
          </div>
        )}

        {resto?.pendiente && (
          <p className="text-sm rounded-lg px-3 py-2 bg-champagne/30 text-negro">
            Falta completar el total: faltan <b>{dinero(resto.falta)}</b>. Al tocar <b>Cobrar</b> te preguntamos con qué paga el resto.
          </p>
        )}
        {resto?.forma && (
          <div className="rounded-lg px-3 py-2 bg-esmeralda/10 grid grid-cols-[1fr_auto_auto] gap-2 items-center">
            <span className="text-sm text-esmeralda">El resto ({dinero(resto.falta)}) se paga con <b>{resto.forma}</b></span>
            <button onClick={resto.abrir} className="h-9 px-3 rounded-lg bg-white text-xs font-medium text-slate-600">Cambiar</button>
            <button onClick={resto.quitar} className="h-9 px-3 rounded-lg bg-white text-xs font-medium text-slate-600">Quitar</button>
          </div>
        )}

        {esPrepago && cliente && (
          <p className="text-sm rounded-lg px-3 py-2 bg-lima/20 text-marca">
            {saldoPrepago >= restante
              ? `Se descuentan ${dinero(restante)} del saldo de ${cliente.nombre}. Le quedan ${dinero(saldoPrepago - restante)}.`
              : `Se usan los ${dinero(Math.max(0, saldoPrepago))} de saldo y la caja pregunta con qué paga los ${dinero(restante - Math.max(0, saldoPrepago))} que faltan.`}
          </p>
        )}
        {mixto && montoPrepago > 0 && cliente && (
          <p className="text-xs text-slate-500">Del saldo prepago: {dinero(montoPrepago)} (tiene {dinero(saldoPrepago)})</p>
        )}

        {!mixto && tipoDe(metodo) === 'datafono' && dueno === true && comision > 0 && (
          <p className="text-xs text-slate-500">Comisión del datáfono ({comision} %): {dinero(comisionDe(total, comision))}, la asume el negocio.</p>
        )}

        {/* Fiado: plazo y cupo */}
        {hayFiado && (
          <div className="space-y-2">
            {cliente && (
              <div className="space-y-2">
                <p className="text-xs font-medium text-slate-500">Fecha límite de pago (opcional)</p>
                <div className="grid grid-cols-4 gap-2">
                  {PLAZOS.map(n => (
                    <button key={n} onClick={() => setFechaLimite(sumarDias(n))}
                      className={`h-10 rounded-lg text-xs font-medium ${
                        fechaLimite === sumarDias(n) ? 'bg-negro text-champagne' : 'bg-slate-100 text-slate-600 active:bg-slate-200'}`}>
                      {n} días
                    </button>
                  ))}
                  <button onClick={() => setFechaLimite('')}
                    className={`h-10 rounded-lg text-xs font-medium ${
                      !fechaLimite ? 'bg-negro text-champagne' : 'bg-slate-100 text-slate-600 active:bg-slate-200'}`}>
                    Sin fecha
                  </button>
                </div>
                <input type="date" value={fechaLimite} min={hoyTexto()}
                       onChange={e => setFechaLimite(e.target.value)} className={claseInput} />
                {yaVencio(fechaLimite) && <p className="text-xs text-red-500">Esa fecha ya pasó.</p>}
              </div>
            )}
            {mixto && montoFiado > 0 && <p className="text-xs text-slate-500">A crédito: {dinero(montoFiado)}</p>}
            {pasaCupo && (
              <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">
                Con esta venta se pasa del cupo de crédito de {cliente.nombre}.
              </p>
            )}
          </div>
        )}
        </div>
      </Seccion>

      {motivoBloqueo && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{motivoBloqueo}</p>}

      <button onClick={() => cobrar()} disabled={!puedeCobrar || cobrando}
        className="w-full h-16 rounded-2xl bg-negro text-champagne text-xl font-semibold ring-1 ring-champagne/30
                   disabled:opacity-40 active:opacity-90">
        {cobrando ? 'Registrando…' : `Cobrar ${dinero(total)}`}
      </button>
    </div>
  )
}
