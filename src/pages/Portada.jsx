// Portada pública de la plataforma (lo que ve quien entra sin sesión): qué es, para quién, cómo funciona,
// tiendas y productos reales que ya se venden aquí, y la invitación a vender o a anunciarse.
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { ir } from '../lib/ruta'
import { TIPOS_NEGOCIO, precioTexto } from '../lib/solicitud'
import { urlFoto } from '../cibus/lib/fotos'
import { Logo } from '../tienda/ui'
import PieMatriz from '../tienda/PieMatriz'
import BarraInferior from '../tienda/BarraInferior'
import BotonWhatsApp from '../tienda/BotonWhatsApp'
import { WHATSAPP_BONITO, enlaceWhatsApp } from '../lib/contacto'
import { Isotipo } from '../tienda/MarcaMatriz'
import { modoComputadorEnCelular, preferenciaVista } from '../lib/vistaPantalla'

const dinero = (n) => `$${Math.round(Number(n)).toLocaleString('es-CO')}`
const NOMBRE_TIPO = Object.fromEntries(TIPOS_NEGOCIO.map((t) => [t.clave, t.nombre]))

// Columnas que se adaptan al ANCHO DISPONIBLE (no al de la pantalla): hasta n columnas, cada una de al menos `min` px.
const cols = (n, min, gap = 16) => ({ display: 'grid', gap, gridTemplateColumns: `repeat(auto-fit, minmax(max(${min}px, calc((100% - ${(n - 1) * gap}px) / ${n})), 1fr))` })

const PASOS = [
  ['1', 'Cuéntanos de tu negocio', 'Llenas un formulario corto: qué vendes, tu ciudad y tu celular. Sin pagar nada para empezar.'],
  ['2', 'Cargamos tu catálogo', 'Con fotos y productos listos para vender. Tú le pones tus precios y listo.'],
  ['3', 'Vende por WhatsApp y en línea', 'Tus clientes piden desde el celular, pagan por Nequi, Llave o Daviplata y tú los atiendes desde tu panel.'],
]
const PREGUNTAS = [
  ['¿Cuánto cuesta?', 'El plan Gestión cuesta $39.900 al mes para los primeros 100 negocios, y ese precio se mantiene mientras sigas con nosotros. También hay una vitrina gratis para probar, con tu catálogo y pedidos por WhatsApp.'],
  ['¿Cobran comisión por cada venta?', 'No. Pagas solo tu plan mensual. Los pagos por Nequi, Llave o Daviplata llegan directo a tu número.'],
  ['¿Necesito saber de computadores?', 'No. Te ayudamos a cargar tus productos y todo está pensado para usarse desde el celular, con letra y botones grandes.'],
  ['¿Cómo recibo el dinero de mis clientes?', 'El cliente paga a tu Nequi, Llave o Daviplata, o en efectivo al recibir. Te avisa en la app y tú confirmas cuando el dinero te llega.'],
  ['¿Puedo hacer domicilios?', 'Sí. El cliente marca su dirección en el mapa y el sistema calcula el valor del domicilio según la distancia y tus reglas. Tú decides hasta dónde entregas.'],
  ['¿Cuánto demora tener mi tienda lista?', 'Revisamos tu solicitud en pocos días. Con tus productos cargados, puedes empezar a vender el mismo día en que te aprobamos.'],
  ['¿Qué pasa con mis datos y los de mis clientes?', 'Cada negocio solo ve sus propios datos. No vendemos información. Puedes leer nuestra política de datos personales al pie de la página.'],
  ['¿Puedo cancelar cuando quiera?', 'Sí. No hay permanencia mínima.'],
  ['¿Necesito descargar algo?', 'No. Matriz funciona desde el navegador y se puede instalar como app en el celular con un toque, sin pasar por tiendas de aplicaciones.'],
]
const BENEFICIOS = [
  ['/iconos/tienda-linea.webp', 'Tu tienda en línea', 'Un enlace propio con tu catálogo, tus fotos y tu horario. Se comparte por WhatsApp.'],
  ['/iconos/domicilios.webp', 'Domicilios con mapa', 'El cliente marca su dirección y el sistema calcula el domicilio por kilómetros.'],
  ['/iconos/pagos.webp', 'Pagos Nequi, Llave y Daviplata', 'El cliente te avisa que pagó y tú confirmas en un toque. Sin comisiones.'],
  ['/iconos/inventario.webp', 'Inventario y caja', 'Productos, existencias, ventas, fiados, compras y reportes, desde el celular o el computador.'],
  ['/iconos/escaner.webp', 'Escáner de código de barras', 'Usa la cámara del celular como pistola para vender y buscar productos al instante.'],
  ['/iconos/ofertas.webp', 'Ofertas y publicidad', 'Publica promociones y anuncios en tu tienda para vender más.'],
]

function Boton({ children, onClick, variante = 'oro', className = '' }) {
  const v = variante === 'oro'
    ? 'bg-champagne text-negro hover:bg-champagne-claro'
    : variante === 'linea' ? 'border-2 border-champagne/60 text-champagne-claro hover:bg-white/5'
    : 'bg-negro text-white hover:bg-marca-claro'
  return <button onClick={onClick} className={`inline-flex min-h-[56px] items-center justify-center rounded-2xl px-6 text-lg font-semibold transition active:scale-[0.99] ${v} ${className}`}>{children}</button>
}

function Seccion({ titulo, sub, children, fondo = '', id }) {
  return (
    <section id={id} style={{ scrollMarginTop: 8 }} className={`px-4 py-10 sm:py-14 ${fondo}`}>
      <div className="mx-auto w-full max-w-5xl">
        <h2 className="portada-h2 font-bold leading-tight">{titulo}</h2>
        {sub && <p className="mt-2 max-w-2xl text-lg leading-snug text-tinta/70">{sub}</p>}
        <div className="mt-8">{children}</div>
      </div>
    </section>
  )
}

export default function Portada() {
  const [tiendas, setTiendas] = useState(null)
  const [productos, setProductos] = useState(null)
  const [planes, setPlanes] = useState([])

  // Celular con el navegador en «modo computador»: la página mide ~1000 px y se encoge para caber. Se agranda todo (letra, botones,
  // espacios) para que se lea cómodo, sin cambiar el diseño de computador. Quien eligió la vista «celular» ya la ve en un marco aparte.
  useEffect(() => {
    if (!modoComputadorEnCelular() || preferenciaVista() === 'celular') return
    const raiz = document.documentElement, antes = raiz.style.fontSize
    raiz.style.fontSize = `${Math.min(2.4, Math.max(1.4, window.innerWidth / 560)) * 16}px`
    return () => { raiz.style.fontSize = antes }
  }, [])

  useEffect(() => {
    supabase.rpc('directorio_tiendas', { p_limite: 6 }).then(({ data }) => setTiendas(Array.isArray(data) ? data : []), () => setTiendas([]))
    supabase.rpc('planes_publicos').then(({ data }) => setPlanes(Array.isArray(data) ? data : []), () => {})
    fetch('/muestra-cibus.json').then((r) => (r.ok ? r.json() : [])).then((d) => setProductos(Array.isArray(d) ? d.slice(0, 12) : []), () => setProductos([]))
  }, [])

  // Celular con el navegador en «sitio de computador»: la página mide ~1000 px y se encogería; se amplía para que se lea como en el celular.
  const [zoom] = useState(() => (modoComputadorEnCelular() && preferenciaVista() !== 'computador' ? Math.min(3, window.innerWidth / 420) : 1))
  return (
    <div className="portada bg-papel text-lg text-tinta" style={zoom > 1 ? { zoom } : undefined}>
      <style>{`.portada-h1{font-size:clamp(2.1rem,1.2rem + 3.6vw,3.75rem)}.portada-h2{font-size:clamp(1.7rem,1.2rem + 1.6vw,2.25rem)}${zoom > 1 ? '.portada-h1{font-size:2.3rem}.portada-h2{font-size:1.75rem}' : ''}`}</style>
      {/* Encabezado */}
      <header className="bg-negro px-4 py-3">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Isotipo tamano={36} oscuro />
            <span className="font-display text-2xl font-light uppercase tracking-[0.28em] text-champagne">Matriz</span>
          </div>
          <button onClick={() => ir('/ingreso')} className="min-h-12 rounded-xl border border-champagne/50 px-4 text-base font-semibold text-champagne-claro hover:bg-white/5">Ingresar</button>
        </div>
      </header>

      {/* Héroe */}
      <section className="bg-negro px-4 pb-14 pt-10 text-white">
        <div className="mx-auto w-full max-w-5xl items-center" style={{ display: 'grid', gap: 24, gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 300px), 1fr))' }}>
          <div>
          <p className="text-sm font-semibold uppercase tracking-[0.25em] text-champagne">Para negocios de barrio y comercios</p>
          <h1 className="portada-h1 mt-3 max-w-3xl font-bold leading-tight">Vende por internet sin complicarte. <span className="text-champagne">Tu negocio, en tu celular.</span></h1>
          <p className="mt-5 max-w-2xl text-[clamp(1.05rem,4vw,1.25rem)] leading-snug text-white/80">Matriz le da a tu tienda un catálogo en línea, pedidos por WhatsApp, domicilios con mapa y pagos por Nequi, Llave y Daviplata. Y además manejas tu inventario y tu caja.</p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Boton onClick={() => ir('/registro')}>Registrar mi negocio</Boton>
            <Boton variante="linea" onClick={() => ir('/tiendas')}>Ver tiendas y comprar</Boton>
          </div>
          <p className="mt-4 text-base text-white/60">Empieza gratis · Te ayudamos a cargar tus productos · Hecho en Colombia</p>
          </div>
          <img src="/iconos/carrito.webp" alt="" className="mx-auto w-48 max-w-full object-contain sm:w-64" />
        </div>
      </section>

      {/* Tipos de negocio */}
      <Seccion titulo="Hecho para tu tipo de negocio" sub="Cada negocio arranca con lo que necesita: tiendas, miscelánea, celulares, ferretería, papelería, veterinaria, ropa y más.">
        <div style={cols(3, 132, 12)}>
          {TIPOS_NEGOCIO.map((t) => (
            <button key={t.clave} onClick={() => ir('/registro')} className="flex flex-col items-start gap-1 rounded-2xl border-2 border-black/5 bg-white p-3 text-left shadow-sm transition hover:border-oro/40 sm:p-4">
              <img src={t.imagen} alt="" width="80" height="80" loading="lazy" className="h-14 w-14 object-contain sm:h-20 sm:w-20" />
              <span className="text-lg font-bold leading-tight sm:text-xl">{t.nombre}</span>
              <span className="text-sm leading-snug text-tinta/60 sm:text-base">{t.ejemplos}</span>
            </button>
          ))}
        </div>
      </Seccion>

      {/* Qué ofrece */}
      <Seccion id="beneficios" titulo="Todo lo que necesitas para vender más" fondo="bg-white">
        <div style={cols(3, 150, 12)}>
          {BENEFICIOS.map(([i, t, d]) => (
            <div key={t} className="rounded-2xl border-2 border-black/5 bg-papel p-4 sm:p-5">
              <img src={i} alt="" width="72" height="72" loading="lazy" className="h-[72px] w-[72px] object-contain" />
              <h3 className="mt-2 text-lg font-bold leading-tight sm:text-xl">{t}</h3>
              <p className="mt-1 text-base leading-snug text-tinta/70">{d}</p>
            </div>
          ))}
        </div>
      </Seccion>

      {/* Muestra del catálogo base (el de Cibus): lo que recibe una tienda nueva al registrarse */}
      {productos?.length > 0 && (
        <Seccion titulo="Tu tienda arranca con productos ya cargados" sub="Ejemplos del catálogo base de Matriz, con nombre, categoría y foto. Tú solo le pones tus precios y empiezas a vender.">
          <div style={cols(4, 130, 12)}>
            {productos.map((p, i) => (
              <div key={i} className="overflow-hidden rounded-2xl border-2 border-black/5 bg-white shadow-sm">
                <div className="aspect-square w-full bg-black/5">
                  {urlFoto(p.foto) && <img src={urlFoto(p.foto)} alt={p.nombre} loading="lazy" className="h-full w-full object-contain" />}
                </div>
                <div className="p-3">
                  <p className="break-words text-sm font-semibold leading-tight sm:text-base">{p.nombre}</p>
                  {p.categoria && <p className="text-sm text-tinta/60">{p.categoria}</p>}
                </div>
              </div>
            ))}
          </div>
        </Seccion>
      )}

      {/* Tiendas */}
      {tiendas?.length > 0 && (
        <Seccion titulo="Tiendas que ya están aquí" fondo="bg-white">
          <div style={cols(3, 270, 12)}>
            {tiendas.map((t) => (
              <button key={t.slug} onClick={() => (t.externa && /^https:\/\//.test(t.url || '') ? window.location.assign(t.url) : ir(`/t/${t.slug}`))} className="flex items-center gap-4 rounded-2xl border-2 border-black/5 bg-papel p-4 text-left transition hover:border-oro/40">
                <div className="flex w-16 shrink-0 justify-center">{t.externa && t.logo_url ? <img src={t.logo_url} alt={t.nombre} className="max-h-14 w-full object-contain" /> : <Logo n={t} tamano={56} />}</div>
                <div className="min-w-0">
                  <p className="break-words text-xl font-bold leading-tight">{t.nombre}</p>
                  <p className="text-base text-tinta/60">{NOMBRE_TIPO[t.tipo] || 'Tienda'}{t.ciudad ? ` · ${t.ciudad}` : ''}</p>
                </div>
              </button>
            ))}
          </div>
          <div className="mt-6"><Boton variante="negro" onClick={() => ir('/tiendas')}>Ver todas las tiendas</Boton></div>
        </Seccion>
      )}

      {/* Plan */}
      {planes.some((p) => p.clave === 'gestion') && (() => {
        const g = planes.find((p) => p.clave === 'gestion'), pr = precioTexto(g), c = planes.find((p) => p.clave === 'completo'), v = planes.find((p) => p.clave === 'vitrina')
        return (
          <Seccion id="planes" titulo="Un plan sencillo y claro" sub="Todo lo que tu negocio necesita para vender en línea y llevar su control, por menos de lo que cuesta un almuerzo al día.">
            <div className="mx-auto max-w-xl rounded-3xl border-2 border-champagne bg-white p-6 shadow-sm">
              <span className="inline-block rounded-full bg-champagne px-3 py-0.5 text-sm font-bold text-negro">Recomendado</span>
              <h3 className="mt-2 text-3xl font-bold leading-tight">{g.nombre}</h3>
              <p className="mt-1 text-4xl font-bold text-oro-oscuro">{pr.principal}</p>
              {pr.detalle && <p className="text-base leading-snug text-tinta/60">{pr.detalle}</p>}
              <ul className="mt-4 grid gap-2 text-base leading-snug">
                {['Tu tienda en línea con catálogo y pedidos', 'Domicilios con mapa y pagos Nequi, Llave y Daviplata', 'Caja, inventario, fiados, compras y reportes', 'Escáner de código de barras con el celular', g.max_productos ? `Hasta ${g.max_productos.toLocaleString('es-CO')} productos` : 'Productos sin límite'].map((t) => (
                  <li key={t} className="grid grid-cols-[auto_1fr] gap-2"><span className="font-bold text-esmeralda" aria-hidden="true">✓</span><span>{t}</span></li>
                ))}
              </ul>
              <div className="mt-5"><Boton variante="negro" onClick={() => ir('/registro')} className="w-full">Empezar con Gestión</Boton></div>
            </div>
            <p className="mx-auto mt-4 max-w-xl text-center text-base leading-snug text-tinta/60">
              {c && <>¿Quieres todo? El plan <b>{c.nombre}</b> cuesta {precioTexto(c).principal}. </>}
              {v && <>¿Solo quieres probar? También hay una <button onClick={() => ir('/registro')} className="font-semibold underline">vitrina gratis</button>.</>}
            </p>
          </Seccion>
        )
      })()}

      {/* Cómo funciona */}
      <Seccion titulo="Empieza en tres pasos">
        <ol style={cols(3, 240)}>
          {PASOS.map(([n, t, d]) => (
            <li key={n} className="rounded-2xl border-2 border-black/5 bg-white p-5">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-negro text-xl font-bold text-champagne">{n}</span>
              <h3 className="mt-3 text-xl font-bold leading-tight">{t}</h3>
              <p className="mt-1 text-base leading-snug text-tinta/70">{d}</p>
            </li>
          ))}
        </ol>
      </Seccion>

      {/* Beneficios: negocios y clientes */}
      <Seccion titulo="Una app que gana el tendero y el cliente" sub="Matriz conecta a los negocios del barrio con las personas que quieren comprarles, sin intermediarios.">
        <div style={cols(2, 300, 16)}>
          <div className="rounded-3xl border-2 border-champagne/60 bg-white p-6">
            <h3 className="text-2xl font-bold leading-tight">Para tu negocio</h3>
            <ul className="mt-3 grid gap-2 text-base leading-snug">
              {['Vendes las 24 horas, aunque la tienda esté cerrada', 'Tus clientes piden por el celular y tú solo alistas', 'Sin comisión por venta: el pago llega directo a ti', 'Controlas tu inventario y tu caja sin cuadernos', 'Sales en el mapa de tiendas cerca de tus clientes', 'Te ayudamos a cargar tus productos con foto'].map((t) => (
                <li key={t} className="grid grid-cols-[auto_1fr] gap-2"><span className="font-bold text-esmeralda" aria-hidden="true">✓</span><span>{t}</span></li>
              ))}
            </ul>
          </div>
          <div className="rounded-3xl border-2 border-black/5 bg-white p-6">
            <h3 className="text-2xl font-bold leading-tight">Para tus clientes</h3>
            <ul className="mt-3 grid gap-2 text-base leading-snug">
              {['Ven qué tiendas están abiertas y cuáles les quedan cerca', 'Piden en pocos toques, sin llamar ni esperar', 'Pagan por Nequi, Llave, Daviplata o al recibir', 'Siguen su pedido desde el celular', 'Domicilio calculado por distancia, sin sorpresas', 'Instalan la app en su celular, sin ocupar memoria'].map((t) => (
                <li key={t} className="grid grid-cols-[auto_1fr] gap-2"><span className="font-bold text-esmeralda" aria-hidden="true">✓</span><span>{t}</span></li>
              ))}
            </ul>
          </div>
        </div>
      </Seccion>

      {/* Misión y visión */}
      <Seccion id="nosotros" titulo="Quiénes somos" fondo="bg-white">
        <div style={cols(2, 300, 16)}>
          <div className="rounded-3xl bg-negro p-6 text-white">
            <p className="text-sm font-bold uppercase tracking-[0.25em] text-champagne">Misión</p>
            <p className="mt-3 text-xl leading-snug">Darle a cada negocio de barrio las herramientas de una gran empresa para vender en línea y llevar su control, de forma sencilla, justa y a un precio que pueda pagar.</p>
          </div>
          <div className="rounded-3xl bg-negro p-6 text-white">
            <p className="text-sm font-bold uppercase tracking-[0.25em] text-champagne">Visión</p>
            <p className="mt-3 text-xl leading-snug">Ser la plataforma que conecte a miles de tiendas de Colombia con sus clientes, y que comprar en el comercio de barrio sea tan fácil como pedir por una app.</p>
          </div>
        </div>
        <p className="mt-5 max-w-2xl text-base leading-snug text-tinta/70">Matriz nació dentro de una tienda real de barrio, probada día a día en el mostrador. Por eso cada herramienta está hecha para quien atiende, no para quien mira desde una oficina.</p>
      </Seccion>

      {/* Preguntas frecuentes */}
      <Seccion id="preguntas" titulo="Preguntas frecuentes">
        <div className="grid gap-3">
          {PREGUNTAS.map(([q, r]) => (
            <details key={q} className="group rounded-2xl border-2 border-black/5 bg-white p-4 open:border-champagne/60">
              <summary className="flex min-h-[44px] cursor-pointer list-none items-center justify-between gap-3 text-lg font-bold leading-snug"><span>{q}</span><span className="text-2xl text-oro transition group-open:rotate-45" aria-hidden="true">+</span></summary>
              <p className="mt-2 text-base leading-relaxed text-tinta/80">{r}</p>
            </details>
          ))}
        </div>
        <p className="mt-5 text-base text-tinta/70">¿Otra duda? Escríbenos por <a className="font-semibold underline" href={enlaceWhatsApp('Hola, tengo una pregunta sobre Matriz')}>WhatsApp {WHATSAPP_BONITO}</a>.</p>
      </Seccion>

      {/* Publicidad y cierre */}
      <section className="bg-negro px-4 py-14 text-white">
        <div className="mx-auto w-full max-w-5xl" style={cols(2, 300, 32)}>
          <div>
            <h2 className="text-3xl font-bold leading-tight">¿Quieres que más gente conozca tu marca?</h2>
            <p className="mt-3 text-lg leading-snug text-white/80">Anuncia tu producto o tu negocio en Matriz: tu publicidad llega a clientes que ya están comprando en tiendas de su barrio. Escríbenos y te contamos.</p>
            <a href={enlaceWhatsApp('Hola, quiero anunciarme en Matriz')} className="mt-5 inline-flex min-h-[56px] items-center justify-center rounded-2xl border-2 border-champagne/60 px-6 text-lg font-semibold text-champagne-claro hover:bg-white/5">Quiero anunciarme</a>
          </div>
          <div className="rounded-2xl border border-champagne/30 bg-white/5 p-6">
            <h2 className="text-3xl font-bold leading-tight">Tu negocio también puede estar aquí</h2>
            <p className="mt-3 text-lg leading-snug text-white/80">Regístralo hoy. Revisamos tu solicitud y te ayudamos a dejarlo funcionando.</p>
            <div className="mt-5"><Boton onClick={() => ir('/registro')} className="w-full">Registrar mi negocio</Boton></div>
          </div>
        </div>
      </section>
      <PieMatriz />
      <BotonWhatsApp />
      <BarraInferior activa="/" />
    </div>
  )
}
