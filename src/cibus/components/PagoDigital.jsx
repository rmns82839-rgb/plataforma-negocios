// Pago por Nequi, Llave o Daviplata: el cliente elige, ve el número, paga en su app y avisa.
import { useEffect, useRef, useState } from 'react'
import { dinero } from '../lib/formato'
import { claseInput } from '../lib/estilos'
import { useCopiado } from '../lib/useCopiado'
import { MEDIOS_DIGITALES, textoMedio, numeroBonito, registrarPago } from '../lib/pagoDigital'

/** Selector al pedir: pagar al recibir o por uno de los medios que acepta la tienda (cuadrícula pareja). */
export function ElegirPago({ config, valor, onCambio }) {
  if (!config) return null
  const medios = MEDIOS_DIGITALES.filter(m => (config.medios ?? []).includes(m.id))
  const opciones = [{ id: '', texto: 'Pagar al recibir' }, ...medios]
  return (
    <div className="space-y-2" role="group" aria-label="Cómo pagas">
      <p className="text-base font-semibold text-slate-700">¿Cómo pagas?</p>
      <div className="grid grid-cols-2 gap-2">
        {opciones.map(o => (
          <button key={o.id || 'recibir'} type="button" onClick={() => onCambio(o.id)} aria-pressed={valor === o.id}
            className={`min-h-12 px-2 rounded-xl text-base font-semibold break-words ${valor === o.id ? 'bg-white text-cibus ring-2 ring-cibus shadow-sm' : 'bg-slate-100 text-slate-600'}`}>
            {o.texto}
          </button>
        ))}
      </div>
      {valor && <p className="text-sm text-slate-500 break-words">Al enviar el pedido te mostramos el número para pagar {textoMedio(valor)}.</p>}
    </div>
  )
}

/** Tarjeta que aparece después de enviar el pedido: número, valor, copiar y «Ya pagué». */
export function TarjetaPagoDigital({ config, pedidoId, medio, total, porConfirmar = false }) {
  const [copiado, copiar] = useCopiado()
  const [ref, setRef] = useState('')
  const [estado, setEstado] = useState('pendiente')       // pendiente | enviando | avisado
  const [error, setError] = useState('')
  const caja = useRef(null)
  useEffect(() => { caja.current?.scrollIntoView?.({ block: 'center', behavior: 'smooth' }) }, [])   // al enviar, la tarjeta queda a la vista
  if (!config || !medio) return null
  const numero = String(config.numero ?? '')

  const yaPague = async () => {
    setEstado('enviando'); setError('')
    const r = await registrarPago(pedidoId, medio, true, ref.trim())
    if (r.ok) setEstado('avisado')
    else { setEstado('pendiente'); setError('No pudimos avisar. Escríbenos por WhatsApp con tu comprobante.') }
  }

  return (
    <div ref={caja} className="rounded-2xl bg-white text-slate-800 px-4 py-4 space-y-3 shadow-sm" aria-live="polite">
      <p className="text-base font-bold break-words">Paga por {textoMedio(medio)}</p>
      <div className="grid grid-cols-[1fr_auto] gap-3 items-center rounded-xl bg-slate-50 px-3 py-3">
        <div className="min-w-0">
          <p className="text-xs text-slate-500">Número{config.titular ? ` · ${config.titular}` : ''}</p>
          <p className="text-2xl font-bold tracking-wide tabular-nums">{numeroBonito(numero)}</p>
        </div>
        <button type="button" onClick={() => copiar(numero)} className="h-12 px-4 rounded-xl bg-cibus text-white text-sm font-semibold">
          {copiado === 'ok' ? '¡Copiado!' : 'Copiar'}
        </button>
      </div>
      <p className="flex justify-between text-base"><span className="text-slate-500">Valor a pagar</span><b>{dinero(total)}</b></p>
      {porConfirmar && <p className="rounded-xl bg-amber-50 text-amber-800 px-3 py-2 text-sm font-semibold break-words">Este valor NO incluye el domicilio. La tienda te dice cuánto es por WhatsApp: espera ese mensaje antes de pagar.</p>}
      <p className="text-sm text-slate-500 break-words">Abre tu app de {textoMedio(medio)}, envía el valor a ese número y vuelve aquí a tocar «Ya pagué».</p>
      {estado === 'avisado' ? (
        <p className="rounded-xl bg-green-50 text-green-800 px-3 py-3 text-base font-semibold break-words">¡Gracias! Avisamos a la tienda. Te confirmamos cuando veamos el pago.</p>
      ) : (
        <>
          <input value={ref} onChange={e => setRef(e.target.value)} maxLength={40} className={claseInput} placeholder="Referencia del pago (opcional)" aria-label="Referencia del pago" />
          {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2 break-words">{error}</p>}
          <button type="button" onClick={yaPague} disabled={estado === 'enviando'} className="w-full h-14 rounded-xl bg-marca text-white text-lg font-semibold disabled:opacity-50">
            {estado === 'enviando' ? 'Avisando…' : 'Ya pagué'}
          </button>
        </>
      )}
    </div>
  )
}
