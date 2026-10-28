import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { aplicarMarca, quitarMarca } from '../lib/marca'
import { ir } from '../lib/ruta'
import { useSesion } from '../lib/sesion'
import { totales, costoDomicilioCalculado, mensajePedido, urlWhatsapp, cop } from '../lib/pedido'
import { Btn, Volver, Aviso, Logo, BarraFija, PiePlataforma, InsigniaHorario } from './ui'
import { resumenHorario } from '../lib/horario'
import Catalogo from './Catalogo'
import { MenuDelDia, MusicaFondo, Opiniones, SeguirPedido } from './Extras'
import Instalar from './Instalar'
import { Carrito, Datos, Revisar } from './Pasos'
import { entrarConGoogle } from '../lib/google'
import EntrarCodigo from './EntrarCodigo'
import { listar, textoDireccion } from '../lib/direcciones'

const guardar = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)) } catch { /* sin almacenamiento: la tienda funciona igual */ } }
const leer = (k, def) => { try { const t = localStorage.getItem(k); return t ? JSON.parse(t) : def } catch { return def } }
const idVisitante = () => {
  let id = leer('visitante', null)
  if (!id) { id = (crypto.randomUUID?.() || String(Math.random()).slice(2) + Date.now()).replace(/-/g, ''); guardar('visitante', id) }
  return id
}

export default function Tienda({ slug }) {
  const sesion = useSesion()
  const [n, setN] = useState(undefined)
  const [catalogo, setCatalogo] = useState(null)
  const [extras, setExtras] = useState(null)   // menú del día, música y opiniones (cada uno solo si el módulo está activo)
  const [error, setError] = useState('')
  const [detalle, setDetalle] = useState('')
  const [carrito, setCarrito] = useState(() => leer(`carrito:${slug}`, {}))
  const [paso, setPaso] = useState('catalogo')   // catalogo · carrito · datos · revisar · listo
  const [datos, setDatos] = useState(() => ({ entrega: 'domicilio', nombre: '', telefono: '', direccion: '', nota: '', ...leer('cliente', {}) }))
  const [calculo, setCalculo] = useState(null)   // cálculo de domicilio hecho por el servidor (solo en el modo por km)
  const [acepta, setAcepta] = useState(false)
  const [promos, setPromos] = useState(false)
  const [practica, setPractica] = useState(false)
  const [rol, setRol] = useState(null)
  const [enviando, setEnviando] = useState(false)
  const [errPedido, setErrPedido] = useState('')
  const [resultado, setResultado] = useState(null)
  const avisoCarrito = useRef(false)

  // Tienda + catálogo
  useEffect(() => {
    let vivo = true
    setN(undefined); setCatalogo(null); setExtras(null); setError('')
    ;(async () => {
      const { data: t, error: et } = await supabase.rpc('negocio_publico', { p_slug: slug })
      if (!vivo) return
      if (et) setDetalle(`${et.code || ''} ${et.message || ''}`.trim())
      setN(t ?? null)
      if (!t) return
      aplicarMarca(t)
      if (t.modulos.includes('catalogo_publico') && ['opiniones', 'menu_del_dia', 'musica_fondo'].some((m) => t.modulos.includes(m))) {
        supabase.rpc('extras_tienda', { p_slug: slug }).then(({ data }) => { if (vivo) setExtras(data || null) }, () => {})
      }
      if (!t.modulos.includes('catalogo_publico') || !t.modulos.includes('productos')) { setCatalogo({ productos: [], categorias: [], ofertas: [], promociones: [] }); return }
      const { data: c, error: e } = await supabase.rpc('catalogo_tienda', { p_slug: slug })
      if (!vivo) return
      if (e || !c) setError('No pudimos cargar los productos. Intenta de nuevo en un momento.')
      else setCatalogo(c)
      if (!t.vista_previa) supabase.rpc('registrar_visita', { p_slug: slug, p_catalogo: 'tienda', p_visitante: idVisitante() }).then(() => {}, () => {})
    })()
    return () => { vivo = false; quitarMarca() }
  }, [slug])

  // Rol de quien mira: soporte (solo lectura) o personal de la tienda
  useEffect(() => {
    setRol(null)
    if (!sesion) return
    supabase.rpc('mis_negocios').then(({ data }) => setRol((data || []).find((x) => x.slug === slug)?.rol ?? null))
  }, [sesion, slug])

  useEffect(() => { guardar(`carrito:${slug}`, carrito) }, [carrito, slug])

  // Cliente con Google: sus datos guardados llenan el pedido (solo lo que esté vacío)
  useEffect(() => {
    if (!sesion || !n?.modulos?.includes('mis_pedidos')) return
    supabase.rpc('mi_perfil_cliente').then(({ data }) => {
      if (data) setDatos((d) => ({ ...d, nombre: d.nombre || data.nombre || '', telefono: d.telefono || data.telefono || '', direccion: d.direccion || data.direccion || '' }))
    }, () => {})
  }, [sesion, n])

  // Modo tarifa fija: la última dirección guardada llena el campo (si está vacío). En modo km lo hace la pantalla de direcciones.
  useEffect(() => {
    if (!n || n.domicilio_modo === 'km') return
    listar(sesion ? {} : null, (...a) => supabase.rpc(...a)).then((r) => {
      const d = r.lista[0]
      if (d) setDatos((x) => (x.direccion ? x : { ...x, direccion: textoDireccion(d) }))
    }, () => {})
  }, [sesion, n])

  // El carrito solo conserva productos que siguen existiendo y disponibles
  const items = useMemo(() => {
    if (!catalogo) return []
    return Object.entries(carrito).map(([id, cantidad]) => ({ producto: catalogo.productos.find((p) => p.id === id), cantidad }))
      .filter((x) => x.producto && x.producto.disponible && x.cantidad > 0)
  }, [carrito, catalogo])
  const tot = useMemo(() => totales(items, catalogo?.promociones), [items, catalogo])
  const cuenta = items.reduce((s, x) => s + x.cantidad, 0)

  const recargarExtras = () => supabase.rpc('extras_tienda', { p_slug: slug }).then(({ data }) => setExtras(data || null), () => {})

  const cambiar = (id, c) => setCarrito((prev) => {
    const sig = { ...prev }
    if (c <= 0) delete sig[id]; else sig[id] = Math.min(c, 99)
    return sig
  })
  const irA = (p) => { setPaso(p); window.scrollTo({ top: 0 }) }

  if (n === undefined) return <p className="py-24 text-center text-xl text-tinta/60">Cargando la tienda…</p>
  if (n === null) {
    return (
      <main className="mx-auto max-w-xl px-4 py-16 text-center">
        <h1 className="mb-3 text-3xl font-bold">Esta tienda no está disponible</h1>
        <p className="text-xl text-tinta/70">Puede que todavía no haya abierto o que la dirección esté mal escrita.</p>
        {detalle && <p className="mt-6 break-words rounded-xl border border-black/10 bg-white p-3 text-left text-sm text-tinta/70">Detalle técnico: {detalle}</p>}
        <PiePlataforma />
      </main>
    )
  }

  const simulado = rol === 'soporte'
  const personal = rol === 'dueno' || rol === 'cajero'
  const pedidosOk = n.modulos.includes('pedidos_en_linea') && n.modulos.includes('productos')
  const conCuenta = n.modulos.includes('mis_pedidos')
  const entrarGoogle = () => entrarConGoogle()
  const esPractica = personal && (n.vista_previa || practica)

  async function confirmar() {
    setEnviando(true); setErrPedido('')
    const km = n.domicilio_modo === 'km' && n.modulos.includes('domicilio_km')
    const dom = datos.entrega === 'domicilio'
    try {
      let r
      if (simulado) {
        const d = dom ? costoDomicilioCalculado(n, tot.subtotal, calculo) : 0
        r = { numero: 'PRUEBA', subtotal: tot.subtotal, domicilio: d || 0, total: tot.subtotal + (d || 0), entrega: datos.entrega,
              lineas: tot.lineas.map((l) => ({ nombre: l.producto.nombre, unidad: l.producto.unidad, cantidad: l.cantidad, subtotal: l.total, promo: l.promo })), es_practica: true }
      } else {
        const payload = {
          entrega: datos.entrega, nombre: datos.nombre.trim(), telefono: datos.telefono, direccion: dom ? datos.direccion.trim() : '',
          nota: datos.nota.trim(), acepta_datos: true, acepta_promos: promos,
          ...(dom && km ? (calculo?.calculo_id ? { calculo_id: calculo.calculo_id } : { sin_calculo: 'true' }) : {}), ...(esPractica ? { practica: 'true' } : {}),
        }
        const { data, error: e } = await supabase.rpc('crear_pedido_tienda', {
          p_slug: slug, p_datos: payload, p_items: items.map((x) => ({ producto_id: x.producto.id, cantidad: x.cantidad })),
        })
        if (e) throw new Error(e.message)
        r = data
        guardar('cliente', { nombre: datos.nombre.trim(), telefono: datos.telefono, direccion: datos.direccion.trim() })
        setCarrito({}); setCalculo(null)
      }
      setResultado({ ...r, direccion: dom ? datos.direccion.trim() : '', nota: datos.nota.trim(), nombre: datos.nombre.trim() })
      irA('listo')
    } catch (e) {
      if (/venció|vuelve a calcular/i.test(e.message)) { setCalculo(null); irA('datos'); setErrPedido(''); return }
      setErrPedido(/^[\wÀ-ÿ"«»¿¡]/.test(e.message) && e.message.length < 200 ? e.message : 'No pudimos enviar tu pedido. Intenta de nuevo o escríbenos por WhatsApp.')
    } finally { setEnviando(false) }
  }

  function abrirCarrito() {
    if (!avisoCarrito.current && !rol && !n.vista_previa) { avisoCarrito.current = true; supabase.rpc('registrar_evento', { p_slug: slug, p_evento: 'abrio_carrito' }).then(() => {}, () => {}) }
    irA('carrito')
  }

  const cuerpo = (() => {
    if (paso === 'carrito') return <Carrito tot={tot} cambiar={cambiar} volver={() => irA('catalogo')} seguir={() => irA('datos')} />
    if (paso === 'datos') return <Datos invitarGoogle={conCuenta && !sesion && !personal} entrarGoogle={entrarGoogle} sesion={sesion} n={n} slug={slug} tot={tot} datos={datos} setDatos={setDatos} calculo={calculo} setCalculo={setCalculo} soloLectura={false} volver={() => irA('carrito')} seguir={() => irA('revisar')} />
    if (paso === 'revisar') {
      return <Revisar n={n} tot={tot} datos={datos} calculo={calculo} volver={() => irA('datos')} confirmar={confirmar} enviando={enviando} error={errPedido}
        personal={personal} simulado={simulado} practica={practica} setPractica={setPractica} acepta={acepta} setAcepta={setAcepta} promos={promos} setPromos={setPromos} />
    }
    if (paso === 'listo' && resultado) return <Listo n={n} r={resultado} slug={slug} conSesion={conCuenta && !!sesion && !personal} verMisPedidos={() => ir(`/t/${slug}/mis-pedidos`)} volver={() => { setResultado(null); setAcepta(false); irA('catalogo') }} />
    return null
  })()

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-6 text-lg sm:py-10">
      {(n.vista_previa || simulado) && paso !== 'listo' && (
        <div className="mb-5"><Aviso tipo="previa">
          {n.vista_previa && <><b>Vista previa.</b> Esta tienda todavía no está publicada: solo la ven su equipo y el soporte. </>}
          {simulado && <><b>Modo soporte (solo lectura).</b> Puedes probar todo el recorrido; los pedidos son simulados.</>}
          {personal && n.vista_previa && <>Tus pedidos aquí serán de práctica.</>}
        </Aviso></div>
      )}

      {paso === 'catalogo' && (
        <>
          {conCuenta && !personal && !simulado && (
            <div className="mb-4 grid grid-cols-1 gap-2">
              {sesion ? <Btn variante="suave" onClick={() => ir(`/t/${slug}/mis-pedidos`)}>Mis pedidos</Btn> : <><Btn variante="suave" onClick={entrarGoogle}>Entrar con Google</Btn><EntrarCodigo /></>}
            </div>
          )}
          <header className="mb-6 flex flex-col items-center gap-3 text-center">
            <Logo n={n} />
            <h1 className="break-words text-3xl font-bold leading-tight text-principal sm:text-4xl">{n.nombre}</h1>
            {n.eslogan && <p className="text-xl text-tinta/70">{n.eslogan}</p>}
            <div className="h-1 w-20 rounded bg-secundario" />
            <div className="space-y-1 text-lg text-tinta/80">
              <InsigniaHorario estado={n.estado_horario} />
              {(n.horario_semana ? resumenHorario(n.horario_semana) : n.horario) && <p>🕒 {n.horario_semana ? resumenHorario(n.horario_semana) : n.horario}</p>}
              {(n.direccion || n.ciudad) && <p>📍 {[n.direccion, n.ciudad].filter(Boolean).join(', ')}</p>}
              {n.zona_domicilio && <p>🛵 {n.zona_domicilio}</p>}
              {n.envio_gratis_desde > 0 && <p>Domicilio sin costo desde {cop(n.envio_gratis_desde)}</p>}
            </div>
          </header>

          <MusicaFondo musica={extras?.musica} />
          <MenuDelDia menu={extras?.menu_hoy} />

          {error && <Aviso tipo="error">{error}</Aviso>}
          {!catalogo && !error && <p className="py-10 text-center text-xl text-tinta/60">Cargando productos…</p>}
          {catalogo && <div className={cuenta > 0 ? 'pb-36' : ''}><Catalogo catalogo={catalogo} carrito={carrito} cambiar={cambiar} /></div>}

          <Opiniones slug={slug} datos={extras?.opiniones} sesion={sesion} personal={personal || simulado} entrarGoogle={entrarGoogle} recargar={recargarExtras} />
          {pedidosOk && !personal && !simulado && <SeguirPedido slug={slug} />}

          {!pedidosOk && urlWhatsapp(n.whatsapp, `Hola ${n.nombre}, vi su catálogo y quiero hacer un pedido.`) && (
            <div className="mt-6"><a href={urlWhatsapp(n.whatsapp, `Hola ${n.nombre}, vi su catálogo y quiero hacer un pedido.`)} className="flex min-h-[56px] items-center justify-center rounded-2xl bg-[#128C4A] px-6 text-lg font-semibold text-white">Escribir por WhatsApp</a></div>
          )}

          {pedidosOk && cuenta > 0 && (
            <BarraFija>
              <div className="flex items-baseline justify-between gap-3 text-2xl font-bold"><span>{cuenta} {cuenta === 1 ? 'producto' : 'productos'}</span><span>{cop(tot.subtotal)}</span></div>
              <Btn className="mt-2" onClick={abrirCarrito}>Ver mi pedido</Btn>
            </BarraFija>
          )}
        </>
      )}

      {cuerpo}

      <footer className="mt-10 flex flex-col items-center gap-1">
        {paso === 'catalogo' && !personal && !simulado && <div className="mb-4 w-full"><Instalar /></div>}
        <button onClick={() => ir(`/t/${slug}/panel`)} className="min-h-[44px] text-base text-tinta/50 underline">Acceso del personal</button>
      </footer>
      <PiePlataforma />
    </main>
  )
}

function Listo({ n, r, volver, conSesion, verMisPedidos }) {
  const practica = r.es_practica
  const texto = mensajePedido({ tienda: n.nombre, numero: r.numero, nombre: r.nombre, lineas: r.lineas, subtotal: r.subtotal, domicilio: r.domicilio, total: r.total, entrega: r.entrega, direccion: r.direccion, nota: r.nota, practica })
  const wa = urlWhatsapp(n.whatsapp, texto)
  const aviso = () => { if (!practica) supabase.rpc('registrar_evento', { p_slug: n.slug, p_evento: 'envio_whatsapp' }).then(() => {}, () => {}) }
  return (
    <div className="pb-6">
      <div className="mb-5 text-center">
        <div aria-hidden="true" className="mx-auto mb-3 flex h-20 w-20 items-center justify-center rounded-full bg-[#128C4A] text-5xl text-white">✓</div>
        <h2 className="text-3xl font-bold leading-tight">{practica ? 'Pedido de prueba listo' : '¡Pedido recibido!'}</h2>
        <p className="mt-1 text-2xl font-bold text-principal">Número {r.numero}</p>
      </div>
      <div className="mb-5 rounded-2xl border-2 border-black/5 bg-white p-4">
        <ul className="space-y-2">{r.lineas.map((l, i) => <li key={i} className="flex items-baseline justify-between gap-3 text-lg"><span className="break-words">{l.cantidad} × {l.nombre}</span><span className="font-semibold">{cop(l.subtotal)}</span></li>)}</ul>
        <hr className="my-3" />
        <div className="space-y-1 text-lg">
          <div className="flex justify-between"><span>Productos</span><span>{cop(r.subtotal)}</span></div>
          <div className="flex justify-between"><span>Domicilio</span><span>{r.entrega === 'recoger' ? 'Lo recoges' : r.domicilio > 0 ? cop(r.domicilio) : 'Sin costo'}</span></div>
          <div className="flex justify-between text-2xl font-bold"><span>Total</span><span>{cop(r.total)}</span></div>
        </div>
      </div>
      {practica ? (
        <div className="mb-4 space-y-3">
          <Aviso tipo="previa"><b>Es una prueba.</b> Un cliente real vería aquí el botón verde «Enviar por WhatsApp». Para no escribirle a la tienda de verdad, en la prueba solo mostramos el mensaje:</Aviso>
          <pre className="whitespace-pre-wrap break-words rounded-2xl border-2 border-black/10 bg-white p-4 font-sans text-base">{texto}</pre>
        </div>
      ) : wa ? (
        <>
          <div className="mb-4"><Aviso tipo="ok"><b>Último paso:</b> toca el botón verde para enviarle el pedido a la tienda por WhatsApp. Así lo confirman contigo.</Aviso></div>
          <a href={wa} onClick={aviso} target="_blank" rel="noopener noreferrer" className="mb-3 flex min-h-[64px] w-full items-center justify-center rounded-2xl bg-[#128C4A] px-6 text-xl font-bold text-white shadow-sm">Enviar por WhatsApp</a>
        </>
      ) : <div className="mb-4"><Aviso>La tienda ya tiene tu pedido y te contactará al número que dejaste.</Aviso></div>}
      {conSesion && !practica && <div className="mb-3"><Btn variante="suave" onClick={verMisPedidos}>Ver el estado de mi pedido</Btn></div>}
      <Btn variante="suave" onClick={volver}>Volver a la tienda</Btn>
    </div>
  )
}
