// Resumen para el dueño: cómo le fue al catálogo esta semana, comparado con la anterior, y envío por WhatsApp.
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { mensajeError } from '../lib/errores'
import { comparar, conversion, nombreDia, pesos, textoResumen, ticketPromedio } from '../lib/resumenSemana'
import { Btn, Volver, Aviso } from '../tienda/ui'
import { Titulo, Seccion, Opciones } from './piezas'

const TONO = { sube: 'text-green-800', baja: 'text-red-700', igual: 'text-tinta/60', nuevo: 'text-green-800' }
const FLECHA = { sube: '▲', baja: '▼', igual: '＝', nuevo: '▲' }

function Dato({ icono, titulo, valor, cmp }) {
  return (
    <div className="rounded-2xl border-2 border-black/5 bg-white p-4">
      <p className="break-words text-lg leading-snug text-tinta/70">{icono} {titulo}</p>
      <p className="break-words text-3xl font-bold text-principal">{valor}</p>
      {cmp && <p className={`text-base font-semibold ${TONO[cmp.tono]}`}>{FLECHA[cmp.tono]} {cmp.texto}</p>}
    </div>
  )
}

export default function ResumenSemana({ ctx, volver }) {
  const nid = ctx.neg.negocio_id
  const [dias, setDias] = useState(7)
  const [r, setR] = useState(undefined)
  const [error, setError] = useState('')

  useEffect(() => {
    let vivo = true
    ;(async () => {
      const { data, error: e } = await supabase.rpc('resumen_semanal', { p_negocio_id: nid, p_dias: dias })
      if (!vivo) return
      if (e) { setError(mensajeError(e)); setR(null) } else { setError(''); setR(data) }
    })()
    return () => { vivo = false }
  }, [nid, dias])

  const texto = r ? textoResumen(r, ctx.neg.nombre_comercial) : ''
  async function enviar() {
    try { if (navigator.share) return await navigator.share({ text: texto }) } catch { return }
    window.open(`https://wa.me/?text=${encodeURIComponent(texto)}`, '_blank', 'noopener')
  }
  const c = r ? conversion(r) : null

  return (
    <div className="pb-6">
      <Volver onClick={volver} texto="Volver al panel" />
      <Titulo sub="Cómo le fue a tu catálogo en línea, comparado con el periodo anterior.">Resumen de la semana</Titulo>
      <div className="mb-4"><Opciones valor={dias} opciones={[[7, 'Últimos 7 días'], [30, 'Últimos 30 días']]} onChange={(v) => { setR(undefined); setDias(v) }} /></div>
      {error && <div className="mb-4"><Aviso tipo="error">{error}</Aviso></div>}
      {r === undefined && <p className="py-8 text-center text-xl text-tinta/60">Cargando…</p>}
      {r && (
        <>
          <div className="mb-4 grid grid-cols-2 gap-3">
            <Dato icono="👀" titulo="Visitas" valor={r.visitas.actual} cmp={comparar(r.visitas.actual, r.visitas.anterior)} />
            <Dato icono="🛒" titulo="Pedidos" valor={r.pedidos.actual} cmp={comparar(r.pedidos.actual, r.pedidos.anterior)} />
            <Dato icono="💰" titulo="Ventas en línea" valor={pesos(r.ventas.actual)} cmp={comparar(r.ventas.actual, r.ventas.anterior)} />
            <Dato icono="🧾" titulo="Pedido promedio" valor={pesos(ticketPromedio(r))} />
            <Dato icono="🛵" titulo="Domicilios" valor={r.domicilios} />
            <Dato icono="🏪" titulo="Para recoger" valor={r.recoger} />
            <Dato icono="👥" titulo="Clientes nuevos" valor={r.clientes_nuevos} />
            <Dato icono="⭐" titulo="Opiniones nuevas" valor={r.opiniones.nuevas} />
          </div>
          {c !== null && <div className="mb-4"><Aviso>🎯 De cada 100 personas que entraron, <b>{c}</b> hicieron un pedido.</Aviso></div>}
          {r.mejor_dia && <div className="mb-4"><Aviso>📅 Mejor día: <b>{nombreDia(r.mejor_dia.dow)}</b> ({r.mejor_dia.pedidos} {r.mejor_dia.pedidos === 1 ? 'pedido' : 'pedidos'}).</Aviso></div>}
          <Seccion titulo="🏆 Lo más pedido">
            {r.productos.length === 0 ? <p className="text-lg text-tinta/60">Aún no hay pedidos en este periodo.</p> : (
              <ol className="space-y-2">{r.productos.map((p, i) => (
                <li key={p.nombre} className="grid grid-cols-[auto_1fr_auto] gap-3 text-lg"><span className="font-bold text-principal">{i + 1}.</span><span className="break-words">{p.nombre}</span><span className="font-bold">{Number(p.cantidad)}</span></li>
              ))}</ol>
            )}
          </Seccion>
          {r.opiniones.pendientes > 0 && <div className="mb-4"><Aviso tipo="previa">Tienes {r.opiniones.pendientes} {r.opiniones.pendientes === 1 ? 'opinión' : 'opiniones'} por revisar en <b>Opiniones y menú</b>.</Aviso></div>}
          {r.cancelados > 0 && <p className="mb-4 text-base text-tinta/60">Pedidos cancelados en el periodo: {r.cancelados} (no cuentan en las ventas).</p>}
          <Btn variante="verde" onClick={enviar}>Enviar resumen por WhatsApp</Btn>
        </>
      )}
    </div>
  )
}
