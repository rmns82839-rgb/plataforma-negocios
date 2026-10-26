import { Logo } from '../tienda/ui'
import { Insignia } from './piezas'
import { supabase } from '../lib/supabase'
import { repartir } from './barra'

// Armazón del panel, como el de Cibus: barra de abajo en el celular, menú lateral en pantalla grande.
// Cada pantalla sigue con su "← Volver"; aquí solo cambia dónde se navega.

function Pestana({ icono, texto, activa, onClick, aviso }) {
  return (
    <button type="button" onClick={onClick} aria-current={activa ? 'page' : undefined}
      className={`relative flex min-h-[64px] flex-col items-center justify-center gap-0.5 px-1 text-center ${activa ? 'font-bold text-principal' : 'text-tinta/70'}`}>
      <span aria-hidden="true" className="text-2xl leading-none">{icono}</span>
      <span className="break-words text-sm leading-tight">{texto}</span>
      {aviso > 0 && <span aria-label={`${aviso} por atender`} className="absolute right-[18%] top-1.5 grid h-5 min-w-5 place-items-center rounded-full bg-red-600 px-1 text-xs font-bold text-white">{aviso}</span>}
      {activa && <span aria-hidden="true" className="absolute inset-x-6 top-0 h-1 rounded-b-full bg-principal" />}
    </button>
  )
}

export function Fila({ icono, titulo, nota, onClick, href }) {
  const cuerpo = (
    <>
      <span aria-hidden="true" className="grid h-12 w-12 place-items-center rounded-xl bg-principal/10 text-2xl">{icono}</span>
      <span className="min-w-0">
        <span className="block break-words text-xl font-bold leading-tight">{titulo}</span>
        {nota && <span className="block break-words text-base leading-tight text-tinta/60">{nota}</span>}
      </span>
      <span aria-hidden="true" className="text-2xl text-tinta/40">›</span>
    </>
  )
  const cls = 'grid min-h-[72px] w-full grid-cols-[3rem_1fr_auto] items-center gap-3 rounded-2xl border-2 border-black/5 bg-white p-3 text-left shadow-sm active:scale-[0.99]'
  return href
    ? <a href={href} target="_blank" rel="noopener noreferrer" className={cls}>{cuerpo}</a>
    : <button type="button" onClick={onClick} className={cls}>{cuerpo}</button>
}

/** Pantalla "Más": lo que no cabe en la barra, en filas grandes e iguales. */
export function MenuMas({ enMas, ir, slug }) {
  return (
    <div className="space-y-3">
      <h2 className="mb-1 text-3xl font-bold leading-tight">Más</h2>
      {enMas.map(([k, icono, titulo, nota]) => <Fila key={k} icono={icono} titulo={titulo} nota={nota} onClick={() => ir(k)} />)}
      <Fila icono="🌐" titulo="Ver mi tienda" nota="Cómo la ven tus clientes" href={`/t/${slug}`} />
      <Fila icono="🚪" titulo="Salir" nota="Cerrar la sesión" onClick={() => supabase.auth.signOut()} />
    </div>
  )
}

export default function Armazon({ ctx, rolTexto, slug, seccion, ir, botones, pendientes = 0, children }) {
  const { enBarra, enMas } = repartir(botones)
  const porClave = Object.fromEntries(botones.map(b => [b[0], b]))
  const pestanas = [
    ['inicio', '🏠', 'Inicio'],
    ...enBarra.map(k => [k, porClave[k][1], porClave[k][2]]),
    ['mas', '☰', 'Más'],
  ]
  // "Más" se ve activo también cuando se abre algo que vive dentro de Más
  const activa = (k) => seccion === k || (k === 'mas' && seccion !== 'inicio' && !enBarra.includes(seccion))
  const lateral = [['inicio', '🏠', 'Inicio'], ...botones.map(b => [b[0], b[1], b[2]])]

  return (
    <div className="armazon min-h-screen lg:grid lg:grid-cols-[16rem_1fr]">
      {/* Menú lateral (pantalla grande) */}
      <aside className="sticky top-0 hidden h-screen flex-col border-r-2 border-black/5 bg-white lg:flex">
        <div className="flex flex-col items-center gap-2 p-4 text-center">
          <Logo n={{ nombre: ctx.marca?.nombre, logo: ctx.marca?.logo, logo_auto: ctx.marca?.logo_auto }} tamano={48} />
          <p className="break-words text-lg font-bold leading-tight">{ctx.neg.nombre_comercial}</p>
          <Insignia tono="azul">{rolTexto}</Insignia>
        </div>
        <nav aria-label="Secciones del panel" className="flex-1 space-y-1 overflow-y-auto px-4">
          {lateral.map(([k, icono, titulo]) => (
            <button key={k} type="button" onClick={() => ir(k)} aria-current={seccion === k ? 'page' : undefined}
              className={`flex min-h-[52px] w-full items-center gap-3 rounded-xl px-3 text-left text-lg ${seccion === k ? 'bg-principal/10 font-bold text-principal' : 'font-medium text-tinta/80 hover:bg-black/5'}`}>
              <span aria-hidden="true" className="text-2xl">{icono}</span><span className="break-words leading-tight">{titulo}</span>
              {k === 'pedidos' && pendientes > 0 && <span className="ml-auto grid h-6 min-w-6 place-items-center rounded-full bg-red-600 px-1.5 text-sm font-bold text-white">{pendientes}</span>}
            </button>
          ))}
        </nav>
        <div className="grid gap-2 border-t-2 border-black/5 p-4">
          <a href={`/t/${slug}`} target="_blank" rel="noopener noreferrer" className="flex min-h-[48px] items-center justify-center rounded-xl border-2 border-principal/30 text-lg font-semibold text-principal">Ver mi tienda</a>
          <button type="button" onClick={() => supabase.auth.signOut()} className="min-h-[48px] rounded-xl bg-black/5 text-lg font-semibold">Salir</button>
        </div>
      </aside>

      <div className="min-w-0">
        {/* Cabecera pequeña (celular) */}
        <header className="sticky top-0 z-20 flex items-center gap-3 border-b-2 border-black/5 bg-papel/95 px-4 py-2 backdrop-blur lg:hidden">
          <Logo n={{ nombre: ctx.marca?.nombre, logo: ctx.marca?.logo, logo_auto: ctx.marca?.logo_auto }} tamano={36} />
          <p className="min-w-0 flex-1 break-words text-lg font-bold leading-tight">{ctx.neg.nombre_comercial}</p>
          <Insignia tono="azul">{rolTexto}</Insignia>
        </header>
        <main className="mx-auto w-full max-w-3xl px-4 py-6 text-lg sm:py-8" style={{ paddingBottom: 'calc(var(--barra-inf, 0px) + 2rem)' }}>
          {seccion === 'mas' ? <MenuMas enMas={enMas} ir={ir} slug={slug} /> : children}
        </main>
      </div>

      {/* Barra de abajo (celular) */}
      <nav aria-label="Secciones del panel" className="fixed inset-x-0 bottom-0 z-40 border-t-2 border-black/10 bg-white shadow-[0_-4px_16px_rgba(0,0,0,0.06)] lg:hidden"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <div className="mx-auto grid max-w-3xl" style={{ gridTemplateColumns: `repeat(${pestanas.length}, minmax(0, 1fr))` }}>
          {pestanas.map(([k, icono, texto]) => <Pestana key={k} icono={icono} texto={texto} activa={activa(k)} onClick={() => ir(k)} aviso={k === 'pedidos' ? pendientes : (k === 'mas' && !enBarra.includes('pedidos') ? pendientes : 0)} />)}
        </div>
      </nav>
    </div>
  )
}
