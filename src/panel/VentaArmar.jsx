// Armar la venta: buscar o escanear, y revisar lo que lleva (cantidad, descuento por producto).
import { useMemo, useState } from 'react'
import { cop } from '../lib/pedido'
import { aNumero } from '../lib/caja'
import { Btn, Aviso, Cantidad, BarraFija, clsInput } from '../tienda/ui'
import { Seccion } from './piezas'

export default function VentaArmar({ productos, error, venta, lineas, mover, ponerDescLinea, calc, calculando, errTotal, items, lista, onCobrar, onDescartar }) {
  const [q, setQ] = useState('')
  const [abiertoDesc, setAbiertoDesc] = useState({})
  const [confirmar, setConfirmar] = useState(false)
  const carrito = venta.carrito

  const visibles = useMemo(() => {
    if (!productos) return []
    const t = q.trim().toLowerCase()
    if (!t) return productos.slice(0, 40)
    return productos.filter((p) => p.nombre.toLowerCase().includes(t) || (p.codigo || '') === t || (p.categoria || '').toLowerCase().includes(t)).slice(0, 40)
  }, [productos, q])

  const alEscribir = (e) => {
    if (e.key !== 'Enter') return
    const exacto = productos?.find((p) => p.codigo && p.codigo === q.trim())
    if (exacto) { mover(exacto.id, (carrito[exacto.id] || 0) + 1); setQ('') }
  }

  return (
    <div className="pb-44">
      {error && <div className="mb-4"><Aviso tipo="error">{error}</Aviso></div>}

      {lineas.length > 0 && (
        <Seccion titulo="En esta venta">
          <div className="space-y-3">
            {lineas.map(({ producto: p, cantidad: c }) => {
              const bruto = Math.round(Number(p.precio_venta) * c)
              const d = aNumero(venta.descLinea[p.id])
              const invalido = d >= bruto
              return (
                <div key={p.id} className="rounded-2xl border-2 border-black/10 p-3">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="break-words text-lg font-bold leading-snug">{p.nombre}</span>
                    <span className="shrink-0 text-xl font-bold text-principal">{cop(Math.max(bruto - d, 0))}</span>
                  </div>
                  <p className="mb-2 text-base text-tinta/60">{cop(p.precio_venta)} c/u{d > 0 && !invalido ? ` · descuento ${cop(d)}` : ''}</p>
                  <Cantidad valor={c} onMenos={() => mover(p.id, c - 1)} onMas={() => mover(p.id, c + 1)} max={9999} />
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <button type="button" onClick={() => setAbiertoDesc((a) => ({ ...a, [p.id]: !a[p.id] }))} className="min-h-[52px] rounded-2xl border-2 border-black/10 bg-white text-lg font-semibold">{d > 0 ? 'Cambiar descuento' : 'Descuento'}</button>
                    <button type="button" onClick={() => mover(p.id, 0)} className="min-h-[52px] rounded-2xl border-2 border-red-200 bg-white text-lg font-semibold text-red-800">Quitar</button>
                  </div>
                  {(abiertoDesc[p.id] || d > 0) && (
                    <div className="mt-2">
                      <input className={clsInput} inputMode="numeric" placeholder="Descuento en $ para este producto" value={venta.descLinea[p.id] || ''} onChange={(e) => ponerDescLinea(p.id, e.target.value)} aria-label={`Descuento de ${p.nombre}`} />
                      {invalido && <p className="mt-1 text-base font-semibold text-red-700">El descuento debe ser menor que lo que vale el producto ({cop(bruto)}).</p>}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </Seccion>
      )}

      <input className={`${clsInput} mb-4`} placeholder="Buscar producto o escanear código" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={alEscribir} />
      {!productos && !error && <p className="py-8 text-center text-xl text-tinta/60">Cargando productos…</p>}
      {productos?.length === 0 && <Aviso>Aún no tienes productos. Créalos en «Productos» para poder vender.</Aviso>}
      <div className="grid grid-cols-1 gap-2">
        {visibles.map((p) => {
          const c = carrito[p.id] || 0
          return (
            <div key={p.id} className={`rounded-2xl border-2 p-3 ${c > 0 ? 'border-principal bg-principal/5' : 'border-black/10 bg-white'}`}>
              <div className="flex items-baseline justify-between gap-3">
                <span className="break-words text-lg font-bold leading-snug">{p.nombre}</span>
                <span className="shrink-0 text-xl font-bold text-principal">{cop(p.precio_venta)}</span>
              </div>
              <p className="text-base text-tinta/60">{p.es_kit ? 'Combo' : `Hay ${Number(p.stock)} ${p.unidad}`}{!p.es_kit && Number(p.stock) <= 0 ? ' · agotado en el sistema' : ''}</p>
              <div className="mt-2">
                {c === 0 ? <Btn variante="suave" type="button" onClick={() => mover(p.id, 1)}>Agregar</Btn>
                  : <Cantidad valor={c} onMenos={() => mover(p.id, c - 1)} onMas={() => mover(p.id, c + 1)} max={9999} />}
              </div>
            </div>
          )
        })}
      </div>
      {productos && visibles.length === 0 && <p className="py-6 text-center text-lg text-tinta/60">No encontramos ese producto.</p>}

      {items > 0 && (
        <div className="mt-6">
          {!confirmar
            ? <Btn variante="suave" type="button" onClick={() => setConfirmar(true)}>Descartar esta venta</Btn>
            : (
              <div className="rounded-2xl border-2 border-red-200 bg-white p-4">
                <p className="mb-3 text-lg font-semibold">¿Descartar esta venta? Se borra lo que llevas.</p>
                <div className="grid grid-cols-2 gap-2">
                  <Btn variante="suave" type="button" onClick={() => setConfirmar(false)}>No, seguir</Btn>
                  <Btn type="button" onClick={() => { setConfirmar(false); onDescartar() }}>Sí, descartar</Btn>
                </div>
              </div>
            )}
        </div>
      )}

      <BarraFija>
        <div className="mb-2 flex items-baseline justify-between">
          <span className="text-xl">{items > 0 ? `${items} ${items === 1 ? 'producto' : 'productos'}` : 'Sin productos'}</span>
          <span className="text-3xl font-bold text-principal">{items === 0 ? '$0' : calc ? cop(calc.total) : '…'}</span>
        </div>
        {calc && lista > calc.total && <p className="mb-1 text-base text-green-800">Incluye promociones y descuentos: ahorro de {cop(lista - calc.total)}</p>}
        {errTotal && <p className="mb-1 text-base font-semibold text-red-700">{errTotal}</p>}
        <Btn disabled={items === 0 || !calc || calculando} onClick={onCobrar}>{calculando ? 'Calculando…' : 'Cobrar'}</Btn>
      </BarraFija>
    </div>
  )
}
