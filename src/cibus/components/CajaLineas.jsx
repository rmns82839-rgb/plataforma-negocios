// Productos de la venta en curso, en grande: cada línea muestra cantidad, precio y valor.
// "Ajustar" cambia el precio o da un descuento SOLO en esta venta (el inventario no se toca).
import { dinero, numero, aNumero } from '../lib/formato'
import { claseInput } from '../lib/estilos'
import { useEffect } from 'react'
import CajaPeso from './CajaPeso'
import Miniatura from './Miniatura'
import { usePersistido, TREINTA_MIN } from '../lib/usePersistido'
import { normalizar } from '../lib/buscar'
import { esPesable } from '../lib/pesaje'
import { precioLista, precioDe, precioBase, esManual, descuentoLinea, promoLinea, brutoLinea, netoLinea, tieneAjuste, minimoLinea, bajoMinimo, minimoDe } from '../lib/venta'

const PORCENTAJES = [5, 10]

function Ajuste({ l, margen, dueno, onCambiar }) {
  const lista = precioLista(l)
  const minimo = minimoDe(l, margen)
  const bajo = bajoMinimo(l, margen)
  return (
    <div className="col-span-2 rounded-2xl bg-hueso p-3 lg:p-4 space-y-3 ring-1 ring-oro/20">
      <div className="grid grid-cols-2 gap-3">
        <label className="space-y-1">
          <span className="text-xs font-medium text-slate-500">Precio de esta venta (c/u)</span>
          <input value={l.precioTxt ?? String(precioDe(l))} inputMode="numeric"
                 onChange={e => onCambiar({ precioTxt: e.target.value, precio: aNumero(e.target.value) || undefined })}
                 onFocus={e => e.target.select()} className={claseInput} />
        </label>
        <label className="space-y-1">
          <span className="text-xs font-medium text-slate-500">Descuento en pesos</span>
          <input value={l.descuentoTxt ?? (descuentoLinea(l) ? String(descuentoLinea(l)) : '')} inputMode="numeric" placeholder="0"
                 onChange={e => onCambiar({ descuentoTxt: e.target.value, descuento: aNumero(e.target.value) })}
                 onFocus={e => e.target.select()} className={claseInput} />
        </label>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {PORCENTAJES.map(p => (
          <button key={p} onClick={() => { const v = Math.round(brutoLinea({ ...l, descuento: 0 }) * p / 100); onCambiar({ descuento: v, descuentoTxt: String(v) }) }}
            className="h-10 rounded-xl bg-white text-xs font-medium text-slate-600 ring-1 ring-slate-200 active:bg-slate-50">
            {p} %
          </button>
        ))}
        <button onClick={() => onCambiar({ precio: undefined, precioTxt: undefined, descuento: 0, descuentoTxt: undefined })}
          className="h-10 rounded-xl bg-white text-xs font-medium text-slate-600 ring-1 ring-slate-200 active:bg-slate-50">
          Quitar ajustes
        </button>
      </div>
      <p className="text-xs text-slate-500">
        Precio de lista {dinero(lista)}{l.auto ? ` · mayorista ${dinero(precioBase(l))}` : ''}
        {minimo > 0 && <> · mínimo permitido {dinero(minimo)}</>}
      </p>
      {bajo && (
        <p className="text-sm rounded-lg px-3 py-2 text-red-600 bg-red-50">
          {dueno ? `Queda por debajo del mínimo (${dinero(minimoLinea(l, margen))}). Como dueño puedes venderlo así.`
                 : `No puede quedar por debajo de ${dinero(minimoLinea(l, margen))}. Sube el precio o quita el descuento.`}
        </p>
      )}
    </div>
  )
}

export default function CajaLineas({ lineas, ultimoId, editandoId, pesandoId, onPesar, margen, dueno, onEditar, onCantidad, onEscribir, onCerrarCantidad, onQuitar, onAjuste }) {
  const [filtro, setFiltro] = usePersistido('caja:filtroLineas', '', true, TREINTA_MIN)   // buscador discreto dentro de la venta en curso
  // al escanear o agregar un producto se limpia el buscador para que el nuevo se vea arriba
  useEffect(() => { if (ultimoId) setFiltro('') }, [ultimoId, setFiltro])
  if (lineas.length === 0) {
    return (
      <div className="bg-white rounded-3xl shadow-sm px-6 py-10 lg:py-16 text-center">
        <p className="text-base lg:text-xl text-slate-400">Escanea un producto para empezar la venta</p>
      </div>
    )
  }
  const unidades = lineas.reduce((s, l) => s + l.cantidad, 0)
  // Buscador: los productos cuyo nombre (o alguna palabra) empieza con lo escrito, los que empiezan de primero
  const q = normalizar(filtro).trim()
  const rango = (l) => { const n = normalizar(l.producto.nombre); return n.startsWith(q) ? 0 : n.split(/\s+/).some(w => w.startsWith(q)) ? 1 : 2 }
  // sort estable: los que no coinciden siguen en su orden, abajo
  const visibles = q ? [...lineas].sort((a, b) => rango(a) - rango(b)) : lineas
  return (
    <div className="bg-white rounded-3xl shadow-sm overflow-hidden">
      <div className="px-4 lg:px-6 py-3 bg-negro text-champagne grid grid-cols-2 text-xs lg:text-sm uppercase tracking-[0.18em]">
        <span>{lineas.length} {lineas.length === 1 ? 'producto' : 'productos'}</span>
        <span className="text-right">{numero(unidades)} {unidades === 1 ? 'unidad' : 'unidades'}</span>
      </div>
      {lineas.length >= 3 && (
        <div className="px-3 lg:px-6 py-2 border-b border-slate-100 grid grid-cols-[1fr_auto] gap-2 items-center">
          <input value={filtro} onChange={e => setFiltro(e.target.value)} aria-label="Buscar en la venta"
                 placeholder="Buscar en la venta (letra inicial)" className="h-9 min-w-0 rounded-lg bg-slate-50 px-3 text-sm outline-none focus:ring-1 focus:ring-oro" />
          {filtro
            ? <button onClick={() => setFiltro('')} aria-label="Limpiar búsqueda" className="h-9 w-9 rounded-full bg-slate-100 text-slate-500 text-sm">✕</button>
            : <span className="w-9" />}
        </div>
      )}
      {q && rango(visibles[0]) === 2 && (
        <p className="px-4 py-2 text-center text-xs text-slate-400">Ningún producto de la venta empieza con «{filtro}»</p>
      )}
      <ul className="divide-y divide-slate-100">
        {visibles.map(l => {
          const p = l.producto
          const ajustada = tieneAjuste(l)
          const bajo = bajoMinimo(l, margen)
          const dl = descuentoLinea(l)
          return (
            <li key={p.id}
                className={`p-3 lg:px-6 lg:py-4 grid grid-cols-[1fr_auto] gap-x-4 gap-y-3 items-center transition-colors duration-700 ${
                  ultimoId === p.id ? 'bg-champagne/25' : ''}`}>
              <div className="min-w-0 grid grid-cols-[auto_1fr] gap-3 items-center">
                <Miniatura producto={p} tam="h-14 w-14 lg:h-16 lg:w-16" />
                <div className="min-w-0">
                <p className="text-base lg:text-2xl font-semibold leading-tight truncate">{p.nombre}</p>
                <p className="text-xs lg:text-base text-slate-500 mt-0.5">
                  {precioDe(l) !== precioLista(l) && (
                    <span className="line-through text-slate-400 mr-1.5">{dinero(precioLista(l))}</span>
                  )}
                  {dinero(precioDe(l))} {p.unidad && p.unidad !== 'und' ? `por ${p.unidad}` : 'c/u'}
                  {l.auto && !esManual(l) && <span className="text-oro-oscuro font-medium"> · mayorista</span>}
                  {p.es_kit && <span className="text-oro-oscuro font-medium"> · combo</span>}
                  {!p.es_kit && p.stock - l.cantidad < 0 && <span className="text-naranja-oscuro"> · stock bajo</span>}
                  {!p.es_kit && p.stock - l.cantidad >= 0 && (
                    <span className={Number(p.stock_minimo) > 0 && p.stock - l.cantidad <= Number(p.stock_minimo) ? 'text-naranja-oscuro' : 'text-slate-400'}>
                      {' '}· quedan {numero(p.stock - l.cantidad)}{p.unidad && p.unidad !== 'und' ? ` ${p.unidad}` : ''}
                    </span>
                  )}
                </p>
              </div>
              </div>
              <div className="text-right">
                <p className="text-2xl lg:text-4xl font-bold tabular-nums leading-none">{dinero(netoLinea(l))}</p>
                {dl > 0 && <p className="text-xs lg:text-sm text-esmeralda mt-1">Descuento − {dinero(dl)}</p>}
                {promoLinea(l) > 0 && <p className="text-xs lg:text-sm text-esmeralda mt-1">{l.promoNombre} − {dinero(promoLinea(l))}</p>}
                {bajo && <p className="text-xs lg:text-sm text-red-500 mt-1">Bajo el mínimo</p>}
              </div>

              <div className="col-span-2 grid gap-2 lg:grid-cols-[auto_1fr] lg:gap-3 items-center">
                <div className="grid grid-cols-[3rem_1fr_3rem] lg:grid-cols-[3rem_6rem_3rem] gap-1.5 lg:gap-1">
                  <button onClick={() => onCantidad(p.id, -1)} aria-label="Menos"
                    className="h-11 lg:h-12 rounded-xl bg-slate-100 text-xl active:bg-slate-200">−</button>
                  <input value={l.txt ?? numero(l.cantidad)} inputMode="decimal" aria-label={`Cantidad de ${p.nombre}`}
                         onChange={e => onEscribir(p.id, e.target.value)}
                         onFocus={e => e.target.select()}
                         onBlur={() => onCerrarCantidad(p.id)}
                         className="h-11 lg:h-12 w-full rounded-xl border border-slate-200 text-center text-lg lg:text-xl font-semibold outline-none focus:border-oro" />
                  <button onClick={() => onCantidad(p.id, 1)} aria-label="Más"
                    className="h-11 lg:h-12 rounded-xl bg-slate-100 text-xl active:bg-slate-200">+</button>
                </div>
                <div className={`grid gap-2 w-full lg:justify-self-end ${esPesable(p) ? 'grid-cols-3 lg:max-w-[22rem]' : 'grid-cols-2 lg:max-w-[15rem]'}`}>
                  {esPesable(p) && (
                    <button onClick={() => onPesar(pesandoId === p.id ? null : p.id)}
                      className={`h-11 lg:h-12 px-1 truncate rounded-xl text-sm font-medium ${
                        pesandoId === p.id ? 'bg-negro text-champagne' : 'bg-lima/20 text-marca active:bg-lima/30'}`}>
                      Pesar
                    </button>
                  )}
                  <button onClick={() => onEditar(editandoId === p.id ? null : p.id)}
                    className={`h-11 lg:h-12 px-1 truncate rounded-xl text-sm font-medium ${
                      editandoId === p.id || ajustada ? 'bg-negro text-champagne' : 'bg-slate-100 text-slate-600 active:bg-slate-200'}`}>
                    Ajustar
                  </button>
                  <button onClick={() => onQuitar(p.id)}
                    className="h-11 lg:h-12 px-1 truncate rounded-xl bg-red-50 text-sm font-medium text-red-600 active:bg-red-100">
                    Quitar
                  </button>
                </div>
              </div>

              {pesandoId === p.id && esPesable(p) && (
                <CajaPeso l={l} onEscribir={onEscribir} onCerrar={onCerrarCantidad} />
              )}

              {editandoId === p.id && (
                <Ajuste l={l} margen={margen} dueno={dueno} onCambiar={(c) => onAjuste(p.id, c)} />
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
