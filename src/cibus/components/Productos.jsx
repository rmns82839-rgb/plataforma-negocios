import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { usePersistido, borrarBorradores, TREINTA_MIN } from '../lib/usePersistido'
import { supabase } from '../lib/supabase'
import { traerTodo } from '../lib/traerTodo'
import { dinero, numero, aCantidad, aNumero } from '../lib/formato'
import { coincide, ordenarPorInicio } from '../lib/buscar'
import { claseInput } from '../lib/estilos'
import Escaner from './Escaner'
import Modal, { Campo } from './Modal'
import Miniatura from './Miniatura'
import ProductoForm from './ProductoForm'
import ImportarFotos from './ImportarFotos'
import { esFotoDeTexto } from '../lib/fotoSoloTexto'
import Repetidos from './Repetidos'
import CargaMasiva from './CargaMasiva'
import ProductosBase from './ProductosBase'
import { catalogoBaseCsv } from '../lib/catalogoBase'
import { esGenerica } from '../lib/imagenGenerica'
import { fotosDe } from '../lib/fotos'
import { descargarFotos } from '../lib/descargarFotos'
import PublicarEnLinea from './PublicarEnLinea'
import FotoRapida from './FotoRapida'
import { useDueno } from '../context/rol'
import { sinFoto } from '../lib/importarFotos'
import AjusteStock from './AjusteStock'
import Compra from './Compra'
import { porVencer, textoVence, diasParaVencer, venceDe } from '../lib/vencimiento'
import { useCopiado, textoCopiar } from '../lib/useCopiado'
import BarraFija, { Desplegable } from './BarraFija'
import BotonCelular from './BotonCelular'
import QrCatalogo from './QrCatalogo'
import { precioConMargen, gananciaPorUnidad } from '../lib/margen'
import { confirmar } from '../lib/confirmar'
import { usePlataforma } from '../context/plataforma'
import { enlaceTienda } from '../lib/enlaces'

let cacheProductos = null      // la lista de la última vez: se muestra al instante mientras llega la nueva

export default function Productos() {
  const { modulos } = usePlataforma()
  const [verRepetidos, setVerRepetidos] = useState(false)
  const [soloMarcados, setSoloMarcados] = useState(false)
  const [escaneo, setEscaneo] = useState(null)
  const [quitando, setQuitando] = useState(false)
  const cancelarEscaneo = useRef(false)
  const conCompras = modulos.includes('compras')       // «Compra» y «+ Stock» registran una compra: necesitan ese módulo
  const [productos, setProductos] = useState([])
  const [cargando, setCargando] = useState(!cacheProductos)
  const [mostrar, setMostrar] = useState(60)      // se dibujan de a 60: con miles de productos, dibujarlos todos traba el celular
  const [error, setError] = useState('')
  const [texto, setTexto] = useState('')
  const [filtro, setFiltro] = useState('todos')     // todos | bajos | vencer
  const [categoria, setCategoria] = useState('todas')
  const [verEscaner, setVerEscaner] = useState(false)
  const [form, setForm] = usePersistido('productos:form', null, true, TREINTA_MIN)        // producto (o {codigo}) abierto en el formulario
  const [ingreso, setIngreso] = usePersistido('ingreso:producto', null, true, TREINTA_MIN)  // producto al que se le suma stock
  const [cantidad, setCantidad] = usePersistido('ingreso:cantidad', '')
  const [lote, setLote] = usePersistido('ingreso:lote', '')
  const [vence, setVence] = usePersistido('ingreso:vence', '')
  const [precioNuevo, setPrecioNuevo] = usePersistido('ingreso:precio', '')   // precio de venta del lote que llega (el dueño lo puede cambiar)
  const [costoIng, setCostoIng] = usePersistido('ingreso:costo', '')           // lo que costó cada unidad del lote nuevo
  const [usarMargen, setUsarMargen] = usePersistido('ingreso:usarMargen', false)  // calcular el precio con un % de ganancia
  const [margen, setMargen] = usePersistido('ingreso:margen', '30')
  const [mostrarLinea, setMostrarLinea] = usePersistido('ingreso:linea', true)  // publicar en la tienda en línea al ingresar
  const [guardandoIngreso, setGuardandoIngreso] = useState(false)
  const [ajuste, setAjuste] = usePersistido('productos:ajuste', null, true, TREINTA_MIN)   // producto que se está contando
  const [compra, setCompra] = usePersistido('productos:compra', false, true, TREINTA_MIN)
  const [fotos, setFotos] = usePersistido('productos:importarFotos', false, true, TREINTA_MIN)
  const [modoBajar, setModoBajar] = useState(false)      // «Descargar fotos»: se pueden marcar varios productos
  const [marcados, setMarcados] = useState(() => new Set())
  const [bajando, setBajando] = useState(null)             // { hechas, total } mientras se descarga
  const [avisoBajar, setAvisoBajar] = useState('')
  const [carga, setCarga] = useState(false)
  const [base, setBase] = useState(false)
  const [publicar, setPublicar] = usePersistido('productos:publicarLinea', false, true, TREINTA_MIN)
  const dueno = useDueno()
  const [fotosHechas, setFotosHechas] = useState({})      // producto → fotos tomadas en esta pantalla (se quedan en la lista para sumar más)
  const [copiado, copiar] = useCopiado()
  const [verQr, setVerQr] = useState(false)

  const modalAbierto = Boolean(form || compra || ingreso || ajuste || fotos || publicar || carga || base || verRepetidos)
  const listaRef = useRef([])
  const cargar = useCallback(async () => {
    if (cacheProductos) { listaRef.current = cacheProductos; setProductos(cacheProductos); setCargando(false) } else setCargando(true)
    const [pr, lo] = await Promise.all([
      traerTodo(() => supabase.from('productos').select('*').eq('activo', true).order('nombre').order('id')),
      traerTodo(() => supabase.from('lotes_saldo').select('producto_id,fecha_vencimiento,restante').gt('restante', 0)
        .not('fecha_vencimiento', 'is', null).order('producto_id')),
    ])
    if (pr.error) setError(pr.error.message)
    // vencimiento que cuenta: el lote más próximo que aún tiene unidades
    const prox = {}
    for (const l of lo.data ?? []) {
      if (!prox[l.producto_id] || l.fecha_vencimiento < prox[l.producto_id]) prox[l.producto_id] = l.fecha_vencimiento
    }
    listaRef.current = (pr.data ?? []).map(p => ({ ...p, vence: prox[p.id] ?? null }))
    setProductos(listaRef.current)
    cacheProductos = listaRef.current
    setCargando(false)
  }, [])
  useEffect(() => { cargar() }, [cargar])

  // Escanear (cámara, pistola o celular-pistola) llena el buscador: la lista queda solo con ese producto.
  // Si el código no existe, abajo aparece «Crear producto con este código».
  const alEscanear = useCallback((codigo) => {
    setTexto(String(codigo ?? '').trim()); setFiltro('todos'); setCategoria('todas')
  }, [])

  const agotados = useMemo(() => productos.filter(p => p.controla_stock !== false && Number(p.stock) <= 0), [productos])      // los servicios (sin control de stock) nunca se «agotan»

  const bajos = useMemo(
    () => productos.filter(p => p.controla_stock !== false && Number(p.stock) <= Number(p.stock_minimo)), [productos])

  const sinFotos = useMemo(() => productos.filter(p => sinFoto(p) && !(fotosHechas[p.id] > 0)), [productos, fotosHechas])

  const aVencer = useMemo(
    () => productos.filter(porVencer)
      .sort((a, b) => diasParaVencer(venceDe(a)) - diasParaVencer(venceDe(b))),
    [productos])

  const visibles = useMemo(() => {
    const base = filtro === 'bajos' ? bajos : filtro === 'agotados' ? agotados : filtro === 'vencer' ? aVencer : filtro === 'sinfoto' ? productos.filter(p => sinFoto(p) || fotosHechas[p.id] > 0) : productos
    const lista = base.filter(p => (categoria === 'todas' || p.categoria === categoria) && coincide([p.nombre, p.codigo], texto))
    return texto.trim() ? ordenarPorInicio(lista, texto) : lista      // al buscar, lo que mejor encaja va primero
  }, [productos, bajos, agotados, aVencer, fotosHechas, texto, filtro, categoria])

  const categorias = useMemo(() => ['todas', ...new Set(productos.map(p => p.categoria).filter(Boolean))], [productos])
  useEffect(() => { setMostrar(60) }, [texto, filtro, categoria])

  const sumarStock = async () => {
    const n = aCantidad(cantidad)
    if (!(n > 0)) return setError('Escribe la cantidad que llegó')
    const pv = aNumero(precioNuevo)
    if (precioNuevo !== '' && !(pv > 0)) return setError('Escribe un precio de venta válido, o déjalo como estaba')
    setGuardandoIngreso(true); setError('')
    const { error: err } = await supabase.rpc('registrar_compra', {
      p_items: [{
        producto_id: ingreso.id, cantidad: n, costo_unitario: dueno === true ? Math.max(0, aNumero(costoIng) || 0) : 0,
        lote: lote.trim() || null, vence: vence || null,
        precio_venta: dueno === true && pv > 0 && pv !== Number(ingreso.precio_venta) ? pv : null,    // el precio del producto pasa al del lote nuevo
      }],
      p_proveedor: null, p_nota: 'Ingreso rápido',
    })
    if (err) { setGuardandoIngreso(false); return setError(err.message) }
    // Llegó mercancía de algo que aún no se ve en la tienda en línea: se publica (si tiene foto y el dueño lo deja marcado)
    if (dueno === true && mostrarLinea && !ingreso.publicado && fotosDe(ingreso).length > 0) {
      await supabase.from('productos').update({ publicado: true }).eq('id', ingreso.id)
    }
    setGuardandoIngreso(false)
    cerrarIngreso(); cargar()
  }

  const cerrarIngreso = () => { setIngreso(null); setCantidad(''); setLote(''); setVence(''); setPrecioNuevo(''); setCostoIng(''); setMostrarLinea(true) }
  // Con el botón de % de ganancia activo, el precio se calcula solo a partir del costo
  useEffect(() => {
    if (!ingreso || !usarMargen) return
    const p = precioConMargen(aNumero(costoIng), parseFloat(String(margen).replace(',', '.')))
    if (p > 0) setPrecioNuevo(String(p))
  }, [ingreso?.id, usarMargen, costoIng, margen]) // eslint-disable-line react-hooks/exhaustive-deps
  // Al abrir el ingreso, el precio aparece ya escrito: se cambia solo si el lote nuevo llegó más caro o más barato
  useEffect(() => { if (ingreso && precioNuevo === '' && Number(ingreso.precio_venta) > 0) setPrecioNuevo(String(Number(ingreso.precio_venta))) }, [ingreso?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const archivar = async (p) => {
    if (!(await confirmar({ titulo: `¿Quitar "${p.nombre}" del inventario?`, texto: 'Deja de aparecer en la Caja y en la tienda. Las ventas anteriores se conservan.' }))) return
    const { error: err } = await supabase.from('productos').update({ activo: false }).eq('id', p.id)
    if (err) return setError(err.message)
    setForm(null); cargar()
  }

  return (
    <div className="space-y-4">
      <BarraFija>
      <div className={`grid ${conCompras ? 'grid-cols-3' : 'grid-cols-2'} gap-2`}>
        <button onClick={() => setVerEscaner(v => !v)}
          className="h-9 rounded-xl bg-white shadow-sm text-sm font-medium text-slate-600">
          {verEscaner ? 'Ocultar' : 'Escanear'}
        </button>
        {conCompras && (
        <button onClick={() => setCompra(true)}
          className="h-9 rounded-xl bg-lima/20 text-marca text-sm font-semibold active:bg-lima/30">
          Compra
        </button>
        )}
        <button onClick={() => setForm({})}
          className="h-9 rounded-xl bg-marca text-white text-sm font-semibold active:bg-marca-oscuro">
          + Producto
        </button>
      </div>

      <div className="grid grid-cols-[1fr_auto] gap-2">
        <input value={texto} onChange={e => setTexto(e.target.value)} inputMode="search" enterKeyHint="search"
               placeholder="Buscar por nombre o código" className={`${claseInput} !h-10`} />
        {texto && <button onClick={() => setTexto('')} aria-label="Borrar la búsqueda" className="h-10 w-10 rounded-xl bg-slate-100 text-slate-500 active:bg-slate-200">✕</button>}
      </div>
      {verEscaner && <p className="text-xs text-slate-500">Apunta la cámara al código de barras: el producto aparece en la lista.</p>}

      <div className="grid grid-cols-2 gap-2">
        <button onClick={() => setFiltro('todos')}
          className={`h-9 rounded-xl text-xs font-medium ${
            filtro === 'todos' ? 'bg-marca text-white' : 'bg-white text-slate-600 shadow-sm'}`}>
          Todos ({productos.length})
        </button>
        <button onClick={() => setFiltro('bajos')}
          className={`h-9 rounded-xl text-xs font-medium ${
            filtro === 'bajos' ? 'bg-naranja text-white' : 'bg-white text-slate-600 shadow-sm'}`}>
          Stock bajo ({bajos.length})
        </button>
        <button onClick={() => setFiltro('agotados')}
          className={`h-9 rounded-xl text-xs font-medium ${
            filtro === 'agotados' ? 'bg-slate-700 text-white' : 'bg-white text-slate-600 shadow-sm'}`}>
          Agotados ({agotados.length})
        </button>
        <button onClick={() => setFiltro('vencer')}
          className={`h-9 rounded-xl text-xs font-medium ${
            filtro === 'vencer' ? 'bg-red-500 text-white' : 'bg-white text-slate-600 shadow-sm'}`}>
          Por vencer ({aVencer.length})
        </button>
      </div>
        {categorias.length > 2 && (
          <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:thin]" role="group" aria-label="Categorías">
            {categorias.map(c => (
              <button key={c} onClick={() => setCategoria(c)}
                className={`shrink-0 w-28 h-8 rounded-full text-xs font-medium capitalize break-words px-3 ${
                  categoria === c ? 'bg-negro text-champagne' : 'bg-white text-slate-600 ring-1 ring-slate-200'}`}>
                {c === 'todas' ? 'Todas' : c}
              </button>
            ))}
          </div>
        )}
      </BarraFija>

      {dueno === true && (
        <button onClick={() => setCarga(true)} className="w-full min-h-12 rounded-xl bg-champagne text-negro text-base font-semibold active:opacity-90">
          Cargar muchos productos de una vez
        </button>
      )}
      {dueno === true && (
        <button onClick={() => setBase(true)} className="w-full min-h-12 rounded-xl bg-champagne text-negro text-base font-semibold active:opacity-90">
          Cargar productos base (con foto y código)
        </button>
      )}
      {dueno === true && (
        <button onClick={() => setVerRepetidos(true)} className="w-full min-h-12 rounded-xl bg-white shadow-sm text-slate-700 text-base font-semibold active:bg-slate-100">
          Buscar productos repetidos
        </button>
      )}
      {verEscaner && !modalAbierto && <Escaner onCodigo={alEscanear} compacto />}
      <BotonCelular onCodigo={alEscanear} deshabilitado={modalAbierto} />

      <Desplegable titulo="Catálogo en línea" nota="Ver y compartir el enlace de la tienda">
      <div className="grid grid-cols-2 gap-2">
        <a href={enlaceTienda()} target="_blank" rel="noopener noreferrer"
           className="h-10 rounded-xl bg-slate-100 text-slate-700 text-xs font-semibold grid place-items-center">
          Ver catálogo en línea
        </a>
        <button onClick={() => copiar(enlaceTienda())}
          className="h-10 rounded-xl bg-lima/20 text-marca text-xs font-semibold">
          {textoCopiar(copiado, 'Copiar enlace')}
        </button>
      </div>
      <button onClick={() => setVerQr(true)} className="mt-2 w-full h-10 rounded-xl bg-negro text-champagne text-xs font-semibold">Código QR: compartir o descargar</button>
      {verQr && <QrCatalogo onCerrar={() => setVerQr(false)} />}
      {dueno === true && (
        <div className="grid grid-cols-2 gap-2 mt-2">
          <button onClick={() => setFotos(true)}
            className="h-10 rounded-xl bg-lima/20 text-marca text-xs font-semibold">
            Importar fotos
          </button>
          <button onClick={() => setFiltro(filtro === 'sinfoto' ? 'todos' : 'sinfoto')}
            className={`h-10 rounded-xl text-xs font-semibold ${filtro === 'sinfoto' ? 'bg-negro text-champagne' : 'bg-slate-100 text-slate-700'}`}>
            {filtro === 'sinfoto' ? 'Ver todos' : `Sin foto (${sinFotos.length})`}
          </button>
          <button onClick={() => { setModoBajar(v => !v); setMarcados(new Set()); setAvisoBajar('') }}
            className={`col-span-2 min-h-10 rounded-xl text-xs font-semibold px-2 leading-tight ${modoBajar ? 'bg-negro text-champagne' : 'bg-slate-100 text-slate-700'}`}>
            {modoBajar ? 'Salir de fotos (bajar / quitar)' : 'Bajar o quitar fotos de varios productos'}
          </button>
          <button onClick={() => {
            const url = URL.createObjectURL(new Blob([catalogoBaseCsv(productos)], { type: 'text/csv;charset=utf-8' }))
            const a = document.createElement('a'); a.href = url; a.download = 'catalogo-base-sin-precios.csv'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 2000)
          }} className="col-span-2 min-h-10 rounded-xl bg-slate-100 text-slate-700 text-xs font-semibold px-2 leading-tight">
            Descargar catálogo base (sin precios)
          </button>
          <button onClick={() => setPublicar(true)} className="col-span-2 h-10 rounded-xl bg-negro text-champagne text-xs font-semibold">
            Mostrar en línea los que ya tienen foto
          </button>
        </div>
      )}
      </Desplegable>

      {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}

      {modoBajar && (() => {
        const conFoto = visibles.filter(p => fotosDe(p).length > 0)
        const elegidos = productos.filter(p => marcados.has(p.id) && fotosDe(p).length > 0)
        const ocupado = bajando !== null || escaneo !== null || quitando
        const bajar = async (lista) => {
          setAvisoBajar(''); setBajando({ hechas: 0, total: lista.reduce((s, p) => s + fotosDe(p).length, 0) })
          const r = await descargarFotos(lista, (hechas, total) => setBajando({ hechas, total }))
          setBajando(null)
          setAvisoBajar(r.bajadas === 0 ? 'No se pudo bajar ninguna foto. Revisa la conexión.' : `Listo: ${r.bajadas} ${r.bajadas === 1 ? 'foto' : 'fotos'}${r.fallidas ? ` (${r.fallidas} no se pudieron bajar)` : ''}.`)
        }
        // Revisa las fotos de lo que se ve (según buscador y filtros) y MARCA las que parecen «solo letras». Las genéricas se marcan sin bajarlas.
        const detectar = async () => {
          if (!(await confirmar({ titulo: `¿Revisar ${conFoto.length} productos?`, texto: 'Se miran sus fotos y se marcan las que parecen solo letras (sin producto). Gasta datos del celular: mejor con wifi. No se borra nada: tú revisas y decides.', si: 'Sí, revisar' }))) return
          setAvisoBajar(''); cancelarEscaneo.current = false
          const cola = [...conFoto]; let hechas = 0, sospechosas = 0, ilegibles = 0
          setEscaneo({ hechas: 0, total: cola.length })
          const obrero = async () => {
            while (cola.length && !cancelarEscaneo.current) {
              const p = cola.shift(); const fotos = fotosDe(p)
              const r = fotos.every(esGenerica) ? true : await esFotoDeTexto(fotos[0])
              if (r === null) ilegibles++
              if (r === true) { sospechosas++; setMarcados(prev => new Set(prev).add(p.id)) }
              hechas++; setEscaneo({ hechas, total: hechas + cola.length })
            }
          }
          await Promise.all([obrero(), obrero(), obrero(), obrero()])
          setEscaneo(null)
          setAvisoBajar(`${cancelarEscaneo.current ? 'Detenido. ' : ''}Revisé ${hechas}: marqué ${sospechosas} que parecen solo letras${ilegibles ? ` (${ilegibles} no se pudieron leer)` : ''}. Toca «Ver solo los marcados» para repasarlas y desmarca las que sean buenas.`)
          if (sospechosas > 0) setSoloMarcados(true)
        }
        const quitarFotos = async () => {
          if (!(await confirmar({ titulo: `¿Quitar las fotos de ${elegidos.length} ${elegidos.length === 1 ? 'producto' : 'productos'}?`, texto: 'Los productos se quedan con todo (precio, stock, código). Solo pierden la foto y vuelven a salir en «Sin foto». No se puede deshacer.', si: 'Sí, quitar fotos' }))) return
          setQuitando(true); setAvisoBajar('')
          let ok = 0, fallos = 0, motivo = ''; const rutas = []
          for (let i = 0; i < elegidos.length; i += 50) {
            const trozo = elegidos.slice(i, i + 50)
            const { error } = await supabase.from('productos').update({ imagenes: [] }).in('id', trozo.map(p => p.id))
            if (error) { fallos += trozo.length; motivo = motivo || error.message } else {
              ok += trozo.length
              for (const p of trozo) for (const u of fotosDe(p)) { const m = /\/object\/public\/[^/]+\/(.+?)(?:\?|$)/.exec(u); if (m) rutas.push(decodeURIComponent(m[1])) }
            }
          }
          try { for (let i = 0; i < rutas.length; i += 50) await supabase.storage.from('prendas').remove(rutas.slice(i, i + 50)) } catch { /* el archivo ya no se usa; si no hay permiso, no pasa nada */ }
          setQuitando(false); setMarcados(new Set()); setSoloMarcados(false)
          setAvisoBajar(`Listo: se quitó la foto de ${ok} ${ok === 1 ? 'producto' : 'productos'}.${fallos ? ` ${fallos} no se pudieron: ${motivo}` : ''}`)
          cargar()
        }
        return (
          <div className="rounded-2xl bg-white shadow-sm p-3 space-y-2">
            <p className="text-xs text-slate-500 break-words">Marca productos para bajar sus fotos en un .zip o para quitarles solo la foto. Con el buscador y los filtros eliges cuáles ver.</p>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => setMarcados(new Set(conFoto.map(p => p.id)))} disabled={ocupado}
                className="min-h-11 rounded-xl bg-slate-100 text-slate-700 text-xs font-semibold px-2 leading-tight">Marcar los {conFoto.length} que se ven</button>
              <button onClick={() => { setMarcados(new Set()); setSoloMarcados(false) }} disabled={ocupado}
                className="min-h-11 rounded-xl bg-slate-100 text-slate-700 text-xs font-semibold px-2 leading-tight">Quitar marcas</button>
              {escaneo ? (
                <button onClick={() => { cancelarEscaneo.current = true }}
                  className="col-span-2 min-h-11 rounded-xl bg-amber-100 text-amber-900 text-xs font-semibold px-2 leading-tight">Revisando {escaneo.hechas} de {escaneo.total}… (toca para detener)</button>
              ) : (
                <button onClick={detectar} disabled={ocupado || conFoto.length === 0}
                  className="col-span-2 min-h-11 rounded-xl bg-amber-50 text-amber-900 text-xs font-semibold px-2 leading-tight disabled:opacity-40">🔍 Detectar fotos de solo letras (en los {conFoto.length} que se ven)</button>
              )}
              <button onClick={() => setSoloMarcados(v => !v)} disabled={ocupado || (marcados.size === 0 && !soloMarcados)}
                className={`col-span-2 min-h-11 rounded-xl text-xs font-semibold px-2 leading-tight disabled:opacity-40 ${soloMarcados ? 'bg-negro text-champagne' : 'bg-slate-100 text-slate-700'}`}>
                {soloMarcados ? `Mostrando solo los ${marcados.size} marcados (toca para ver todos)` : `👁️ Ver solo los marcados (${marcados.size})`}</button>
              <button onClick={() => bajar(elegidos)} disabled={ocupado || elegidos.length === 0}
                className="min-h-12 rounded-xl bg-negro text-champagne text-xs font-semibold px-2 leading-tight disabled:opacity-40">
                {bajando ? `Bajando ${bajando.hechas} de ${bajando.total}…` : `⬇️ Descargar fotos (${elegidos.length})`}
              </button>
              <button onClick={quitarFotos} disabled={ocupado || elegidos.length === 0}
                className="min-h-12 rounded-xl bg-red-600 text-white text-xs font-semibold px-2 leading-tight disabled:opacity-40">
                {quitando ? 'Quitando…' : `🗑️ Quitar fotos (${elegidos.length})`}
              </button>
            </div>
            {avisoBajar && <p className="text-sm text-marca bg-lima/20 rounded-lg px-3 py-2 break-words">{avisoBajar}</p>}
          </div>
        )
      })()}

      {cargando ? (
        <p className="text-center text-sm text-slate-400 py-8">Cargando…</p>
      ) : visibles.length === 0 ? (
        <div className="py-8 space-y-3 text-center">
          <p className="text-sm text-slate-400">{texto.trim() ? `No hay productos con «${texto.trim()}»` : 'No hay productos'}</p>
          {/^\d{6,14}$/.test(texto.trim()) && (
            <button onClick={() => setForm({ codigo: texto.trim() })} className="h-11 px-5 rounded-xl bg-marca text-white text-sm font-semibold active:bg-marca-oscuro">
              Crear producto con el código {texto.trim()}
            </button>
          )}
        </div>
      ) : (
        <ul className="bg-white rounded-2xl shadow-sm divide-y divide-slate-100 lg:bg-transparent lg:shadow-none lg:divide-y-0 lg:grid lg:grid-cols-2 lg:gap-3 [&>li]:lg:bg-white [&>li]:lg:rounded-2xl [&>li]:lg:shadow-sm lg:[&>li:last-child:nth-child(odd)]:col-span-2">
          {(modoBajar && soloMarcados ? visibles.filter(p => marcados.has(p.id)) : visibles.slice(0, mostrar)).map(p => {
            const bajo = Number(p.stock) <= Number(p.stock_minimo)
            return (
              <li key={p.id} className="p-3 grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-x-3 gap-y-2 items-center">
                {modoBajar && (
                  <div className="col-span-2">
                    {fotosDe(p).length > 0 ? (
                      <div className="grid grid-cols-3 gap-2">
                        <button type="button" role="checkbox" aria-checked={marcados.has(p.id)} disabled={bajando !== null}
                          onClick={() => setMarcados(prev => { const n = new Set(prev); n.has(p.id) ? n.delete(p.id) : n.add(p.id); return n })}
                          className={`min-h-11 rounded-lg text-xs font-semibold px-1 leading-tight ${marcados.has(p.id) ? 'bg-marca text-white' : 'bg-slate-100 text-slate-700'}`}>
                          {marcados.has(p.id) ? '✓ Marcado' : 'Marcar'}
                        </button>
                        <button disabled={bajando !== null || quitando} onClick={async () => {
                            setAvisoBajar(''); setBajando({ hechas: 0, total: fotosDe(p).length })
                            const r = await descargarFotos([p], (hechas, total) => setBajando({ hechas, total }))
                            setBajando(null); if (r.bajadas === 0) setAvisoBajar('No se pudo bajar la foto. Revisa la conexión.')
                          }}
                          className="min-h-11 rounded-lg bg-negro text-champagne text-xs font-semibold px-1 leading-tight disabled:opacity-40">⬇️ Bajar</button>
                        <button disabled={bajando !== null || quitando} onClick={async () => {
                            if (!(await confirmar({ titulo: `¿Quitar la foto de "${p.nombre}"?`, texto: 'El producto se queda; solo pierde la foto.', si: 'Sí, quitar' }))) return
                            const { error } = await supabase.from('productos').update({ imagenes: [] }).eq('id', p.id)
                            if (error) setAvisoBajar('No se pudo quitar: ' + error.message); else { setAvisoBajar('Foto quitada.'); setMarcados(prev => { const n = new Set(prev); n.delete(p.id); return n }); cargar() }
                          }}
                          className="min-h-11 rounded-lg bg-red-50 text-red-700 text-xs font-semibold px-1 leading-tight disabled:opacity-40">🗑️ Quitar</button>
                      </div>
                    ) : <p className="text-xs text-slate-400 min-h-11 grid items-center">Sin foto</p>}
                  </div>
                )}
                <button onClick={() => setForm(p)} className="min-w-0 text-left grid grid-cols-[auto_1fr] gap-3 items-center">
                  <Miniatura producto={p} tam="h-11 w-11" />
                  <span className="min-w-0 block">
                  <p className="text-sm font-medium break-words">{p.nombre}</p>
                  <p className="text-xs text-slate-400 break-words">
                    {p.codigo || 'sin código'} · {dinero(p.precio_venta)}{p.unidad && p.unidad !== 'und' ? ` / ${p.unidad}` : ''}
                  </p>
                  {porVencer(p) && (
                    <p className="text-xs font-medium text-red-500">{textoVence(venceDe(p))}</p>
                  )}
                  {fotosDe(p).length > 0 && fotosDe(p).every(esGenerica) && (
                    <p className="text-[11px] font-medium text-amber-600">Imagen genérica: falta la foto real</p>
                  )}
                  </span>
                </button>
                {filtro === 'sinfoto' ? (
                  <FotoRapida producto={p} nuevas={fotosHechas[p.id] ?? 0} onHecho={(prod, imagenes, nuevas) => {
                    listaRef.current = listaRef.current.map(x => x.id === prod.id ? { ...x, imagenes } : x)
                    setProductos(listaRef.current)
                    setFotosHechas(prev => ({ ...prev, [prod.id]: nuevas }))
                  }} />
                ) : (
                <div className={`grid ${dueno === true && conCompras ? 'grid-cols-2' : 'grid-cols-1'} sm:grid-cols-[4.5rem_auto] gap-2 items-center`}>
                  <button onClick={() => setAjuste(p)} title="Ajustar por conteo"
                    className={`text-center text-sm font-semibold rounded-lg py-2 sm:py-1 ${
                      bajo ? 'bg-naranja/15 text-naranja-oscuro' : 'bg-slate-100 text-slate-600'}`}>
                    {numero(p.stock)}
                  </button>
                  {dueno === true && conCompras && (
                  <button onClick={() => setIngreso(p)}
                    className="h-10 sm:h-9 px-3 rounded-lg bg-lima/20 text-marca text-sm sm:text-xs font-semibold">
                    + Stock
                  </button>
                  )}
                </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
      {!cargando && visibles.length > mostrar && (
        <button onClick={() => setMostrar(m => m + 60)} className="w-full min-h-12 rounded-xl bg-white shadow-sm text-sm font-medium text-slate-600 active:bg-slate-50">
          Mostrar más ({visibles.length - mostrar} restantes)
        </button>
      )}

      {form && (
        <ProductoForm
          producto={form}
          onCerrar={() => setForm(null)}
          onGuardado={() => { setForm(null); cargar() }}
          onArchivar={archivar}
        />
      )}

      {ajuste && (
        <AjusteStock producto={ajuste} onCerrar={() => setAjuste(null)}
                     onGuardado={() => { setAjuste(null); cargar() }} />
      )}

      {base && dueno === true && <ProductosBase onCerrar={() => setBase(false)} onGuardado={cargar} />}
      {carga && dueno === true && <CargaMasiva productos={productos} onCerrar={() => setCarga(false)} onGuardado={cargar} />}
      {verRepetidos && dueno === true && <Repetidos productos={productos} onCerrar={() => setVerRepetidos(false)} onCambio={cargar} />}

      {fotos && dueno === true && (
        <ImportarFotos productos={productos} onCerrar={() => setFotos(false)} onGuardado={cargar} />
      )}

      {publicar && dueno === true && (
        <PublicarEnLinea productos={productos} onCerrar={() => setPublicar(false)} onGuardado={cargar} />
      )}

      {compra && (
        <Compra onCerrar={() => setCompra(false)} onGuardado={() => { setCompra(false); cargar() }} />
      )}

      {ingreso && (
        <Modal titulo="Ingresar mercancía" onCerrar={cerrarIngreso}>
          <p className="text-sm text-slate-500">
            {ingreso.nombre} · hay {numero(ingreso.stock)} {ingreso.unidad ?? 'und'}. Se guarda como un lote nuevo.
          </p>
          <Campo etiqueta="Cantidad que llegó">
            <input autoFocus value={cantidad} onChange={e => setCantidad(e.target.value)}
                   onKeyDown={e => e.key === 'Enter' && sumarStock()}
                   inputMode="decimal" className={claseInput} />
          </Campo>
          <div className="grid grid-cols-2 gap-3">
            <Campo etiqueta="Lote (opcional)">
              <input value={lote} onChange={e => setLote(e.target.value)} className={claseInput} />
            </Campo>
            <Campo etiqueta="Vence (opcional)">
              <input type="date" value={vence} onChange={e => setVence(e.target.value)} className={claseInput} />
            </Campo>
          </div>
          {dueno === true && (
            <div className="space-y-3 rounded-2xl bg-slate-50 p-3">
              <Campo etiqueta="Costo de compra (por unidad)">
                <input value={costoIng} onChange={e => setCostoIng(e.target.value)} inputMode="numeric" placeholder={ingreso.precio_compra > 0 ? `Último: ${dinero(ingreso.precio_compra)}` : ''} className={claseInput} />
              </Campo>
              <button onClick={() => setUsarMargen(v => !v)} aria-pressed={usarMargen}
                className={`w-full min-h-12 rounded-xl text-base font-semibold ${usarMargen ? 'bg-marca text-white' : 'bg-white ring-1 ring-slate-200 text-slate-700'}`}>
                {usarMargen ? '✓ Calculando con % de ganancia' : 'Calcular precio con % de ganancia'}
              </button>
              {usarMargen && (
                <div className="space-y-2">
                  <div className="grid grid-cols-4 gap-2">
                    {['20', '30', '40'].map(m => (
                      <button key={m} onClick={() => setMargen(m)} className={`min-h-11 rounded-xl text-base font-semibold ${margen === m ? 'bg-negro text-champagne' : 'bg-white ring-1 ring-slate-200'}`}>{m} %</button>
                    ))}
                    <input value={margen} onChange={e => setMargen(e.target.value.replace(/[^\d.,]/g, ''))} inputMode="decimal" aria-label="Otro porcentaje de ganancia" className={`${claseInput} !min-h-11 text-center`} />
                  </div>
                  {!(aNumero(costoIng) > 0) && <p className="text-sm text-slate-500">Escribe el costo de compra y el precio sale solo.</p>}
                  {aNumero(costoIng) > 0 && aNumero(precioNuevo) > 0 && (
                    <p className="text-sm text-slate-600">Ganas {dinero(gananciaPorUnidad(aNumero(costoIng), aNumero(precioNuevo)))} por unidad ({margen || 0} % sobre el costo, redondeado a 50 pesos).</p>
                  )}
                </div>
              )}
            </div>
          )}
          {dueno === true && (
            <Campo etiqueta={`Precio de venta (ahora ${dinero(ingreso.precio_venta)})`}>
              <input value={precioNuevo} onChange={e => setPrecioNuevo(e.target.value)} inputMode="numeric" className={claseInput} />
              {precioNuevo !== '' && aNumero(precioNuevo) > 0 && aNumero(precioNuevo) !== Number(ingreso.precio_venta) && (
                <span className="block text-xs text-oro-oscuro pt-1">Cambia el precio de todo este producto, no solo del lote nuevo.</span>
              )}
            </Campo>
          )}
          {dueno === true && !ingreso.publicado && (
            fotosDe(ingreso).length > 0 ? (
              <label className="flex items-center gap-3 text-sm text-slate-600 min-h-10">
                <input type="checkbox" checked={mostrarLinea} onChange={e => setMostrarLinea(e.target.checked)} className="h-5 w-5 accent-marca" />
                Mostrarlo en la tienda en línea
              </label>
            ) : <p className="text-xs text-slate-400">Agrégale una foto al producto para poder mostrarlo en la tienda en línea.</p>
          )}
          {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
          <button onClick={sumarStock} disabled={guardandoIngreso}
            className="w-full h-12 rounded-xl bg-marca text-white font-semibold disabled:opacity-40 active:bg-marca-oscuro">
            {guardandoIngreso ? 'Guardando…' : 'Sumar al stock'}
          </button>
        </Modal>
      )}
    </div>
  )
}
