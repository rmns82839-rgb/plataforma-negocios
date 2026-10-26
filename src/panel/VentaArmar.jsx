// Armar la venta: buscar o escanear, y revisar lo que lleva (cantidad, descuento por producto).
import { useMemo, useState } from 'react'
import { cop } from '../lib/pedido'
import { aNumero } from '../lib/caja'
import { esPeso, pasoPeso, atajosPeso, leerPeso, sumarPeso, textoCantidad } from '../lib/pesaje'
import { Btn, Aviso, Cantidad, BarraFija, clsInput } from '../tienda/ui'
import { Seccion } from './piezas'

// Cantidad de un producto por peso: se puede escribir (1,5) o mover de a poquito
function CantidadPeso({ valor, unidad, onCambiar }) {
  const [t, setT] = useState(String(valor).replace('.', ','))
  const paso = pasoPeso(unidad)
  const cambiar = (n) => { onCambiar(n); setT(String(n).replace('.', ',')) }
  return (
    <div>
      <div className="grid grid-cols-[56px_1fr_56px] items-center gap-1">
        <button type="button" onClick={() => cambiar(Math.max(sumarPeso(valor, -paso), 0))} aria-label="Quitar un poco" className="h-14 rounded-2xl border-2 border-principal/30 bg-white text-3xl font-bold text-principal">−</button>
        <div className="flex items-center justify-center gap-2">
          <input aria-label={`Cantidad en ${unidad}`} inputMode="decimal" value={t} onChange={(e) => { setT(e.target.value); const n = leerPeso(e.target.value); if (n) onCambiar(n) }} className="h-14 w-24 rounded-2xl border-2 border-black/15 bg-white text-center text-2xl font-bold outline-none focus:border-principal" />
          <span className="text-lg font-semibold">{unidad}</span>
        </div>
        <button type="button" onClick={() => cambiar(sumarPeso(valor, paso))} aria-label="Agregar un poco" className="h-14 rounded-2xl bg-principal text-3xl font-bold text-white">+</button>
      </div>
    </div>
  )
}

// Agregar un producto por peso: se escribe cuánto pesa o se toca un atajo
function PesarProducto({ p, onAgregar, onCancelar }) {
  const [t, setT] = useState('')
  const n = leerPeso(t)
  return (
    <div className="mt-2 rounded-2xl border-2 border-principal/30 bg-white p-3">
      <button type="button" onClick={onCancelar} className="mb-2 min-h-[44px] text-lg font-semibold text-principal">← Volver</button>
      <p className="mb-2 text-lg font-semibold">¿Cuántos {p.unidad}?</p>
      <div className="grid grid-cols-4 gap-2" role="group" aria-label="Atajos">
        {atajosPeso(p.unidad).map((a) => <button key={a} type="button" aria-pressed={n === a} onClick={() => setT(String(a).replace('.', ','))} className={`min-h-[56px] rounded-2xl border-2 px-1 text-lg font-bold ${n === a ? 'border-principal bg-principal text-white' : 'border-black/10 bg-white'}`}>{textoCantidad(a)}</button>)}
      </div>
      <input autoFocus className={`${clsInput} mt-3`} inputMode="decimal" placeholder={`Otro valor en ${p.unidad} (ej: 1,5)`} value={t} onChange={(e) => setT(e.target.value)} />
      {n && <p className="mt-2 text-xl font-bold text-principal">{textoCantidad(n)} {p.unidad} = {cop(Math.round(Number(p.precio_venta) * n))}</p>}
      <div className="mt-3"><Btn disabled={!n} onClick={() => onAgregar(n)}>Agregar a la venta</Btn></div>
    </div>
  )
}

export default function VentaArmar({ productos, error, venta, lineas, mover, ponerDescLinea, calc, calculando, errTotal, items, lista, onCobrar, onDescartar }) {
  const [q, setQ] = useState('')
  const [abiertoDesc, setAbiertoDesc] = useState({})
  const [confirmar, setConfirmar] = useState(false)
  const [pesando, setPesando] = useState(null)
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
                  <p className="mb-2 text-base text-tinta/60">{cop(p.precio_venta)} {esPeso(p.unidad) ? `por ${p.unidad}` : 'c/u'}{d > 0 && !invalido ? ` · descuento ${cop(d)}` : ''}</p>
                  {esPeso(p.unidad)
                    ? <CantidadPeso key={c} valor={c} unidad={p.unidad} onCambiar={(n) => mover(p.id, n)} />
                    : <Cantidad valor={c} onMenos={() => mover(p.id, c - 1)} onMas={() => mover(p.id, c + 1)} max={9999} />}
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
              <p className="text-base text-tinta/60">{p.es_kit ? 'Combo' : `Hay ${textoCantidad(p.stock)} ${p.unidad}`}{!p.es_kit && Number(p.stock) <= 0 ? ' · agotado en el sistema' : ''}</p>
              <div className="mt-2">
                {c === 0
                  ? (esPeso(p.unidad)
                    ? (pesando === p.id ? <PesarProducto p={p} onCancelar={() => setPesando(null)} onAgregar={(n) => { mover(p.id, n); setPesando(null) }} /> : <Btn variante="suave" type="button" onClick={() => setPesando(p.id)}>Pesar y agregar</Btn>)
                    : <Btn variante="suave" type="button" onClick={() => mover(p.id, 1)}>Agregar</Btn>)
                  : esPeso(p.unidad) ? <p className="text-lg font-semibold text-principal">✓ Ya está en la venta: {textoCantidad(c)} {p.unidad}</p>
                    : <Cantidad valor={c} onMenos={() => mover(p.id, c - 1)} onMas={() => mover(p.id, c + 1)} max={9999} />}
              </div>
            </div>
          )
        })}
      </div>
      {productos && visibles.length === 0 && <p className="py-6 text-center text-lg text-tinta/60">No encontramos ese producto.</p>}

      {lineas.length > 0 && (
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
          <span className="text-xl">{lineas.length > 0 ? `${lineas.length} ${lineas.length === 1 ? 'producto' : 'productos'}` : 'Sin productos'}</span>
          <span className="text-3xl font-bold text-principal">{lineas.length === 0 ? '$0' : calc ? cop(calc.total) : '…'}</span>
        </div>
        {calc && lista > calc.total && <p className="mb-1 text-base text-green-800">Incluye promociones y descuentos: ahorro de {cop(lista - calc.total)}</p>}
        {errTotal && <p className="mb-1 text-base font-semibold text-red-700">{errTotal}</p>}
        <Btn disabled={lineas.length === 0 || !calc || calculando} onClick={onCobrar}>{calculando ? 'Calculando…' : 'Cobrar'}</Btn>
      </BarraFija>
    </div>
  )
}
