// "En vivo": lo que pasa ahora en el negocio — ventas del día, visitantes de los catálogos,
// personal conectado, pedidos por atender y últimos accesos. Se refresca solo (tiempo real + cada 30 s).
import { useCallback, useEffect, useRef, useState } from 'react'
import Cifra from './Cifra'
import { supabase } from '../lib/supabase'
import { useConfig } from '../lib/config'
import { dinero, inicioDia } from '../lib/formato'
import { numeroFactura } from '../lib/factura'
import { textoMetodo } from '../lib/pagos'
import { useVisitasEnVivo, usePersonalConectado } from '../lib/enVivo'

const hora = (t) => new Date(t).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })
const fechaCorta = (t) => new Date(t).toLocaleString('es-CO', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
const ROLES = { dueno: 'Dueño', cajero: 'Cajero', soporte: 'Soporte' }
const COLOR_ROL = { dueno: 'bg-champagne/30 text-oro-oscuro', cajero: 'bg-slate-100 text-slate-600', soporte: 'bg-amber-100 text-amber-800' }
const nombreDe = (correo) => String(correo ?? '').split('@')[0] || 'Sin nombre'

function Dato({ titulo, valor, nota, resaltar }) {
  return (
    <div className={`rounded-2xl shadow-sm p-4 min-w-0 grid content-between gap-1 h-24 ${resaltar ? 'bg-negro' : 'bg-white'}`}>
      <p className={`text-xs break-words ${resaltar ? 'text-champagne/70' : 'text-slate-400'}`}>{titulo}</p>
      <Cifra className={`text-xl font-bold ${resaltar ? 'text-champagne' : ''}`}>{valor}</Cifra>
      <p className={`text-[11px] break-words ${resaltar ? 'text-hueso/60' : 'text-slate-400'}`}>{nota ?? ' '}</p>
    </div>
  )
}

function Bloque({ titulo, nota, children }) {
  return (
    <section className="bg-white rounded-2xl shadow-sm p-4 space-y-3 min-w-0">
      <div className="min-w-0">
        <h2 className="text-sm font-semibold break-words">{titulo}</h2>
        {nota && <p className="text-[11px] text-slate-400 break-words">{nota}</p>}
      </div>
      {children}
    </section>
  )
}

const Vacio = ({ texto }) => <p className="text-center text-xs text-slate-400 py-4">{texto}</p>

export default function EnVivo() {
  useConfig()   // para que el prefijo de la factura esté cargado
  const visitas = useVisitasEnVivo(true)
  const conectados = usePersonalConectado()
  const [ventas, setVentas] = useState([])
  const [pend, setPend] = useState({ tienda: 0 })
  const [accesos, setAccesos] = useState([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [actualizado, setActualizado] = useState(Date.now())
  const [, setReloj] = useState(0)
  const [nuevas, setNuevas] = useState([])
  const vistas = useRef(null)
  const espera = useRef(null)

  const cargar = useCallback(async () => {
    const contar = async (tabla) => {
      const { count, error: err } = await supabase.from(tabla).select('id', { count: 'exact', head: true }).eq('estado', 'pendiente')
      return err ? 0 : (count ?? 0)
    }
    const [v, tienda, a] = await Promise.all([
      supabase.from('ventas').select('id, numero, fecha, total, metodo, anulada, domicilio')
        .gte('fecha', inicioDia()).order('fecha', { ascending: false }).range(0, 299),
      contar('pedidos_tienda'),
      supabase.from('accesos').select('id, fecha, correo, rol').order('fecha', { ascending: false }).range(0, 7),
    ])
    if (v.error) setError(v.error.message); else setError('')
    const lista = v.data ?? []
    // las ventas que no estaban la vez anterior se resaltan unos segundos
    if (vistas.current) {
      const frescas = lista.filter(x => !vistas.current.has(x.id)).map(x => x.id)
      if (frescas.length) {
        setNuevas(frescas)
        try { navigator.vibrate?.(60) } catch { /* sin vibración */ }
        setTimeout(() => setNuevas([]), 6000)
      }
    }
    vistas.current = new Set(lista.map(x => x.id))
    setVentas(lista)
    setPend({ tienda })
    // si la tabla de accesos no existe todavía (falta migracion-v28.sql), simplemente no se muestra
    setAccesos(a.error ? null : (a.data ?? []))
    setActualizado(Date.now())
    setCargando(false)
  }, [])

  useEffect(() => {
    cargar()
    const pedir = () => { clearTimeout(espera.current); espera.current = setTimeout(cargar, 700) }
    let canal = null
    try {
      for (const c of supabase.getChannels()) if (c.topic === 'realtime:cambios-en-vivo') supabase.removeChannel(c)
      canal = supabase.channel('cambios-en-vivo')
      for (const tabla of ['ventas', 'pedidos_tienda']) {
        canal.on('postgres_changes', { event: '*', schema: 'public', table: tabla }, pedir)
      }
      canal.subscribe()
    } catch { canal = null }
    const t = setInterval(() => { if (!document.hidden) cargar() }, 30000)
    const r = setInterval(() => setReloj(n => n + 1), 5000)
    const v = () => { if (!document.hidden) cargar() }
    document.addEventListener('visibilitychange', v)
    return () => {
      clearTimeout(espera.current); clearInterval(t); clearInterval(r)
      document.removeEventListener('visibilitychange', v)
      if (canal) { try { supabase.removeChannel(canal) } catch { /* ya cerrado */ } }
    }
  }, [cargar])

  const validas = ventas.filter(v => !v.anulada)
  const vendido = validas.reduce((s, v) => s + Number(v.total || 0), 0)
  const anuladas = ventas.length - validas.length
  const visitantes = visitas.tienda
  const segundos = Math.max(0, Math.round((Date.now() - actualizado) / 1000))
  const hace = segundos < 8 ? 'ahora mismo' : segundos < 60 ? `hace ${segundos} s` : `hace ${Math.round(segundos / 60)} min`

  // una persona con varios dispositivos aparece una sola vez
  const personas = []
  for (const p of conectados) {
    const ya = personas.find(x => x.correo === p.correo)
    if (ya) { ya.equipos += 1; ya.desde = Math.min(ya.desde, p.desde ?? Date.now()) } else personas.push({ ...p, equipos: 1, desde: p.desde ?? Date.now() })
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-[1fr_auto] gap-3 items-center">
        <p className="text-sm text-slate-500 flex items-center gap-2">
          <span className="relative flex h-2.5 w-2.5 shrink-0">
            <span className="absolute inline-flex h-full w-full rounded-full bg-esmeralda opacity-60 animate-ping" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-esmeralda" />
          </span>
          <span>En vivo · {hace}</span>
        </p>
        <button onClick={cargar} className="h-9 px-4 rounded-xl bg-white shadow-sm text-xs font-semibold active:bg-slate-50">Actualizar</button>
      </div>

      {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Dato resaltar titulo="Vendido hoy" valor={cargando ? '…' : dinero(vendido)} nota={`${validas.length} venta${validas.length === 1 ? '' : 's'}`} />
        <Dato titulo="Ventas de hoy" valor={cargando ? '…' : validas.length} nota={anuladas ? `${anuladas} anulada${anuladas === 1 ? '' : 's'}` : 'Ninguna anulada'} />
        <Dato titulo="Visitando ahora" valor={visitas.estado === 'error' ? '—' : visitantes}
              nota={visitas.estado === 'error' ? 'Canal no disponible' : 'Mirando tu catálogo ahora'} />
        <Dato titulo="Pedidos por atender" valor={pend.tienda} nota="Del catálogo en línea" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Bloque titulo="Conectados ahora" nota="Personal con el panel abierto">
          {personas.length === 0 ? <Vacio texto="Nadie conectado ahora" /> : (
            <ul className="divide-y divide-slate-100">
              {personas.map(p => (
                <li key={p.correo} className="py-2.5 grid grid-cols-[auto_1fr_auto] gap-3 items-center">
                  <span className="h-2.5 w-2.5 rounded-full bg-esmeralda" aria-hidden="true" />
                  <span className="min-w-0">
                    <span className="block text-sm font-medium break-words">{nombreDe(p.correo)}{p.equipos > 1 ? ` · ${p.equipos} equipos` : ''}</span>
                    <span className="block text-[11px] text-slate-400">{p.pantalla ? `En ${p.pantalla}` : 'En el panel'} · desde las {hora(p.desde)}</span>
                  </span>
                  <span className={`text-[11px] font-semibold rounded-full px-2.5 py-1 ${COLOR_ROL[p.rol] ?? COLOR_ROL.cajero}`}>{ROLES[p.rol] ?? p.rol}</span>
                </li>
              ))}
            </ul>
          )}
        </Bloque>

        <Bloque titulo="Visitando los catálogos" nota="Gente mirando tu catálogo en este momento">
          <div className="grid grid-cols-2 gap-3">
            {[['Tu catálogo', visitas.tienda]].map(([nombre, n]) => (
              <div key={nombre} className="rounded-xl bg-fondo p-3 grid content-between h-20">
                <p className="text-xs text-slate-400">{nombre}</p>
                <p className="text-2xl font-bold">{visitas.estado === 'error' ? '—' : n}</p>
              </div>
            ))}
          </div>
          {visitas.estado === 'error' && <p className="text-[11px] text-slate-400">El canal en vivo no está disponible; el resto de la pantalla sigue funcionando.</p>}
        </Bloque>

        <Bloque titulo="Últimas ventas de hoy" nota="Aparecen apenas se registran">
          {cargando ? <Vacio texto="Cargando…" /> : ventas.length === 0 ? <Vacio texto="Todavía no hay ventas hoy" /> : (
            <ul className="divide-y divide-slate-100">
              {ventas.slice(0, 8).map(v => (
                <li key={v.id} className={`py-2.5 px-2 -mx-2 rounded-lg grid grid-cols-[1fr_auto] gap-3 items-center transition-colors duration-1000 ${nuevas.includes(v.id) ? 'bg-champagne/25' : ''}`}>
                  <span className="min-w-0">
                    <span className={`block text-sm font-medium ${v.anulada ? 'line-through text-slate-400' : ''}`}>
                      {numeroFactura(v.numero)}{v.domicilio ? ' · Domicilio' : ''}
                    </span>
                    <span className="block text-[11px] text-slate-400">{hora(v.fecha)} · {textoMetodo(v.metodo)}{v.anulada ? ' · Anulada' : ''}</span>
                  </span>
                  <span className={`text-sm font-semibold ${v.anulada ? 'line-through text-slate-400' : ''}`}>{dinero(v.total)}</span>
                </li>
              ))}
            </ul>
          )}
        </Bloque>

        <Bloque titulo="Últimos accesos" nota="Quién entró a la app">
          {accesos === null ? <Vacio texto="Falta ejecutar migracion-v28.sql en Supabase." /> : accesos.length === 0 ? <Vacio texto="Aún no hay accesos registrados" /> : (
            <ul className="divide-y divide-slate-100">
              {accesos.map(a => (
                <li key={a.id} className="py-2.5 grid grid-cols-[1fr_auto] gap-3 items-center">
                  <span className="min-w-0">
                    <span className="block text-sm font-medium break-words">{nombreDe(a.correo)}</span>
                    <span className="block text-[11px] text-slate-400">{fechaCorta(a.fecha)}</span>
                  </span>
                  <span className={`text-[11px] font-semibold rounded-full px-2.5 py-1 ${COLOR_ROL[a.rol] ?? COLOR_ROL.cajero}`}>{ROLES[a.rol] ?? a.rol}</span>
                </li>
              ))}
            </ul>
          )}
        </Bloque>
      </div>
    </div>
  )
}
