// Cobrar: cliente, descuento general y pagos (uno o varios). Lo que falta se cobra con cualquier forma, incluido el fiado.
import { useState } from 'react'
import { cop } from '../lib/pedido'
import { faltante, sumaPagos, cambioTotal, spansMetodos, agregarPago } from '../lib/caja'
import { Btn, Volver, Aviso, BarraFija, clsInput } from '../tienda/ui'
import { Titulo, Seccion, Opciones } from './piezas'
import ClienteSelector from './ClienteSelector'
import ModalPago from './ModalPago'

export default function VentaCobrar({ nid, sim, venta, cambiar, formas, calc, calculando, errTotal, error, ocupado, onVolver, onRegistrar }) {
  const [forma, setForma] = useState(null)
  const total = calc?.total ?? null
  const pagos = venta.pagos
  const falta = total != null ? faltante(pagos, total) : null
  const spans = spansMetodos(formas.length)
  const usaFiado = pagos.some((p) => formas.find((f) => f.id === p.metodo)?.tipo === 'fiado')
  const devuelve = cambioTotal(pagos)
  const quitar = (m) => cambiar({ pagos: pagos.filter((p) => p.metodo !== m) })
  const pct = venta.descTipo === 'pct'
  const listo = total != null && falta === 0 && !(usaFiado && !venta.cliente) && !calculando

  return (
    <div className="pb-64">
      <Volver onClick={onVolver} texto="Volver a los productos" />
      <Titulo>Cobrar</Titulo>
      {(error || errTotal) && <div className="mb-4"><Aviso tipo="error">{error || errTotal}</Aviso></div>}

      <Seccion titulo="Cliente (opcional)">
        <ClienteSelector nid={nid} cliente={venta.cliente} onElegir={(c) => cambiar({ cliente: c })} soloLectura={sim} />
      </Seccion>

      <Seccion titulo="Descuento general (opcional)">
        <div className="grid grid-cols-3 gap-2" role="group" aria-label="Descuentos rápidos">
          {[['Ninguno', null], ['5 %', '5'], ['10 %', '10']].map(([t, v]) => {
            const activo = v === null ? !venta.descValor : pct && venta.descValor === v
            return <button key={t} type="button" aria-pressed={activo} onClick={() => cambiar(v === null ? { descValor: '', pagos: [] } : { descTipo: 'pct', descValor: v, pagos: [] })}
              className={`min-h-[60px] rounded-2xl border-2 px-2 text-xl font-bold ${activo ? 'border-principal bg-principal text-white' : 'border-black/10 bg-white'}`}>{t}</button>
          })}
        </div>
        <div className="mt-3"><Opciones valor={venta.descTipo} opciones={[['monto', 'Otro valor en $'], ['pct', 'Otro valor en %']]} onChange={(v) => cambiar({ descTipo: v, descValor: '', pagos: [] })} /></div>
        <input className={`${clsInput} mt-3`} inputMode="numeric" placeholder={pct ? '% de descuento' : '$ de descuento'} aria-label="Valor del descuento" value={venta.descValor} onChange={(e) => cambiar({ descValor: e.target.value, pagos: [] })} />
        {calc?.desc > 0 && <p className="mt-2 text-xl font-bold text-green-800">Descuento: −{cop(calc.desc)}</p>}
      </Seccion>

      {pagos.length > 0 && (
        <Seccion titulo="Pagos recibidos">
          <div className="space-y-2">
            {pagos.map((p) => {
              const f = formas.find((x) => x.id === p.metodo)
              return (
                <div key={p.metodo} className="grid grid-cols-[1fr_auto] items-center gap-3 rounded-2xl border-2 border-black/10 p-3">
                  <div>
                    <p className="break-words text-lg font-bold leading-snug">{f?.nombre || p.metodo}</p>
                    <p className="text-xl font-bold text-principal">{cop(p.monto)}</p>
                    {p.recibido > p.monto && <p className="text-base text-tinta/70">Recibió {cop(p.recibido)} · devuelve {cop(p.recibido - p.monto)}</p>}
                  </div>
                  <button type="button" onClick={() => quitar(p.metodo)} className="min-h-[56px] rounded-2xl border-2 border-red-200 bg-white px-4 text-lg font-semibold text-red-800">Quitar</button>
                </div>
              )
            })}
          </div>
        </Seccion>
      )}

      {falta != null && falta > 0 && (
        <Seccion titulo={pagos.length === 0 ? '¿Cómo paga?' : `Falta ${cop(falta)}: ¿con qué paga el resto?`}>
          <div className="grid grid-cols-6 gap-2" role="group" aria-label="Forma de pago">
            {formas.map((f, i) => (
              <button key={f.id} type="button" onClick={() => setForma(f)}
                className={`${spans[i]} flex min-h-[72px] items-center justify-center rounded-2xl border-2 border-black/10 bg-white px-1 text-center text-lg font-bold leading-tight active:scale-[0.99]`}>{f.nombre}</button>
            ))}
          </div>
        </Seccion>
      )}
      {falta === 0 && usaFiado && !venta.cliente && <Aviso tipo="error">Para fiar, elige un cliente arriba.</Aviso>}

      <BarraFija>
        {calc && calc.desc > 0 && <div className="flex items-baseline justify-between text-lg text-tinta/70"><span>Subtotal {cop(calc.base)}</span><span>Descuento −{cop(calc.desc)}</span></div>}
        <div className="mb-1 flex items-baseline justify-between"><span className="text-xl">Total a cobrar</span><span className="text-3xl font-bold text-principal">{total != null ? cop(total) : '…'}</span></div>
        <div className="mb-2 grid grid-cols-2 gap-2 text-center">
          <div className="rounded-xl bg-black/5 py-1"><p className="text-sm text-tinta/70">Pagado</p><p className="text-xl font-bold">{cop(sumaPagos(pagos))}</p></div>
          <div className={`rounded-xl py-1 ${falta === 0 ? 'bg-green-100' : 'bg-amber-100'}`}><p className="text-sm text-tinta/70">{falta === 0 ? 'Completo' : 'Falta'}</p><p className="text-xl font-bold">{falta != null && falta > 0 ? cop(falta) : '✓'}</p></div>
        </div>
        {devuelve > 0 && <p className="mb-1 text-center text-xl font-bold text-green-800">Devuelve {cop(devuelve)}</p>}
        <Btn variante="verde" disabled={ocupado || !listo} onClick={onRegistrar}>{ocupado ? 'Registrando…' : 'Registrar venta'}</Btn>
      </BarraFija>

      {forma && (
        <ModalPago forma={forma} falta={falta} nid={nid} cliente={venta.cliente} onCliente={(c) => cambiar({ cliente: c })} plazo={venta.plazo} onPlazo={(d) => cambiar({ plazo: d })} soloLectura={sim}
          onCerrar={() => setForma(null)}
          onConfirmar={(p) => { cambiar({ pagos: agregarPago(pagos, p) }); setForma(null) }} />
      )}
    </div>
  )
}
