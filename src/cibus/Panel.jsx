import { useEffect, useState } from 'react'
import { usePersistido, TREINTA_MIN } from './lib/usePersistido'
import { useAuth } from './context/AuthContext'
import { supabase } from './lib/supabase'
import { RolContext, useDueno, useSoporte } from './context/rol'
import { usePlataforma } from './context/plataforma'
import { disponible, NUEVAS, LEGADO } from './lib/etapas'
import Legado from './Legado'
import AvisosPlataforma from './AvisosPlataforma'
import Caja from './components/Caja'
import Productos from './components/Productos'
import Fiados from './components/Fiados'
import Prestamos from './components/Prestamos'
import Reportes from './components/Reportes'
import Tablero from './components/Tablero'
import EnVivo from './components/EnVivo'
import { iniciarPresenciaPersonal, cambiarPantallaPresencia, useAvisoSoporte } from './lib/enVivo'
import Respaldo from './components/Respaldo'
import ClientesRegistrados from './components/ClientesRegistrados'
import PedidosTienda from './components/PedidosTienda'
import { dinero } from './lib/formato'
import { usePractica, desactivarPractica } from './lib/practica'
import ModoPractica from './components/ModoPractica'
import { toca as tocaRespaldo, ultimoRespaldo, diasDesde, pospuestoHoy, posponerAviso } from './lib/respaldo'
import VentasLista from './components/VentasLista'
import Pagos from './components/Pagos'
import Gastos from './components/Gastos'
import CajaMovimientos from './components/CajaMovimientos'
import Exportar from './components/Exportar'
import Equipo from './components/Equipo'
import Auditoria from './components/Auditoria'
import Negocio from './components/Negocio'
import OfertasPublicidad from './components/OfertasPublicidad'
import ComentariosAdmin from './components/ComentariosAdmin'
import MenuDelDia from './components/MenuDelDia'
import AvisosClientes from './components/AvisosClientes'
import MusicaAdmin from './components/MusicaAdmin'
import ResumenSemana from './components/ResumenSemana'
import SonidosAvisos from './components/SonidosAvisos'
import { limpiarVideosVencidos } from './lib/videoAnuncios'
import FormasPago from './components/FormasPago'
import GuiaDinero from './components/GuiaDinero'
import PromocionesAdmin from './components/PromocionesAdmin'
import Domicilios from './components/Domicilios'
import MiCuenta from './components/MiCuenta'
import SelectorVista from '../tienda/SelectorVista'
import PuertaMfa from './components/PuertaMfa'
import { useDosPasos } from './lib/useDosPasos'
import FiltroFechas from './components/FiltroFechas'
import RopaAdmin from './components/RopaAdmin'
import InstalarApp from './components/InstalarApp'
import Icono from './components/Iconos'
import Marca from './components/Marca'
import DialogoConfirmar from './components/DialogoConfirmar'
import EstadoConexion from './components/EstadoConexion'
import { useEsGrande } from './lib/useEsGrande'
import { cargarConfig, useConfig } from './lib/config'
import { usePedidosNuevos } from './lib/usePedidosNuevos'

const BARRA = [
  { id: 'caja',      texto: 'Caja',      icono: 'caja' },
  { id: 'productos', texto: 'Productos', icono: 'productos' },
  { id: 'fiados',    texto: 'Fiados',    icono: 'fiados' },
  { id: 'prestamos', texto: 'Préstamos', icono: 'prestamos', soloDueno: true },
  { id: 'mas',       texto: 'Más',       icono: 'mas' },
]

// Lo que hay dentro de "Más"
const MAS = [
  { id: 'reportes', texto: 'Reportes',            nota: 'Resumen y cierre', icono: 'reportes' },
  { id: 'ventas',   texto: 'Historial de ventas', nota: 'Buscar y anular',          icono: 'ventas' },
  { id: 'pagos',    texto: 'Historial de pagos',  nota: 'Abonos y cobros',          icono: 'pagos' },
  { id: 'gastos',   texto: 'Gastos',              nota: 'Arriendo, servicios',     icono: 'gastos' },
  { id: 'retiros',  texto: 'Retiros de caja',     nota: 'Plata que sale o entra', icono: 'caja' },
  { id: 'exportar', texto: 'Exportar a Excel',    nota: 'Base de datos',            icono: 'exportar' },
  { id: 'ropa',     texto: 'Catálogo de ropa',    nota: 'Pedidos WhatsApp',     icono: 'ropa' },
  { id: 'domicilios', texto: 'Domicilios',        nota: 'Pedidos por entregar', icono: 'ventas' },
  { id: 'promos',   texto: 'Promociones',         nota: 'Precios automáticos',  icono: 'etiqueta', soloDueno: true },
  { id: 'ofertas',  texto: 'Ofertas y publicidad',  nota: 'Ventanas en catálogos', icono: 'etiqueta', soloDueno: true },
  { id: 'formas',   texto: 'Formas de pago',      nota: 'Nequi, datáfono…',     icono: 'pagos', soloDueno: true },
  { id: 'negocio',  texto: 'Datos del negocio',   nota: 'Logo y factura',       icono: 'negocio', soloDueno: true },
  { id: 'cuenta',   texto: 'Mi cuenta',           nota: 'Contraseña y seguridad', icono: 'llave' },
  { id: 'equipo',   texto: 'Equipo y accesos',    nota: 'Quién puede entrar',   icono: 'fiados', soloDueno: true },
  { id: 'auditoria', texto: 'Auditoría',          nota: 'Quién hizo qué',       icono: 'buscar', soloDueno: true },
  { id: 'guia',     texto: 'Guía del dinero',     nota: 'Cómo manejar cada entrada', icono: 'nota', soloDueno: true },
  { id: 'categorias', texto: 'Categorías',        nota: 'Ordenar la tienda',    icono: 'etiqueta' },
  { id: 'tienda',   texto: 'Mi tienda en línea',  nota: 'Colores y domicilio por km', icono: 'negocio', soloDueno: true },
  { id: 'plan',     texto: 'Mi plan',             nota: 'Precio y límites',     icono: 'pagos', soloDueno: true },
]

// El tablero no es una tarjeta más (así las 16 siguen parejas): va destacado arriba, solo para el dueño
const RESPALDO = { id: 'respaldo', texto: 'Copia de seguridad', nota: 'Descargar todo en ZIP', icono: 'exportar' }
const CLIENTES = { id: 'clientes', texto: 'Clientes registrados', nota: 'Base de datos y promociones', icono: 'fiados' }
const PEDIDOS_TIENDA = { id: 'pedidostienda', texto: 'Pedidos de la tienda', nota: 'Llegan desde /tienda en línea', icono: 'ventas' }
const COMENTARIOS = { id: 'comentarios', texto: 'Opiniones de clientes', nota: 'Aprobar y responder', icono: 'nota' }
const MENU_DIA = { id: 'menudia', texto: 'Menú del día', nota: '30 almuerzos para ofrecer y enviar', icono: 'nota' }
const AVISOS_ITEM = { id: 'avisos', texto: 'Avisos a la app', nota: 'Notificaciones a los clientes', icono: 'campana' }
const MUSICA_ITEM = { id: 'musica', texto: 'Música de fondo', nota: 'Canción suave en el catálogo', icono: 'campana' }
const RESUMEN_ITEM = { id: 'resumen', texto: 'Resumen de la semana', nota: 'Visitas, pedidos y lo más vendido', icono: 'reportes' }
const SONIDOS_ITEM = { id: 'sonidos', texto: 'Sonidos de avisos', nota: 'Elegir cómo suena un pedido nuevo', icono: 'campana' }
const PRACTICA = { id: 'practica', texto: 'Modo práctica', nota: 'Enseñar sin guardar nada', icono: 'etiqueta' }
const TABLERO = { id: 'tablero', texto: 'Tablero', nota: 'Indicadores del negocio', icono: 'reportes' }
const EN_VIVO = { id: 'envivo', texto: 'En vivo', nota: 'Ventas y gente conectada ahora', icono: 'envivo' }

function Menu({ onIr, dueno, soporte = false, nuevos = 0, opiniones = 0 }) {
  const { modulos } = usePlataforma()
  const ok = (id) => disponible(id, modulos)
  const lista = MAS.filter(m => (!m.soloDueno || dueno === true) && ok(m.id))
  const dosPasos = useDosPasos()
  return (
    <div className="space-y-3">
    {dueno === true && ok('tablero') && (
      <button onClick={() => onIr('tablero')}
        className="w-full bg-negro text-left rounded-2xl p-4 grid grid-cols-[2.75rem_1fr_auto] gap-3 items-center active:opacity-90">
        <span className="h-11 w-11 rounded-xl bg-champagne/15 text-champagne grid place-items-center"><Icono nombre="reportes" /></span>
        <span>
          <span className="block text-sm font-semibold text-champagne">Tablero del negocio</span>
          <span className="block text-xs text-hueso/70 mt-0.5">Ventas, ganancia, alertas y gráficas</span>
        </span>
        <span className="text-champagne text-lg" aria-hidden="true">›</span>
      </button>
    )}
    {dueno === true && ok('envivo') && (
      <button onClick={() => onIr('envivo')}
        className="w-full bg-negro text-left rounded-2xl p-4 grid grid-cols-[2.75rem_1fr_auto] gap-3 items-center active:opacity-90">
        <span className="h-11 w-11 rounded-xl bg-champagne/15 text-champagne grid place-items-center"><Icono nombre="envivo" /></span>
        <span>
          <span className="flex items-center gap-2 text-sm font-semibold text-champagne">
            En vivo
            <span className="relative flex h-2 w-2" aria-hidden="true">
              <span className="absolute inline-flex h-full w-full rounded-full bg-esmeralda opacity-70 animate-ping" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-esmeralda" />
            </span>
          </span>
          <span className="block text-xs text-hueso/70 mt-0.5">Ventas, visitantes y gente conectada ahora</span>
        </span>
        <span className="text-champagne text-lg" aria-hidden="true">›</span>
      </button>
    )}
    {dueno === true && !soporte && ok('respaldo') && tocaRespaldo() && (
      <button onClick={() => onIr('respaldo')}
        className="w-full bg-negro text-left rounded-2xl p-4 grid grid-cols-[1fr_auto] gap-3 items-center ring-1 ring-champagne/30 active:opacity-90">
        <span>
          <span className="block text-sm font-semibold text-champagne">Toca hacer la copia de seguridad</span>
          <span className="block text-xs text-hueso/70 mt-0.5">
            {ultimoRespaldo() ? `La última fue hace ${diasDesde(ultimoRespaldo())} días` : 'Aún no has hecho ninguna'} · 1 minuto
          </span>
        </span>
        <span className="text-champagne text-lg" aria-hidden="true">›</span>
      </button>
    )}
    {dueno === true && !soporte && ok('cuenta') && !dosPasos.cargando && !dosPasos.activo && (
      <button onClick={() => onIr('cuenta')}
        className="w-full bg-negro text-left rounded-2xl p-4 grid grid-cols-[1fr_auto] gap-3 items-center active:opacity-90">
        <span>
          <span className="block text-sm font-semibold text-champagne">Protege la cuenta del dueño</span>
          <span className="block text-xs text-hueso/70 mt-0.5">Activa la verificación en dos pasos (1 minuto)</span>
        </span>
        <span className="text-champagne text-lg" aria-hidden="true">›</span>
      </button>
    )}
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {lista.map((m, i) => (
        // si queda una sola tarjeta en la última fila, ocupa el ancho completo para que se vea simétrico
        <button key={m.id} onClick={() => onIr(m.id)}
          className={`bg-white rounded-2xl shadow-sm p-4 h-36 grid content-between justify-items-start text-left active:bg-slate-50 ${
            lista.length % 2 === 1 && i === lista.length - 1 ? 'col-span-2 lg:col-span-1' : ''}`}>
          <span className="h-11 w-11 rounded-xl bg-lima/20 text-marca grid place-items-center">
            <Icono nombre={m.icono} />
          </span>
          <span>
            <span className="block text-sm font-semibold leading-tight">{m.texto}</span>
            <span className="block text-xs text-slate-400 mt-0.5">{m.nota}</span>
          </span>
        </button>
      ))}
    </div>
    {[PEDIDOS_TIENDA, ...(dueno === true ? [RESUMEN_ITEM, CLIENTES, COMENTARIOS, MENU_DIA, AVISOS_ITEM, MUSICA_ITEM, RESPALDO] : []), SONIDOS_ITEM, ...(dueno === true || soporte ? [PRACTICA] : [])].filter(m => ok(m.id)).map(m => (
      <button key={m.id} onClick={() => onIr(m.id)}
        className="w-full bg-white rounded-2xl shadow-sm p-4 grid grid-cols-[2.75rem_1fr_auto] gap-3 items-center text-left active:bg-slate-50">
        <span className="h-11 w-11 rounded-xl bg-lima/20 text-marca grid place-items-center"><Icono nombre={m.icono} /></span>
        <span>
          <span className="block text-sm font-semibold leading-tight">{m.texto}{m.id === 'pedidostienda' && nuevos > 0 ? ` (${nuevos} nuevo${nuevos === 1 ? '' : 's'})` : ''}{m.id === 'comentarios' && opiniones > 0 ? ` (${opiniones} por revisar)` : ''}</span>
          <span className="block text-xs text-slate-400 mt-0.5">{m.nota}</span>
        </span>
        <span className="text-slate-400 text-lg" aria-hidden="true">›</span>
      </button>
    ))}
    <SelectorVista />
    </div>
  )
}

// En pantallas grandes la navegación pasa a una barra lateral negra (en el celular sigue abajo)
function BarraLateral({ activa, sub, dueno, soporte = false, onIr, onSub, onSalir, rail, onAlternar }) {
  const { modulos } = usePlataforma()
  const ok = (id) => disponible(id, modulos)
  const principales = BARRA.filter(b => b.id !== 'mas' && (!b.soloDueno || dueno === true) && ok(b.id))
  const mas = MAS.filter(m => (!m.soloDueno || dueno === true) && ok(m.id))
  const Item = ({ on, icono, texto, onClick }) => (
    <button onClick={onClick} aria-current={on ? 'page' : undefined} title={rail ? texto : undefined} aria-label={texto}
      className={`w-full h-10 px-3 rounded-xl flex items-center text-left text-sm transition-colors ${
        on ? 'bg-champagne/15 text-champagne font-semibold' : 'text-hueso/70 hover:bg-white/5 hover:text-hueso'}`}>
      <Icono nombre={icono} className="h-5 w-5 shrink-0" />
      <span className={`break-words transition-all duration-300 ${rail ? 'w-0 ml-0 opacity-0' : 'ml-3 w-40 opacity-100'}`}>{texto}</span>
    </button>
  )
  return (
    <aside className={`hidden lg:flex fixed inset-y-0 left-0 z-40 bg-negro border-r border-champagne/15 flex-col overflow-hidden transition-[width] duration-300 ease-out ${rail ? 'w-[4.5rem]' : 'w-64'}`}>
      <div className="px-4 pt-5 pb-3 h-[6.25rem] grid place-items-center">
        {rail
          ? <img src="/isotipo.png" alt="Matriz" className="h-10 w-10 object-contain" />
          : <Marca tam="sm" eslogan={false} />}
      </div>
      <nav className="flex-1 overflow-y-auto px-3 pb-3 space-y-0.5 [scrollbar-width:thin] [scrollbar-color:#3a3a3a_transparent]">
        {principales.map(b => (
          <Item key={b.id} on={activa === b.id} icono={b.icono} texto={b.texto} onClick={() => onIr(b.id)} />
        ))}
        {rail
          ? <div className="mx-3 my-2 h-px bg-champagne/15" />
          : <p className="px-3 pt-3 pb-1 text-[10px] uppercase tracking-[0.25em] text-champagne/50">Más</p>}
        {dueno === true && ok('tablero') && <Item on={activa === 'mas' && sub === 'tablero'} icono={TABLERO.icono} texto={TABLERO.texto} onClick={() => onSub('tablero')} />}
        {dueno === true && ok('envivo') && <Item on={activa === 'mas' && sub === 'envivo'} icono={EN_VIVO.icono} texto={EN_VIVO.texto} onClick={() => onSub('envivo')} />}
        {mas.map(m => (
          <Item key={m.id} on={activa === 'mas' && sub === m.id} icono={m.icono} texto={m.texto} onClick={() => onSub(m.id)} />
        ))}
        {ok('pedidostienda') && <Item on={activa === 'mas' && sub === 'pedidostienda'} icono={PEDIDOS_TIENDA.icono} texto={PEDIDOS_TIENDA.texto} onClick={() => onSub('pedidostienda')} />}
        {dueno === true && ok('clientes') && <Item on={activa === 'mas' && sub === 'clientes'} icono={CLIENTES.icono} texto={CLIENTES.texto} onClick={() => onSub('clientes')} />}
        {dueno === true && ok('comentarios') && <Item on={activa === 'mas' && sub === 'comentarios'} icono={COMENTARIOS.icono} texto={COMENTARIOS.texto} onClick={() => onSub('comentarios')} />}
        {dueno === true && ok('menudia') && <Item on={activa === 'mas' && sub === 'menudia'} icono={MENU_DIA.icono} texto={MENU_DIA.texto} onClick={() => onSub('menudia')} />}
        {dueno === true && ok('avisos') && <Item on={activa === 'mas' && sub === 'avisos'} icono={AVISOS_ITEM.icono} texto={AVISOS_ITEM.texto} onClick={() => onSub('avisos')} />}
        {dueno === true && ok('musica') && <Item on={activa === 'mas' && sub === 'musica'} icono={MUSICA_ITEM.icono} texto={MUSICA_ITEM.texto} onClick={() => onSub('musica')} />}
        {dueno === true && ok('resumen') && <Item on={activa === 'mas' && sub === 'resumen'} icono={RESUMEN_ITEM.icono} texto={RESUMEN_ITEM.texto} onClick={() => onSub('resumen')} />}
        {ok('sonidos') && <Item on={activa === 'mas' && sub === 'sonidos'} icono={SONIDOS_ITEM.icono} texto={SONIDOS_ITEM.texto} onClick={() => onSub('sonidos')} />}
        {dueno === true && ok('respaldo') && <Item on={activa === 'mas' && sub === 'respaldo'} icono={RESPALDO.icono} texto={RESPALDO.texto} onClick={() => onSub('respaldo')} />}
        {(dueno === true || soporte) && ok('practica') && <Item on={activa === 'mas' && sub === 'practica'} icono={PRACTICA.icono} texto={PRACTICA.texto} onClick={() => onSub('practica')} />}
      </nav>
      <div className="p-3 border-t border-champagne/15 space-y-1">
        {!rail && <InstalarApp clase="w-full h-10 rounded-xl" />}
        <button onClick={onAlternar} title={rail ? 'Mostrar menú' : undefined} aria-label={rail ? 'Mostrar menú' : 'Ocultar menú'}
          className="w-full h-10 px-3 rounded-xl flex items-center text-left text-sm text-hueso/70 hover:bg-white/5 hover:text-hueso transition-colors">
          <Icono nombre="atras" className={`h-5 w-5 shrink-0 transition-transform duration-300 ${rail ? 'rotate-180' : ''}`} />
          <span className={`break-words transition-all duration-300 ${rail ? 'w-0 ml-0 opacity-0' : 'ml-3 w-40 opacity-100'}`}>Ocultar menú</span>
        </button>
        <button onClick={onSalir} title={rail ? 'Salir' : undefined} aria-label="Salir"
          className="w-full h-10 px-3 rounded-xl flex items-center text-left text-sm text-hueso/70 hover:bg-white/5 hover:text-hueso transition-colors">
          <Icono nombre="salir" className="h-5 w-5 shrink-0" />
          <span className={`break-words transition-all duration-300 ${rail ? 'w-0 ml-0 opacity-0' : 'ml-3 w-40 opacity-100'}`}>Salir</span>
        </button>
      </div>
    </aside>
  )
}

function Contenido() {
  const { salir, sesion } = useAuth()
  const { modulos } = usePlataforma()
  const dueno = useDueno()
  const soporte = useSoporte()
  const practica = usePractica()
  const grande = useEsGrande()
  useConfig()                                  // al cambiar los ajustes (formas de pago, prefijo) se vuelve a pintar
  useEffect(() => { cargarConfig() }, [])
  const [activa, setActiva] = usePersistido('panel:activa', 'caja', true, TREINTA_MIN)   // si se recarga, vuelve a la misma pantalla
  const [sub, setSub] = usePersistido('panel:sub', null, true, TREINTA_MIN)       // página abierta dentro de "Más"
  const nuevos = usePedidosNuevos(true, dueno === true)
  useEffect(() => { if (dueno === true && !soporte) limpiarVideosVencidos() }, [dueno, soporte])   // borra del almacenamiento los videos de anuncios ya terminados
  const aviso = useAvisoSoporte(dueno === true && !soporte)
  // Registro de acceso y presencia (quién está conectado). Si falta la migración v28 simplemente no hace nada.
  const miId = sesion?.user?.id
  const miCorreo = sesion?.user?.email
  const miRol = dueno === null ? null : soporte ? 'soporte' : dueno ? 'dueno' : 'cajero'
  useEffect(() => {
    if (!miId || !miRol) return undefined
    supabase.rpc('registrar_acceso', { p_detalle: /Mobi|Android|iPhone/i.test(navigator.userAgent) ? 'celular' : 'computador' }).then(() => {}, () => {})
    return iniciarPresenciaPersonal({ id: miId, correo: miCorreo, rol: miRol, pantalla: 'Caja' })
  }, [miId, miCorreo, miRol])
  const [ocultoRespaldo, setOcultoRespaldo] = useState(false)
  const revisarPedidos = nuevos.revisar
  useEffect(() => { revisarPedidos() }, [sub, activa, revisarPedidos])   // al salir de la lista de pedidos, el aviso se actualiza
  // menú lateral del PC: completo o solo íconos (se recuerda la elección en este equipo)
  // Sin elección guardada, en pantallas de 960 a 1199 px (p. ej. el «sitio de computadora» del celular) el menú arranca en solo íconos para dejar espacio al contenido
  const [rail, setRail] = useState(() => { try { const g = localStorage.getItem('menu-lateral'); return g ? g === 'rail' : window.innerWidth < 1200 } catch { return false } })
  const alternarMenu = () => setRail(r => {
    const n = !r
    try { localStorage.setItem('menu-lateral', n ? 'rail' : 'completo') } catch { /* sin almacenamiento */ }
    return n
  })

  const ancho = rail ? 'lg:max-w-[88rem]' : 'lg:max-w-6xl'
  const barra = BARRA.filter(b => (!b.soloDueno || dueno === true) && (b.id === 'mas' || disponible(b.id, modulos)))
  const efectiva = activa === 'mas' ? sub : activa
  const viejo = !NUEVAS[efectiva] && LEGADO[efectiva] ? efectiva : null     // pantalla que todavía es la de antes de la plataforma
  const pantallaActual = sub
    ? ([TABLERO, EN_VIVO, RESPALDO, CLIENTES, PEDIDOS_TIENDA, PRACTICA, ...MAS].find(m => m.id === sub)?.texto ?? 'Más')
    : (BARRA.find(b => b.id === activa)?.texto ?? 'Caja')
  useEffect(() => { cambiarPantallaPresencia(pantallaActual) }, [pantallaActual])
  const irA = (id) => { setActiva(id); setSub(null); window.scrollTo(0, 0) }
  const irASub = (id) => { setActiva('mas'); setSub(id); window.scrollTo(0, 0) }
  const titulo = sub
    ? [TABLERO, EN_VIVO, RESPALDO, CLIENTES, PEDIDOS_TIENDA, ...MAS].find(m => m.id === sub)?.texto
    : BARRA.find(b => b.id === activa)?.texto

  return (
    <div className="min-h-full bg-fondo">
      {grande && <BarraLateral activa={activa} sub={sub} dueno={dueno} soporte={soporte} onIr={irA} onSub={irASub} onSalir={salir} rail={rail} onAlternar={alternarMenu} />}
      <div className={`transition-[padding] duration-300 ease-out ${rail ? 'lg:pl-[4.5rem]' : 'lg:pl-64'}`}>
      <header className={`fixed top-0 inset-x-0 transition-[left] duration-300 ease-out ${rail ? 'lg:left-[4.5rem]' : 'lg:left-64'} z-30 bg-negro border-b border-champagne/20 pt-[env(safe-area-inset-top)]`}>
        <div className={`max-w-md ${ancho} mx-auto h-14 px-4 lg:px-8 grid gap-2 items-center grid-cols-[2.5rem_1fr_auto]`}>
          {grande ? (
            <button onClick={alternarMenu} aria-label={rail ? 'Mostrar menú' : 'Ocultar menú'} title={rail ? 'Mostrar menú' : 'Ocultar menú'}
              className="h-10 w-10 rounded-full bg-white/10 text-champagne grid place-items-center hover:bg-white/20 transition-colors">
              <Icono nombre="atras" className={`h-5 w-5 transition-transform duration-300 ${rail ? 'rotate-180' : ''}`} />
            </button>
          ) : sub ? (
            <button onClick={() => setSub(null)} aria-label="Volver"
              className="h-10 w-10 rounded-full bg-white/10 text-champagne grid place-items-center active:bg-white/20">
              <Icono nombre="atras" className="h-5 w-5" />
            </button>
          ) : (
            <img src="/isotipo.png" alt="" className="h-10 w-10 object-contain" />
          )}
          <div className="min-w-0">
            <p className="lg:hidden font-display font-light uppercase tracking-[0.3em] text-[11px] text-champagne/70 leading-none break-words">Matriz</p>
            <h1 className="font-display text-xl font-semibold text-hueso leading-tight break-words">{titulo}</h1>
          </div>
          <div className="flex items-center gap-2">
            {!grande && <InstalarApp />}
            {!grande && <button onClick={salir} aria-label="Salir"
              className="h-10 w-10 rounded-full text-champagne grid place-items-center active:bg-white/10">
              <Icono nombre="salir" className="h-5 w-5" />
            </button>}
          </div>
        </div>
      </header>

      <main className={`max-w-md ${ancho} mx-auto px-4 lg:px-8 pt-[calc(4.5rem+env(safe-area-inset-top))] pb-6 space-y-4 min-h-[calc(100vh-12rem)] transition-[max-width] duration-300`}>
        <EstadoConexion />
        {aviso.ultimo && dueno === true && !soporte && (
          <div className="rounded-2xl bg-amber-50 ring-1 ring-amber-300 px-4 py-3 grid grid-cols-[1fr_auto] gap-3 items-center">
            <button onClick={() => { irASub('envivo'); aviso.descartar() }} className="text-left min-w-0">
              <span className="block text-sm font-semibold text-amber-900">Entró la cuenta de soporte</span>
              <span className="block text-xs text-amber-800/80">
                {new Date(aviso.ultimo.fecha).toLocaleString('es-CO', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })} · toca para ver los accesos
              </span>
            </button>
            <button onClick={aviso.descartar} className="h-9 px-3 rounded-xl bg-white text-xs font-semibold text-amber-900 active:bg-amber-100">Entendido</button>
          </div>
        )}
        <AvisosPlataforma irAPublicar={() => irASub('negocio')} />
        {practica.activa && (
          <div className="sticky top-[calc(4.5rem+env(safe-area-inset-top))] lg:top-0 z-30 rounded-2xl bg-amber-400 text-negro px-4 py-2 grid grid-cols-[1fr_auto] gap-3 items-center shadow-md ring-1 ring-amber-600/40">
            <span className="text-xs leading-snug"><b className="font-bold tracking-wide">MODO PRÁCTICA</b> · nada se guarda{practica.acciones > 0 ? ` · ${practica.acciones} simulada${practica.acciones === 1 ? '' : 's'}` : ''}</span>
            <button onClick={desactivarPractica} className="h-8 px-3 rounded-lg bg-negro text-champagne text-xs font-semibold active:opacity-90">Salir</button>
          </div>
        )}
        {soporte && (
          <div className="rounded-2xl bg-slate-800 text-slate-100 px-4 py-2.5 text-xs leading-snug ring-1 ring-slate-600">
            <b className="font-semibold">Cuenta de soporte · solo lectura.</b> Puedes mirar cómo funciona todo, pero no modificar nada.
          </div>
        )}
        {dueno === true && nuevos.opiniones > 0 && sub !== 'comentarios' && (
          <button onClick={() => irASub('comentarios')}
            className="w-full min-h-12 px-4 py-2 rounded-2xl bg-white text-negro grid grid-cols-[auto_1fr_auto] gap-3 items-center text-left ring-1 ring-amber-400 shadow-sm active:bg-slate-50">
            <span className="text-xl" aria-hidden="true">★</span>
            <span className="text-sm font-semibold">{nuevos.opiniones} opinión{nuevos.opiniones === 1 ? '' : 'es'} de clientes por revisar</span>
            <span className="text-xs font-semibold">Ver ›</span>
          </button>
        )}
        {(nuevos.tienda > 0 && sub !== 'pedidostienda') || (nuevos.ropa > 0 && sub !== 'ropa') ? (
          <div className={`grid gap-2 ${nuevos.tienda > 0 && nuevos.ropa > 0 && sub !== 'pedidostienda' && sub !== 'ropa' ? 'sm:grid-cols-2' : ''}`}>
            {nuevos.tienda > 0 && sub !== 'pedidostienda' && (
              <button onClick={() => irASub('pedidostienda')}
                className="relative overflow-hidden w-full px-4 py-3 rounded-2xl bg-gradient-to-r from-oro via-champagne to-oro text-negro text-left ring-1 ring-oro/60 shadow-md pulso-suave active:opacity-90">
                <span className="brillo" aria-hidden="true" />
                <span className="relative grid grid-cols-[auto_1fr_auto] gap-3 items-center">
                  <span className="relative grid place-items-center h-9 w-9 rounded-full bg-negro text-champagne" aria-hidden="true">
                    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M6 8a6 6 0 1 1 12 0c0 6 2.5 7.500 2.500 7.500h-17S6 14 6 8Z" /><path d="M10 19a2 2 0 0 0 4 0" /></svg>
                    <span className="absolute -top-0.5 -right-0.5 h-3 w-3 rounded-full bg-red-500 ring-2 ring-champagne animate-pulse" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-bold leading-tight">{nuevos.tienda} pedido{nuevos.tienda === 1 ? '' : 's'} nuevo{nuevos.tienda === 1 ? '' : 's'} de la tienda en línea</span>
                    {nuevos.listaTienda?.length > 0 && (
                      <span className="mt-1 block space-y-0.5 text-[11px] text-negro/75 leading-snug">
                        {nuevos.listaTienda.slice(0, 3).map(p => (
                          <span key={p.numero} className="grid grid-cols-[auto_1fr_auto] gap-2">
                            <span className="font-semibold">N.º {p.numero}</span>
                            <span>{p.entrega === 'recoger' ? 'Recoger en tienda' : 'A domicilio'}</span>
                            <span className="font-semibold tabular-nums">{dinero(p.total)}</span>
                          </span>
                        ))}
                        {nuevos.tienda > 3 && <span className="block">+{nuevos.tienda - 3} más</span>}
                      </span>
                    )}
                  </span>
                  <span className="text-xs font-bold">Ver ›</span>
                </span>
              </button>
            )}
            {nuevos.ropa > 0 && sub !== 'ropa' && (
              <button onClick={() => irASub('ropa')}
                className="w-full min-h-12 px-4 py-2 rounded-2xl bg-champagne text-negro grid grid-cols-[1fr_auto] gap-3 items-center text-left ring-1 ring-oro/50 active:opacity-90">
                <span className="text-sm font-semibold">{nuevos.ropa} pedido{nuevos.ropa === 1 ? '' : 's'} nuevo{nuevos.ropa === 1 ? '' : 's'} de ropa</span>
                <span className="text-xs font-semibold">Ver ›</span>
              </button>
            )}
          </div>
        ) : null}
        {dueno === true && !soporte && activa === 'caja' && disponible('respaldo', modulos) && !ocultoRespaldo && tocaRespaldo() && !pospuestoHoy() && (
          <div className="rounded-2xl bg-negro ring-1 ring-champagne/30 p-3 grid gap-2">
            <p className="text-sm font-semibold text-champagne">Toca hacer la copia de seguridad</p>
            <p className="text-xs text-hueso/70">{ultimoRespaldo() ? `La última fue hace ${diasDesde(ultimoRespaldo())} días` : 'Aún no has hecho ninguna'} · 1 minuto</p>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => irASub('respaldo')} className="h-10 rounded-xl bg-champagne text-negro text-sm font-semibold active:opacity-90">Hacerla ahora</button>
              <button onClick={() => { posponerAviso(); setOcultoRespaldo(true) }} className="h-10 rounded-xl bg-white/10 text-hueso text-sm font-medium active:bg-white/20">Más tarde</button>
            </div>
          </div>
        )}
        {viejo && <Legado id={viejo} onCobrar={() => irA('caja')} volver={() => irA('caja')} />}
        {activa === 'caja'      && <Caja />}
        {activa === 'productos' && <Productos />}
        {activa === 'fiados'    && <Fiados />}
        {activa === 'prestamos' && <Prestamos />}
        {activa === 'mas' && !sub && <Menu onIr={setSub} dueno={dueno} soporte={soporte} nuevos={nuevos.tienda} opiniones={nuevos.opiniones} />}
        {activa === 'mas' && sub === 'tablero'  && dueno === true && <Tablero />}
        {activa === 'mas' && sub === 'envivo'   && dueno === true && <EnVivo />}
        {activa === 'mas' && sub === 'reportes' && <Reportes />}
        {activa === 'mas' && sub === 'respaldo' && dueno === true && <Respaldo />}
        {activa === 'mas' && sub === 'formas'   && <FormasPago />}
        {activa === 'mas' && sub === 'negocio'  && <div className="lg:max-w-2xl lg:mx-auto"><Negocio /></div>}
        {activa === 'mas' && sub === 'resumen'  && dueno === true && <div className="lg:max-w-2xl lg:mx-auto"><ResumenSemana /></div>}
        {activa === 'mas' && sub === 'avisos' && dueno === true && <AvisosClientes />}
        {activa === 'mas' && sub === 'sonidos' && <SonidosAvisos />}
        {activa === 'mas' && sub === 'ventas'   && <FiltroFechas>{(r) => <VentasLista rango={r} />}</FiltroFechas>}
        {activa === 'mas' && sub === 'pagos'    && <FiltroFechas inicial="mes">{(r) => <Pagos rango={r} />}</FiltroFechas>}
        {activa === 'mas' && sub === 'gastos'   && <FiltroFechas inicial="mes">{(r) => <Gastos rango={r} />}</FiltroFechas>}
        {activa === 'mas' && sub === 'retiros'  && <FiltroFechas inicial="mes">{(r) => <CajaMovimientos rango={r} />}</FiltroFechas>}
        {activa === 'mas' && sub === 'exportar' && <div className="lg:max-w-2xl lg:mx-auto"><Exportar /></div>}
        {activa === 'mas' && sub === 'ropa'     && <RopaAdmin />}
        {activa === 'mas' && sub === 'domicilios' && <Domicilios />}
        {activa === 'mas' && sub === 'clientes' && dueno === true && <ClientesRegistrados />}
        {activa === 'mas' && sub === 'comentarios' && dueno === true && <ComentariosAdmin />}
        {activa === 'mas' && sub === 'pedidostienda' && <PedidosTienda onCobrar={() => irA('caja')} />}
        {activa === 'mas' && sub === 'promos'   && <PromocionesAdmin />}
        {activa === 'mas' && sub === 'ofertas'  && <OfertasPublicidad />}
        {activa === 'mas' && sub === 'guia'     && dueno === true && <GuiaDinero />}
        {activa === 'mas' && sub === 'practica' && (dueno === true || soporte) && <ModoPractica />}
        {activa === 'mas' && sub === 'cuenta'   && <div className="lg:max-w-2xl lg:mx-auto"><MiCuenta /></div>}
        {activa === 'mas' && sub === 'equipo'   && dueno === true && <div className="lg:max-w-2xl lg:mx-auto"><Equipo /></div>}
        {activa === 'mas' && sub === 'auditoria' && <FiltroFechas inicial="sem">{(r) => <Auditoria rango={r} />}</FiltroFechas>}
      </main>

      <footer className="max-w-md mx-auto px-4 pb-[calc(5.5rem+env(safe-area-inset-bottom))] lg:pb-6 pt-2 text-center text-[11px] text-slate-400">
        Matriz · El origen de lo bueno
      </footer>

      {!grande && (
      <nav className="fixed bottom-0 inset-x-0 z-30 bg-white border-t border-slate-100 pb-[env(safe-area-inset-bottom)]">
        <div className="max-w-md mx-auto h-16 grid" style={{ gridTemplateColumns: `repeat(${barra.length}, minmax(0, 1fr))` }}>
          {barra.map(b => {
            const on = activa === b.id
            return (
              <button key={b.id} onClick={() => irA(b.id)} aria-current={on ? 'page' : undefined}
                className={`grid content-center justify-items-center gap-0.5 ${on ? 'text-marca' : 'text-slate-400'}`}>
                <span className={`h-8 w-14 rounded-full grid place-items-center transition ${on ? 'bg-lima/25' : ''}`}>
                  <Icono nombre={b.icono} />
                </span>
                <span className={`text-[11px] leading-none ${on ? 'font-semibold' : 'font-medium'}`}>{b.texto}</span>
              </button>
            )
          })}
        </div>
      </nav>
      )}
      </div>
    </div>
  )
}

export default function Panel({ ctx }) {
  const { sesion, cargando } = useAuth()
  if (cargando) return <div className="min-h-full grid place-items-center text-slate-400">Cargando…</div>
  if (!sesion) return <div className="min-h-full grid place-items-center text-slate-400">Tu sesión se cerró. Entra de nuevo.</div>
  const dueno = ctx.esDueno || ctx.soloLectura
  return (
    <PuertaMfa>
      <RolContext.Provider value={{ dueno, soporte: ctx.soloLectura }}><Contenido /><DialogoConfirmar /></RolContext.Provider>
    </PuertaMfa>
  )
}
