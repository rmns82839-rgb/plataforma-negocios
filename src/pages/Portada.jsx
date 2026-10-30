// Portada pública de la plataforma (lo que ve quien entra sin sesión): qué es, para quién, cómo funciona,
// tiendas y productos reales que ya se venden aquí, y la invitación a vender o a anunciarse.
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { ir } from '../lib/ruta'
import { TIPOS_NEGOCIO } from '../lib/solicitud'
import { urlFoto } from '../cibus/lib/fotos'
import { Logo, PiePlataforma } from '../tienda/ui'
import { Isotipo } from '../tienda/MarcaMatriz'

const dinero = (n) => `$${Math.round(Number(n)).toLocaleString('es-CO')}`
const NOMBRE_TIPO = Object.fromEntries(TIPOS_NEGOCIO.map((t) => [t.clave, t.nombre]))

const PASOS = [
  ['1', 'Cuéntanos de tu negocio', 'Llenas un formulario corto: qué vendes, tu ciudad y tu celular. Sin pagar nada para empezar.'],
  ['2', 'Cargamos tu catálogo', 'Con fotos y productos listos para vender. Tú le pones tus precios y listo.'],
  ['3', 'Vende por WhatsApp y en línea', 'Tus clientes piden desde el celular, pagan por Nequi, Llave o Daviplata y tú los atiendes desde tu panel.'],
]
const BENEFICIOS = [
  ['🛍️', 'Tu tienda en línea', 'Un enlace propio con tu catálogo, tus fotos y tu horario. Se comparte por WhatsApp.'],
  ['🛵', 'Domicilios con mapa', 'El cliente marca su dirección y el sistema calcula el domicilio por kilómetros.'],
  ['💸', 'Pagos Nequi, Llave y Daviplata', 'El cliente te avisa que pagó y tú confirmas en un toque. Sin comisiones.'],
  ['📦', 'Inventario y caja', 'Productos, existencias, ventas, fiados, compras y reportes, desde el celular o el computador.'],
  ['📷', 'Escáner de código de barras', 'Usa la cámara del celular como pistola para vender y buscar productos al instante.'],
  ['📣', 'Ofertas y publicidad', 'Publica promociones y anuncios en tu tienda para vender más.'],
]

function Boton({ children, onClick, variante = 'oro', className = '' }) {
  const v = variante === 'oro'
    ? 'bg-champagne text-negro hover:bg-champagne-claro'
    : variante === 'linea' ? 'border-2 border-champagne/60 text-champagne-claro hover:bg-white/5'
    : 'bg-negro text-white hover:bg-marca-claro'
  return <button onClick={onClick} className={`inline-flex min-h-[56px] items-center justify-center rounded-2xl px-6 text-lg font-semibold transition active:scale-[0.99] ${v} ${className}`}>{children}</button>
}

function Seccion({ titulo, sub, children, fondo = '' }) {
  return (
    <section className={`px-4 py-12 ${fondo}`}>
      <div className="mx-auto w-full max-w-5xl">
        <h2 className="text-3xl font-bold leading-tight sm:text-4xl">{titulo}</h2>
        {sub && <p className="mt-2 max-w-2xl text-lg leading-snug text-tinta/70">{sub}</p>}
        <div className="mt-8">{children}</div>
      </div>
    </section>
  )
}

export default function Portada() {
  const [tiendas, setTiendas] = useState(null)
  const [productos, setProductos] = useState(null)

  useEffect(() => {
    supabase.rpc('directorio_tiendas', { p_limite: 6 }).then(({ data }) => setTiendas(Array.isArray(data) ? data : []), () => setTiendas([]))
    fetch('/muestra-cibus.json').then((r) => (r.ok ? r.json() : [])).then((d) => setProductos(Array.isArray(d) ? d.slice(0, 12) : []), () => setProductos([]))
  }, [])

  return (
    <div className="bg-papel text-lg text-tinta">
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
        <div className="mx-auto grid w-full max-w-5xl items-center gap-6 lg:grid-cols-[1fr_320px]">
          <div>
          <p className="text-sm font-semibold uppercase tracking-[0.25em] text-champagne">Para negocios de barrio y comercios</p>
          <h1 className="mt-3 max-w-3xl text-4xl font-bold leading-tight sm:text-6xl">Vende por internet sin complicarte. <span className="text-champagne">Tu negocio, en tu celular.</span></h1>
          <p className="mt-5 max-w-2xl text-xl leading-snug text-white/80">Matriz le da a tu tienda un catálogo en línea, pedidos por WhatsApp, domicilios con mapa y pagos por Nequi, Llave y Daviplata. Y además manejas tu inventario y tu caja.</p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Boton onClick={() => ir('/registro')}>Registrar mi negocio</Boton>
            <Boton variante="linea" onClick={() => ir('/tiendas')}>Ver tiendas y comprar</Boton>
          </div>
          <p className="mt-4 text-base text-white/60">Empieza gratis · Te ayudamos a cargar tus productos · Hecho en Colombia</p>
          </div>
          <img src="/iconos/carrito.webp" alt="" className="mx-auto hidden w-72 object-contain lg:block" />
        </div>
      </section>

      {/* Tipos de negocio */}
      <Seccion titulo="Hecho para tu tipo de negocio" sub="Cada negocio arranca con lo que necesita: tiendas, miscelánea, celulares, ferretería, papelería, veterinaria, ropa y más.">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {TIPOS_NEGOCIO.map((t) => (
            <button key={t.clave} onClick={() => ir('/registro')} className="flex flex-col items-start gap-1 rounded-2xl border-2 border-black/5 bg-white p-4 text-left shadow-sm transition hover:border-oro/40">
              <img src={t.imagen} alt="" width="80" height="80" loading="lazy" className="h-20 w-20 object-contain" />
              <span className="text-xl font-bold leading-tight">{t.nombre}</span>
              <span className="text-base leading-snug text-tinta/60">{t.ejemplos}</span>
            </button>
          ))}
        </div>
      </Seccion>

      {/* Qué ofrece */}
      <Seccion titulo="Todo lo que necesitas para vender más" fondo="bg-white">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {BENEFICIOS.map(([i, t, d]) => (
            <div key={t} className="rounded-2xl border-2 border-black/5 bg-papel p-5">
              <p className="text-3xl" aria-hidden="true">{i}</p>
              <h3 className="mt-2 text-xl font-bold leading-tight">{t}</h3>
              <p className="mt-1 text-base leading-snug text-tinta/70">{d}</p>
            </div>
          ))}
        </div>
      </Seccion>

      {/* Muestra del catálogo base (el de Cibus): lo que recibe una tienda nueva al registrarse */}
      {productos?.length > 0 && (
        <Seccion titulo="Tu tienda arranca con productos ya cargados" sub="Ejemplos del catálogo base de Matriz, con nombre, categoría y foto. Tú solo le pones tus precios y empiezas a vender.">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {productos.map((p, i) => (
              <div key={i} className="overflow-hidden rounded-2xl border-2 border-black/5 bg-white shadow-sm">
                <div className="aspect-square w-full bg-black/5">
                  {urlFoto(p.foto) && <img src={urlFoto(p.foto)} alt={p.nombre} loading="lazy" className="h-full w-full object-contain" />}
                </div>
                <div className="p-3">
                  <p className="break-words text-base font-semibold leading-tight">{p.nombre}</p>
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
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {tiendas.map((t) => (
              <button key={t.slug} onClick={() => ir(`/t/${t.slug}`)} className="flex items-center gap-4 rounded-2xl border-2 border-black/5 bg-papel p-4 text-left transition hover:border-oro/40">
                <div className="flex w-16 shrink-0 justify-center"><Logo n={t} tamano={56} /></div>
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

      {/* Cómo funciona */}
      <Seccion titulo="Empieza en tres pasos">
        <ol className="grid gap-4 sm:grid-cols-3">
          {PASOS.map(([n, t, d]) => (
            <li key={n} className="rounded-2xl border-2 border-black/5 bg-white p-5">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-negro text-xl font-bold text-champagne">{n}</span>
              <h3 className="mt-3 text-xl font-bold leading-tight">{t}</h3>
              <p className="mt-1 text-base leading-snug text-tinta/70">{d}</p>
            </li>
          ))}
        </ol>
      </Seccion>

      {/* Publicidad y cierre */}
      <section className="bg-negro px-4 py-14 text-white">
        <div className="mx-auto grid w-full max-w-5xl gap-8 lg:grid-cols-2">
          <div>
            <h2 className="text-3xl font-bold leading-tight">¿Quieres que más gente conozca tu marca?</h2>
            <p className="mt-3 text-lg leading-snug text-white/80">Anuncia tu producto o tu negocio en Matriz: tu publicidad llega a clientes que ya están comprando en tiendas de su barrio. Escríbenos y te contamos.</p>
            <a href="https://wa.me/573005008432?text=Hola%2C%20quiero%20anunciarme%20en%20Matriz" className="mt-5 inline-flex min-h-[56px] items-center justify-center rounded-2xl border-2 border-champagne/60 px-6 text-lg font-semibold text-champagne-claro hover:bg-white/5">Quiero anunciarme</a>
          </div>
          <div className="rounded-2xl border border-champagne/30 bg-white/5 p-6">
            <h2 className="text-3xl font-bold leading-tight">Tu negocio también puede estar aquí</h2>
            <p className="mt-3 text-lg leading-snug text-white/80">Regístralo hoy. Revisamos tu solicitud y te ayudamos a dejarlo funcionando.</p>
            <div className="mt-5"><Boton onClick={() => ir('/registro')} className="w-full">Registrar mi negocio</Boton></div>
          </div>
        </div>
      </section>
      <div className="px-4 pb-10"><PiePlataforma /></div>
    </div>
  )
}
