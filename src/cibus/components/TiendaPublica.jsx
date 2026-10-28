// Catálogo público de productos de la tienda (ruta /t/{tienda}). No requiere sesión.
// El cliente arma su pedido y se envía por WhatsApp. Solo se ven los productos
// marcados "Mostrar en la tienda en línea" (vista catalogo_productos).
import { useVisitante } from '../lib/enVivo'
import { contarAperturaApp } from '../lib/instalaciones'
import { useEffect, useMemo, useRef, useState } from 'react'
import { leerBorrador, guardarBorrador, TRES_DIAS } from '../lib/borrador'
import { supabase } from '../lib/supabase'
import { traerTodo } from '../lib/traerTodo'
import { dinero, numero } from '../lib/formato'
import { claseInput } from '../lib/estilos'
import { coincide } from '../lib/buscar'
import { rutaProducto, idDeLaDireccion } from '../lib/tiendaUrl'
import { slugActual } from '../lib/enlaces'
import Modal from './Modal'
import Carrusel from './Carrusel'
import SinFoto from './SinFoto'
import CabeceraPublica from './CabeceraPublica'
import { useCopiado, textoCopiar } from '../lib/useCopiado'
import TituloSeccion from './TituloSeccion'
import OfertasPublicas from './OfertasPublicas'
import PiePublico from './PiePublico'
import ComentariosTienda from './ComentariosTienda'
import MenuHoyTienda from './MenuHoyTienda'
import ActivarAvisos from './ActivarAvisos'
import MusicaFondo from './MusicaFondo'
import PideloOtraVez from './PideloOtraVez'
import EsqueletoProductos from './EsqueletoProductos'
import { productosHabituales } from '../lib/habituales'
import { useMisPedidos, TarjetaPedidoActivo, VentanaMisPedidos, SeguirPedido } from './MisPedidos'
import BotonesFlotantes from './BotonesFlotantes'
import BuscadorFlotante from './BuscadorFlotante'
import Revelar from './Revelar'
import AnuncioPublico from './AnuncioPublico'
import BarraCatalogo, { AvisoAgregado, Sugeridos } from './BarraCatalogo'
import DatosPedido from './DatosPedido'
import DomicilioPlataforma from './DomicilioPlataforma'
import CuentaCliente from './CuentaCliente'
import { useCuentaCliente, volvioDeIngreso, datosDePerfil } from '../lib/cuentaCliente'
import { useNegocioPublico } from '../lib/useNegocioPublico'
import { soloDigitos, datosGuardados, validarDatos, datosParaServidor, recordarDatos, lineaDatos } from '../lib/datosCliente'
import { mejorPromo, promoVisible } from '../lib/promos'
import CategoriasImagen from './CategoriasImagen'
import MasVendidos from './MasVendidos'
import FranjaConfianza from './FranjaConfianza'
import { CATEGORIAS_CON_IMAGEN, AGREGAR_EN_TARJETA, BARRA_CARRITO, MAS_VENDIDOS, MOSTRAR_AHORRO, REPETIR_PEDIDO, FRANJA_CONFIANZA, BARRA_ENVIO_GRATIS } from '../lib/catalogoOpciones'

const PAGINA_CATALOGO = 60   // tarjetas por tanda: el catálogo puede tener miles de productos

const WHATSAPP_ENV = (import.meta.env.VITE_WHATSAPP_NUMBER || '').replace(/\D/g, '')

/** Productos parecidos (misma categoría; si faltan, de los demás) para invitar a seguir mirando. */
const sugeridosDe = (productos, actual) => {
  const hay = (p) => p.id !== actual.id && p.disponible
  const misma = productos.filter(p => hay(p) && p.categoria === actual.categoria)
  const otras = productos.filter(p => hay(p) && p.categoria !== actual.categoria)
  return [...misma, ...otras].slice(0, 4).map(p => ({ id: p.id, nombre: p.nombre, imagen: p.imagenes?.[0], precio: p.precio_venta }))
}

const porUnidad = (u) => (u && u !== 'und' ? ` / ${u}` : '')
const paso_ = (u) => (u && u !== 'und' ? 0.5 : 1)
const bruto = (l) => (l.valor ? l.valor : Math.round(Number(l.producto.precio_venta) * l.cantidad))
const sueltoPorPeso = (p) => Boolean(p.unidad && p.unidad !== 'und')
const PASO_VALOR = 500
const cantidadDeValor = (p, valor) => Math.max(0.001, Math.round((valor / Number(p.precio_venta)) * 1000) / 1000)
const textoCantidad = (l) => (l.valor ? dinero(l.valor) : `${numero(l.cantidad)}${l.producto.unidad && l.producto.unidad !== 'und' ? ` ${l.producto.unidad}` : ''}`)

function Detalle({ producto: p, sugeridos, onVerOtro, onAgregar, onCerrar }) {
  const [cantidad, setCantidad] = useState(paso_(p.unidad))
  const [modo, setModo] = useState('cantidad')          // 'cantidad' | 'valor'
  const [valorTxt, setValorTxt] = useState('')
  const valor = Math.round(Number(String(valorTxt).replace(/\D/g, '')) || 0)
  const porPeso = sueltoPorPeso(p)
  const [copiado, copiar] = useCopiado()
  const url = `${window.location.origin}${rutaProducto(p)}`

  const compartir = async () => {
    if (navigator.share) {
      try { await navigator.share({ title: p.nombre, url }); return } catch { /* canceló */ }
    }
    await copiar(url)
  }

  return (
    <Modal titulo={p.nombre} onCerrar={onCerrar} ancho="max-w-md lg:max-w-4xl">
      <div className="grid gap-4 lg:grid-cols-2 lg:gap-8 lg:items-start">
      <Carrusel imagenes={p.imagenes ?? []} alt={p.nombre} />
      <div className="space-y-4">
      <div className="grid grid-cols-[1fr_auto] gap-3 items-center">
        <p className="text-2xl font-bold text-oro-oscuro">{dinero(p.precio_venta)}<span className="text-sm font-medium text-slate-400">{porUnidad(p.unidad)}</span></p>
        <button onClick={compartir}
          className="h-10 px-4 rounded-xl bg-lima/20 text-marca text-sm font-semibold active:bg-lima/30">
          {copiado ? textoCopiar(copiado, 'Compartir') : 'Compartir'}
        </button>
      </div>
      <Quedan p={p} />
      {p.descripcion && <p className="text-sm text-slate-500 whitespace-pre-line">{p.descripcion}</p>}
      {!p.disponible && <p className="text-sm text-naranja-oscuro bg-naranja/10 rounded-lg px-3 py-2">Agotado por ahora. Escríbenos y te avisamos cuando llegue.</p>}

      {p.disponible && porPeso && (
        <div className="grid grid-cols-2 gap-2 p-1 rounded-xl bg-slate-100">
          {[['cantidad', `Por ${p.unidad}`], ['valor', 'Por valor ($)']].map(([k, t]) => (
            <button key={k} onClick={() => setModo(k)}
              className={`h-9 rounded-lg text-sm font-medium ${modo === k ? 'bg-white text-cibus shadow-sm' : 'text-slate-500'}`}>{t}</button>
          ))}
        </div>
      )}
      {p.disponible && porPeso && modo === 'valor' && (
        <div className="space-y-2">
          <div className="grid grid-cols-4 gap-2">
            {[1000, 2000, 3000, 5000].map(v => (
              <button key={v} onClick={() => setValorTxt(String(v))}
                className={`h-10 rounded-xl text-xs font-semibold ${valor === v ? 'bg-cibus text-white' : 'bg-slate-100 text-slate-600'}`}>{dinero(v)}</button>
            ))}
          </div>
          <input inputMode="numeric" value={valorTxt ? numero(valor) : ''} onChange={e => setValorTxt(e.target.value)}
            placeholder="¿Cuánto quieres comprar? Ej: 3.000" className={claseInput} />
          {valor > 0 && <p className="text-xs text-slate-500 text-center">{dinero(valor)} de {p.nombre} ≈ {numero(cantidadDeValor(p, valor))} {p.unidad}</p>}
        </div>
      )}
      {p.disponible && !(porPeso && modo === 'valor') && (
        <div className="grid grid-cols-[2.75rem_1fr_2.75rem] gap-2 items-center">
          <button onClick={() => setCantidad(c => Math.max(paso_(p.unidad), c - paso_(p.unidad)))}
            className="h-11 rounded-xl bg-slate-100 text-xl active:bg-slate-200" aria-label="Menos">−</button>
          <p className="text-center font-semibold">{numero(cantidad)} {p.unidad === 'und' ? (cantidad === 1 ? 'unidad' : 'unidades') : p.unidad}</p>
          <button onClick={() => setCantidad(c => c + paso_(p.unidad))}
            className="h-11 rounded-xl bg-slate-100 text-xl active:bg-slate-200" aria-label="Más">+</button>
        </div>
      )}
      <button disabled={!p.disponible || (porPeso && modo === 'valor' && valor < 500)}
        onClick={() => (porPeso && modo === 'valor' ? onAgregar(p, cantidadDeValor(p, valor), valor) : onAgregar(p, cantidad))}
        className="w-full h-12 rounded-xl bg-marca text-white font-semibold disabled:opacity-30 active:bg-marca-oscuro">
        Agregar al pedido
      </button>
      <Sugeridos items={sugeridos} onVer={onVerOtro} />
      </div>
      </div>
    </Modal>
  )
}

function AgregarTarjeta({ p, linea, onAgregar, onCambiar }) {
  if (!p.disponible) return <div className="p-2 pt-0"><button disabled className="w-full h-10 rounded-xl bg-slate-100 text-slate-400 text-sm font-medium">Agotado</button></div>
  return (
    <div className="p-2 pt-0">
      {linea ? (
        <div className="grid grid-cols-[2.5rem_1fr_2.5rem] items-center h-10 rounded-xl bg-cibus/10 ring-1 ring-cibus/30">
          <button onClick={() => onCambiar(-1)} aria-label="Quitar uno" className="h-10 text-xl text-cibus active:bg-cibus/10 rounded-l-xl">−</button>
          <span className="text-center text-sm font-semibold text-cibus-oscuro">{textoCantidad(linea)}</span>
          <button onClick={() => onCambiar(1)} aria-label="Agregar uno más" className="h-10 text-xl text-cibus active:bg-cibus/10 rounded-r-xl">+</button>
        </div>
      ) : (
        <button onClick={onAgregar} className="w-full h-10 rounded-xl bg-cibus text-white text-sm font-semibold active:opacity-80">Agregar</button>
      )}
    </div>
  )
}

// "Quedan 12": discreto. Solo para productos por unidad; desde 50 en adelante se dice "50+" (no se publica el inventario exacto)
function Quedan({ p }) {
  if (!p.disponible || p.quedan == null || sueltoPorPeso(p)) return null
  const pocas = p.quedan <= 3
  return <p className={`text-[10px] leading-none pt-0.5 ${pocas ? 'text-naranja-oscuro/80' : 'text-slate-400'}`}>{pocas ? (p.quedan === 1 ? 'Queda 1' : `Quedan ${p.quedan}`) : `Quedan ${p.quedan >= 50 ? '50+' : p.quedan}`}</p>
}

const textoDomicilio = (dom, base) =>
  (dom == null ? '' : dom === 0 ? '\nDomicilio: gratis' : `\nDomicilio: ${dinero(dom)}\nTotal con domicilio: ${dinero(base + dom)}`)

const CLAVE_BORRADOR = 'borrador-tienda'
const CLAVE_ULTIMO = 'ultimo-pedido-tienda'
const leerUltimo = () => { try { const v = JSON.parse(localStorage.getItem(CLAVE_ULTIMO) || 'null'); return Array.isArray(v) ? v : [] } catch { return [] } }
const guardarUltimo = (v) => { try { localStorage.setItem(CLAVE_ULTIMO, JSON.stringify(v)) } catch { /* sin almacenamiento */ } }

export default function TiendaPublica() {
  const negocio = useNegocioPublico()
  const WHATSAPP = soloDigitos(negocio?.whatsapp) || WHATSAPP_ENV   // el del negocio manda; si no, el de la configuración
  const [productos, setProductos] = useState([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [texto, setTexto] = useState('')
  const [mostrar, setMostrar] = useState(PAGINA_CATALOGO)   // cuántas tarjetas se dibujan (el catálogo puede tener miles)
  const refBuscador = useRef(null)
  useVisitante('tienda')
  const [ofertaAbierta, setOfertaAbierta] = useState(false)
  const [buscFuera, setBuscFuera] = useState(false)
  const [buscAbierto, setBuscAbierto] = useState(false)
  const [lupaOculta, setLupaOculta] = useState(false)
  useEffect(() => { contarAperturaApp() }, [])   // cuenta la apertura si ya corre como app instalada
  // La lupa se esconde un instante DESPUÉS de abrir la barra: así el "clic" tardío del celular no cae en el producto de atrás
  useEffect(() => {
    if (!buscAbierto) { setLupaOculta(false); return undefined }
    const t = setTimeout(() => setLupaOculta(true), 500)
    return () => clearTimeout(t)
  }, [buscAbierto])
  const [categoria, setCategoria] = useState('todas')
  const [detalle, setDetalle] = useState(null)
  const [pedido, setPedido] = useState([])           // [{ producto, cantidad }]
  const guardarListo = useRef(false)                 // no se guarda hasta intentar recuperar el pedido anterior
  const [verPedido, setVerPedido] = useState(false)
  const [promos, setPromos] = useState([])
  const [ultimo, setUltimo] = useState(() => (REPETIR_PEDIDO ? leerUltimo() : []))   // [{id, cantidad, valor?}] del último pedido enviado
  const [puestos, setPuestos] = useState([])           // ids de los más vendidos, en orden
  // Lo que la persona va escribiendo se conserva si recarga o se cierra el navegador (3 días, solo en este celular)
  const [datos, setDatos] = useState(() => ({ ...datosGuardados(), ...(leerBorrador('tienda:datos', TRES_DIAS) ?? {}), acepta_datos: false, acepta_promos: false }))
  useEffect(() => {
    const { nombre, telefono, direccion, email, nota } = datos
    guardarBorrador('tienda:datos', (nombre || telefono || direccion || email || nota) ? { nombre, telefono, direccion, email, nota } : null)
  }, [datos])
  const [paso, setPaso] = useState('pedido')           // 'pedido' | 'datos'
  const [menuHoy, setMenuHoy] = useState(null)
  const [quitados, setQuitados] = useState(0)          // productos de la lista guardada que ya no están disponibles
  const cta = useCuentaCliente()
  const mis = useMisPedidos(cta.sesion)
  const [verMis, setVerMis] = useState(false)
  const [seguir, setSeguir] = useState(null)             // { numero, telefono } para quien compró sin cuenta
  const [editandoPerfil, setEditandoPerfil] = useState(false)
  const [guardarPerfil, setGuardarPerfil] = useState(true)   // guardar los datos al enviar el pedido (si entró con Google)
  const [domCfg, setDomCfg] = useState(null)             // { modo: 'fijo' | 'km', max_km } (datos públicos del domicilio)
  const [domRes, setDomRes] = useState(null)             // resultado del cálculo por distancia
  const [recoge, setRecoge] = useState(false)           // true = recoge en la tienda (sin dirección ni domicilio)
  const [soloOfertas, setSoloOfertas] = useState(false)
  const [agregado, setAgregado] = useState(null)
  const temporizador = useRef(null)
  const [enviando, setEnviando] = useState(false)
  const [errorPedido, setErrorPedido] = useState('')
  const [enviado, setEnviado] = useState(null)         // { numero, url }

  useEffect(() => {
    supabase.rpc('datos_domicilio').then(({ data, error: err }) => { if (!err && data) setDomCfg(data) })   // sin migracion-v37: sigue el costo fijo
    supabase.from('promos_tienda_vigentes').select('*').range(0, 99)
      .then(({ data, error: err }) => { if (!err && Array.isArray(data)) setPromos(data) })   // sin promos o sin migracion-v12: no se ve nada
    if (MAS_VENDIDOS) supabase.from('catalogo_mas_vendidos').select('producto_id,puesto').order('puesto').range(0, 7)
      .then(({ data, error: err }) => { if (!err && Array.isArray(data)) setPuestos(data.map(x => x.producto_id)) })   // sin migracion-v19: no se ve la sección
    const pedirQuedan = traerTodo(() => supabase.from('catalogo_stock').select('id,quedan').order('id'))   // sin migracion-v37: no se muestra nada
    traerTodo(() => supabase.from('catalogo_productos').select('*').order('creado_en', { ascending: false }).order('id'))
      .then(async (res) => {
        const err = res.error
        const st = await pedirQuedan
        const mapa = new Map((!st.error && Array.isArray(st.data) ? st.data : []).map(x => [x.id, x.quedan]))
        const data = Array.isArray(res.data) ? res.data.map(p => ({ ...p, quedan: mapa.get(p.id) })) : res.data
        if (err) setError('No se pudo cargar el catálogo')
        setProductos(data ?? [])
        setCargando(false)
        if (!err) {
          // el pedido que el cliente ya estaba armando, con los precios y la disponibilidad de hoy
          const ls = (leerBorrador(CLAVE_BORRADOR, TRES_DIAS) ?? []).map(g => {
            const p = (data ?? []).find(x => x.id === g.id)
            return p && p.disponible && g.cantidad > 0 ? { producto: p, cantidad: g.cantidad, ...(g.valor ? { valor: g.valor } : {}) } : null
          }).filter(Boolean)
          const guardados = (leerBorrador(CLAVE_BORRADOR, TRES_DIAS) ?? []).filter(g => g.cantidad > 0).length
          if (guardados > ls.length) setQuitados(guardados - ls.length)
          if (ls.length > 0) setPedido(ls)
          if (ls.length > 0 && volvioDeIngreso()) { setPaso('datos'); setVerPedido(true) }     // venía de entrar con Google: sigue en sus datos
          guardarListo.current = true
        }
        const id = idDeLaDireccion('tienda')
        const enlazado = (data ?? []).find(x => x.id === id)
        if (enlazado) setDetalle(enlazado)
      })
  }, [])

  const categorias = useMemo(
    () => ['todas', ...new Set(productos.map(p => p.categoria).filter(Boolean))], [productos])
  const enOferta = useMemo(() => productos.filter(p => p.disponible).map(p => {
    const v = promoVisible(promos, p)
    return v ? { id: p.id, nombre: p.nombre, categoria: p.categoria, imagen: p.imagenes?.[0], etiqueta: v.etiqueta,
                 precio: v.precio, antes: Number(p.precio_venta), nota: v.nota, ahorro: v.ahorro } : null
  }).filter(Boolean), [productos, promos])
  const idsOferta = useMemo(() => new Set(enOferta.map(d => d.id)), [enOferta])
  const visibles = productos.filter(p =>
    (categoria === 'todas' || p.categoria === categoria) && coincide([p.nombre, p.categoria, p.descripcion], texto)
    && (!soloOfertas || idsOferta.has(p.id)))
  useEffect(() => { setMostrar(PAGINA_CATALOGO) }, [categoria, texto, soloOfertas])
  const verOferta = (id) => { const p = productos.find(x => x.id === id); if (p) abrir(p) }
  const verTodasOfertas = () => { setSoloOfertas(true); setCategoria('todas'); setTexto(''); window.scrollTo({ top: 0, behavior: 'smooth' }) }

  const abrir = (p) => { setDetalle(p); window.history.replaceState(null, '', rutaProducto(p)) }
  const cerrar = () => { setDetalle(null); window.history.replaceState(null, '', `/t/${slugActual()}`) }

  const cuenta = useMemo(() => {
    let b = 0, d = 0
    const detalle = pedido.map(l => {
      const br = bruto(l)
      const m = mejorPromo(promos.map(x => ({ activa: true, desde: '0000-01-01', ...x })), l.producto, Number(l.producto.precio_venta), l.cantidad)
      b += br; d += m?.descuento ?? 0
      return { ...l, bruto: br, descuento: m?.descuento ?? 0, promo: m?.nombre ?? null }
    })
    return { bruto: b, descuento: d, total: b - d, detalle }
  }, [pedido, promos])
  const total = cuenta.total
  // Domicilio configurado por el dueño (vacío = no se muestra nada)
  const costoDom = negocio?.domicilio_costo != null ? Number(negocio.domicilio_costo) : null
  const gratisDesde = BARRA_ENVIO_GRATIS && negocio?.envio_gratis_desde != null && Number(negocio.envio_gratis_desde) > 0 ? Number(negocio.envio_gratis_desde) : null
  const faltaGratis = gratisDesde && !recoge ? Math.max(0, gratisDesde - total) : 0
  const modoKm = domCfg?.modo === 'km'
  // Con cuenta y datos guardados el cliente solo confirma; si no, llena el formulario de siempre
  const perfilSirve = Boolean(cta.perfil) && (recoge || String(cta.perfil.direccion ?? '').trim().length >= 6)
  const usandoPerfil = perfilSirve && !editandoPerfil
  const datosPedido = usandoPerfil ? datosDePerfil(cta.perfil, datos) : datos
  useEffect(() => { if (cta.perfil && !perfilSirve) setDatos(d => (d.nombre && d.telefono ? d : datosDePerfil(cta.perfil, d))) }, [cta.perfil, perfilSirve])   // perfil sin dirección: se completa el formulario con lo guardado
  const domVigente = modoKm && !recoge && domRes && domRes.clave === String(datosPedido.direccion ?? '').trim() ? domRes : null
  const domicilio = recoge ? null
    : modoKm ? (domVigente?.estado === 'ok' ? domVigente.costo : null)
    : costoDom == null ? null : (gratisDesde && total >= gratisDesde ? 0 : costoDom)
  const unidades = pedido.length

  useEffect(() => {
    if (!guardarListo.current) return
    guardarBorrador(CLAVE_BORRADOR, pedido.length === 0 ? null : pedido.map(l => ({ id: l.producto.id, cantidad: l.cantidad, valor: l.valor })))
  }, [pedido])

  const agregar = (producto, cantidad, valor) => {
    setPedido(prev => {
      const i = prev.findIndex(l => l.producto.id === producto.id)
      if (i >= 0) {
        const c = [...prev], a = c[i]
        if (valor && a.valor) { const v = a.valor + valor; c[i] = { ...a, valor: v, cantidad: cantidadDeValor(producto, v) } }
        else c[i] = { producto, cantidad: Math.round((a.cantidad + cantidad) * 1000) / 1000 }
        return c
      }
      return [...prev, { producto, cantidad, ...(valor ? { valor } : {}) }]
    })
    cerrar()
    setAgregado(producto.nombre)
    clearTimeout(temporizador.current)
    temporizador.current = setTimeout(() => setAgregado(null), 6000)
  }
  useEffect(() => {
    supabase.from('menu_hoy_publico').select('*').maybeSingle().then(({ data }) => setMenuHoy(data ?? null), () => {})
  }, [])
  const agregarIngredientes = (lista) => setPedido(prev => {
    const nuevos = lista.filter(p => !prev.some(l => l.producto.id === p.id)).map(p => ({ producto: p, cantidad: paso_(p.unidad) }))
    return [...prev, ...nuevos]
  })
  const agregarRapido = (producto) => setPedido(prev => {
    const i = prev.findIndex(l => l.producto.id === producto.id)
    if (i >= 0) return prev
    return [...prev, { producto, cantidad: paso_(producto.unidad) }]
  })
  const elegirCategoria = (c) => {
    setCategoria(c)
    setTimeout(() => document.getElementById('lista-productos')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50)
  }
  // Lo que el cliente pidió la última vez, con los precios y la disponibilidad de hoy
  const repetibles = useMemo(() => ultimo.map(g => {
    const p = productos.find(x => x.id === g.id)
    return p && p.disponible && g.cantidad > 0 ? { producto: p, cantidad: g.cantidad, ...(g.valor ? { valor: g.valor, cantidad: cantidadDeValor(p, g.valor) } : {}) } : null
  }).filter(Boolean), [ultimo, productos])
  const habituales = useMemo(() => productosHabituales(mis.lista, ultimo, productos, 3), [mis.lista, ultimo, productos])
  const lineasPorId = useMemo(() => new Map(pedido.map(l => [l.producto.id, l])), [pedido])
  const repetir = () => { setPedido(repetibles); setPaso('pedido'); setVerPedido(true) }
  const cambiar = (id, delta) =>
    setPedido(prev => prev
      .map(l => {
        if (l.producto.id !== id) return l
        if (l.valor) { const v = l.valor + Math.sign(delta) * PASO_VALOR; return v > 0 ? { ...l, valor: v, cantidad: cantidadDeValor(l.producto, v) } : { ...l, cantidad: 0 } }
        return { ...l, cantidad: Math.round((l.cantidad + delta) * 1000) / 1000 }
      })
      .filter(l => l.cantidad > 0))

  // Guardar los datos de una vez (sin tener que enviar un pedido): la próxima compra solo se confirman
  const [guardandoPerfil, setGuardandoPerfil] = useState(false)
  const guardarSolo = async () => {
    const falla = validarDatos(datosPedido, recoge)
    if (falla) return setErrorPedido(falla)
    setGuardandoPerfil(true)
    const r = await cta.guardar({ nombre: datosPedido.nombre, telefono: datosPedido.telefono, email: datosPedido.email, referencia: datosPedido.nota,
      direccion: recoge ? (cta.perfil?.direccion ?? '') : datosPedido.direccion, acepta_datos: true, acepta_promos: datosPedido.acepta_promos })
    setGuardandoPerfil(false)
    if (r) { setEditandoPerfil(false); setErrorPedido('') }
  }
  // Entró con Google y aún no tiene datos guardados: se adelanta su nombre y correo para que escriba menos
  useEffect(() => {
    const u = cta.sesion?.user
    if (!u || cta.perfil || cta.cargando) return
    setDatos(d => (d.nombre || d.email ? d : { ...d, nombre: u.user_metadata?.full_name || u.user_metadata?.name || '', email: u.email || '' }))
  }, [cta.sesion, cta.perfil, cta.cargando])

  const enviar = async () => {
    const falla = validarDatos(datosPedido, recoge)
    if (falla) return setErrorPedido(falla)
    if (modoKm && !recoge) {
      if (!domVigente) return setErrorPedido('Calcula el domicilio con tu dirección antes de enviar el pedido')
      if (domVigente.estado === 'fuera') return setErrorPedido('Esa dirección está fuera de la zona de domicilios. Puedes recoger en la tienda')
      if (domVigente.estado === 'error') return setErrorPedido('No se pudo calcular el domicilio. Intenta de nuevo o pide que la tienda te lo confirme')
    }
    setErrorPedido(''); setEnviando(true)
    const ventana = window.open('', '_blank')        // se abre ya, para que el navegador no la bloquee
    const items = pedido.map(l => ({ producto_id: l.producto.id, cantidad: l.cantidad }))
    const { data, error: err } = await supabase.rpc('crear_pedido_tienda', { p_datos: { ...datosParaServidor(datosPedido, recoge), ...(modoKm && !recoge && domVigente?.estado === 'ok' ? (domVigente.calculo_id ? { calculo_id: domVigente.calculo_id } : { sin_calculo: 'true' }) : {}) }, p_items: items })
    let t, numeroPedido = null
    if (!err && data?.numero) {
      numeroPedido = data.numero
      const lineas = data.lineas.map(l =>
        `• ${numero(l.cantidad)}${l.unidad === 'und' ? '×' : ' ' + l.unidad} ${l.nombre} — ${dinero(l.subtotal)}${l.promo ? ` [${l.promo}]` : ''}`)
      t = `Hola, quiero hacer el pedido N.º ${numeroPedido}:\n\n${lineas.join('\n')}\n\nTotal: ${dinero(data.subtotal ?? data.total)}${recoge ? '' : data.por_confirmar ? '\nDomicilio: lo confirma la tienda' : textoDomicilio(data.domicilio == null ? domicilio : (costoDom == null && !modoKm && Number(data.domicilio) === 0 ? null : Number(data.domicilio)), data.domicilio != null ? Number(data.subtotal) : Number(data.total))}${!recoge && data.km ? `\nDistancia aprox.: ${numero(data.km)} km` : ''}\n\n${lineaDatos(datosPedido, recoge)}`
    } else if (err && !/could not find the function|schema cache|PGRST202/i.test(`${err.message} ${err.code}`)) {
      if (ventana) ventana.close()
      setEnviando(false)
      return setErrorPedido(err.message)            // p. ej. "Solo quedan 2 de Arroz"
    } else {
      // todavía sin migracion-v12: se manda solo el mensaje
      const lineas = cuenta.detalle.map(l =>
        `• ${numero(l.cantidad)}${l.producto.unidad === 'und' ? '×' : ' ' + l.producto.unidad} ${l.producto.nombre} — ${dinero(l.bruto - l.descuento)}\n  ${window.location.origin}${rutaProducto(l.producto)}`)
      t = `Hola, quiero hacer este pedido:\n\n${lineas.join('\n')}\n\nTotal: ${dinero(total)}${textoDomicilio(domicilio, total)}\n\n${lineaDatos(datosPedido, recoge)}`
    }
    recordarDatos(recoge ? { ...datosPedido, direccion: datosGuardados().direccion } : datosPedido)
    if (cta.sesion && !usandoPerfil && guardarPerfil && datosPedido.acepta_datos) {      // los datos quedan para la próxima compra
      await cta.guardar({ nombre: datosPedido.nombre, telefono: datosPedido.telefono, email: datosPedido.email, referencia: datosPedido.nota,
        direccion: recoge ? (cta.perfil?.direccion ?? '') : datosPedido.direccion, acepta_datos: true, acepta_promos: datosPedido.acepta_promos })
      setEditandoPerfil(false)
    }
    if (REPETIR_PEDIDO) { const u = pedido.map(l => ({ id: l.producto.id, cantidad: l.cantidad, ...(l.valor ? { valor: l.valor } : {}) })); guardarUltimo(u); setUltimo(u) }
    const url = `https://wa.me/${WHATSAPP}?text=${encodeURIComponent(t)}`
    if (ventana && !ventana.closed) ventana.location.href = url
    else window.open(url, '_blank', 'noopener,noreferrer')
    setEnviando(false); setVerPedido(false); setPaso('pedido'); setPedido([])
    setDatos(d => ({ ...d, acepta_datos: false, nota: '' }))
    setEnviado({ numero: numeroPedido, url, telefono: datosPedido.telefono })
    mis.recargar()
  }

  return (
    <>
    <CabeceraPublica tema="tienda" subtitulo="Tienda en línea · pide por WhatsApp" />
    <div className="max-w-md sm:max-w-3xl lg:max-w-6xl mx-auto p-4 lg:px-8 lg:pt-8 space-y-4 lg:space-y-6">
      {cta.perfil?.nombre && !texto.trim() && <p className="max-w-2xl mx-auto w-full"><span className="inline-block rounded-full bg-cibus-profundo ring-1 ring-oro/40 px-4 py-2 text-sm text-champagne">Hola, <b className="font-semibold">{String(cta.perfil.nombre).trim().split(/\s+/)[0]}</b> 👋 ¿Qué se te antoja hoy?</span></p>}
      <div ref={refBuscador} className="max-w-2xl mx-auto w-full">
        <input value={texto} onChange={e => setTexto(e.target.value)} placeholder="Buscar un producto" aria-label="Buscar un producto" className={claseInput} />
      </div>
      {!cargando && categoria === 'todas' && !texto.trim() && !soloOfertas && habituales.length > 0 && (
        <PideloOtraVez productos={habituales} lineas={lineasPorId} porPeso={sueltoPorPeso} onVer={abrir} onAgregar={agregarRapido} onCambiar={(id, d) => { const p = productos.find(x => x.id === id); if (p) cambiar(id, d * paso_(p.unidad)) }} />
      )}
      {CATEGORIAS_CON_IMAGEN && !cargando && categoria === 'todas' && !texto.trim() && !soloOfertas && (
        <CategoriasImagen productos={productos} onElegir={elegirCategoria} />
      )}
      <div className="flex items-center gap-2">
        <div className="flex-1 min-w-0">{FRANJA_CONFIANZA && <Revelar><FranjaConfianza negocio={negocio} porDistancia={domCfg?.modo === 'km'} /></Revelar>}</div>
        <MusicaFondo />
      </div>
      {menuHoy && !cargando && !texto.trim() && categoria === 'todas' && <MenuHoyTienda menu={menuHoy} productos={productos} onAgregarTodos={agregarIngredientes} />}
      <OfertasPublicas onAbierta={setOfertaAbierta} tema="tienda" catalogo="tienda" whatsapp={WHATSAPP} destacados={enOferta} onVerProducto={verOferta} onVerTodas={verTodasOfertas} />
      {cta.sesion && <TarjetaPedidoActivo lista={mis.lista} onAbrir={() => setVerMis(true)} />}
      {cta.sesion && !texto.trim() && <ActivarAvisos />}
      {cta.sesion && mis.lista.length > 0 && !texto.trim() && (
        <button onClick={() => setVerMis(true)} className="w-full min-h-14 rounded-2xl bg-white px-4 shadow-sm ring-1 ring-slate-200 text-base font-semibold text-cibus-oscuro active:opacity-80">Mis pedidos ({mis.lista.length})</button>
      )}
      {REPETIR_PEDIDO && !cargando && pedido.length === 0 && repetibles.length > 0 && !texto.trim() && (
        <button onClick={repetir} className="w-full grid grid-cols-[1fr_auto] gap-3 items-center rounded-2xl bg-white px-4 py-3 shadow-sm ring-1 ring-oro/40 text-left active:opacity-80">
          <span className="min-w-0">
            <span className="block text-sm font-semibold text-cibus-oscuro">Repetir mi último pedido</span>
            <span className="block text-xs text-slate-500">{repetibles.length} {repetibles.length === 1 ? 'producto' : 'productos'} · {dinero(repetibles.reduce((s, l) => s + bruto(l), 0))}</span>
          </span>
          <span className="h-9 px-3 grid place-items-center rounded-lg bg-cibus text-white text-xs font-semibold">Ver</span>
        </button>
      )}
      {MAS_VENDIDOS && !cargando && categoria === 'todas' && !texto.trim() && !soloOfertas && (
        <MasVendidos productos={puestos.map(id => productos.find(p => p.id === id)).filter(p => p && p.disponible).slice(0, 4)} onVer={abrir} />
      )}

      {categoria !== 'todas' && (
        <div className="max-w-2xl mx-auto w-full grid grid-cols-[1fr_auto] gap-3 items-center rounded-2xl bg-white shadow-sm px-4 py-2.5">
          <span className="text-sm break-words">Mostrando: <b className="font-semibold">{categoria}</b></span>
          <button onClick={() => setCategoria('todas')} className="h-9 px-3 rounded-lg bg-slate-100 text-xs font-medium text-slate-600">Quitar</button>
        </div>
      )}

      {enviado && (
        <div className="rounded-2xl bg-negro text-left px-4 py-3 grid grid-cols-[1fr_auto] gap-3 items-center ring-1 ring-champagne/30">
          <span>
            <span className="block text-sm font-semibold text-champagne">{enviado.numero ? `Pedido N.º ${enviado.numero} enviado` : 'Pedido enviado'}</span>
            <span className="block text-xs text-hueso/70">Te confirmamos por WhatsApp. ¿No se abrió?</span>
            {enviado.numero && enviado.telefono && <button onClick={() => setSeguir({ numero: enviado.numero, telefono: enviado.telefono })} className="mt-2 h-11 px-4 rounded-xl bg-champagne text-negro text-sm font-semibold">¿En qué va mi pedido?</button>}
          </span>
          <a href={enviado.url} target="_blank" rel="noopener noreferrer" className="text-champagne text-xs font-semibold underline">Abrir WhatsApp</a>
        </div>
      )}
      {soloOfertas && (
        <div className="rounded-2xl bg-negro px-4 py-3 grid grid-cols-[1fr_auto] gap-3 items-center ring-1 ring-champagne/30">
          <span className="text-sm font-semibold text-champagne">Mostrando solo ofertas</span>
          <button onClick={() => setSoloOfertas(false)} className="text-champagne text-xs font-semibold underline">Ver todo</button>
        </div>
      )}

      {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}

      {cargando ? (
        <EsqueletoProductos />
      ) : visibles.length === 0 ? (
        <p className="text-center text-sm text-slate-400 py-12">{texto.trim() ? 'No encontramos ese producto' : 'Pronto tendremos productos aquí'}</p>
      ) : (
        <div className="space-y-3">
        <div className="grid grid-cols-[1fr_auto] gap-3 items-center">
          <TituloSeccion className={`justify-self-start ${categoria === 'todas' ? '' : 'capitalize'}`}>{categoria === 'todas' ? 'Todos los productos' : categoria}</TituloSeccion>
          <span className="text-xs text-slate-500">{visibles.length} {visibles.length === 1 ? 'producto' : 'productos'}</span>
        </div>
        <ul id="lista-productos" className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 lg:gap-5 scroll-mt-4">
          {visibles.slice(0, mostrar).map((p, i) => (
            <li key={p.id} className="flex flex-col">
              <Revelar retraso={(i % 4) * 60} className="flex-1 flex flex-col">
              <div className="flex-1 flex flex-col bg-white rounded-3xl shadow-sm ring-1 ring-negro/5 overflow-hidden transition duration-300 hover:shadow-xl hover:-translate-y-0.5 active:scale-[.99]">
              <a href={rutaProducto(p)} onClick={(e) => { e.preventDefault(); abrir(p) }}
                 className="group block flex-1 active:opacity-80">
                <div className={`aspect-square bg-white relative overflow-hidden ${lineasPorId.has(p.id) ? 'ring-2 ring-inset ring-cibus/60' : ''}`}>
                  {p.imagenes?.[0] ? <img key={lineasPorId.get(p.id)?.cantidad ?? 0} src={p.imagenes[0]} alt={p.nombre} loading="lazy" className={`w-full h-full object-contain transition duration-300 group-hover:scale-105 ${lineasPorId.has(p.id) ? 'foto-late' : ''}`} /> : <SinFoto />}
                  {lineasPorId.has(p.id) && (
                    <span key={lineasPorId.get(p.id).cantidad} aria-label={`${textoCantidad(lineasPorId.get(p.id))} en tu pedido`} className="pop-cantidad absolute bottom-2 left-2 min-w-7 h-7 px-2 rounded-full bg-cibus text-white text-xs font-bold grid place-items-center shadow-md ring-2 ring-white">🛒 {textoCantidad(lineasPorId.get(p.id))}</span>
                  )}
                  {p.disponible && idsOferta.has(p.id) && (
                    <span className="absolute top-2 right-2 text-[11px] font-semibold px-2.5 py-1 rounded-full bg-cibus text-white ring-1 ring-white/40">
                      {enOferta.find(d => d.id === p.id)?.etiqueta}
                    </span>
                  )}
                  {!p.disponible && (
                    <span className="absolute top-2 left-2 text-[10px] px-2 py-0.5 rounded-full bg-black/60 text-white">Agotado</span>
                  )}
                </div>
                <div className="p-3 lg:p-4 space-y-0.5">
                  {p.categoria && <p className="text-[10px] uppercase tracking-[0.18em] text-oro break-words">{p.categoria}</p>}
                  <p className="text-sm font-medium leading-tight min-h-[2.25rem]">{p.nombre}</p>
                  {(() => {
                    const d = enOferta.find(x => x.id === p.id)
                    return d?.precio != null ? (
                      <>
                        <p className="text-sm font-semibold text-oro-oscuro">{dinero(d.precio)} <span className="text-xs font-normal text-slate-400 line-through">{dinero(p.precio_venta)}</span><span className="text-xs font-medium text-slate-400">{porUnidad(p.unidad)}</span></p>
                        {MOSTRAR_AHORRO && d.ahorro > 0 && <p className="text-xs font-medium text-cibus">Ahorras {dinero(d.ahorro)}</p>}
                      </>
                    ) : (
                      <p className="text-sm font-semibold text-oro-oscuro">{dinero(p.precio_venta)}<span className="text-xs font-medium text-slate-400">{porUnidad(p.unidad)}</span></p>
                    )
                  })()}
                  <Quedan p={p} />
                </div>
              </a>
              {AGREGAR_EN_TARJETA && <AgregarTarjeta p={p} linea={pedido.find(l => l.producto.id === p.id)}
                onAgregar={() => (sueltoPorPeso(p) ? abrir(p) : agregarRapido(p))} onCambiar={(d) => cambiar(p.id, d * paso_(p.unidad))} />}
              </div>
              </Revelar>
            </li>
          ))}
        </ul>
        {visibles.length > mostrar && (
          <div className="grid gap-2 pt-2">
            <p className="text-center text-sm text-slate-500">Mostrando {mostrar} de {visibles.length} productos</p>
            <button type="button" onClick={() => setMostrar(m => m + PAGINA_CATALOGO)}
              className="w-full min-h-14 rounded-2xl bg-cibus text-white text-base font-semibold active:opacity-80">Ver más productos</button>
          </div>
        )}
        </div>
      )}

      <AnuncioPublico catalogo="tienda" whatsapp={WHATSAPP} bloqueado={ofertaAbierta || verPedido || !!detalle} />
      <BuscadorFlotante objetivo={refBuscador} texto={texto} setTexto={setTexto} fuera={buscFuera} setFuera={setBuscFuera} abierto={buscAbierto} setAbierto={setBuscAbierto} />
      <BotonesFlotantes lupa={{ visible: buscFuera && !lupaOculta, activo: !!texto.trim(), onClick: () => setBuscAbierto(true) }} tema="tienda" icono="carrito" reserva={BARRA_CARRITO && unidades > 0 ? 148 : 84} cantidad={BARRA_CARRITO ? 0 : unidades} total={dinero(total)} onPedido={() => { setPaso('pedido'); setVerPedido(true) }} whatsapp={WHATSAPP}
                        mensaje="Hola, vi la tienda en línea y quiero más información." />

      {detalle && <Detalle producto={detalle} onAgregar={agregar} onCerrar={cerrar}
        sugeridos={sugeridosDe(productos, detalle)} onVerOtro={(id) => { const x = productos.find(q => q.id === id); if (x) abrir(x) }} />}

      {verPedido && (
        <Modal titulo={paso === 'pedido' ? 'Paso 1 de 2 · Tu pedido' : 'Paso 2 de 2 · Tus datos'} onCerrar={() => setVerPedido(false)}>
          {paso === 'pedido' ? (
            <>
              <ul className="divide-y divide-slate-100">
                {cuenta.detalle.map(l => (
                  <li key={l.producto.id} className="py-3 grid grid-cols-[1fr_auto] gap-x-3 gap-y-2 items-center">
                    <div className="min-w-0">
                      <p className="text-base font-medium break-words leading-snug">{l.producto.nombre}</p>
                      <p className="text-sm text-slate-500">{dinero(l.producto.precio_venta)}{porUnidad(l.producto.unidad)}</p>
                    </div>
                    <p className="text-base font-semibold text-right">{dinero(l.bruto - l.descuento)}</p>
                    <div className="grid grid-cols-[3rem_4.5rem_3rem] gap-1 items-center">
                      <button onClick={() => cambiar(l.producto.id, -paso_(l.producto.unidad))} className="h-12 rounded-lg bg-slate-100 text-xl font-semibold active:bg-slate-200" aria-label="Quitar uno">−</button>
                      <span className="text-center font-semibold text-sm leading-tight">{textoCantidad(l)}</span>
                      <button onClick={() => cambiar(l.producto.id, paso_(l.producto.unidad))} className="h-12 rounded-lg bg-slate-100 text-xl font-semibold active:bg-slate-200" aria-label="Agregar uno">+</button>
                    </div>
                  </li>
                ))}
              </ul>
              {quitados > 0 && <p className="text-base rounded-lg px-3 py-2 bg-champagne/30 text-negro">{quitados === 1 ? 'Un producto de tu lista ya no está disponible y lo quitamos.' : `${quitados} productos de tu lista ya no están disponibles y los quitamos.`}</p>}
              {pedido.length === 0 && <p className="text-center text-base text-slate-500 py-6">Tu pedido está vacío</p>}
              {!cta.sesion && pedido.length > 0 && <CuentaCliente cuenta={cta} recoge={recoge} editando={false} onEditar={() => {}} onUsar={() => {}} />}
            </>
          ) : (
            <>
              <CuentaCliente cuenta={cta} recoge={recoge} editando={editandoPerfil || (Boolean(cta.perfil) && !perfilSirve)}
                onEditar={(v) => { if (v && cta.perfil) setDatos(d => datosDePerfil(cta.perfil, { ...d, nota: '' })); setEditandoPerfil(v) }}
                onUsar={() => setEditandoPerfil(false)} />
              {!usandoPerfil && <DatosPedido datos={datos} onCambio={(d) => { setDatos(d); setErrorPedido('') }} recoge={recoge} direccionTienda={negocio?.direccion ?? ''} />}
              {!usandoPerfil && cta.sesion && (
                <label className="grid grid-cols-[1.5rem_1fr] gap-3 items-center text-base text-slate-700">
                  <input type="checkbox" checked={guardarPerfil} onChange={e => setGuardarPerfil(e.target.checked)} className="h-6 w-6 accent-[#0b0b0b]" />
                  <span>Guardar estos datos para mi próxima compra</span>
                </label>
              )}
              {!usandoPerfil && cta.sesion && (
                <button onClick={guardarSolo} disabled={guardandoPerfil}
                  className="w-full min-h-12 rounded-xl bg-white ring-1 ring-slate-300 text-slate-700 text-base font-semibold px-3 leading-tight active:bg-slate-100 disabled:opacity-50">
                  {guardandoPerfil ? 'Guardando…' : 'Guardar mis datos ahora'}
                </button>
              )}
              {cta.error && cta.sesion && <p className="text-base text-red-600 bg-red-50 rounded-lg px-3 py-2 break-words">{cta.error}</p>}
              {modoKm && !recoge && negocio && (
                <DomicilioPlataforma n={negocio} direccion={datosPedido.direccion} subtotal={total} onRecoger={() => setRecoge(true)} onResultado={(r) => { setDomRes(r); setErrorPedido('') }} />
              )}
            </>
          )}

          {cuenta.descuento > 0 && (
            <div className="rounded-xl bg-champagne/20 px-4 py-3 space-y-1 text-sm">
              <div className="flex justify-between text-slate-500"><span>Subtotal</span><span>{dinero(cuenta.bruto)}</span></div>
              {cuenta.detalle.filter(l => l.descuento > 0).map(l => (
                <div key={l.producto.id} className="flex justify-between text-oro-oscuro gap-3">
                  <span className="break-words">{l.promo}</span><span>− {dinero(l.descuento)}</span>
                </div>
              ))}
            </div>
          )}
          {paso === 'pedido' && (
            <div className="grid grid-cols-2 gap-2 p-1 rounded-xl bg-slate-100" role="group" aria-label="Cómo recibes tu pedido">
              {[[false, 'Domicilio'], [true, 'Recoger en tienda']].map(([v, t]) => (
                <button key={t} onClick={() => setRecoge(v)}
                  className={`h-12 rounded-lg text-base font-semibold ${recoge === v ? 'bg-white text-cibus shadow-sm' : 'text-slate-500'}`}>{t}</button>
              ))}
            </div>
          )}
          {gratisDesde && !recoge && (
            <div className="space-y-1.5" aria-live="polite">
              <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                <div className="h-full rounded-full bg-cibus transition-all" style={{ width: `${Math.min(100, Math.round(total / gratisDesde * 100))}%` }} />
              </div>
              <p className="text-sm text-center text-slate-600">
                {faltaGratis > 0 ? <>Te faltan <b className="text-cibus">{dinero(faltaGratis)}</b> para el envío gratis</> : <b className="text-cibus">¡Tienes envío gratis!</b>}
              </p>
            </div>
          )}
          {recoge && (
            <div className="flex justify-between text-base text-slate-600"><span>Entrega</span><span>Recoges en la tienda · sin costo</span></div>
          )}
          {domicilio != null && (
            <div className="flex justify-between text-base text-slate-600">
              <span>Domicilio</span><span>{domicilio === 0 ? 'Gratis' : dinero(domicilio)}</span>
            </div>
          )}
          {modoKm && !recoge && domicilio == null && (
            <div className="flex justify-between gap-3 text-base text-slate-600">
              <span>Domicilio</span><span className="text-right">{domVigente?.estado === 'manual' ? 'Lo confirma la tienda' : 'Se calcula con tu dirección'}</span>
            </div>
          )}
          <div className="flex items-baseline justify-between">
            <span className="text-lg text-slate-600">{domicilio != null ? 'Total con domicilio' : 'Total'}</span>
            <span className="text-2xl font-bold text-marca">{dinero(total + (domicilio ?? 0))}</span>
          </div>
          {errorPedido && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{errorPedido}</p>}

          {!WHATSAPP ? (
            <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">Falta configurar el número de WhatsApp de la tienda.</p>
          ) : paso === 'pedido' ? (
            <button onClick={() => setPaso('datos')} disabled={pedido.length === 0}
              className="w-full h-14 rounded-xl bg-cibus text-white text-lg font-semibold active:opacity-90 disabled:opacity-40">
              Siguiente: mis datos
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
    {BARRA_CARRITO && unidades > 0 && !verPedido && !detalle && (
      <div className="fixed inset-x-0 bottom-[calc(5.75rem+env(safe-area-inset-bottom))] z-40 px-3 flex justify-center pointer-events-none">
        <button onClick={() => { setPaso('pedido'); setVerPedido(true) }}
          className="pointer-events-auto w-full max-w-md grid grid-cols-[1fr_auto] gap-3 items-center h-14 px-4 rounded-2xl bg-cibus text-white shadow-xl ring-1 ring-oro/60 active:opacity-90 text-left">
          <span className="min-w-0">
            <span className="block text-xs text-white/80">{unidades} {unidades === 1 ? 'producto' : 'productos'}</span>
            <span className="block text-base font-bold leading-tight">{dinero(total)}</span>
          </span>
          <span className="h-10 px-4 grid place-items-center rounded-xl bg-champagne text-negro text-sm font-semibold">Ver pedido →</span>
        </button>
      </div>
    )}
    <AvisoAgregado tema="tienda" aviso={BARRA_CARRITO && unidades > 0 ? null : agregado} onSeguir={() => setAgregado(null)} onVer={() => { setAgregado(null); setPaso('pedido'); setVerPedido(true) }} />
    <BarraCatalogo tema="tienda" secciones={[{ titulo: 'Categoría', items: categorias, activo: categoria, onElegir: setCategoria, etiqueta: (c) => (c === 'todas' ? 'Todas' : c) }]}
      ofertas={enOferta.length} filtrando={categoria !== 'todas' || soloOfertas}
      onInicio={() => { setCategoria('todas'); setSoloOfertas(false); setTexto(''); window.scrollTo({ top: 0, behavior: 'smooth' }) }}
      onOfertas={() => (enOferta.length ? verTodasOfertas() : window.scrollTo({ top: 0, behavior: 'smooth' }))}
      onOpiniones={() => document.getElementById('opiniones')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
      onContacto={() => document.getElementById('contacto')?.scrollIntoView({ behavior: 'smooth' })} />
    {verMis && <VentanaMisPedidos lista={mis.lista} productos={productos} recargar={mis.recargar} onCerrar={() => setVerMis(false)}
      onRepetir={(lineas, faltan) => { setVerMis(false); if (lineas.length) { setPedido(lineas); setPaso('pedido'); setVerPedido(true) } setQuitados(faltan) }} />}
    {seguir && <SeguirPedido numero={seguir.numero} telefono={seguir.telefono} onCerrar={() => setSeguir(null)} />}
    <ComentariosTienda cuenta={cta} />
    <PiePublico tema="tienda" whatsapp={WHATSAPP} />
    </>
  )
}
