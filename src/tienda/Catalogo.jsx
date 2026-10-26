import { useMemo, useState } from 'react'
import { urlImagen } from '../lib/supabase'
import { cop } from '../lib/pedido'
import { Cantidad, clsInput } from './ui'

const POR_TANDA = 60
const sinTildes = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

function Foto({ p }) {
  const url = urlImagen(p.imagenes?.[0])
  return url
    ? <img src={url} alt={p.nombre} loading="lazy" className="aspect-[4/3] w-full rounded-xl bg-white object-contain" />
    : <div aria-hidden="true" className="flex aspect-[4/3] w-full items-center justify-center rounded-xl bg-principal/10 text-5xl font-bold text-principal/40">{p.nombre.charAt(0).toUpperCase()}</div>
}

export default function Catalogo({ catalogo, carrito, cambiar }) {
  const [texto, setTexto] = useState('')
  const [cat, setCat] = useState('')
  const [mostrar, setMostrar] = useState(POR_TANDA)

  const nombresCat = useMemo(() => {
    const dePro = new Set(catalogo.productos.map((p) => p.categoria).filter(Boolean))
    const ordenadas = (catalogo.categorias || []).map((c) => c.nombre).filter((n) => dePro.has(n))
    return [...ordenadas, ...[...dePro].filter((n) => !ordenadas.includes(n)).sort()]
  }, [catalogo])

  const lista = useMemo(() => {
    const q = sinTildes(texto)
    return catalogo.productos.filter((p) => (!cat || p.categoria === cat) && (!q || sinTildes(p.nombre).includes(q) || sinTildes(p.descripcion).includes(q)))
  }, [catalogo, texto, cat])

  const promoDe = (p) => (catalogo.promociones || []).find((x) => x.producto_id === p.id || (x.categoria && x.categoria === p.categoria))
  const etiquetaPromo = (x) => x.tipo === 'porcentaje' ? `${x.valor}% menos` : x.tipo === 'nxm' ? `Lleva ${x.lleva}, paga ${x.paga}` : `A ${cop(x.valor)} c/u`

  return (
    <div>
      {catalogo.ofertas?.length > 0 && (
        <section className="mb-6" aria-label="Ofertas">
          <h2 className="mb-3 text-2xl font-bold">Ofertas</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {catalogo.ofertas.map((o) => (
              <div key={o.id} className="rounded-2xl border-2 border-secundario/50 bg-white p-4">
                {o.etiqueta && <span className="mb-1 inline-block rounded-full bg-secundario/20 px-3 py-1 text-base font-bold">{o.etiqueta}</span>}
                <p className="text-xl font-bold leading-snug">{o.titulo}</p>
                {o.detalle && <p className="mt-1 text-lg text-tinta/80">{o.detalle}</p>}
              </div>
            ))}
          </div>
        </section>
      )}

      <input type="search" value={texto} onChange={(e) => { setTexto(e.target.value); setMostrar(POR_TANDA) }} placeholder="Buscar un producto" aria-label="Buscar un producto" className={`${clsInput} mb-4`} />

      {nombresCat.length > 0 && (
        <div className="mb-6 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {['', ...nombresCat].map((c) => (
            <button key={c || 'todo'} onClick={() => { setCat(c); setMostrar(POR_TANDA) }} aria-pressed={cat === c}
              className={`min-h-[56px] rounded-2xl border-2 px-3 py-2 text-lg font-semibold leading-tight ${c === '' ? 'col-span-2 sm:col-span-1' : ''} ${cat === c ? 'border-principal bg-principal text-white' : 'border-black/10 bg-white text-tinta'}`}>
              {c || 'Todo'}
            </button>
          ))}
        </div>
      )}

      {lista.length === 0 && (
        <p className="rounded-2xl border-2 border-black/10 bg-white p-6 text-center text-xl">
          {catalogo.productos.length === 0 ? 'Esta tienda todavía no tiene productos publicados.' : 'No encontramos productos con ese nombre.'}
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        {lista.slice(0, mostrar).map((p) => {
          const c = carrito[p.id] || 0
          const promo = promoDe(p)
          return (
            <article key={p.id} className="flex flex-col gap-3 rounded-2xl border-2 border-black/5 bg-white p-4 shadow-sm">
              <Foto p={p} />
              <div className="flex-1">
                <h3 className="break-words text-xl font-bold leading-snug">{p.nombre}</h3>
                {p.descripcion && <p className="mt-1 text-lg leading-snug text-tinta/70">{p.descripcion}</p>}
                {promo && <p className="mt-2 inline-block rounded-full bg-[#128C4A]/10 px-3 py-1 text-base font-bold text-[#0d6b38]">{etiquetaPromo(promo)}</p>}
              </div>
              <p className="text-2xl font-bold text-principal">{cop(p.precio_venta)}{p.unidad && p.unidad !== 'und' && <span className="text-lg font-semibold text-tinta/60"> / {p.unidad}</span>}</p>
              {!p.disponible
                ? <p className="rounded-2xl bg-black/5 py-4 text-center text-lg font-bold text-tinta/60">Agotado por ahora</p>
                : c === 0
                  ? <button onClick={() => cambiar(p.id, 1)} className="min-h-[56px] rounded-2xl bg-principal text-lg font-semibold text-white active:scale-[0.99]">Agregar</button>
                  : <Cantidad valor={c} onMenos={() => cambiar(p.id, c - 1)} onMas={() => cambiar(p.id, c + 1)} />}
            </article>
          )
        })}
      </div>

      {lista.length > mostrar && (
        <button onClick={() => setMostrar((m) => m + POR_TANDA)}
          className="mt-6 min-h-[56px] w-full rounded-2xl border-2 border-principal bg-white px-4 text-lg font-semibold text-principal active:scale-[0.99]">
          Ver más productos ({lista.length - mostrar} por ver)
        </button>
      )}
    </div>
  )
}
