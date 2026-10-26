import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { quitarMarca } from '../lib/marca'
import { ir } from '../lib/ruta'
import { useSesion } from '../lib/sesion'
import { cop } from '../lib/pedido'
import { Btn, Volver, Aviso, Logo, PiePlataforma } from '../tienda/ui'
import { Insignia, SoloLectura } from './piezas'
import Login from '../pages/Login'
import Pedidos from './Pedidos'
import Productos from './Productos'
import Categorias from './Categorias'
import MiTienda from './MiTienda'
import Equipo from './Equipo'
import MiPlan from './MiPlan'
import Caja from './Caja'
import Fiados from './Fiados'
import Reportes from './Reportes'

const ROL = { dueno: 'Dueño', cajero: 'Cajero', soporte: 'Soporte · solo lectura' }

export default function PanelApp({ slug }) {
  const sesion = useSesion()
  const [ctx, setCtx] = useState(undefined)
  const [avisos, setAvisos] = useState([])
  const [seccion, setSeccion] = useState('inicio')
  const [resumen, setResumen] = useState(null)
  const [pub, setPub] = useState(null)

  useEffect(() => {
    if (!sesion) return
    let vivo = true
    ;(async () => {
      const { data: mios } = await supabase.rpc('mis_negocios')
      const m = (mios || []).find((x) => x.slug === slug)
      if (!m) { if (vivo) setCtx(null); return }
      const { data: marca } = await supabase.rpc('negocio_publico', { p_slug: slug })
      if (!vivo) return
      // El panel usa siempre la paleta de Matriz; los colores de la tienda se ven solo en la tienda pública.
      setCtx({ userId: sesion?.user?.id ?? '', neg: m, rol: m.rol, esDueno: m.rol === 'dueno', soloLectura: m.rol === 'soporte', modulos: marca?.modulos || [], marca })
      supabase.rpc('registrar_acceso', { p_negocio_id: m.negocio_id, p_detalle: 'Panel' })
      if (m.rol === 'dueno') {
        const { data: av } = await supabase.rpc('accesos_pendientes', { p_negocio_id: m.negocio_id })
        if (vivo) setAvisos(av || [])
      }
    })()
    return () => { vivo = false; quitarMarca() }
  }, [sesion, slug])

  const cargarResumen = useCallback(async () => {
    if (!ctx) return
    const [a, b] = await Promise.all([
      supabase.rpc('resumen_panel', { p_negocio_id: ctx.neg.negocio_id }),
      supabase.rpc('estado_publicacion', { p_negocio_id: ctx.neg.negocio_id }),
    ])
    setResumen(a.data || null); setPub(b.data || null)
  }, [ctx])
  useEffect(() => { if (seccion === 'inicio') cargarResumen() }, [seccion, cargarResumen])
  useEffect(() => { if (seccion !== 'inicio') return; const t = setInterval(cargarResumen, 30000); return () => clearInterval(t) }, [seccion, cargarResumen])

  if (sesion === undefined) return <p className="py-24 text-center text-xl text-tinta/60">Cargando…</p>
  if (!sesion) return <Login titulo="Acceso del personal" />
  if (ctx === undefined) return <p className="py-24 text-center text-xl text-tinta/60">Cargando tu panel…</p>
  if (ctx === null) {
    return (
      <main className="mx-auto max-w-xl px-4 py-10 text-lg">
        <Volver onClick={() => ir('/')} texto="Mis negocios" />
        <Aviso>No tienes acceso a este negocio con esta cuenta.</Aviso>
        <div className="mt-4"><Btn variante="suave" onClick={() => supabase.auth.signOut()}>Salir</Btn></div>
      </main>
    )
  }

  const dueño = ctx.esDueno || ctx.soloLectura
  const volver = () => setSeccion('inicio')
  const pagina = {
    pedidos: <Pedidos ctx={ctx} volver={volver} />,
    caja: <Caja ctx={ctx} volver={volver} />,
    fiados: <Fiados ctx={ctx} volver={volver} />,
    reportes: <Reportes ctx={ctx} volver={volver} />,
    productos: <Productos ctx={ctx} volver={volver} />,
    categorias: <Categorias ctx={ctx} volver={volver} />,
    tienda: <MiTienda ctx={ctx} volver={volver} />,
    equipo: <Equipo ctx={ctx} volver={volver} miId={sesion.user?.id} />,
    plan: <MiPlan ctx={ctx} volver={volver} />,
  }[seccion]

  async function entendido() {
    await supabase.rpc('marcar_accesos_vistos', { p_negocio_id: ctx.neg.negocio_id })
    setAvisos([])
  }

  const botones = [
    ['pedidos', '🧾', 'Pedidos', resumen?.pedidos_pendientes > 0 ? `${resumen.pedidos_pendientes} por atender` : 'Ver pedidos', true],
    ['caja', '💵', 'Caja', 'Vender y cuadrar el día', ctx.modulos.includes('caja')],
    ['fiados', '📒', 'Fiados', 'Quién debe y abonos', ctx.modulos.includes('fiados')],
    ['reportes', '📊', 'Reportes', 'Ventas y ganancias', ctx.modulos.includes('reportes') && dueño],
    ['productos', '📦', 'Productos', 'Crear y editar', true],
    ['categorias', '🏷️', 'Categorías', 'Ordenar la tienda', true],
    ['tienda', '🏪', 'Mi tienda', 'Datos, logo, domicilio', dueño],
    ['equipo', '👥', 'Mi equipo', 'Quién puede entrar', dueño],
    ['plan', '⭐', 'Mi plan', 'Precio y límites', dueño],
  ].filter((b) => b[4])

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-6 text-lg sm:py-10">
      {seccion !== 'inicio' ? pagina : (
        <>
          <header className="mb-5 flex flex-col items-center gap-2 text-center">
            <Logo n={{ nombre: ctx.marca?.nombre, logo: ctx.marca?.logo, logo_auto: ctx.marca?.logo_auto }} tamano={72} />
            <h1 className="break-words text-3xl font-bold leading-tight text-principal">{ctx.neg.nombre_comercial}</h1>
            <Insignia tono="azul">{ROL[ctx.rol]}</Insignia>
          </header>

          {ctx.soloLectura && <SoloLectura />}
          {avisos.length > 0 && (
            <div className="mb-4 rounded-2xl border-2 border-secundario/50 bg-white p-4">
              <p className="mb-3 text-lg">El soporte de la plataforma entró a consultar tu negocio ({avisos.length} {avisos.length === 1 ? 'vez' : 'veces'}). Solo puede ver, no modificar.</p>
              <Btn variante="suave" onClick={entendido}>Entendido</Btn>
            </div>
          )}

          {pub && !pub.publicada && (
            <div className="mb-4"><Aviso tipo="previa">
              <b>Tu tienda todavía no está publicada.</b> {pub.solicitada_en ? 'Ya pedimos publicarla; te avisamos cuando esté abierta.' : pub.lista ? (dueño ? 'Ya está lista: pide la publicación en «Mi tienda».' : 'Ya está lista: el dueño debe pedir la publicación.') : `Falta: ${pub.faltantes?.[0] || 'revisar tus datos'}.`}
            </Aviso></div>
          )}

          {resumen && (
            <div className="mb-5 grid grid-cols-2 gap-3">
              {[['Pedidos por atender', resumen.pedidos_pendientes], ['Pedidos de hoy', resumen.pedidos_hoy], ['Vendido hoy', cop(resumen.ventas_hoy)], [`Productos en la tienda${resumen.productos_agotados > 0 ? ` (${resumen.productos_agotados} ${resumen.productos_agotados === 1 ? 'agotado' : 'agotados'})` : ''}`, resumen.productos_publicados]].map(([k, v]) => (
                <div key={k} className="rounded-2xl border-2 border-black/5 bg-white p-4 text-center">
                  <p className="break-words text-3xl font-bold text-principal">{v}</p>
                  <p className="text-lg leading-snug text-tinta/70">{k}</p>
                </div>
              ))}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            {botones.map(([k, icono, titulo, sub]) => (
              <button key={k} onClick={() => setSeccion(k)} className="flex min-h-[132px] flex-col items-center justify-center gap-1 rounded-2xl border-2 border-black/5 bg-white p-3 text-center shadow-sm active:scale-[0.99]">
                <span aria-hidden="true" className="text-4xl">{icono}</span>
                <span className="break-words text-xl font-bold leading-tight">{titulo}</span>
                <span className="text-base leading-tight text-tinta/60">{sub}</span>
              </button>
            ))}
          </div>

          <div className="mt-5 grid grid-cols-2 gap-3">
            <a href={`/t/${slug}`} target="_blank" rel="noopener noreferrer" className="flex min-h-[56px] items-center justify-center rounded-2xl border-2 border-principal/30 text-lg font-semibold text-principal">Ver mi tienda</a>
            <Btn variante="suave" onClick={() => supabase.auth.signOut()}>Salir</Btn>
          </div>
          <PiePlataforma />
        </>
      )}
    </main>
  )
}
