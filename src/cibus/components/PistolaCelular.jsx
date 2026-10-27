// Pantalla del celular: escanea y manda cada código al computador emparejado (ver BotonCelular).
import { useEffect, useRef, useState } from 'react'
import Escaner from './Escaner'
import Marca from './Marca'
import Login from './Login'
import PuertaMfa from './PuertaMfa'
import { AuthProvider, useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { canalPar, codigoParValido } from '../lib/pistolaCelular'
import { dinero, numero } from '../lib/formato'

function Pantalla() {
  const codigo = new URLSearchParams(window.location.search).get('c')
  const valido = codigoParValido(codigo)
  const canal = useRef(null)
  const [enLinea, setEnLinea] = useState(false)
  const [fallo, setFallo] = useState(false)
  const [detalle, setDetalle] = useState('')
  const [pcPresente, setPcPresente] = useState(false)
  const [enviados, setEnviados] = useState([])    // [{ codigo, ok }]
  const [confirmar, setConfirmar] = useState(null)   // 'todo' | índice de la fila que se va a quitar
  const [venta, setVenta] = useState(null)           // venta en curso del computador: { total, items: [{ n, c, t }] }
  const [verVenta, setVerVenta] = useState(false)

  useEffect(() => {
    if (!valido) return undefined
    const ch = canalPar(codigo, 'cel-' + Math.random().toString(36).slice(2, 8))
    canal.current = ch
    ch.on('broadcast', { event: 'ok' }, ({ payload }) => {
      setEnviados(l => l.map(x => (x.codigo === payload?.codigo && !x.ok ? { ...x, ok: true } : x)))
    })
    ch.on('broadcast', { event: 'venta' }, ({ payload }) => {
      if (payload && Array.isArray(payload.items)) setVenta({ total: Number(payload.total) || 0, items: payload.items })
    })
    ch.on('presence', { event: 'sync' }, () => setPcPresente(Object.keys(ch.presenceState()).includes('pc')))
    ch.subscribe(async (estado, err) => {
      setEnLinea(estado === 'SUBSCRIBED')
      setFallo(estado === 'CHANNEL_ERROR' || estado === 'TIMED_OUT')
      setDetalle(estado === 'SUBSCRIBED' ? '' : `${estado}${err?.message ? ': ' + err.message : ''}`)
      if (estado === 'SUBSCRIBED') await ch.track({ rol: 'celular' })
    })
    return () => { supabase.removeChannel(ch); canal.current = null }
  }, [codigo, valido])

  const enviar = (c) => {
    if (!canal.current || !enLinea) return
    canal.current.send({ type: 'broadcast', event: 'codigo', payload: { codigo: c } })
    setEnviados(l => [{ codigo: c, ok: false }, ...l].slice(0, 6))
  }

  if (!valido) {
    return (
      <main className="min-h-full grid place-items-center p-6 text-center bg-negro text-hueso">
        <div className="space-y-3 max-w-xs">
          <Marca tam="sm" />
          <p className="text-sm">Este enlace no es válido. Vuelve a escanear el QR que aparece en el computador.</p>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-full bg-fondo pb-10">
      <header className="bg-negro px-4 pt-[calc(1rem+env(safe-area-inset-top))] pb-4 text-center space-y-2">
        <Marca tam="sm" eslogan={false} />
        <p className="text-xs text-champagne/80 tracking-wide">Celular como pistola</p>
      </header>
      <div className="max-w-md mx-auto px-4 pt-4 space-y-4">
        <p role="status" className={`text-center text-sm font-medium rounded-xl px-3 py-2 ${
          fallo ? 'bg-red-50 text-red-600' : !enLinea ? 'bg-slate-100 text-slate-500' : pcPresente ? 'bg-esmeralda/10 text-esmeralda' : 'bg-champagne/25 text-slate-700'}`}>
          {fallo ? 'No se pudo conectar. Revisa internet y que tu sesión sea del personal.' : !enLinea ? 'Conectando…' : pcPresente ? '✓ Conectado al computador' : 'Esperando al computador… (puedes escanear igual)'}
        </p>
        {fallo && detalle && <p className="text-[11px] text-slate-400 text-center break-words">Detalle: {detalle}</p>}
        {venta && (
          <section className="bg-white rounded-2xl shadow-sm overflow-hidden">
            <button onClick={() => setVerVenta(v => !v)} aria-expanded={verVenta}
              className="w-full px-4 py-3 grid grid-cols-[1fr_auto_auto] items-center gap-3 text-left">
              <span className="text-sm text-slate-500">{venta.items.length > 0 ? `Venta en curso · ${venta.items.length} ${venta.items.length === 1 ? 'producto' : 'productos'}` : 'Sin venta en curso'}</span>
              <span className="text-lg font-semibold tabular-nums text-slate-800">{dinero(venta.total)}</span>
              <span className={`text-slate-400 transition-transform ${verVenta ? 'rotate-180' : ''}`}>▾</span>
            </button>
            {verVenta && (
              venta.items.length === 0
                ? <p className="px-4 pb-3 text-sm text-slate-400">Cuando escanees productos aparecen aquí. Se vacía solo cuando se cobra en el computador.</p>
                : <ul className="border-t border-slate-100 divide-y divide-slate-100">
                    {venta.items.map((it, i) => (
                      <li key={i} className="px-4 py-2 grid grid-cols-[auto_1fr_auto] gap-3 text-sm items-center">
                        <span className="text-slate-400 tabular-nums">{numero(it.c)}×</span>
                        <span className="text-slate-700 break-words">{it.n}</span>
                        <span className="tabular-nums text-slate-700">{dinero(it.t)}</span>
                      </li>
                    ))}
                  </ul>
            )}
          </section>
        )}
        <Escaner onCodigo={enviar} activo={false} compacto={false} />
        {enviados.length > 0 && (
          <section className="space-y-2">
            <div className="grid grid-cols-[1fr_auto] items-center gap-3">
              <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Enviados</h2>
              <button onClick={() => setConfirmar('todo')} className="text-xs font-medium text-slate-500 px-3 h-8 rounded-lg border border-slate-200 active:bg-slate-100">Limpiar lista</button>
            </div>
            {confirmar !== null && (
              <div role="alertdialog" className="bg-champagne/25 rounded-2xl p-3 space-y-2">
                <p className="text-sm text-slate-700 text-center">
                  {confirmar === 'todo' ? '¿Quitar todos los códigos de esta lista?' : `¿Quitar ${enviados[confirmar]?.codigo ?? 'este código'} de la lista?`}
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <button onClick={() => setConfirmar(null)} className="h-11 rounded-xl bg-white text-sm font-medium text-slate-600 active:bg-slate-100">Cancelar</button>
                  <button onClick={() => { setEnviados(l => (confirmar === 'todo' ? [] : l.filter((_, j) => j !== confirmar))); setConfirmar(null) }}
                    className="h-11 rounded-xl bg-negro text-sm font-semibold text-hueso active:opacity-80">Sí, quitar</button>
                </div>
              </div>
            )}
            <ul className="bg-white rounded-2xl shadow-sm divide-y divide-slate-100">
              {enviados.map((e, i) => (
                <li key={`${e.codigo}-${i}`} className="pl-4 pr-1 py-1 grid grid-cols-[1fr_auto_auto] items-center gap-2 text-sm">
                  <span className="font-mono text-slate-700 break-words">{e.codigo}</span>
                  <span className={e.ok ? 'text-esmeralda font-medium' : 'text-slate-400'}>{e.ok ? '✓ recibido' : 'enviado…'}</span>
                  <button onClick={() => setConfirmar(i)} aria-label={`Quitar ${e.codigo} de la lista`}
                    className="w-9 h-9 grid place-items-center text-slate-400 rounded-lg active:bg-slate-100">✕</button>
                </li>
              ))}
            </ul>
            <p className="text-[11px] text-slate-400 text-center">Quitar de esta lista no deshace nada en el computador, solo limpia la pantalla del celular.</p>
          </section>
        )}
        <p className="text-xs text-slate-400 text-center">Para terminar, cierra esta pestaña o desactiva el emparejamiento en el computador.</p>
      </div>
    </main>
  )
}

// Para usarlo hay que iniciar sesión en el celular (y pasar la verificación en dos pasos si la tiene activada)
function Puerta() {
  const { sesion, cargando } = useAuth()
  if (cargando) return null
  if (!sesion) return <Login />
  return <PuertaMfa><Pantalla /></PuertaMfa>
}

export default function PistolaCelular() {
  return <AuthProvider><Puerta /></AuthProvider>
}
