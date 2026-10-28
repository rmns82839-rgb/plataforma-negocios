// Catálogo público de ropa (ruta /ropa). No requiere sesión.
// El cliente arma su pedido y se envía por WhatsApp a la tienda.
import { useVisitante } from '../lib/enVivo'
import { useEffect, useMemo, useRef, useState } from 'react'
import { claseInput } from '../lib/estilos'
import { coincide } from '../lib/buscar'
import CategoriasImagen from './CategoriasImagen'
import FranjaConfianza from './FranjaConfianza'
import TituloSeccion from './TituloSeccion'
import Revelar from './Revelar'
import AnuncioPublico from './AnuncioPublico'
import BuscadorFlotante from './BuscadorFlotante'
import { CATEGORIAS_CON_IMAGEN, FRANJA_CONFIANZA, BARRA_ENVIO_GRATIS } from '../lib/catalogoOpciones'
import { supabase } from '../lib/supabase'
import { leerBorrador, guardarBorrador, TRES_DIAS } from '../lib/borrador'
import { dinero } from '../lib/formato'
import Modal from './Modal'
import Carrusel from './Carrusel'
import { fotosDe } from '../lib/fotos'
import { rutaPrenda, idDeLaDireccion } from '../lib/tiendaUrl'
import CabeceraPublica from './CabeceraPublica'
import { useCopiado, textoCopiar } from '../lib/useCopiado'
import FiltroCategorias from './FiltroCategorias'
import OfertasPublicas from './OfertasPublicas'
import BotonesFlotantes from './BotonesFlotantes'
import BarraCatalogo, { AvisoAgregado, Sugeridos } from './BarraCatalogo'
import DatosPedido from './DatosPedido'
import { useNegocioPublico } from '../lib/useNegocioPublico'
import { soloDigitos, datosGuardados, validarDatos, datosParaServidor, recordarDatos, lineaDatos } from '../lib/datosCliente'
import PiePublico from './PiePublico'
import Espera from './Espera'
import { GENEROS, textoGenero, mejorPromoPrenda, etiquetaPromo, precioConPromo, totalesPedido } from '../lib/ropa'

const WHATSAPP_ENV = (import.meta.env.VITE_WHATSAPP_NUMBER || '').replace(/\D/g, '')

/** Prendas parecidas (misma categoría; si faltan, de las demás) para invitar a seguir mirando. */
const sugeridosDe = (prendas, actual) => {
  const hay = (p) => p.id !== actual.id && p.prenda_variantes.some(v => v.stock > 0)
  const misma = prendas.filter(p => hay(p) && p.categoria === actual.categoria)
  const otras = prendas.filter(p => hay(p) && p.categoria !== actual.categoria)
  return [...misma, ...otras].slice(0, 4).map(p => ({ id: p.id, nombre: p.nombre, imagen: fotosDe(p)[0], precio: p.precio }))
}

const enlacePrenda = (p) => `${window.location.origin}${rutaPrenda(p)}`

function DetallePrenda({ prenda, promos, sugeridos, onVerOtro, onAgregar, onCerrar }) {
  const promo = mejorPromoPrenda(promos, prenda, 1)
  const nxm = promos.find(p => p.tipo === 'nxm' && mejorPromoPrenda([p], prenda, p.lleva))
  const [varId, setVarId] = useState('')
  const [copiado, copiar] = useCopiado()
  const elegida = prenda.prenda_variantes.find(v => v.id === varId)

  const compartir = async () => {
    const url = enlacePrenda(prenda)
    if (navigator.share) {
      try { await navigator.share({ title: prenda.nombre, url }); return } catch { /* canceló */ }
    }
    await copiar(url)
  }

  return (
    <Modal titulo={prenda.nombre} onCerrar={onCerrar} ancho="max-w-md lg:max-w-4xl">
      <div className="grid gap-4 lg:grid-cols-2 lg:gap-8 lg:items-start">
      <Carrusel imagenes={fotosDe(prenda)} alt={prenda.nombre} />
      <div className="space-y-4">
      <div className="grid grid-cols-[1fr_auto] gap-3 items-center">
        <div className="grid">
          {precioConPromo(promo, prenda) != null ? (
            <>
              <p className="text-2xl font-bold text-oro-oscuro">{dinero(precioConPromo(promo, prenda))}</p>
              <p className="text-xs text-slate-400"><span className="line-through">{dinero(prenda.precio)}</span> · {promo.nombre}</p>
            </>
          ) : (
            <>
              <p className="text-2xl font-bold text-oro-oscuro">{dinero(prenda.precio)}</p>
              {nxm && <p className="text-xs font-medium text-oro-oscuro">{nxm.nombre}: lleva {nxm.lleva} y paga {nxm.paga}</p>}
            </>
          )}
        </div>
        <button onClick={compartir}
          className="h-10 px-4 rounded-xl bg-lima/20 text-marca text-sm font-semibold active:bg-lima/30">
          {copiado ? textoCopiar(copiado, 'Compartir') : 'Compartir'}
        </button>
      </div>
      {prenda.descripcion && <p className="text-sm text-slate-500">{prenda.descripcion}</p>}

      <div className="space-y-2">
        <p className="text-xs font-medium text-slate-500">Elige talla y color</p>
        <div className="grid grid-cols-2 gap-2">
          {prenda.prenda_variantes.map(v => (
            <button key={v.id} disabled={v.stock <= 0} onClick={() => setVarId(v.id)}
              className={`h-12 rounded-xl text-sm font-medium transition ${
                varId === v.id ? 'bg-marca text-white'
                : v.stock <= 0 ? 'bg-slate-50 text-slate-300 line-through'
                : 'bg-slate-100 text-slate-700'}`}>
              {v.talla}{v.color ? ` · ${v.color}` : ''}
            </button>
          ))}
        </div>
        {prenda.prenda_variantes.length === 0 && (
          <p className="text-sm text-slate-400">Sin tallas disponibles por ahora</p>
        )}
      </div>

      <button disabled={!elegida} onClick={() => onAgregar(prenda, elegida)}
        className="w-full h-12 rounded-xl bg-marca text-white font-semibold disabled:opacity-30 active:bg-marca-oscuro">
        Agregar al pedido
      </button>
      <Sugeridos items={sugeridos} onVer={onVerOtro} />
      </div>
      </div>
    </Modal>
  )
}

const CLAVE_BORRADOR = 'borrador-ropa'

const textoDomicilio = (dom, base) =>
  (dom == null ? '' : dom === 0 ? '\nDomicilio: gratis' : `\nDomicilio: ${dinero(dom)}\nTotal con domicilio: ${dinero(base + dom)}`)

export default function CatalogoPublico() {
  const negocio = useNegocioPublico()
  const WHATSAPP = soloDigitos(negocio?.whatsapp) || WHATSAPP_ENV   // el del negocio manda; si no, el de la configuración
  const [prendas, setPrendas] = useState([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [categoria, setCategoria] = useState('todas')
  const [texto, setTexto] = useState('')
  const [recoge, setRecoge] = useState(false)           // true = recoge en la tienda (sin dirección ni domicilio)
  const refBuscador = useRef(null)
  useVisitante('ropa')
  const [buscFuera, setBuscFuera] = useState(false)
  const [buscAbierto, setBuscAbierto] = useState(false)
  const [lupaOculta, setLupaOculta] = useState(false)
  const [ofertaAbierta, setOfertaAbierta] = useState(false)
  // La lupa se esconde un instante DESPUÉS de abrir la barra: así el "clic" tardío del celular no cae en la prenda de atrás
  useEffect(() => {
    if (!buscAbierto) { setLupaOculta(false); return undefined }
    const t = setTimeout(() => setLupaOculta(true), 500)
    return () => clearTimeout(t)
  }, [buscAbierto])
  const [genero, setGenero] = useState('todos')
  const [promos, setPromos] = useState([])
  const [datos, setDatos] = useState(() => datosGuardados())
  const [paso, setPaso] = useState('pedido')     // 'pedido' | 'datos'
  const [soloOfertas, setSoloOfertas] = useState(false)
  const [agregado, setAgregado] = useState(null)   // nombre de la prenda recién agregada
  const temporizador = useRef(null)
  const [enviando, setEnviando] = useState(false)
  const [errorPedido, setErrorPedido] = useState('')
  const [enviado, setEnviado] = useState(null)   // { numero, url }
  const [detalle, setDetalle] = useState(null)
  const [pedido, setPedido] = useState([])      // [{ prenda, variante, cantidad }]
  const guardarListo = useRef(false)             // no se guarda hasta intentar recuperar el pedido anterior
  const [verPedido, setVerPedido] = useState(false)

  useEffect(() => {
    supabase.from('promos_ropa_vigentes').select('*').range(0, 99)
      .then(({ data, error: err }) => { if (!err && Array.isArray(data)) setPromos(data) })   // sin promos o sin migracion-v11: no se ve nada
    supabase.from('prendas').select('*, prenda_variantes(*)')
      .eq('activo', true).order('creado_en', { ascending: false })
      .then(({ data, error: err }) => {
        if (err) setError('No se pudo cargar el catálogo')
        setPrendas(data ?? [])
        setCargando(false)
        if (!err) {
          // el pedido que la clienta ya estaba armando, con el stock de hoy
          const ls = []
          for (const g of leerBorrador(CLAVE_BORRADOR, TRES_DIAS) ?? []) {
            const prenda = (data ?? []).find(p => p.prenda_variantes.some(v => v.id === g.vid))
            const variante = prenda?.prenda_variantes.find(v => v.id === g.vid)
            const cantidad = variante ? Math.min(g.cantidad, variante.stock) : 0
            if (cantidad > 0) ls.push({ prenda, variante, cantidad })
          }
          if (ls.length > 0) setPedido(ls)
          guardarListo.current = true
        }
        // Enlace directo a una prenda: /ropa/<id>/<nombre> (o el viejo /ropa?p=<id>)
        const id = idDeLaDireccion('ropa')
        const enlazada = (data ?? []).find(x => x.id === id)
        if (enlazada) setDetalle(enlazada)
      })
  }, [])

  const categorias = useMemo(
    () => ['todas', ...new Set(prendas.map(p => p.categoria).filter(Boolean))], [prendas])
  const generos = useMemo(
    () => ['todos', ...GENEROS.map(g => g.id).filter(id => prendas.some(p => (p.genero ?? 'unisex') === id))], [prendas])
  const enOferta = useMemo(() => prendas.filter(p => !p.prenda_variantes.every(v => v.stock <= 0)).map(p => {
    const promo = mejorPromoPrenda(promos, p, 1)
    const nxm = promo ? null : promos.find(x => x.tipo === 'nxm' && mejorPromoPrenda([x], p, x.lleva))
    const m = promo ?? nxm
    if (!m) return null
    const ahora = precioConPromo(promo, p)
    return { id: p.id, nombre: p.nombre, categoria: p.categoria, imagen: fotosDe(p)[0], etiqueta: etiquetaPromo(m),
             precio: ahora, antes: Number(p.precio), nota: nxm ? `${nxm.nombre}: lleva ${nxm.lleva} y paga ${nxm.paga}` : '' }
  }).filter(Boolean), [prendas, promos])
  const idsOferta = useMemo(() => new Set(enOferta.map(d => d.id)), [enOferta])
  const visibles = prendas.filter(p =>
    (categoria === 'todas' || p.categoria === categoria) && (genero === 'todos' || (p.genero ?? 'unisex') === genero)
    && (!soloOfertas || idsOferta.has(p.id)) && coincide([p.nombre, p.categoria, p.descripcion], texto))
  const paraCategorias = useMemo(() => prendas.map(p => ({ categoria: p.categoria, imagenes: fotosDe(p) })), [prendas])
  const elegirCategoria = (c) => {
    setCategoria(c)
    setTimeout(() => document.getElementById('lista-productos')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50)
  }
  const verOferta = (id) => { const p = prendas.find(x => x.id === id); if (p) abrirDetalle(p) }
  const verTodasOfertas = () => { setSoloOfertas(true); setCategoria('todas'); setGenero('todos'); window.scrollTo({ top: 0, behavior: 'smooth' }) }

  const abrirDetalle = (p) => {
    setDetalle(p)
    window.history.replaceState(null, '', rutaPrenda(p))
  }
  const cerrarDetalle = () => {
    setDetalle(null)
    window.history.replaceState(null, '', '/ropa')
  }

  const cantidadTotal = pedido.reduce((s, l) => s + l.cantidad, 0)

  useEffect(() => {
    if (!guardarListo.current) return
    guardarBorrador(CLAVE_BORRADOR, pedido.length === 0 ? null : pedido.map(l => ({ vid: l.variante.id, cantidad: l.cantidad })))
  }, [pedido])
  const cuenta = useMemo(() => totalesPedido(promos, pedido), [promos, pedido])
  const total = cuenta.total
  // El dueño fija el domicilio de ropa aparte (migracion-v26); sin ella se usa el de la tienda
  const negocioRopa = useMemo(() => (negocio && 'domicilio_costo_ropa' in negocio
    ? { ...negocio, domicilio_costo: negocio.domicilio_costo_ropa, envio_gratis_desde: negocio.envio_gratis_desde_ropa } : negocio), [negocio])
  const costoDom = negocioRopa?.domicilio_costo != null ? Number(negocioRopa.domicilio_costo) : null
  const gratisDesde = BARRA_ENVIO_GRATIS && negocioRopa?.envio_gratis_desde != null && Number(negocioRopa.envio_gratis_desde) > 0 ? Number(negocioRopa.envio_gratis_desde) : null
  const faltaGratis = gratisDesde && !recoge ? Math.max(0, gratisDesde - total) : 0
  const domicilio = recoge || costoDom == null ? null : (gratisDesde && total >= gratisDesde ? 0 : costoDom)

  const agregar = (prenda, variante) => {
    setPedido(prev => {
      const i = prev.findIndex(l => l.variante.id === variante.id)
      if (i >= 0) {
        const copia = [...prev]
        copia[i] = { ...copia[i], cantidad: Math.min(copia[i].cantidad + 1, variante.stock) }
        return copia
      }
      return [...prev, { prenda, variante, cantidad: 1 }]
    })
    cerrarDetalle()
    setAgregado(prenda.nombre)
    clearTimeout(temporizador.current)
    temporizador.current = setTimeout(() => setAgregado(null), 6000)
  }

  const cambiar = (vid, delta) =>
    setPedido(prev => prev
      .map(l => l.variante.id === vid
        ? { ...l, cantidad: Math.min(l.cantidad + delta, l.variante.stock) } : l)
      .filter(l => l.cantidad > 0))

  const abrirWhatsApp = (texto, ventana) => {
    const url = `https://wa.me/${WHATSAPP}?text=${encodeURIComponent(texto)}`
    if (ventana && !ventana.closed) ventana.location.href = url
    else window.open(url, '_blank', 'noopener,noreferrer')
    return url
  }

  const enviar = async () => {
    const falla = validarDatos(datos, recoge)
    if (falla) return setErrorPedido(falla)
    setErrorPedido(''); setEnviando(true)
    const ventana = window.open('', '_blank')        // se abre ya, para que el navegador no la bloquee
    const items = pedido.map(l => ({ variante_id: l.variante.id, cantidad: l.cantidad }))
    const { data, error: err } = await supabase.rpc('crear_pedido_ropa', { p_datos: datosParaServidor(datos, recoge), p_items: items })
    let texto
    let numero = null
    if (!err && data?.numero) {
      // el servidor guardó el pedido (y al cliente) y calculó los precios finales
      numero = data.numero
      const lineas = data.lineas.map((l, i) =>
        `• ${l.cantidad}× ${l.nombre} (${l.talla}${l.color ? ', ' + l.color : ''}) — ${dinero(l.subtotal)}${l.promo ? ` [${l.promo}]` : ''}\n  ${enlacePrenda(pedido[i].prenda)}`)
      texto = `Hola, quiero hacer el pedido N.º ${numero}:\n\n${lineas.join('\n')}\n\nTotal: ${dinero(data.subtotal ?? data.total)}${recoge ? '' : textoDomicilio(data.domicilio == null ? domicilio : (costoDom == null && Number(data.domicilio) === 0 ? null : Number(data.domicilio)), data.domicilio != null ? Number(data.subtotal) : Number(data.total))}\n\n${lineaDatos(datos, recoge)}`
    } else if (err && !/could not find the function|schema cache|PGRST202/i.test(`${err.message} ${err.code}`)) {
      if (ventana) ventana.close()
      setEnviando(false)
      return setErrorPedido(err.message)            // p. ej. "Solo quedan 2 de ... (talla M)"
    } else {
      // todavía sin migracion-v12: se manda solo el mensaje
      const lineas = cuenta.detalle.map(l =>
        `• ${l.cantidad}× ${l.prenda.nombre} (${l.variante.talla}${l.variante.color ? ', ' + l.variante.color : ''}) — ${dinero(l.bruto - l.descuento)}\n  ${enlacePrenda(l.prenda)}`)
      texto = `Hola, quiero hacer este pedido:\n\n${lineas.join('\n')}\n\nTotal: ${dinero(total)}${textoDomicilio(domicilio, total)}\n\n${lineaDatos(datos, recoge)}`
    }
    recordarDatos(recoge ? { ...datos, direccion: datosGuardados().direccion } : datos)
    const url = abrirWhatsApp(texto, ventana)
    setEnviando(false); setVerPedido(false); setPaso('pedido'); setPedido([])
    setDatos(d => ({ ...d, acepta_datos: false, nota: '' }))
    setEnviado({ numero, url })
  }

  return (
    <>
    <CabeceraPublica subtitulo="Catálogo de ropa · pide por WhatsApp" />
    <div className="max-w-md sm:max-w-3xl lg:max-w-6xl mx-auto p-4 lg:px-8 lg:pt-8 space-y-4 lg:space-y-6">
      <div ref={refBuscador} className="max-w-2xl mx-auto w-full">
        <input value={texto} onChange={e => setTexto(e.target.value)} placeholder="Buscar una prenda" aria-label="Buscar una prenda" className={claseInput} />
      </div>
      {CATEGORIAS_CON_IMAGEN && !cargando && categoria === 'todas' && !texto.trim() && !soloOfertas && (
        <CategoriasImagen productos={paraCategorias} onElegir={elegirCategoria} />
      )}
      {FRANJA_CONFIANZA && <Revelar><FranjaConfianza negocio={negocioRopa} /></Revelar>}
      <OfertasPublicas onAbierta={setOfertaAbierta} catalogo="ropa" whatsapp={WHATSAPP} destacados={enOferta} onVerProducto={verOferta} onVerTodas={verTodasOfertas} />

      <div className="hidden lg:block"><FiltroCategorias items={generos} activo={genero} onElegir={setGenero} etiqueta={(g) => (g === 'todos' ? 'Todos' : textoGenero(g))} minimo={3} /></div>
      {(genero !== 'todos' || categoria !== 'todas') && (
        <div className="lg:hidden grid grid-cols-[1fr_auto] gap-3 items-center rounded-2xl bg-white shadow-sm px-4 py-2.5">
          <span className="text-sm break-words">Mostrando: <b className="font-semibold">{[genero !== 'todos' ? textoGenero(genero) : null, categoria !== 'todas' ? categoria : null].filter(Boolean).join(' · ')}</b></span>
          <button onClick={() => { setGenero('todos'); setCategoria('todas') }} className="h-9 px-3 rounded-lg bg-slate-100 text-xs font-medium text-slate-600">Quitar</button>
        </div>
      )}
      {soloOfertas && (
        <div className="rounded-2xl bg-negro px-4 py-3 grid grid-cols-[1fr_auto] gap-3 items-center ring-1 ring-champagne/30">
          <span className="text-sm font-semibold text-champagne">Mostrando solo ofertas</span>
          <button onClick={() => setSoloOfertas(false)} className="text-champagne text-xs font-semibold underline">Ver todo</button>
        </div>
      )}

      {enviado && (
        <div className="rounded-2xl bg-negro text-left px-4 py-3 grid grid-cols-[1fr_auto] gap-3 items-center ring-1 ring-champagne/30">
          <span>
            <span className="block text-sm font-semibold text-champagne">{enviado.numero ? `Pedido N.º ${enviado.numero} enviado` : 'Pedido enviado'}</span>
            <span className="block text-xs text-hueso/70">Te confirmamos por WhatsApp. ¿No se abrió?</span>
          </span>
          <a href={enviado.url} target="_blank" rel="noopener noreferrer" className="text-champagne text-xs font-semibold underline">Abrir WhatsApp</a>
        </div>
      )}

      {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}

      {cargando ? (
        <Espera tipo="ropa" />
      ) : visibles.length === 0 ? (
        <p className="text-center text-sm text-slate-400 py-12">{texto.trim() ? 'No encontramos esa prenda' : 'Pronto tendremos prendas nuevas'}</p>
      ) : (
        <div className="space-y-3">
        <div className="grid grid-cols-[1fr_auto] gap-3 items-center">
          <TituloSeccion className={`justify-self-start ${categoria === 'todas' ? '' : 'capitalize'}`}>{categoria === 'todas' ? 'Todas las prendas' : categoria}</TituloSeccion>
          <span className="text-xs text-slate-500">{visibles.length} {visibles.length === 1 ? 'prenda' : 'prendas'}</span>
        </div>
        <ul id="lista-productos" className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 lg:gap-5 scroll-mt-4">
          {visibles.map((p, i) => {
            const agotada = p.prenda_variantes.every(v => v.stock <= 0)
            const promo = mejorPromoPrenda(promos, p, 1)
            const nxm = promo ? null : promos.find(x => x.tipo === 'nxm' && mejorPromoPrenda([x], p, x.lleva))
            const etiq = promo ? etiquetaPromo(promo) : nxm ? etiquetaPromo(nxm) : null
            const precioPromo = precioConPromo(promo, p)
            return (
              <li key={p.id}>
                <Revelar retraso={(i % 4) * 60}>
                <button onClick={() => abrirDetalle(p)}
                  className="group w-full bg-white rounded-3xl shadow-sm ring-1 ring-negro/5 overflow-hidden text-left transition duration-300 hover:shadow-xl hover:-translate-y-0.5 active:scale-[.99]">
                  <div className="aspect-square bg-slate-100 relative overflow-hidden">
                    {fotosDe(p)[0] && <img src={fotosDe(p)[0]} alt={p.nombre} loading="lazy"
                                            className="w-full h-full object-cover transition duration-300 group-hover:scale-105" />}
                    {fotosDe(p).length > 1 && (
                      <span className="absolute bottom-2 right-2 text-[10px] px-2 py-0.5 rounded-full bg-black/50 text-white">
                        {fotosDe(p).length} fotos
                      </span>
                    )}
                    {etiq && !agotada && (
                      <span className="absolute top-2 right-2 text-[11px] font-semibold px-2.5 py-1 rounded-full bg-negro text-champagne ring-1 ring-champagne/40">
                        {etiq}
                      </span>
                    )}
                    {agotada && (
                      <span className="absolute top-2 left-2 text-[10px] px-2 py-0.5 rounded-full bg-black/60 text-white">
                        Agotada
                      </span>
                    )}
                  </div>
                  <div className="p-3 lg:p-4 space-y-0.5">
                    {p.categoria && <p className="text-[10px] uppercase tracking-[0.18em] text-oro break-words">{p.categoria}</p>}
                    <p className="text-sm font-medium leading-tight min-h-[2.25rem]">{p.nombre}</p>
                    <p className="text-sm font-semibold text-oro-oscuro">
                      {precioPromo != null
                        ? <>{dinero(precioPromo)} <span className="text-xs font-normal text-slate-400 line-through">{dinero(p.precio)}</span></>
                        : dinero(p.precio)}
                    </p>
                  </div>
                </button>
                </Revelar>
              </li>
            )
          })}
        </ul>
        </div>
      )}

      <AnuncioPublico catalogo="ropa" whatsapp={WHATSAPP} bloqueado={ofertaAbierta || verPedido || !!detalle} />
      <BuscadorFlotante objetivo={refBuscador} texto={texto} setTexto={setTexto} fuera={buscFuera} setFuera={setBuscFuera} abierto={buscAbierto} setAbierto={setBuscAbierto} etiqueta="Buscar una prenda" />
      <BotonesFlotantes lupa={{ visible: buscFuera && !lupaOculta, activo: !!texto.trim(), onClick: () => setBuscAbierto(true) }} icono="ropa" reserva={84} cantidad={cantidadTotal} total={dinero(total)} onPedido={() => { setPaso('pedido'); setVerPedido(true) }} whatsapp={WHATSAPP}
                        mensaje="Hola, vi el catálogo de ropa y quiero más información." />

      {detalle && <DetallePrenda prenda={detalle} promos={promos} onAgregar={agregar} onCerrar={cerrarDetalle}
        sugeridos={sugeridosDe(prendas, detalle)} onVerOtro={(id) => { const x = prendas.find(q => q.id === id); if (x) abrirDetalle(x) }} />}

      {verPedido && (
        <Modal titulo={paso === 'pedido' ? 'Tu pedido' : 'Tus datos'} onCerrar={() => setVerPedido(false)}>
          {paso === 'pedido' ? (
            <>
              <ul className="divide-y divide-slate-100">
                {pedido.map(l => (
                  <li key={l.variante.id} className="py-3 grid grid-cols-[1fr_auto] gap-x-3 gap-y-2 items-center">
                    <div className="min-w-0">
                      <p className="text-sm font-medium break-words">{l.prenda.nombre}</p>
                      <p className="text-xs text-slate-400">
                        {l.variante.talla}{l.variante.color ? ` · ${l.variante.color}` : ''}
                      </p>
                    </div>
                    <p className="text-sm font-semibold text-right">{dinero(l.prenda.precio * l.cantidad)}</p>
                    <div className="grid grid-cols-[2.5rem_3rem_2.5rem] gap-1 items-center">
                      <button onClick={() => cambiar(l.variante.id, -1)} className="h-10 rounded-lg bg-slate-100 text-lg">−</button>
                      <span className="text-center font-semibold">{l.cantidad}</span>
                      <button onClick={() => cambiar(l.variante.id, 1)} className="h-10 rounded-lg bg-slate-100 text-lg">+</button>
                    </div>
                  </li>
                ))}
              </ul>
              {pedido.length === 0 && <p className="text-center text-sm text-slate-400 py-6">Tu pedido está vacío</p>}
            </>
          ) : (
            <DatosPedido datos={datos} onCambio={(d) => { setDatos(d); setErrorPedido('') }} recoge={recoge} direccionTienda={negocio?.direccion ?? ''} />
          )}

          {cuenta.descuento > 0 && (
            <div className="rounded-xl bg-champagne/20 px-4 py-3 space-y-1 text-sm">
              <div className="flex justify-between text-slate-500"><span>Subtotal</span><span>{dinero(cuenta.bruto)}</span></div>
              {cuenta.detalle.filter(l => l.descuento > 0).map(l => (
                <div key={l.variante.id} className="flex justify-between text-oro-oscuro gap-3">
                  <span className="break-words">{l.promo}</span><span>− {dinero(l.descuento)}</span>
                </div>
              ))}
            </div>
          )}
          {paso === 'pedido' && (
            <div className="grid grid-cols-2 gap-2 p-1 rounded-xl bg-slate-100" role="group" aria-label="Cómo recibes tu pedido">
              {[[false, 'Domicilio'], [true, 'Recoger en tienda']].map(([v, t]) => (
                <button key={t} onClick={() => setRecoge(v)}
                  className={`h-10 rounded-lg text-sm font-medium ${recoge === v ? 'bg-white text-marca shadow-sm' : 'text-slate-500'}`}>{t}</button>
              ))}
            </div>
          )}
          {gratisDesde && !recoge && (
            <div className="space-y-1.5" aria-live="polite">
              <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                <div className="h-full rounded-full bg-negro transition-all" style={{ width: `${Math.min(100, Math.round(total / gratisDesde * 100))}%` }} />
              </div>
              <p className="text-xs text-center text-slate-500">
                {faltaGratis > 0 ? <>Te faltan <b className="text-marca">{dinero(faltaGratis)}</b> para el envío gratis</> : <b className="text-marca">¡Tienes envío gratis!</b>}
              </p>
            </div>
          )}
          {recoge && (
            <div className="flex justify-between text-sm text-slate-500"><span>Entrega</span><span>Recoges en la tienda · sin costo</span></div>
          )}
          {domicilio != null && (
            <div className="flex justify-between text-sm text-slate-500">
              <span>Domicilio</span><span>{domicilio === 0 ? 'Gratis' : dinero(domicilio)}</span>
            </div>
          )}
          <div className="flex items-baseline justify-between">
            <span className="text-slate-500">{domicilio != null ? 'Total con domicilio' : 'Total'}</span>
            <span className="text-2xl font-bold text-marca">{dinero(total + (domicilio ?? 0))}</span>
          </div>
          {errorPedido && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{errorPedido}</p>}

          {!WHATSAPP ? (
            <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">Falta configurar el número de WhatsApp de la tienda.</p>
          ) : paso === 'pedido' ? (
            <button onClick={() => setPaso('datos')} disabled={pedido.length === 0}
              className="w-full h-14 rounded-xl bg-negro text-champagne text-lg font-semibold active:opacity-90 disabled:opacity-40">
              Continuar con mis datos
            </button>
          ) : (
            <div className="grid grid-cols-[auto_1fr] gap-3">
              <button onClick={() => { setPaso('pedido'); setErrorPedido('') }}
                className="h-14 px-5 rounded-xl bg-slate-100 text-slate-600 font-medium active:bg-slate-200">← Volver</button>
              <button onClick={enviar} disabled={enviando}
                className="h-14 rounded-xl bg-[#25D366] text-white text-lg font-semibold active:opacity-80 disabled:opacity-60">
                {enviando ? 'Enviando…' : 'Enviar por WhatsApp'}
              </button>
            </div>
          )}
        </Modal>
      )}
    </div>
    <AvisoAgregado aviso={agregado} onSeguir={() => setAgregado(null)} onVer={() => { setAgregado(null); setPaso('pedido'); setVerPedido(true) }} />
    <BarraCatalogo secciones={[
        { titulo: 'Para quién', items: generos, activo: genero, onElegir: setGenero, etiqueta: (g) => (g === 'todos' ? 'Todos' : textoGenero(g)) },
        { titulo: 'Categoría', items: categorias, activo: categoria, onElegir: setCategoria, etiqueta: (c) => (c === 'todas' ? 'Todas' : c) },
      ]}
      ofertas={enOferta.length} filtrando={genero !== 'todos' || categoria !== 'todas' || soloOfertas}
      onInicio={() => { setGenero('todos'); setCategoria('todas'); setSoloOfertas(false); window.scrollTo({ top: 0, behavior: 'smooth' }) }}
      onOfertas={() => (enOferta.length ? verTodasOfertas() : window.scrollTo({ top: 0, behavior: 'smooth' }))}
      onContacto={() => document.getElementById('contacto')?.scrollIntoView({ behavior: 'smooth' })} />
    <PiePublico whatsapp={WHATSAPP} />
    </>
  )
}
