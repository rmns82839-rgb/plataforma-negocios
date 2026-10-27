import { useCallback, useEffect, useState } from 'react'
import { usePersistido, borrarBorradores } from '../lib/usePersistido'
import { supabase } from '../lib/supabase'
import { dinero, aNumero, fechaHora, fechaSolo } from '../lib/formato'
import { claseInput } from '../lib/estilos'
import { METODOS_ABONO, textoMetodo } from '../lib/pagos'
import { yaVencio } from '../lib/cartera'
import { FRECUENCIAS } from '../lib/prestamos'
import Modal, { Campo } from './Modal'

// Ficha de un préstamo: cuotas, pagos, cobrar y cancelar.
export default function PrestamoDetalle({ prestamo: p, onCerrar, onCambio }) {
  const [cuotas, setCuotas] = useState([])
  const [pagos, setPagos] = useState([])
  const base = `pdet:${p.id}:`                   // lo escrito sobrevive a recargar la página
  const [monto, setMonto] = usePersistido(base + 'monto', '')
  const [metodo, setMetodo] = usePersistido(base + 'metodo', 'efectivo')
  const [error, setError] = useState('')
  const [trabajando, setTrabajando] = useState(false)
  const [cancelando, setCancelando] = usePersistido(base + 'cancelando', false)
  const [motivo, setMotivo] = usePersistido(base + 'motivo', '')
  const cerrarFicha = () => { borrarBorradores(base); onCerrar() }

  const cargar = useCallback(async () => {
    const [c, g] = await Promise.all([
      supabase.from('prestamo_cuotas').select('*').eq('prestamo_id', p.id).order('numero'),
      supabase.from('prestamo_pagos').select('*').eq('prestamo_id', p.id).order('fecha', { ascending: false }),
    ])
    setCuotas(c.data ?? []); setPagos(g.data ?? [])
  }, [p.id])
  useEffect(() => { cargar() }, [cargar])

  const activo = p.estado === 'activo'
  const saldo = Number(p.saldo)
  const siguiente = cuotas.find(c => Number(c.pagado) < Number(c.valor))
  const frecTexto = FRECUENCIAS.find(f => f.id === p.frecuencia)?.texto.toLowerCase()

  const cobrar = async (valor) => {
    if (!(valor > 0)) return setError('Escribe el valor del pago')
    if (valor > saldo) return setError(`El pago no puede ser mayor que lo que se debe (${dinero(saldo)})`)
    setTrabajando(true); setError('')
    const { error: err } = await supabase.rpc('registrar_pago_prestamo', {
      p_prestamo_id: p.id, p_monto: valor, p_metodo: metodo, p_nota: null,
    })
    setTrabajando(false)
    if (err) return setError(err.message)
    onCambio?.(); cerrarFicha()
  }

  const cancelar = async () => {
    setTrabajando(true); setError('')
    const { error: err } = await supabase.rpc('cancelar_prestamo', { p_prestamo_id: p.id, p_motivo: motivo })
    setTrabajando(false)
    if (err) return setError(err.message)
    onCambio?.(); cerrarFicha()
  }

  return (
    <Modal titulo={p.cliente_nombre} onCerrar={cerrarFicha}>
      <div className="grid grid-cols-2 gap-3 items-center">
        <div>
          <p className="text-xs text-slate-400">{activo ? 'Falta por pagar' : p.estado === 'pagado' ? 'Pagado completo' : 'Cancelado'}</p>
          <p className={`text-2xl font-bold ${Number(p.cuotas_vencidas) > 0 ? 'text-red-500' : 'text-marca'}`}>{dinero(saldo)}</p>
          {Number(p.cuotas_vencidas) > 0 && (
            <p className="text-xs font-medium text-red-500">{p.cuotas_vencidas} cuota(s) vencida(s)</p>
          )}
        </div>
        {p.cliente_telefono && (
          <a href={`https://wa.me/57${p.cliente_telefono.replace(/\D/g, '')}?text=${encodeURIComponent(
              `Hola ${p.cliente_nombre}, te recordamos tu cuota${siguiente ? ` de ${dinero(Number(siguiente.valor) - Number(siguiente.pagado))} con fecha ${fechaSolo(siguiente.fecha_limite)}` : ''}. ¡Gracias!`)}`}
             target="_blank" rel="noreferrer"
             className="h-11 rounded-xl bg-lima/20 text-marca text-sm font-semibold grid place-items-center text-center leading-tight">
            Recordar por WhatsApp
          </a>
        )}
      </div>

      <div className="rounded-2xl bg-slate-50 p-3 grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-slate-500">
        <span>Prestado</span><span className="text-right font-medium text-slate-700">{dinero(p.monto)}</span>
        <span>Interés {Number(p.tasa_mensual).toLocaleString('es-CO')}% mensual</span><span className="text-right font-medium text-slate-700">{dinero(p.interes_total)}</span>
        <span>Total a pagar</span><span className="text-right font-medium text-slate-700">{dinero(p.total_a_pagar)}</span>
        <span>Pagado</span><span className="text-right font-medium text-slate-700">{dinero(p.pagado_total)}</span>
        <span>Plan</span><span className="text-right font-medium text-slate-700">{p.num_cuotas} cuotas {frecTexto}</span>
        <span>Desde</span><span className="text-right font-medium text-slate-700">{fechaSolo(p.fecha_inicio)}</span>
        {p.cliente_documento && (<><span>Documento</span><span className="text-right font-medium text-slate-700">{`${p.cliente_tipo_documento ?? ''} ${p.cliente_documento}`.trim()}</span></>)}
      </div>

      {activo && (
        <div className="space-y-3 rounded-2xl border border-slate-200 p-3">
          <p className="text-sm font-semibold">Registrar pago</p>
          <div className="grid grid-cols-2 gap-2">
            {METODOS_ABONO.map((m, i) => (
              <button key={m.id} onClick={() => setMetodo(m.id)}
                className={`h-10 rounded-xl text-xs font-medium ${i === METODOS_ABONO.length - 1 && METODOS_ABONO.length % 2 ? 'col-span-2' : ''} ${metodo === m.id ? 'bg-marca text-white' : 'bg-slate-100 text-slate-600'}`}>
                {m.texto}
              </button>
            ))}
          </div>
          <Campo etiqueta="Valor recibido">
            <input value={monto} onChange={e => setMonto(e.target.value)} inputMode="numeric" placeholder="$" className={claseInput} />
          </Campo>
          <div className="grid grid-cols-2 gap-2">
            {siguiente && (
              <button disabled={trabajando}
                onClick={() => cobrar(Number(siguiente.valor) - Number(siguiente.pagado))}
                className="h-11 rounded-xl bg-lima/20 text-marca text-xs font-semibold disabled:opacity-40">
                Cuota #{siguiente.numero}<br />{dinero(Number(siguiente.valor) - Number(siguiente.pagado))}
              </button>
            )}
            <button disabled={trabajando} onClick={() => cobrar(aNumero(monto))}
              className={`h-11 rounded-xl bg-marca text-white text-sm font-semibold disabled:opacity-40 ${siguiente ? '' : 'col-span-2'}`}>
              Cobrar
            </button>
          </div>
        </div>
      )}

      <div>
        <p className="text-sm font-semibold mb-2">Cuotas</p>
        <ul className="rounded-2xl bg-slate-50 divide-y divide-white text-xs">
          {cuotas.map(c => {
            const pend = Number(c.valor) - Number(c.pagado)
            const venc = pend > 0 && yaVencio(c.fecha_limite)
            return (
              <li key={c.id} className="grid grid-cols-[2rem_1fr_auto] gap-2 px-3 py-2 items-center">
                <span className="text-slate-400">#{c.numero}</span>
                <span className={venc ? 'text-red-500 font-medium' : ''}>{fechaSolo(c.fecha_limite)}{venc ? ' · vencida' : ''}</span>
                <span className={`font-medium ${pend === 0 ? 'text-marca' : venc ? 'text-red-500' : ''}`}>
                  {pend === 0 ? 'Pagada' : Number(c.pagado) > 0 ? `Falta ${dinero(pend)}` : dinero(c.valor)}
                </span>
              </li>
            )
          })}
        </ul>
      </div>

      <div>
        <p className="text-sm font-semibold mb-2">Historial de pagos</p>
        {pagos.length === 0 ? (
          <p className="text-xs text-slate-400">Aún no hay pagos</p>
        ) : (
          <ul className="rounded-2xl bg-slate-50 divide-y divide-white text-xs">
            {pagos.map(g => (
              <li key={g.id} className="grid grid-cols-[1fr_auto] gap-2 px-3 py-2">
                <span>{fechaHora(g.fecha)} · {textoMetodo(g.metodo)}</span>
                <span className="font-medium text-marca">{dinero(g.monto)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {p.nota && <p className="text-xs text-slate-400">{p.nota}</p>}
      {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}

      {activo && (cancelando ? (
        <div className="space-y-2">
          <Campo etiqueta="Motivo de la cancelación">
            <input value={motivo} onChange={e => setMotivo(e.target.value)} className={claseInput} />
          </Campo>
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => setCancelando(false)} className="h-11 rounded-xl bg-slate-100 text-slate-600 text-sm">Volver</button>
            <button onClick={cancelar} disabled={trabajando} className="h-11 rounded-xl bg-red-500 text-white text-sm font-semibold disabled:opacity-40">Cancelar préstamo</button>
          </div>
        </div>
      ) : (
        <button onClick={() => setCancelando(true)} className="w-full h-10 text-xs text-red-500">Cancelar este préstamo</button>
      ))}
    </Modal>
  )
}
