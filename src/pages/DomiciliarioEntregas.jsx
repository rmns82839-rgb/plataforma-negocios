// Lo que ve el domiciliario aprobado en su celular: ofertas de la ciudad, sus entregas en curso, sus ganancias y las últimas entregas.
// Las ofertas se refrescan solas cada 20 segundos mientras la pantalla está abierta.
import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { Btn, Aviso } from '../tienda/ui'

const dinero = (n) => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(Number(n) || 0)
const hoyFecha = (iso) => new Date(iso).toLocaleDateString('es-CO', { day: 'numeric', month: 'short' })
const mapa = (dir) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(dir || '')}`
const soloNumeros = (t) => String(t || '').replace(/\D/g, '')

function Seccion({ titulo, children }) {
  return (
    <section className="space-y-3">
      <h2 className="break-words text-2xl font-bold leading-tight">{titulo}</h2>
      {children}
    </section>
  )
}

function Fila({ k, children }) {
  return (
    <div className="grid grid-cols-[6rem_1fr] gap-3 text-lg">
      <dt className="text-tinta/60">{k}</dt>
      <dd className="min-w-0 break-words font-semibold">{children}</dd>
    </div>
  )
}

function EntregaActiva({ e, alCambiar, setError }) {
  const [ocupado, setOcupado] = useState(false)
  const recogida = e.estado === 'recogida'
  const wa = (t) => `https://wa.me/57${soloNumeros(t).slice(-10)}`

  async function avanzar() {
    setOcupado(true); setError('')
    const { data, error } = await supabase.rpc('avanzar_entrega', { p_entrega_id: e.id })
    setOcupado(false)
    if (error) return setError(error.message)
    if (data?.aviso) fetch('/api/avisar-estado', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ aviso: data.aviso }) }).catch(() => {})
    alCambiar()
  }
  async function soltar() {
    if (!window.confirm('¿Soltar esta entrega? Volverá a la lista para otros domiciliarios.')) return
    setOcupado(true); setError('')
    const { error } = await supabase.rpc('soltar_entrega', { p_entrega_id: e.id })
    setOcupado(false)
    if (error) return setError(error.message)
    alCambiar()
  }

  return (
    <article className="space-y-4 rounded-2xl border-2 border-principal/40 bg-white p-4 shadow-sm">
      <header className="grid grid-cols-[1fr_auto] items-start gap-3">
        <h3 className="break-words text-xl font-bold leading-tight">Pedido N.º {e.numero} · {e.tienda}</h3>
        <span className="rounded-full bg-principal/10 px-3 py-1 text-base font-bold text-principal">{dinero(e.tarifa)}</span>
      </header>
      <p className="text-lg font-semibold">{recogida ? 'Ya lo recogiste: llévalo al cliente' : 'Pasa a recogerlo a la tienda'}</p>
      <dl className="space-y-2">
        <Fila k="Tienda">{e.direccion_tienda || 'Pregunta la dirección a la tienda'}</Fila>
        <Fila k="Cliente">{e.cliente || 'Cliente'}</Fila>
        <Fila k="Dirección">{e.direccion || 'Sin dirección'}</Fila>
        {e.nota && <Fila k="Nota">{e.nota}</Fila>}
        <Fila k="Llevas">{(e.productos ?? []).map((p) => `${Number(p.cantidad)} ${p.nombre}`).join(', ')}</Fila>
        <Fila k="Cobro">{e.pago_estado === 'confirmado' ? 'Ya está pagado' : `Revisa con la tienda cómo paga (total ${dinero(e.total)})`}</Fila>
      </dl>
      <div className="grid grid-cols-2 gap-2">
        <a href={mapa(recogida ? e.direccion : e.direccion_tienda)} target="_blank" rel="noreferrer" className="grid min-h-[56px] place-items-center rounded-2xl border-2 border-black/15 bg-white text-lg font-semibold">Abrir mapa</a>
        <a href={`tel:${soloNumeros(recogida ? e.telefono_cliente : e.telefono_tienda)}`} className="grid min-h-[56px] place-items-center rounded-2xl border-2 border-black/15 bg-white text-lg font-semibold">Llamar</a>
        {(recogida ? e.telefono_cliente : e.telefono_tienda) && (
          <a href={wa(recogida ? e.telefono_cliente : e.telefono_tienda)} target="_blank" rel="noreferrer" className="col-span-2 grid min-h-[56px] place-items-center rounded-2xl border-2 border-black/15 bg-white text-lg font-semibold">WhatsApp</a>
        )}
      </div>
      <div className="grid gap-2">
        <Btn disabled={ocupado} onClick={avanzar}>{recogida ? 'Ya entregué el pedido' : 'Ya recogí el pedido'}</Btn>
        {!recogida && <Btn variante="suave" disabled={ocupado} onClick={soltar}>Soltar esta entrega</Btn>}
      </div>
    </article>
  )
}

export default function DomiciliarioEntregas({ disponible }) {
  const [ofertas, setOfertas] = useState(null)
  const [mias, setMias] = useState(null)
  const [ganancias, setGanancias] = useState(null)
  const [error, setError] = useState('')
  const [ocupado, setOcupado] = useState('')

  const cargar = useCallback(async () => {
    const [o, m, g] = await Promise.all([supabase.rpc('ofertas_disponibles'), supabase.rpc('mis_entregas'), supabase.rpc('mis_ganancias')])
    if (o.error || m.error) setError((o.error || m.error).message)
    setOfertas(o.data ?? []); setMias(m.data ?? { activas: [], recientes: [] }); setGanancias(g.data ?? null)
  }, [])
  useEffect(() => {
    cargar()
    const t = setInterval(() => { if (document.visibilityState === 'visible') cargar() }, 20000)
    const v = () => { if (document.visibilityState === 'visible') cargar() }
    document.addEventListener('visibilitychange', v)
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', v) }
  }, [cargar])

  async function tomar(id) {
    setOcupado(id); setError('')
    const { error: e } = await supabase.rpc('aceptar_entrega', { p_entrega_id: id })
    setOcupado('')
    if (e) setError(e.message)
    cargar()
  }

  if (!ofertas || !mias) return <p className="py-8 text-center text-xl text-tinta/60">Cargando…</p>
  return (
    <div className="mt-6 space-y-8">
      {error && <Aviso tipo="error">{error}</Aviso>}

      {ganancias && (
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-2xl border-2 border-black/5 bg-white p-4">
            <p className="text-base text-tinta/60">Por cobrar</p>
            <p className="text-2xl font-bold">{dinero(ganancias.pendiente_total)}</p>
            <p className="text-base text-tinta/60">{ganancias.pendiente_n} {ganancias.pendiente_n === 1 ? 'entrega' : 'entregas'}</p>
          </div>
          <div className="rounded-2xl border-2 border-black/5 bg-white p-4">
            <p className="text-base text-tinta/60">Pagado (30 días)</p>
            <p className="text-2xl font-bold">{dinero(ganancias.pagado_total)}</p>
            <p className="text-base text-tinta/60">{ganancias.calificacion ? `★ ${Number(ganancias.calificacion).toFixed(1)} (${ganancias.calificaciones})` : 'Sin calificaciones'}</p>
          </div>
        </div>
      )}

      {mias.activas.length > 0 && (
        <Seccion titulo="Tus entregas en curso">
          {mias.activas.map((e) => <EntregaActiva key={e.id} e={e} alCambiar={cargar} setError={setError} />)}
        </Seccion>
      )}

      <Seccion titulo="Entregas disponibles">
        {!disponible && <Aviso>Estás en «No disponible». Igual puedes ver las entregas, pero las tiendas ven primero a quienes están disponibles.</Aviso>}
        {ofertas.length === 0 && <p className="rounded-2xl border-2 border-dashed border-black/15 p-5 text-center text-lg text-tinta/60">Por ahora no hay entregas. Esta lista se actualiza sola.</p>}
        {ofertas.map((o) => (
          <article key={o.id} className="space-y-3 rounded-2xl border-2 border-black/5 bg-white p-4 shadow-sm">
            <header className="grid grid-cols-[1fr_auto] items-start gap-3">
              <h3 className="break-words text-xl font-bold leading-tight">{o.tienda}</h3>
              <span className="rounded-full bg-principal/10 px-3 py-1 text-lg font-bold text-principal">{dinero(o.tarifa)}</span>
            </header>
            <p className="break-words text-lg text-tinta/70">{o.direccion_tienda || 'Dirección de la tienda al aceptar'}</p>
            <p className="text-base text-tinta/60">{o.productos} {o.productos === 1 ? 'producto' : 'productos'}{o.km ? ` · ${Number(o.km).toFixed(1)} km` : ''} · hace {o.hace_min} min</p>
            <Btn disabled={ocupado === o.id} onClick={() => tomar(o.id)}>{ocupado === o.id ? 'Tomando…' : 'Tomar esta entrega'}</Btn>
          </article>
        ))}
      </Seccion>

      {mias.recientes.length > 0 && (
        <Seccion titulo="Últimas entregas">
          <ul className="divide-y divide-black/5 rounded-2xl border-2 border-black/5 bg-white">
            {mias.recientes.map((r) => (
              <li key={r.id} className="grid grid-cols-[1fr_auto] gap-3 px-4 py-3">
                <span className="min-w-0 break-words text-lg">{r.tienda}<span className="block text-base text-tinta/60">{hoyFecha(r.fecha)}{r.calificacion ? ` · ★ ${r.calificacion}` : ''}</span></span>
                <span className="text-right text-lg font-bold">{dinero(r.tarifa)}<span className="block text-sm font-normal text-tinta/60">{r.pago_estado === 'pagado' ? 'Pagado' : 'Por cobrar'}</span></span>
              </li>
            ))}
          </ul>
        </Seccion>
      )}
    </div>
  )
}
