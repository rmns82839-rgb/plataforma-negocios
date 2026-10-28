// Pantalla del dueño: cómo le fue al catálogo esta semana, comparado con la anterior, y envío por WhatsApp.
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import Cifra from './Cifra'
import { comparar, conversion, nombreDia, pesos, textoResumen, ticketPromedio } from '../lib/resumenSemana'

const TONO = { sube: 'text-emerald-700', baja: 'text-red-600', igual: 'text-slate-500', nuevo: 'text-emerald-700' }
const FLECHA = { sube: '▲', baja: '▼', igual: '＝', nuevo: '▲' }

function Dato({ icono, titulo, valor, cmp }) {
  return (
    <div className="rounded-2xl bg-white shadow-sm p-4 space-y-1">
      <p className="text-sm text-slate-500 break-words">{icono} {titulo}</p>
      <Cifra className="text-2xl font-bold text-tinta">{valor}</Cifra>
      {cmp && <p className={`text-sm font-semibold ${TONO[cmp.tono]}`}>{FLECHA[cmp.tono]} {cmp.texto}</p>}
    </div>
  )
}

export default function ResumenSemana() {
  const [dias, setDias] = useState(7)
  const [r, setR] = useState(undefined)
  const [error, setError] = useState('')
  useEffect(() => {
    setR(undefined); setError('')
    supabase.rpc('listar_resumen_semanal', { p_dias: dias }).then(({ data, error: e }) => {
      if (e) { setError(/could not find the function|schema cache/i.test(e.message) ? 'No se pudo cargar el resumen' : e.message); return setR(null) }
      setR(data)
    })
  }, [dias])

  const [apps, setApps] = useState(null)
  useEffect(() => { supabase.rpc('listar_instalaciones_app').then(({ data, error: e }) => setApps(e ? { falta: /could not find the function|schema cache/i.test(e.message) } : data)) }, [])

  const [nombre, setNombre] = useState('')
  useEffect(() => { supabase.from('negocio').select('nombre').eq('id', 1).maybeSingle().then(({ data }) => setNombre(data?.nombre || '')) }, [])
  const texto = r ? textoResumen(r, nombre || 'Mi tienda') : ''
  const enviar = async () => {
    try { if (navigator.share) return await navigator.share({ text: texto }) } catch { return }
    window.open(`https://wa.me/?text=${encodeURIComponent(texto)}`, '_blank', 'noopener')
  }
  const c = r ? conversion(r) : null

  return (
    <div className="space-y-4 max-w-2xl">
      <div>
        <h2 className="text-xl font-bold">Resumen de la semana</h2>
        <p className="text-sm text-slate-500">Cómo le fue al catálogo en línea, comparado con el periodo anterior.</p>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {[[7, 'Últimos 7 días'], [30, 'Últimos 30 días']].map(([n, t]) => (
          <button key={n} onClick={() => setDias(n)} aria-pressed={dias === n} className={`min-h-12 rounded-xl text-base font-semibold ${dias === n ? 'bg-negro text-champagne' : 'bg-white ring-1 ring-slate-200'}`}>{t}</button>
        ))}
      </div>
      {error && <p className="rounded-lg bg-red-50 text-red-700 p-3 text-base">{error}</p>}
      {r === undefined && <p className="text-center text-slate-400 py-8">Cargando…</p>}
      {r && (
        <>
          <div className="grid grid-cols-2 gap-3">
            <Dato icono="👀" titulo="Visitas" valor={r.visitas.actual} cmp={comparar(r.visitas.actual, r.visitas.anterior)} />
            <Dato icono="🛒" titulo="Pedidos" valor={r.pedidos.actual} cmp={comparar(r.pedidos.actual, r.pedidos.anterior)} />
            <Dato icono="💰" titulo="Ventas en línea" valor={pesos(r.ventas.actual)} cmp={comparar(r.ventas.actual, r.ventas.anterior)} />
            <Dato icono="🧾" titulo="Pedido promedio" valor={pesos(ticketPromedio(r))} />
            <Dato icono="🛵" titulo="Domicilios" valor={r.domicilios} />
            <Dato icono="🏪" titulo="Para recoger" valor={r.recoger} />
            <Dato icono="👥" titulo="Clientes nuevos" valor={r.clientes_nuevos} />
            <Dato icono="⭐" titulo="Opiniones nuevas" valor={r.opiniones.nuevas} />
          </div>
          {c !== null && <p className="rounded-2xl bg-white shadow-sm p-4 text-base">🎯 De cada 100 personas que entraron, <b>{c}</b> hicieron un pedido.</p>}
          {r.mejor_dia && <p className="rounded-2xl bg-white shadow-sm p-4 text-base">📅 Mejor día: <b>{nombreDia(r.mejor_dia.dow)}</b> ({r.mejor_dia.pedidos} {r.mejor_dia.pedidos === 1 ? 'pedido' : 'pedidos'}).</p>}
          <section className="rounded-2xl bg-white shadow-sm p-4 space-y-2">
            <h3 className="text-base font-semibold">🏆 Lo más pedido</h3>
            {r.productos.length === 0 ? <p className="text-slate-500">Aún no hay pedidos en este periodo.</p> : (
              <ol className="space-y-1">{r.productos.map((p, i) => (
                <li key={p.nombre} className="grid grid-cols-[auto_1fr_auto] gap-2 text-base"><span className="font-bold text-oro">{i + 1}.</span><span className="break-words">{p.nombre}</span><span className="font-semibold">{Number(p.cantidad)}</span></li>
              ))}</ol>
            )}
          </section>
          {apps && !apps.falta && apps.total != null && (
            <section className="rounded-2xl bg-white shadow-sm p-4 space-y-3">
              <h3 className="text-base font-semibold">📲 App instalada en celulares</h3>
              <div className="grid grid-cols-2 gap-3 text-center">
                <p className="rounded-xl bg-slate-50 p-3"><span className="block text-3xl font-bold text-tinta">{apps.total}</span><span className="text-sm text-slate-500">la instalaron en total</span></p>
                <p className="rounded-xl bg-slate-50 p-3"><span className="block text-3xl font-bold text-tinta">{apps.abren_semana}</span><span className="text-sm text-slate-500">la abrieron esta semana</span></p>
                <p className="rounded-xl bg-slate-50 p-3"><span className="block text-2xl font-bold text-tinta">{apps.hoy}</span><span className="text-sm text-slate-500">instalaron hoy</span></p>
                <p className="rounded-xl bg-slate-50 p-3"><span className="block text-2xl font-bold text-tinta">{apps.semana}</span><span className="text-sm text-slate-500">en los últimos 7 días</span></p>
              </div>
              <p className="text-sm text-slate-500">Android: {apps.android} · iPhone: {apps.ios} · Otros: {apps.otros}. Cuenta desde que se activó este contador; los celulares que ya la tenían se suman cuando la abren. En iPhone solo se cuentan quienes abren la app instalada.</p>
            </section>
          )}
          {r.opiniones.pendientes > 0 && <p className="rounded-lg bg-amber-50 text-amber-800 p-3 text-base">Tienes {r.opiniones.pendientes} {r.opiniones.pendientes === 1 ? 'opinión' : 'opiniones'} por revisar en <b>Opiniones de clientes</b>.</p>}
          {r.cancelados > 0 && <p className="text-sm text-slate-500">Pedidos cancelados en el periodo: {r.cancelados} (no cuentan en las ventas).</p>}
          <button onClick={enviar} className="w-full min-h-14 rounded-xl bg-esmeralda text-white text-lg font-bold active:opacity-80">Enviar resumen por WhatsApp</button>
        </>
      )}
    </div>
  )
}
