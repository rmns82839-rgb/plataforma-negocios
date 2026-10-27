import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { usePersistido, borrarBorradores, TREINTA_MIN } from '../lib/usePersistido'
import { supabase } from '../lib/supabase'
import { dinero, aNumero, aCantidad } from '../lib/formato'
import { claseInput } from '../lib/estilos'
import Escaner from './Escaner'
import ProductoForm from './ProductoForm'
import ClienteForm from './ClienteForm'
import CajaLineas from './CajaLineas'
import { esPesable } from '../lib/pesaje'
import { leerBorrador, guardarBorrador, DOCE_HORAS } from '../lib/borrador'
import CajaTotal from './CajaTotal'
import CajaPago from './CajaPago'
import { fechaATexto } from '../lib/periodo'
import { numeroFactura } from '../lib/factura'
import { useConfig } from '../lib/config'
import { useDueno } from '../context/rol'
import { resumen, bajoMinimo, faltaPagar, conPrecios, esManual, descuentoLinea, brutoLinea, precioDe, promoLinea } from '../lib/venta'
import { hoyTexto } from '../lib/periodo'
import Factura from './Factura'
import BotonCelular from './BotonCelular'
import { confirmar } from '../lib/confirmar'
import { ordenarPorInicio, buscarProductosPorNombre } from '../lib/buscar'
import DialogoResto from './DialogoResto'
import { usePractica, practicaActiva, moverPrepagoSimulado } from '../lib/practica'
import { saldoVisible } from '../lib/prepago'
import VentasAbiertas, { MAX_VENTAS } from './VentasAbiertas'
import PrestamoRapido from './PrestamoRapido'
import RetiroCaja from './RetiroCaja'
import Miniatura from './Miniatura'
import { encolarVenta, registrarVentaSegura } from '../lib/sincronizar'
import { esErrorDeRed, idNuevo } from '../lib/offline'
import { actualizarCatalogo, productoPorCodigo, buscarPorNombre, productosPorIds, descontarStockLocal } from '../lib/catalogoLocal'
import ClienteDetalle from './ClienteDetalle'
import { FUNCIONES } from '../lib/etapas'
import { usePlataforma } from '../context/plataforma'
import Icono from './Iconos'

// Productos que se venden por peso o medida se mueven de a media unidad
const pasoDe = (p) => (p.unidad && p.unidad !== 'und' ? 0.5 : 1)
const sumarDias = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return fechaATexto(d) }
const CLAVE_BORRADOR = 'borrador-caja'
const CLAVE_ESPERA = 'borrador-caja-espera'
// Si dos pagos van con la misma forma (p. ej. el abono y el resto), se suman en uno solo
const unirMismaForma = (pagos) => {
  const por = new Map()
  for (const p of pagos) {
    const antes = por.get(p.metodo)
    por.set(p.metodo, antes ? { ...antes, monto: antes.monto + p.monto, recibido: antes.recibido != null || p.recibido != null ? (antes.recibido ?? antes.monto) + (p.recibido ?? p.monto) : undefined } : { ...p })
  }
  return [...por.values()]
}
const TIPO_BASE = { efectivo: 'efectivo', fiado: 'fiado', datafono: 'datafono' }

// Mensajes de la base de datos que conviene explicar en cristiano
const explicar = (msg) =>
  /registrar_venta|schema cache|Could not find the function/i.test(msg) && !/Supera|suman|mínimo|disponible/i.test(msg)
    ? 'Falta ejecutar migracion-v9.sql (y la v8) en Supabase: la venta nueva todavía no está activa.'
    : msg

export default function Caja() {
  const { modulos: modulosTienda } = usePlataforma()
  const prestamoRapido = FUNCIONES.prestamoRapido && modulosTienda.includes('fiados')
  const cfg = useConfig()
  const dueno = useDueno()
  const formasActivas = useMemo(() => cfg.formas.filter(f => f.activa), [cfg.formas])
  const tipoDe = useCallback((id) => cfg.formas.find(f => f.id === id)?.tipo ?? TIPO_BASE[id] ?? 'digital', [cfg.formas])

  const [carrito, setCarrito] = useState([])          // [{ producto, cantidad, precio?, descuento? }]
  const [ultimoId, setUltimoId] = useState(null)       // último producto agregado (se resalta un momento)
  const [editandoId, setEditandoId] = useState(null)   // línea con el panel "Ajustar" abierto
  const [pesandoId, setPesandoId] = useState(null)     // línea con el panel de pesaje abierto
  const [verEscaner, setVerEscaner] = useState(true)
  const [verPago, setVerPago] = usePersistido('caja:verPago', false, true, TREINTA_MIN)       // el panel de cobro está a la vista (celular)
  const [busqueda, setBusqueda] = useState('')
  const [resultados, setResultados] = useState([])
  const [metodo, setMetodo] = usePersistido('caja:metodo', 'efectivo', true, TREINTA_MIN)
  const [mixto, setMixto] = usePersistido('caja:mixto', false)
  const [filas, setFilas] = usePersistido('caja:filas', [])               // pago dividido: [{ id, metodo, txt, recibido }]
  const [prepago, setPrepago] = useState({})          // saldo prepago por cliente: { [id]: pesos }
  const [clientes, setClientes] = useState([])
  const [clienteId, setClienteId] = useState('')
  const [buscaCliente, setBuscaCliente] = usePersistido('caja:buscaCliente', '', true, TREINTA_MIN)
  const [fechaLimite, setFechaLimite] = usePersistido('caja:fechaLimite', '')
  const [recibido, setRecibido] = usePersistido('caja:recibido', '')
  const [parcial, setParcial] = usePersistido('caja:parcial', '')            // transferencia, Nequi, Daviplata o datáfono: cuánto paga con esa forma (si es menos del total)
  const [abonoTxt, setAbonoTxt] = usePersistido('caja:abonoTxt', '')          // fiado: cuánto abona ahora (vacío = nada)
  const [abonoMetodo, setAbonoMetodo] = usePersistido('caja:abonoMetodo', 'efectivo', true, TREINTA_MIN)
  const [abonoRecibido, setAbonoRecibido] = usePersistido('caja:abonoRecibido', '')   // si la parte se paga en efectivo: cuánto entregó
  const [verParte, setVerParte] = usePersistido('caja:verParte', false, true, TREINTA_MIN)          // pago normal: "pagar una parte con otra forma" abierto
  const [codigoNuevo, setCodigoNuevo] = usePersistido('caja:codigoNuevo', null, true, TREINTA_MIN) // abre el alta con el código escaneado
  const [nuevoCliente, setNuevoCliente] = usePersistido('caja:nuevoCliente', false, true, TREINTA_MIN)
  const [cobrando, setCobrando] = useState(false)
  const [aviso, setAviso] = useState(null)             // avisos del escáner: { tipo, texto }
  const [avisoCobro, setAvisoCobro] = useState('')     // error al cobrar (se ve junto al botón)
  const [descuentoTxt, setDescuentoTxt] = useState('')
  const [verDescuento, setVerDescuento] = usePersistido('caja:verDescuento', false, true, TREINTA_MIN)
  const [verCliente, setVerCliente] = usePersistido('caja:verCliente', false, true, TREINTA_MIN)
  const [ultima, setUltima] = useState(null)           // última venta: { id, numero, total, cambio }
  const [facturaId, setFacturaId] = useState(null)
  const [facturaProv, setFacturaProv] = useState(null)      // comprobante provisional de una venta hecha sin internet
  const [restoForma, setRestoForma] = usePersistido('caja:restoForma', '')       // efectivo incompleto: forma con la que se paga lo que falta
  const [verResto, setVerResto] = usePersistido('caja:verResto', false, true, TREINTA_MIN)         // ventana "¿con qué paga el resto?"
  const [espera, setEspera] = useState([])                // otras ventas abiertas: [{ id, n, lineas, clienteId, descuentoTxt, dom, productos, total }]
  const [numActual, setNumActual] = useState(1)           // número de la venta que está en pantalla
  const esperaLista = useRef(false)
  const [recuperada, setRecuperada] = useState(0)      // productos de la venta que se recuperó al abrir
  const guardarListo = useRef(false)                   // no se guarda hasta intentar recuperar la anterior

  const [promos, setPromos] = useState([])            // promociones activas (se aplican solas)
  const [mora, setMora] = useState({})                 // deuda vencida por cliente: { [id]: { vencido, dias_atraso, recargo } }
  const [dom, setDom] = useState({ on: false, direccion: '', telefono: '', costoTxt: '' })   // domicilio
  const [verRetiro, setVerRetiro] = usePersistido('caja:verRetiro', false, true, TREINTA_MIN)       // ventana de retiro/ingreso de caja
  const [verPrestamo, setVerPrestamo] = usePersistido('caja:verPrestamo', false, true, TREINTA_MIN)  // ventana del préstamo rápido (solo dueño)
  const [verCuenta, setVerCuenta] = usePersistido('caja:verCuenta', null, true, TREINTA_MIN)         // cliente cuya cuenta se abre desde el aviso de deuda
  const [notaVenta, setNotaVenta] = useState('')       // nota opcional de la venta (sale en rojo en el reporte de ventas)
  const [pedidoTienda, setPedidoTienda] = useState(null)   // pedido de la tienda en línea que se está cobrando: { id, numero }
  const envio = dom.on ? Math.max(aNumero(dom.costoTxt), 0) : 0

  const cliente = clientes.find(c => c.id === clienteId)
  usePractica()                                       // el saldo simulado del modo práctica también cambia la pantalla
  const saldoPrepago = cliente ? saldoVisible(prepago[cliente.id], cliente.id) : 0
  // "Saldo prepago" solo aparece cuando el cliente elegido tiene saldo a favor
  const formas = useMemo(() => formasActivas.filter(f => f.tipo !== 'prepago' || saldoPrepago > 0), [formasActivas, saldoPrepago])
  // Mientras se escribe la cantidad ("0" antes de "0,57") la línea no debe desaparecer de la pantalla,
  // pero solo cuentan para el total las que tienen cantidad.
  const lineasVista = useMemo(
    () => conPrecios(carrito.filter(l => l.cantidad > 0 || l.txt !== undefined), { cliente, descMayorista: cfg.mayorista, promos, hoy: hoyTexto() }),
    [carrito, cliente, cfg.mayorista, promos])
  const lineas = useMemo(() => lineasVista.filter(l => l.cantidad > 0), [lineasVista])
  const descuentoPedido = aNumero(descuentoTxt)
  const base = resumen(lineas, 0)
  // El descuento general no puede ser negativo ni dejar la venta en cero
  const descuentoMalo = descuentoPedido < 0 || (descuentoPedido > 0 && descuentoPedido >= base.subtotal)
  const descuento = descuentoMalo ? 0 : Math.round(descuentoPedido)
  const r = resumen(lineas, descuento, envio)
  const total = r.total
  // Lo que se muestra en el celular emparejado: la venta en curso (se vacía al cobrar)
  const ventaCelular = useMemo(() => ({
    total,
    items: lineas.slice(0, 60).map(l => ({ n: String(l.producto.nombre).slice(0, 60), c: l.cantidad, t: brutoLinea(l) - descuentoLinea(l) })),
  }), [lineas, total])

  const elegirCliente = (c) => {
    setClienteId(c.id); setBuscaCliente('')
    setFechaLimite(Number(c.dias_credito) > 0 ? sumarDias(Number(c.dias_credito)) : '')
  }
  const quitarCliente = () => { setClienteId(''); setBuscaCliente(''); setFechaLimite(''); if (tipoDe(metodo) === 'prepago') setMetodo('efectivo') }
  const qCliente = buscaCliente.trim().toLowerCase()
  // Se busca por nombre, cédula o celular: con solo la cédula aparece el cliente con sus datos
  const qNum = qCliente.replace(/\D/g, '')
  const digitos = (t) => String(t ?? '').replace(/\D/g, '')
  const coincidencias = qCliente
    ? clientes.filter(c => c.nombre.toLowerCase().includes(qCliente) || (qNum.length >= 3 && (digitos(c.documento).includes(qNum) || digitos(c.telefono).includes(qNum))))
        .sort((a, b) => Number(digitos(b.documento) === qNum && qNum !== '') - Number(digitos(a.documento) === qNum && qNum !== ''))
        .slice(0, 6)
    : []

  // Una parte con otra forma: en fiado es el abono (el resto queda debiendo); en las demás formas, el cliente
  // paga una parte con una y el resto con otra. En ambos casos son dos pagos de la misma venta.
  const fiadoUnico = !mixto && tipoDe(metodo) === 'fiado'
  const parteOn = !mixto && fiadoUnico        // solo en fiado (abono); en las demás formas la caja pregunta sola si falta plata
  const formasAbono = formas.filter(f => tipoDe(f.id) !== 'fiado' && tipoDe(f.id) !== 'prepago' && f.id !== metodo)
  const abonoForma = formasAbono.some(f => f.id === abonoMetodo) ? abonoMetodo : (formasAbono[0]?.id ?? 'efectivo')
  const abonoPedido = parteOn ? aNumero(abonoTxt) : 0
  const abonoMalo = parteOn && abonoPedido > 0 && abonoPedido >= total
  const abono = parteOn && !abonoMalo ? Math.max(0, Math.round(abonoPedido)) : 0
  const restante = total - abono                      // lo que se paga con la forma principal

  // Pagos de la venta: uno solo por el total, o varios
  // Efectivo incompleto: entregó menos de lo que vale la venta → al cobrar se pregunta con qué paga el resto
  const recibidoNum = aNumero(recibido)
  const faltaEfectivo = !mixto && tipoDe(metodo) === 'efectivo' && recibidoNum > 0 && recibidoNum < restante
  // Lo mismo con las formas digitales: si paga solo una parte con Nequi, transferencia o datáfono, se pregunta con qué paga el resto
  const parcialNum = aNumero(parcial)
  const esDigital = !mixto && ['digital', 'datafono'].includes(tipoDe(metodo))
  const faltaDigital = esDigital && parcialNum > 0 && parcialNum < restante
  // Saldo prepago que no alcanza: se usa todo el saldo y la caja pregunta con qué se paga lo que falta
  const esPrepago = !mixto && tipoDe(metodo) === 'prepago'
  const faltaPrepago = esPrepago && Boolean(cliente) && saldoPrepago < restante
  const hayFalta = faltaEfectivo || faltaDigital || faltaPrepago
  const faltaResto = faltaEfectivo ? restante - recibidoNum : faltaDigital ? restante - parcialNum : faltaPrepago ? restante - Math.max(0, saldoPrepago) : 0
  const formasResto = formas.filter(f => f.id !== metodo && tipoDe(f.id) !== 'prepago')
  const restoValido = hayFalta && formasResto.some(f => f.id === restoForma)
  const pagosCon = (resto) => mixto
    ? filas.map(f => ({ metodo: f.metodo, monto: aNumero(f.txt), recibido: tipoDe(f.metodo) === 'efectivo' && f.recibido ? aNumero(f.recibido) : undefined }))
            .filter(p => p.monto > 0)
    : hayFalta && resto
      ? unirMismaForma([
          ...(abono > 0 ? [{ metodo: abonoForma, monto: abono, recibido: tipoDe(abonoForma) === 'efectivo' && abonoRecibido ? aNumero(abonoRecibido) : undefined }] : []),
          ...(faltaEfectivo ? [{ metodo, monto: recibidoNum, recibido: recibidoNum }] : faltaDigital ? [{ metodo, monto: parcialNum }] : saldoPrepago > 0 ? [{ metodo, monto: saldoPrepago }] : []),
          { metodo: resto, monto: faltaResto },
        ])
      : [
          ...(abono > 0 ? [{ metodo: abonoForma, monto: abono, recibido: tipoDe(abonoForma) === 'efectivo' && abonoRecibido ? aNumero(abonoRecibido) : undefined }] : []),
          { metodo, monto: restante, recibido: tipoDe(metodo) === 'efectivo' && recibido ? aNumero(recibido) : undefined },
        ]
  const pagos = pagosCon(restoValido ? restoForma : '')
  const pedirResto = hayFalta && !restoValido
  const montoPrepago = pagos.filter(p => tipoDe(p.metodo) === 'prepago').reduce((s, p) => s + p.monto, 0)
  const prepagoMal = montoPrepago > 0 && !pedirResto && (!cliente || montoPrepago > saldoPrepago)
  const montoFiado = pagos.filter(p => tipoDe(p.metodo) === 'fiado').reduce((s, p) => s + p.monto, 0)
  const hayFiado = montoFiado > 0
  const pasaCupo = hayFiado && Boolean(cliente) && Number(cliente.cupo_credito) > 0 &&
    Number(cliente.saldo) + montoFiado > Number(cliente.cupo_credito)
  const hayBajoMinimo = lineas.some(l => bajoMinimo(l, cfg.margen))
  const bloqueadaPorMinimo = hayBajoMinimo && dueno !== true
  const falta = faltaPagar(total, pagos)
  const moraCliente = cliente ? mora[cliente.id] : null
  const bloqueadaPorMora = hayFiado && Boolean(moraCliente) && Number(moraCliente.vencido) > 0 && cfg.bloqueoMora && dueno !== true
  const faltaDireccion = dom.on && dom.direccion.trim().length < 5
  const puedeCobrar = lineas.length > 0 && !descuentoMalo && total > 0 && falta === 0 && !bloqueadaPorMinimo && !bloqueadaPorMora && !faltaDireccion && !abonoMalo && !prepagoMal
  const motivoBloqueo = prepagoMal ? (cliente ? `El saldo prepago de ${cliente.nombre} no alcanza (tiene ${dinero(saldoPrepago)}).` : 'Elige el cliente para cobrar con su saldo prepago.')
    : abonoMalo ? 'Ese valor no puede ser igual o mayor que el total. Si paga todo con una forma, deja la otra en cero.'
    : bloqueadaPorMinimo ? 'Hay productos por debajo del precio mínimo. Ajusta el precio o el descuento.'
    : bloqueadaPorMora ? `${cliente.nombre} tiene deuda vencida: debe pagarla antes de fiarle más.`
    : faltaDireccion ? 'Falta la dirección del domicilio.' : ''

  const elegirMetodo = (id) => { setMetodo(id); setAvisoCobro(''); setAbonoTxt(''); setAbonoRecibido(''); setRestoForma(''); setParcial('') }
  const ponerRecibido = (v) => { setRecibido(v); setRestoForma('') }
  const ponerParcial = (v) => { setParcial(v); setRestoForma('') }
  const cambiarMixto = (v) => {
    if (v) setFilas([{ id: crypto.randomUUID(), metodo, txt: total > 0 ? String(total) : '' }])
    setMixto(v); setAvisoCobro('')
  }

  const cargarClientes = useCallback(async () => {
    const [{ data }, pp] = await Promise.all([
      supabase.from('clientes_saldo').select('*').order('nombre'),
      supabase.from('prepago_saldos').select('cliente_id, saldo'),      // sin migracion-v35 aún: no hay saldos
    ])
    setClientes(data ?? [])
    setPrepago(pp.error ? {} : Object.fromEntries((pp.data ?? []).map(x => [x.cliente_id, Number(x.saldo)])))
  }, [])
  useEffect(() => { cargarClientes() }, [cargarClientes])

  // Promociones activas y deudas vencidas (si todavía no se ejecutó migracion-v9, quedan vacías)
  const cargarExtras = useCallback(async () => {
    const [p, m] = await Promise.all([
      supabase.from('promociones').select('*').eq('activa', true),
      supabase.from('clientes_mora').select('cliente_id, vencido, dias_atraso, recargo'),
    ])
    setPromos(p.error ? [] : (p.data ?? []))
    setMora(m.error ? {} : Object.fromEntries((m.data ?? []).map(x => [x.cliente_id, x])))
  }, [])
  useEffect(() => { cargarExtras() }, [cargarExtras])

  // El producto recién agregado se resalta un momento
  useEffect(() => {
    if (!ultimoId) return
    const t = setTimeout(() => setUltimoId(null), 1600)
    return () => clearTimeout(t)
  }, [ultimoId])

  // Funcional a propósito: la cámara conserva la primera versión de esta función
  const agregar = useCallback((producto) => {
    setCarrito(prev => {
      const i = prev.findIndex(l => l.producto.id === producto.id)
      if (i >= 0) {
        const subida = { ...prev[i], cantidad: Math.round((prev[i].cantidad + pasoDe(producto)) * 1000) / 1000, txt: undefined }
        return [subida, ...prev.filter((_, k) => k !== i)]       // el último escaneado sube al primer lugar
      }
      return [{ producto, cantidad: 1 }, ...prev]       // el último producto agregado queda arriba
    })
    // Lo que se vende por peso abre el pesaje de una vez
    setPesandoId(esPesable(producto) ? producto.id : null)
    setUltimoId(producto.id)
    setAviso(null)
    setAvisoCobro('')
    setUltima(null)
  }, [])

  const alEscanear = useCallback(async (codigo) => {
    const { data, error } = await supabase
      .from('productos').select('*').eq('codigo', codigo).eq('activo', true).maybeSingle()
    if (error && esErrorDeRed(error)) {          // sin internet: se busca en la copia de productos guardada en este equipo
      const local = await productoPorCodigo(codigo)
      if (local) return agregar(local)
      return setAviso({ tipo: 'error', texto: 'Sin internet y ese código no está en la copia guardada de productos.' })
    }
    if (error) return setAviso({ tipo: 'error', texto: error.message })
    if (data) agregar(data)
    else setCodigoNuevo(codigo)
  }, [agregar])

  // Copia de los productos en este equipo (para vender sin internet): al abrir la caja y cada 10 minutos
  useEffect(() => {
    actualizarCatalogo()
    const t = setInterval(actualizarCatalogo, 10 * 60000)
    return () => clearInterval(t)
  }, [])

  // Búsqueda por nombre (para productos sin código)
  useEffect(() => {
    const q = busqueda.trim()
    if (q.length < 1) { setResultados([]); return }
    const t = setTimeout(async () => {
      const { data, error } = await buscarProductosPorNombre(supabase, q)
      const filas = error && esErrorDeRed(error) ? await buscarPorNombre(q) : (data ?? [])
      setResultados(ordenarPorInicio(filas, q).slice(0, 30))
    }, 250)
    return () => clearTimeout(t)
  }, [busqueda])

  // Recuperar la venta en curso (si se recargó la página o se cerró la app a mitad de venta)
  useEffect(() => {
    const g = leerBorrador(CLAVE_BORRADOR, DOCE_HORAS)
    const ids = (g?.lineas ?? []).map(l => l.id)
    if (ids.length === 0) { guardarListo.current = true; return }
    supabase.from('productos').select('*').in('id', ids).eq('activo', true).then(async (r) => {
      let { data, error } = r
      if (error && esErrorDeRed(error)) { data = await productosPorIds(ids); error = null }   // sin internet: se usa la copia guardada
      if (error) return                                 // si no hay forma de leerlos, el borrador se conserva intacto
      const por = new Map((data ?? []).map(p => [p.id, p]))   // precios y stock de hoy, no los viejos
      const ls = g.lineas.filter(l => por.has(l.id)).map(({ id, ...resto }) => ({ producto: por.get(id), ...resto }))
      if (ls.length > 0) {
        setCarrito(ls); setClienteId(g.clienteId ?? ''); setDescuentoTxt(g.descuentoTxt ?? '')
        setVerDescuento(Boolean(g.descuentoTxt)); if (g.dom) setDom(g.dom)
        setNotaVenta(g.nota ?? '')
        if (g.pedido?.id) setPedidoTienda(g.pedido)
        setRecuperada(g.pedido?.id ? 0 : ls.length)
      } else guardarBorrador(CLAVE_BORRADOR, null)
      guardarListo.current = true
    })
  }, [])

  // Guardar la venta en curso cada vez que cambia
  useEffect(() => {
    if (!guardarListo.current) return
    const ls = carrito.filter(l => l.cantidad > 0)
    guardarBorrador(CLAVE_BORRADOR, ls.length === 0 ? null : {
      lineas: ls.map(l => ({ id: l.producto.id, cantidad: l.cantidad, precio: l.precio, precioTxt: l.precioTxt, descuento: l.descuento, descuentoTxt: l.descuentoTxt })),
      clienteId, descuentoTxt, dom, nota: notaVenta, pedido: pedidoTienda,
    })
  }, [carrito, clienteId, descuentoTxt, dom, notaVenta, pedidoTienda])

  const vaciarVenta = () => {
    setCarrito([]); setRecibido(''); setParcial(''); setBusqueda(''); setResultados([]); setEditandoId(null); setPesandoId(null)
    setDescuentoTxt(''); setVerDescuento(false); setMixto(false); setFilas([]); setAbonoTxt(''); setAbonoRecibido(''); setVerParte(false)
    setClienteId(''); setBuscaCliente(''); setFechaLimite(''); setVerCliente(false); setRestoForma('')
    setDom({ on: false, direccion: '', telefono: '', costoTxt: '' }); setNotaVenta(''); setRecuperada(0); setPedidoTienda(null)
  }

  // ---- Varias ventas a la vez ----
  const nombreCorto = (id) => (clientes.find(c => c.id === id)?.nombre ?? '').split(' ')[0]
  const instantanea = () => ({
    id: crypto.randomUUID(), n: numActual,
    lineas: carrito.filter(l => l.cantidad > 0).map(l => ({ id: l.producto.id, cantidad: l.cantidad, precio: l.precio, precioTxt: l.precioTxt, descuento: l.descuento, descuentoTxt: l.descuentoTxt })),
    clienteId, descuentoTxt, dom, nota: notaVenta, pedido: pedidoTienda, productos: lineas.length, total,
  })
  const limpiarPantalla = () => {
    setCarrito([]); setRecibido(''); setParcial(''); setBusqueda(''); setResultados([]); setEditandoId(null); setPesandoId(null)
    setDescuentoTxt(''); setVerDescuento(false); setMixto(false); setFilas([]); setAbonoTxt(''); setAbonoRecibido(''); setVerParte(false); setRestoForma('')
    setClienteId(''); setBuscaCliente(''); setFechaLimite(''); setVerCliente(false)
    setDom({ on: false, direccion: '', telefono: '', costoTxt: '' }); setNotaVenta(''); setRecuperada(0); setAvisoCobro(''); setPedidoTienda(null)
  }
  const otroNumero = (lista) => Math.max(numActual, ...lista.map(e => e.n)) + 1
  // El cliente actual se pone en espera y la pantalla queda lista para el siguiente
  const atenderOtro = () => {
    if (lineas.length === 0 || espera.length + 1 >= MAX_VENTAS) return
    const nueva = instantanea()
    setEspera(prev => [...prev, nueva]); limpiarPantalla(); setNumActual(otroNumero(espera))
    setUltima(null); window.scrollTo({ top: 0, behavior: 'smooth' })
  }
  const retomar = async (id) => {
    const g = espera.find(e => e.id === id)
    if (!g) return
    const ids = g.lineas.map(l => l.id)
    const { data, error } = await supabase.from('productos').select('*').in('id', ids).eq('activo', true)
    if (error) return setAviso({ tipo: 'error', texto: 'No se pudo abrir esa venta (sin conexión). Intenta de nuevo.' })
    const por = new Map((data ?? []).map(p => [p.id, p]))          // precios y stock de hoy
    const ls = g.lineas.filter(l => por.has(l.id)).map(({ id: pid, ...resto }) => ({ producto: por.get(pid), ...resto }))
    const actual = lineas.length > 0 ? instantanea() : null
    setEspera(prev => { const sin = prev.filter(e => e.id !== id); return actual ? [...sin, actual] : sin })
    limpiarPantalla()
    setCarrito(ls); setClienteId(g.clienteId ?? ''); setDescuentoTxt(g.descuentoTxt ?? ''); setVerDescuento(Boolean(g.descuentoTxt))
    if (g.dom) setDom(g.dom)
    setNotaVenta(g.nota ?? '')
    setPedidoTienda(g.pedido ?? null)
    setNumActual(g.n); setUltima(null); setAviso(null)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }
  const descartar = async (id) => {
    const g = espera.find(e => e.id === id)
    if (!g || !(await confirmar({ titulo: `¿Descartar la ${etiquetaDe(g)}?`, texto: 'Se quitan sus productos. No se registra ninguna venta.', si: 'Sí, descartar' }))) return
    setEspera(prev => prev.filter(e => e.id !== id))
  }
  const etiquetaDe = (v) => (v.clienteId && nombreCorto(v.clienteId)) ? `Venta ${v.n} · ${nombreCorto(v.clienteId)}` : `Venta ${v.n}`
  const ventasAbiertas = useMemo(() => espera.map(v => ({ ...v, label: etiquetaDe(v) })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [espera, clientes])

  // Las ventas en espera sobreviven a recargar la página (solo en este dispositivo)
  useEffect(() => {
    const g = leerBorrador(CLAVE_ESPERA, DOCE_HORAS)
    if (Array.isArray(g) && g.length > 0) { setEspera(g); setNumActual(Math.max(...g.map(e => e.n)) + 1) }
    esperaLista.current = true
  }, [])
  useEffect(() => {
    if (!esperaLista.current) return
    guardarBorrador(CLAVE_ESPERA, espera.length === 0 ? null : espera)
  }, [espera])

  const cambiarCantidad = (id, delta) => {
    const l0 = carrito.find(x => x.producto.id === id)
    // si con el − la cantidad llegaría a cero, es quitar el producto: se confirma
    if (l0 && delta < 0 && l0.cantidad + delta * pasoDe(l0.producto) <= 0) return pedirQuitar(id)
    return setCarrito(prev => prev
      .map(l => l.producto.id === id
        ? { ...l, cantidad: Math.round((l.cantidad + delta * pasoDe(l.producto)) * 1000) / 1000, txt: undefined } : l)
      .filter(l => l.cantidad > 0))
  }

  // Se puede escribir la cantidad (por ejemplo 1,5 kilos)
  const escribirCantidad = (id, texto) =>
    setCarrito(prev => prev.map(l => l.producto.id === id ? { ...l, txt: texto, cantidad: aCantidad(texto) } : l))
  const cerrarCantidad = (id) =>
    setCarrito(prev => prev.filter(l => l.producto.id !== id || l.cantidad > 0)
      .map(l => (l.producto.id === id ? { ...l, txt: undefined } : l)))

  // Quitar un producto pide confirmación (por un toque accidental no se pierde nada sin darse cuenta)
  const pedirQuitar = async (id) => {
    const l = carrito.find(x => x.producto.id === id)
    if (!l) return
    if (await confirmar({ titulo: `¿Quitar ${l.producto.nombre}?`, texto: 'Se saca de la venta en curso.', si: 'Sí, quitar' })) quitar(id)
  }
  const quitar = (id) => { setCarrito(prev => prev.filter(l => l.producto.id !== id)); setEditandoId(null); setPesandoId(null) }
  const ajustar = (id, cambios) => setCarrito(prev => prev.map(l => (l.producto.id === id ? { ...l, ...cambios } : l)))

  useEffect(() => {
    const el = document.getElementById('pago-caja')
    if (!el || typeof IntersectionObserver === 'undefined') return undefined
    const o = new IntersectionObserver(([e]) => setVerPago(e.isIntersecting && e.intersectionRatio > 0.25), { threshold: [0, 0.25, 0.5] })
    o.observe(el)
    return () => o.disconnect()
  }, [lineas.length > 0])

  const irAPagar = () => document.getElementById('pago-caja')?.scrollIntoView({ behavior: 'smooth', block: 'start' })

  const cobrar = async (restoElegido) => {
    setAvisoCobro('')
    if (pedirResto && typeof restoElegido !== 'string') return setVerResto(true)
    const pg = typeof restoElegido === 'string' ? pagosCon(restoElegido) : pagos
    const hayFiado = pg.some(p => tipoDe(p.metodo) === 'fiado')
    if (hayFiado && !clienteId) return setAvisoCobro('Elige el cliente al que se le fía')
    if (descuentoMalo) return setAvisoCobro('El descuento no puede ser negativo ni igual o mayor que la venta')
    if (lineas.length === 0) return setAvisoCobro('Revisa las cantidades')
    setCobrando(true)
    const argsVenta = {
      p_items: lineas.map(l => ({
        producto_id: l.producto.id,
        cantidad: l.cantidad,
        ...(esManual(l) ? { precio: l.precio } : {}),
        ...(descuentoLinea(l) > 0 ? { descuento: descuentoLinea(l) } : {}),
      })),
      p_pagos: pg.map(p => ({ metodo: p.metodo, monto: p.monto, ...(p.recibido ? { recibido: p.recibido } : {}) })),
      p_cliente_id: clienteId || null,
      p_fecha_limite: hayFiado && fechaLimite ? fechaLimite : null,
      p_descuento: descuento,
      p_nota: notaVenta.trim() || null,
      p_domicilio: dom.on ? { direccion: dom.direccion.trim(), telefono: dom.telefono.trim(), costo: envio } : null,
    }
    const claveVenta = idNuevo()      // clave única: si la respuesta se pierde y se reintenta, la venta no se duplica
    const horaVenta = new Date().toISOString()
    let { data: ventaId, error } = await registrarVentaSegura(argsVenta, claveVenta, horaVenta)
    let sinInternet = false
    if (error && esErrorDeRed(error) && pg.some(p => tipoDe(p.metodo) === 'prepago')) {
      setCobrando(false); return setAvisoCobro('Cobrar con saldo prepago necesita internet, para que el saldo no se gaste dos veces.')
    }
    if (error && esErrorDeRed(error)) {
      // Sin internet: la venta queda guardada en este equipo y se sube sola cuando vuelva la conexión
      await encolarVenta(argsVenta, claveVenta, horaVenta, pedidoTienda?.id ?? null)
      await descontarStockLocal(lineas)
      sinInternet = true; error = null; ventaId = null
    }
    if (error) { setCobrando(false); return setAvisoCobro(explicar(error.message)) }

    const { data: v } = sinInternet ? { data: null } : await supabase.from('ventas').select('numero').eq('id', ventaId).single()
    if (pedidoTienda?.id && !sinInternet) {
      // el pedido queda atendido y ligado a su venta (para las estadísticas en línea); si falta la migración v29, solo cambia el estado
      const r = await supabase.from('pedidos_tienda').update({ estado: 'atendido', venta_id: ventaId }).eq('id', pedidoTienda.id)
      if (r.error) await supabase.from('pedidos_tienda').update({ estado: 'atendido' }).eq('id', pedidoTienda.id)
    }
    setCobrando(false)
    const efectivo = pg.find(p => tipoDe(p.metodo) === 'efectivo' && p.recibido && p.recibido > p.monto)
    const provisional = sinInternet ? {
      provisional: true, numero: null, fecha: horaVenta, total, descuento, metodo: pg[0]?.metodo, anulada: false, nota: notaVenta.trim() || null,
      clientes: clientes.find(c => c.id === clienteId) ?? null,
      venta_items: lineas.map(l => ({ nombre: l.producto.nombre, cantidad: l.cantidad, precio_unitario: precioDe(l), descuento_linea: descuentoLinea(l) + promoLinea(l), promo: l.promoNombre ?? null })),
      venta_pagos: pg.map(p => ({ metodo: p.metodo, monto: p.monto, recibido: p.recibido ?? null })),
      domicilio: dom.on, dom_direccion: dom.on ? dom.direccion.trim() : null, dom_telefono: dom.on ? dom.telefono.trim() : null, dom_costo: dom.on ? envio : 0,
    } : null
    setUltima({ id: ventaId, numero: v?.numero, total, pendiente: sinInternet, provisional, cambio: efectivo ? efectivo.recibido - efectivo.monto : 0 })
    if (practicaActiva() && clienteId) for (const p of pg) if (tipoDe(p.metodo) === 'prepago') moverPrepagoSimulado(clienteId, -p.monto)
    if (clienteId) cargarClientes()
    setCarrito([]); setRecibido(''); setParcial(''); setBusqueda(''); setResultados([]); setEditandoId(null); setPesandoId(null)
    setDescuentoTxt(''); setVerDescuento(false); setMixto(false); setFilas([]); setRestoForma(''); setVerResto(false)
    setClienteId(''); setBuscaCliente(''); setFechaLimite(''); setVerCliente(false); if (tipoDe(metodo) === 'prepago') setMetodo('efectivo')
    setDom({ on: false, direccion: '', telefono: '', costoTxt: '' }); setNotaVenta(''); setRecuperada(0); setPedidoTienda(null); cargarExtras()
    setNumActual(espera.length === 0 ? 1 : Math.max(...espera.map(e => e.n)) + 1)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const pago = {
    total, subtotal: base.subtotal, formas, tipoDe, metodo, elegirMetodo, mixto, setMixto: cambiarMixto, filas, setFilas,
    recibido, setRecibido: ponerRecibido, parcial, setParcial: ponerParcial, esDigital, restante, descuentoTxt, setDescuentoTxt, descuento, descuentoMalo, verDescuento, setVerDescuento,
    cliente, clienteId, quitarCliente, elegirCliente, buscaCliente, setBuscaCliente, coincidencias, qCliente,
    verCliente, setVerCliente, setNuevoCliente, hayFiado, montoFiado, pasaCupo, fechaLimite, setFechaLimite, sumarDias,
    abono, abonoTxt, setAbonoTxt, abonoMalo, formasAbono, abonoForma, setAbonoMetodo, fiadoUnico, parteOn, restante,
    saldoPrepago, esPrepago, montoPrepago, prepagoDe: (id) => saldoVisible(prepago[id], id),
    verParte, setVerParte, abonoRecibido, setAbonoRecibido,
    resto: { falta: faltaResto, pendiente: pedirResto, forma: restoValido ? formas.find(f => f.id === restoForma)?.nombre : '', abrir: () => setVerResto(true), quitar: () => setRestoForma('') },
    abrirCuenta: () => setVerCuenta(cliente),
    comision: cfg.comision, dueno, pagos, dom, setDom, notaVenta, setNotaVenta, moraCliente, puedeCobrar, cobrando, cobrar, motivoBloqueo,
  }

  return (
    <div className="space-y-4">
      {pedidoTienda && (
        <div className="rounded-2xl bg-champagne/30 ring-1 ring-oro/40 px-4 py-2.5 grid grid-cols-[1fr_auto] gap-3 items-center">
          <span className="text-sm font-semibold text-negro">Cobrando el pedido N.º {pedidoTienda.numero} de la tienda en línea</span>
          <button onClick={() => setPedidoTienda(null)} className="h-8 px-3 rounded-lg bg-white text-xs font-medium text-slate-600 ring-1 ring-slate-200 active:bg-slate-50">Soltar</button>
        </div>
      )}
      <div className="space-y-4 lg:space-y-0 lg:grid lg:grid-cols-[minmax(0,1fr)_26rem] xl:grid-cols-[minmax(0,1fr)_30rem] lg:gap-6 lg:items-start">
        {/* Izquierda: escáner, búsqueda y productos de la venta */}
        <div className="space-y-4">
          {(espera.length > 0 || lineas.length > 0) && (
            <VentasAbiertas
              actual={{ label: lineas.length > 0 || cliente ? etiquetaDe({ n: numActual, clienteId }) + ' (esta)' : `Venta ${numActual} (esta)`, productos: lineas.length, total }}
              espera={ventasAbiertas} puedeNueva={lineas.length > 0 && espera.length + 1 < MAX_VENTAS}
              onNueva={atenderOtro} onRetomar={retomar} onDescartar={descartar} />
          )}

          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => setVerEscaner(v => !v)}
                className={`h-11 rounded-xl bg-white shadow-sm text-sm font-medium text-slate-600 ${dueno === true && prestamoRapido ? 'col-span-2' : ''}`}>
                {verEscaner ? 'Ocultar escáner' : 'Mostrar escáner'}
              </button>
              <button onClick={() => setVerRetiro(true)}
                className="h-11 rounded-xl bg-white shadow-sm text-sm font-semibold text-negro grid grid-cols-[auto_auto] gap-2 items-center justify-center active:bg-slate-50">
                <Icono nombre="gastos" className="h-5 w-5" /><span>Retiro de caja</span>
              </button>
              {dueno === true && prestamoRapido && (
                <button onClick={() => setVerPrestamo(true)}
                  className="h-11 rounded-xl bg-negro text-champagne text-sm font-semibold grid grid-cols-[auto_auto] gap-2 items-center justify-center active:opacity-90">
                  <Icono nombre="prestamos" className="h-5 w-5" /><span>Préstamo rápido</span>
                </button>
              )}
            </div>
            {verEscaner && <Escaner onCodigo={alEscanear} compacto fino />}
            <BotonCelular onCodigo={alEscanear} venta={ventaCelular} />
          </div>

          <div className="space-y-2">
            <input value={busqueda} onChange={e => setBusqueda(e.target.value)}
                   placeholder="Buscar por nombre (sin código)" className={claseInput} />
            {resultados.length > 0 && (
              <div className="bg-white rounded-xl shadow-sm divide-y divide-slate-100 max-h-[18.5rem] overflow-y-auto overscroll-contain">
                {resultados.map(p => (
                  <button key={p.id} onClick={() => { agregar(p); setBusqueda(''); setResultados([]) }}
                    className="w-full min-h-12 px-4 py-2 flex items-center justify-between gap-3 text-left active:bg-slate-50">
                    <Miniatura producto={p} tam="h-9 w-9" />
                    <span className="text-sm break-words flex-1">{p.nombre}</span>
                    <span className="text-sm font-semibold text-marca shrink-0">{dinero(p.precio_venta)}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {aviso && (
            <p className={`text-sm rounded-lg px-3 py-2 ${aviso.tipo === 'ok' ? 'text-marca bg-lima/20' : 'text-red-600 bg-red-50'}`}>
              {aviso.texto}
            </p>
          )}

          {ultima && (
            <div className="rounded-3xl bg-esmeralda/10 ring-1 ring-esmeralda/30 p-4 lg:p-5 space-y-3">
              <p className="text-sm lg:text-base font-medium text-esmeralda">
                {ultima.pendiente ? `Venta guardada sin internet: ${dinero(ultima.total)}. Se sube sola cuando vuelva la conexión; si el sistema la rechaza (por ejemplo, sin stock) te avisamos arriba.` : `Venta N.º ${numeroFactura(ultima.numero)} registrada: ${dinero(ultima.total)}`}
                {ultima.cambio > 0 ? ` · Cambio: ${dinero(ultima.cambio)}` : ''}
              </p>
              {ultima.cambio > 0 && (
                <p className="text-center text-4xl lg:text-5xl font-semibold tabular-nums text-esmeralda">
                  <span className="block text-xs uppercase tracking-[0.2em] font-normal mb-1">Entrega de cambio</span>
                  {dinero(ultima.cambio)}
                </p>
              )}
              <div className="grid grid-cols-2 gap-3">
                {ultima.pendiente
                  ? <button onClick={() => setFacturaProv(ultima.provisional)}
                      className="h-11 rounded-xl bg-negro text-champagne text-sm font-semibold active:opacity-90">Comprobante provisional</button>
                  : <button onClick={() => setFacturaId(ultima.id)}
                      className="h-11 rounded-xl bg-negro text-champagne text-sm font-semibold active:opacity-90">
                      Imprimir factura
                    </button>}
                <button onClick={() => setUltima(null)}
                  className="h-11 rounded-xl bg-white text-slate-600 text-sm font-medium active:bg-slate-50">
                  Listo
                </button>
              </div>
            </div>
          )}

          {recuperada > 0 && lineas.length > 0 && (
            <div className="rounded-2xl bg-champagne/25 ring-1 ring-oro/30 p-3 space-y-3">
              <p className="text-sm text-negro">Recuperamos la venta que tenías en curso ({recuperada} {recuperada === 1 ? 'producto' : 'productos'}). Los precios y el stock son los de hoy.</p>
              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => setRecuperada(0)}
                  className="h-11 rounded-xl bg-negro text-champagne text-sm font-semibold active:opacity-90">Seguir con esta venta</button>
                <button onClick={vaciarVenta}
                  className="h-11 rounded-xl bg-white text-slate-600 text-sm font-medium ring-1 ring-slate-200 active:bg-slate-50">Empezar de nuevo</button>
              </div>
            </div>
          )}

          <CajaLineas lineas={lineasVista} ultimoId={ultimoId} editandoId={editandoId} pesandoId={pesandoId} onPesar={setPesandoId} margen={cfg.margen} dueno={dueno === true}
            onEditar={setEditandoId} onCantidad={cambiarCantidad} onEscribir={escribirCantidad}
            onCerrarCantidad={cerrarCantidad} onQuitar={pedirQuitar} onAjuste={ajustar} />

          {lineasVista.length > 0 && (
            <button onClick={async () => { if (await confirmar({ titulo: '¿Vaciar la venta en curso?', texto: 'Se quitan todos los productos de esta venta.', si: 'Sí, vaciar' })) vaciarVenta() }}
              className="w-full h-11 rounded-xl bg-white ring-1 ring-slate-200 text-sm font-medium text-slate-500 active:bg-slate-50">
              Vaciar venta
            </button>
          )}
        </div>

        {/* Derecha: total en grande y cobro */}
        {lineas.length > 0 && (
          <div className="space-y-4 lg:space-y-0 lg:sticky lg:top-20 lg:max-h-[calc(100vh-6rem)] lg:flex lg:flex-col lg:gap-4">
            {/* El total queda fijo arriba; solo el cobro de abajo se desplaza */}
            <div className="lg:shrink-0"><CajaTotal r={r} /></div>
            <div className="lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:pr-1 [scrollbar-width:thin] space-y-4">
              <CajaPago c={pago} />
              {avisoCobro && (
                <p role="alert" className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{avisoCobro}</p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Celular: el total siempre a la vista */}
      {lineas.length > 0 && (
        <>
          <div className="h-20 lg:hidden" />
          <div className="lg:hidden fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-20 px-3 pb-2">
            <button onClick={verPago ? () => cobrar() : irAPagar} disabled={verPago && (!puedeCobrar || cobrando)}
              className="w-full h-16 rounded-2xl bg-negro text-champagne px-5 grid grid-cols-[1fr_auto] items-center ring-1 ring-champagne/40 shadow-xl active:opacity-90 disabled:opacity-60">
              <span className="text-left">
                <span className="block text-[10px] uppercase tracking-[0.2em] text-champagne/70">Total · {r.productos} {r.productos === 1 ? 'producto' : 'productos'}</span>
                <span className="block text-3xl font-semibold tabular-nums leading-tight">{dinero(total)}</span>
              </span>
              <span className="text-sm font-semibold">{verPago ? (cobrando ? 'Registrando…' : 'Cobrar ›') : 'Ir a pagar ›'}</span>
            </button>
          </div>
        </>
      )}

      {verResto && (
        <DialogoResto recibido={faltaDigital ? parcialNum : recibidoNum} falta={faltaResto} formas={formasResto}
          detalle={faltaPrepago ? `Tiene ${dinero(Math.max(0, saldoPrepago))} de saldo prepago.` : undefined}
          nombreRecibido={formas.find(f => f.id === metodo)?.nombre ?? 'efectivo'}
          onCerrar={() => setVerResto(false)}
          onElegir={(id) => {
            setRestoForma(id); setVerResto(false)
            if (tipoDe(id) === 'fiado' && !clienteId) { setVerCliente(true); return setAvisoCobro('Elige el cliente al que se le fía y vuelve a tocar Cobrar') }
            cobrar(id)
          }} />
      )}

      {facturaId && <Factura ventaId={facturaId} onCerrar={() => setFacturaId(null)} />}
      {facturaProv && <Factura provisional={facturaProv} onCerrar={() => setFacturaProv(null)} />}

      {verPrestamo && (
        <PrestamoRapido clientes={clientes} onCerrar={() => setVerPrestamo(false)}
          onHecho={(c, r) => { setVerPrestamo(false); cargarClientes(); setAviso({ tipo: 'ok', texto: r?.pendiente ? `Préstamo rápido a ${c.nombre} guardado sin internet: se sube solo.` : `Préstamo rápido registrado a ${c.nombre}. Míralos todos en Fiados → Préstamos rápidos.` }) }} />
      )}
      {verRetiro && (
        <RetiroCaja onCerrar={() => setVerRetiro(false)}
          onHecho={(m) => { setVerRetiro(false); setAviso({ tipo: 'ok', texto: `${m.tipo === 'retiro' ? 'Retiro' : 'Ingreso'} de caja ${m.pendiente ? 'guardado sin internet (se sube solo)' : 'registrado'}: ${dinero(m.monto)}.` }) }} />
      )}
      {verCuenta && (
        <ClienteDetalle cliente={verCuenta} onCerrar={() => setVerCuenta(null)} onCambio={cargarClientes} />
      )}

      {codigoNuevo && (
        <ProductoForm
          producto={{ codigo: codigoNuevo }}
          onCerrar={() => setCodigoNuevo(null)}
          onGuardado={(p) => { setCodigoNuevo(null); agregar(p) }}
        />
      )}
      {nuevoCliente && (
        <ClienteForm
          onCerrar={() => setNuevoCliente(false)}
          onGuardado={async (c) => { setNuevoCliente(false); const { data } = await supabase.from('clientes_saldo').select('*').eq('id', c.id).single(); await cargarClientes(); elegirCliente(data ?? c) }}
        />
      )}
    </div>
  )
}
