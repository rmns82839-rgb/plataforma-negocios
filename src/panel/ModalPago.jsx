// Un pago, una forma: se abre al tocar «Efectivo», «Nequi», «Fiado»… y pide solo lo que esa forma necesita.
import { useState } from 'react'
import { cop } from '../lib/pedido'
import { aNumero, BILLETES, comisionDe } from '../lib/caja'
import { Btn, Volver, Aviso, Campo, clsInput } from '../tienda/ui'
import ClienteSelector from './ClienteSelector'

const PLAZOS = [[0, 'Sin fecha'], [7, '7 días'], [15, '15 días'], [30, '30 días']]

export default function ModalPago({ forma, falta, nid, cliente, onCliente, plazo, onPlazo, soloLectura, onConfirmar, onCerrar }) {
  const [texto, setTexto] = useState(String(falta))
  const [recibido, setRecibido] = useState('')
  const [error, setError] = useState('')
  const monto = aNumero(texto)
  const efectivo = forma.tipo === 'efectivo'
  const fiado = forma.tipo === 'fiado'
  const rec = aNumero(recibido)
  const comision = comisionDe(forma, monto)

  function confirmar() {
    if (!(monto > 0)) return setError('Escribe cuánto va a pagar con esta forma')
    if (monto > falta) return setError(`No puede ser más de lo que falta (${cop(falta)})`)
    if (fiado && !cliente) return setError('Para fiar, elige primero el cliente')
    if (efectivo && rec > 0 && rec < monto) return setError('El efectivo recibido es menor que el valor a pagar')
    onConfirmar({ metodo: forma.id, monto, ...(efectivo && rec > monto ? { recibido: rec } : {}) })
  }

  return (
    <div role="dialog" aria-modal="true" aria-label={`Pagar con ${forma.nombre}`} className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center">
      <div className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-papel p-5 sm:rounded-3xl" style={{ paddingBottom: 'max(1.25rem, env(safe-area-inset-bottom))' }}>
        <Volver onClick={onCerrar} texto="Volver" />
        <h3 className="break-words text-3xl font-bold leading-tight">Pagar con {forma.nombre}</h3>
        <div className="my-4 rounded-2xl border-2 border-principal/20 bg-white p-4 text-center">
          <p className="text-lg text-tinta/70">Falta por pagar</p>
          <p className="text-4xl font-bold text-principal">{cop(falta)}</p>
        </div>

        {error && <div className="mb-3"><Aviso tipo="error">{error}</Aviso></div>}

        <Campo etiqueta={fiado ? '¿Cuánto se le fía?' : '¿Cuánto paga con esto?'} ayuda={monto > 0 && monto < falta ? `Después te preguntaremos con qué paga los ${cop(falta - monto)} que faltan.` : undefined}>
          <input autoFocus className={clsInput} inputMode="numeric" value={texto} onChange={(e) => { setTexto(e.target.value); setError('') }} placeholder="$ 0" />
        </Campo>
        {monto > 0 && <p className="mt-1 text-xl font-bold text-principal">{cop(monto)}</p>}

        {efectivo && (
          <div className="mt-4">
            <p className="mb-2 text-lg font-semibold">¿Con cuánto paga?</p>
            <div className="grid grid-cols-2 gap-2" role="group" aria-label="Billetes">
              <button type="button" aria-pressed={rec === 0} onClick={() => setRecibido('')}
                className={`min-h-[60px] rounded-2xl border-2 px-2 text-xl font-bold ${rec === 0 ? 'border-principal bg-principal text-white' : 'border-black/10 bg-white'}`}>Exacto</button>
              {BILLETES.map((b) => (
                <button key={b} type="button" disabled={b < monto} aria-pressed={rec === b} onClick={() => setRecibido(String(b))}
                  className={`min-h-[60px] rounded-2xl border-2 px-2 text-xl font-bold disabled:opacity-30 ${rec === b ? 'border-principal bg-principal text-white' : 'border-black/10 bg-white'}`}>{cop(b)}</button>
              ))}
            </div>
            <div className="mt-3"><Campo etiqueta="Otro valor"><input className={clsInput} inputMode="numeric" placeholder="$ 0" value={rec > 0 && !BILLETES.includes(rec) ? recibido : ''} onChange={(e) => setRecibido(e.target.value)} /></Campo></div>
            {rec > monto && monto > 0 && <p className="mt-3 rounded-2xl bg-green-50 p-3 text-center text-2xl font-bold text-green-900">Devuelve {cop(rec - monto)}</p>}
          </div>
        )}

        {fiado && (
          <div className="mt-4 space-y-4">
            <div>
              <p className="mb-2 text-lg font-semibold">¿A quién se le fía?</p>
              <ClienteSelector nid={nid} cliente={cliente} onElegir={onCliente} soloLectura={soloLectura} obligatorio />
            </div>
            <div>
              <p className="mb-2 text-lg font-semibold">¿En cuánto tiempo paga?</p>
              <div className="grid grid-cols-2 gap-2" role="group" aria-label="Plazo">
                {PLAZOS.map(([d, t]) => (
                  <button key={d} type="button" aria-pressed={plazo === d} onClick={() => onPlazo(d)}
                    className={`min-h-[56px] rounded-2xl border-2 px-2 text-lg font-bold ${plazo === d ? 'border-principal bg-principal text-white' : 'border-black/10 bg-white'}`}>{t}</button>
                ))}
              </div>
              <p className="mt-2 text-base text-tinta/60">«Sin fecha» usa los días de crédito que tenga el cliente.</p>
            </div>
          </div>
        )}

        {comision > 0 && <p className="mt-4 rounded-2xl bg-amber-50 p-3 text-lg text-amber-950">{forma.nombre} cobra {Number(forma.comision).toLocaleString('es-CO')} % de comisión: {cop(comision)}. La paga la tienda, no el cliente.</p>}

        <div className="mt-5"><Btn variante="verde" onClick={confirmar}>{monto === falta ? `Pagar ${cop(monto)}` : 'Agregar este pago'}</Btn></div>
      </div>
    </div>
  )
}
