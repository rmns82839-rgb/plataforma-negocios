// Base de clientes registrados (los que dejan sus datos al pedir en los catálogos y los que ya tenías).
// El dueño les escribe por WhatsApp (uno a uno) o copia los correos de quienes aceptaron promociones.
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { claseInput } from '../lib/estilos'
import { coincide } from '../lib/buscar'
import { enlaceWhatsApp, telefono10 } from '../lib/datosCliente'
import BarraFija, { Desplegable } from './BarraFija'
import { useCopiado, textoCopiar } from '../lib/useCopiado'
import { confirmar } from '../lib/confirmar'

const FILTROS = [
  { id: 'todos', texto: 'Todos' },
  { id: 'promos', texto: 'Aceptan promos' },
  { id: 'linea', texto: 'Pedidos en línea' },
]
const PLANTILLA = 'Hola {nombre}, te escribimos de Matriz / Tienda Cibus. Esta semana tenemos promociones para ti: '
const CLAVE_PLANTILLA = 'matriz-plantilla-promo'
const leerPlantilla = () => { try { return localStorage.getItem(CLAVE_PLANTILLA) || PLANTILLA } catch { return PLANTILLA } }

export default function ClientesRegistrados() {
  const [lista, setLista] = useState([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [filtro, setFiltro] = useState('todos')
  const [texto, setTexto] = useState('')
  const [plantilla, setPlantilla] = useState(leerPlantilla)
  const [copiado, copiar] = useCopiado()
  const [menuHoy, setMenuHoy] = useState('')
  const [favoritos, setFavoritos] = useState({})     // cliente_id → producto que más compra
  useEffect(() => {
    supabase.from('menu_hoy_publico').select('nombre').maybeSingle().then(({ data }) => setMenuHoy(data?.nombre ?? ''), () => {})
    supabase.rpc('listar_producto_favorito').then(({ data }) => {
      if (Array.isArray(data)) setFavoritos(Object.fromEntries(data.map(f => [f.cliente_id, f.producto])))
    }, () => {})
  }, [])

  const cargar = async () => {
    setCargando(true)
    const { data, error: err } = await supabase.from('clientes').select('id, nombre, telefono, direccion, email, acepta_promos, origen, creado_en')
      .order('creado_en', { ascending: false }).range(0, 4999)
    setError(err ? (/acepta_promos|column/i.test(err.message) ? 'Falta ejecutar migracion-v12.sql en Supabase.' : err.message) : '')
    setLista(data ?? [])
    setCargando(false)
  }
  useEffect(() => { cargar() }, [])

  const cambiarPlantilla = (v) => { setPlantilla(v); try { localStorage.setItem(CLAVE_PLANTILLA, v) } catch { /* no pasa nada */ } }

  const visibles = useMemo(() => lista.filter(c =>
    (filtro === 'todos' || (filtro === 'promos' && c.acepta_promos) || (filtro === 'linea' && c.origen && c.origen !== 'panel'))
    && coincide([c.nombre, c.telefono, c.email, c.direccion], texto)), [lista, filtro, texto])

  const conPromos = lista.filter(c => c.acepta_promos).length
  const correos = [...new Set(visibles.filter(c => c.acepta_promos && c.email).map(c => c.email.trim().toLowerCase()))]

  const quitarPromos = async (c) => {
    if (!(await confirmar({ titulo: `¿Quitar a ${c.nombre} de las promociones?`, texto: 'Ya no deberás enviarle promociones.' }))) return
    const { error: err } = await supabase.from('clientes').update({ acepta_promos: false }).eq('id', c.id)
    if (err) return setError(err.message)
    setLista(l => l.map(x => x.id === c.id ? { ...x, acepta_promos: false } : x))
  }

  const mensaje = (c) => plantilla
    .replace(/\{nombre\}/g, String(c.nombre ?? '').split(' ')[0])
    .replace(/\{menu\}/g, menuHoy || 'nuestro menú del día')
    .replace(/\{producto\}/g, favoritos[c.id] || 'tus productos de siempre')

  return (
    <div className="space-y-4">
      <BarraFija>
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-white rounded-2xl shadow-sm px-4 py-2"><p className="text-[11px] text-slate-400">Clientes registrados</p><p className="text-xl font-bold leading-tight">{lista.length}</p></div>
        <div className="bg-white rounded-2xl shadow-sm px-4 py-2"><p className="text-[11px] text-slate-400">Aceptan promociones</p><p className="text-xl font-bold leading-tight text-marca">{conPromos}</p></div>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {FILTROS.map(f => (
          <button key={f.id} onClick={() => setFiltro(f.id)}
            className={`h-10 rounded-xl text-xs font-medium ${filtro === f.id ? 'bg-marca text-white' : 'bg-white text-slate-600 shadow-sm'}`}>{f.texto}</button>
        ))}
      </div>
      <input value={texto} onChange={e => setTexto(e.target.value)} placeholder="Buscar por nombre, celular o correo" className={claseInput} />
      </BarraFija>

      <Desplegable titulo="Mensaje de promoción y correos" nota="Texto de WhatsApp y copiar correos">
        <p className="text-xs font-medium text-slate-500">Mensaje de promoción (WhatsApp) · usa {'{nombre}'}, {'{menu}'} (menú del día) y {'{producto}'} (lo que más compra ese cliente)</p>
        <div className="flex flex-wrap gap-2">{['{nombre}', '{menu}', '{producto}'].map(t => <button key={t} onClick={() => cambiarPlantilla(plantilla + ' ' + t)} className="min-h-10 px-3 rounded-lg bg-white ring-1 ring-slate-200 text-sm font-semibold">+ {t}</button>)}</div>
        <textarea value={plantilla} onChange={e => cambiarPlantilla(e.target.value)} rows={3} maxLength={500}
          className="w-full px-4 py-3 rounded-xl border border-slate-300 bg-white focus:border-marca focus:ring-2 focus:ring-marca/20 outline-none resize-none text-sm" />
        <p className="text-xs text-slate-400">Solo se escribe con promociones a quienes dieron su autorización. Para envíos masivos de WhatsApp se necesita la API de WhatsApp Business; por ahora es un mensaje por cliente.</p>
      
      <button disabled={correos.length === 0} onClick={() => copiar(correos.join(', '))}
        className="w-full h-11 rounded-xl bg-lima/20 text-marca text-sm font-semibold disabled:opacity-40 active:bg-lima/30">
        {copiado ? textoCopiar(copiado, 'Correos') : `Copiar correos de quienes aceptan promos (${correos.length}) para enviarlos con copia oculta`}
      </button>
      </Desplegable>

      {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}

      {cargando ? <p className="text-center text-sm text-slate-400 py-8">Cargando…</p>
        : visibles.length === 0 ? <p className="text-center text-sm text-slate-400 py-8">No hay clientes con ese filtro. Se registran solos cuando alguien hace un pedido en /ropa o /tienda.</p>
        : (
        <ul className="grid gap-3 lg:grid-cols-2 lg:[&>li:last-child:nth-child(odd)]:col-span-2">
          {visibles.map(c => {
            const base = enlaceWhatsApp(c.telefono)
            const promo = c.acepta_promos ? enlaceWhatsApp(c.telefono, mensaje(c)) : null
            return (
              <li key={c.id} className="bg-white rounded-2xl shadow-sm p-4 space-y-3">
                <div className="grid grid-cols-[1fr_auto] gap-3 items-start">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold truncate">{c.nombre}</p>
                    <p className="text-xs text-slate-400 truncate">{telefono10(c.telefono) || c.telefono || 'Sin celular'}{c.email ? ` · ${c.email}` : ''}</p>
                    {c.direccion && <p className="text-xs text-slate-400 truncate">{c.direccion}</p>}
                  </div>
                  <span className={`text-[10px] font-semibold px-2 py-1 rounded-full ${c.acepta_promos ? 'bg-lima/30 text-marca' : 'bg-slate-100 text-slate-400'}`}>
                    {c.acepta_promos ? 'Promos sí' : 'Sin promos'}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {promo
                    ? <a href={promo} target="_blank" rel="noopener noreferrer" className="h-11 rounded-xl bg-negro text-champagne text-xs font-semibold grid place-items-center">Enviar promoción</a>
                    : base
                      ? <a href={base} target="_blank" rel="noopener noreferrer" className="h-11 rounded-xl bg-slate-100 text-slate-600 text-xs font-medium grid place-items-center">WhatsApp</a>
                      : <span className="h-11 rounded-xl bg-slate-50 text-slate-300 text-xs font-medium grid place-items-center">Sin celular</span>}
                  {c.acepta_promos
                    ? <button onClick={() => quitarPromos(c)} className="h-11 rounded-xl bg-red-50 text-red-600 text-xs font-medium">Quitar de promociones</button>
                    : <span className="h-11 rounded-xl bg-slate-50 text-slate-300 text-xs font-medium grid place-items-center">No autorizó promos</span>}
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
