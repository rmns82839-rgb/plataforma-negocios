import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { alCambiarCola, alCambiarEstado, iniciarSincronizacion, listarCola, subirPendientes } from '../lib/sincronizar'
import { quitarDeCola, actualizarEnCola } from '../lib/offline'
import { dinero, fechaHora } from '../lib/formato'
import { confirmar } from '../lib/confirmar'

const textoItem = (it) => {
  if (it.tipo === 'venta') {
    const total = (it.args?.p_pagos ?? []).reduce((s, p) => s + Number(p.monto), 0)
    return `Venta de ${dinero(total)} · ${(it.args?.p_items ?? []).length} producto(s)`
  }
  if (it.tipo === 'accion') return it.etiqueta ?? 'Abono o préstamo'
  return it.etiqueta ?? 'Registro'
}

// Aviso de "sin conexión" y de lo que está pendiente por subir. Toca el aviso para ver el detalle.
export default function EstadoConexion() {
  const [enLinea, setEnLinea] = useState(typeof navigator === 'undefined' ? true : navigator.onLine !== false)
  const [cola, setCola] = useState([])
  const [subiendo, setSubiendo] = useState(false)
  const [avance, setAvance] = useState({ total: 0, hechos: 0 })
  const [exito, setExito] = useState(0)        // cuántos se subieron en la última tanda (se muestra unos segundos)
  const [detalle, setDetalle] = useState(false)
  const [resultado, setResultado] = useState('')

  useEffect(() => {
    const sube = () => setEnLinea(true), baja = () => setEnLinea(false)
    window.addEventListener('online', sube); window.addEventListener('offline', baja)
    listarCola().then(setCola)
    const a = alCambiarCola(setCola)
    const b = alCambiarEstado(e => {
      setSubiendo(e.subiendo); setAvance({ total: e.total, hechos: e.hechos })
      if (!e.subiendo && e.ultimo?.subidos > 0 && e.ultimo.fallidos === 0) setExito(e.ultimo.subidos)
    })
    const parar = iniciarSincronizacion()
    return () => { window.removeEventListener('online', sube); window.removeEventListener('offline', baja); a(); b(); parar() }
  }, [])

  useEffect(() => {
    if (!exito) return undefined
    const t = setTimeout(() => setExito(0), 6000)
    return () => clearTimeout(t)
  }, [exito])

  const conError = cola.filter(x => x.error)
  const pendientes = cola.length - conError.length
  if (enLinea && cola.length === 0) {
    return exito > 0 ? (
      <div role="status" className="w-full rounded-2xl ring-1 px-4 py-2.5 bg-emerald-50 ring-emerald-300 text-emerald-900">
        <span className="block text-sm font-semibold">✓ Todo subido</span>
        <span className="block text-xs opacity-80">Se subieron {exito} registro(s) hechos sin internet.</span>
      </div>
    ) : null
  }

  const subir = async () => {
    setResultado('')
    const r = await subirPendientes(true)
    if (r.subidos) setResultado(`Se subieron ${r.subidos}.`)
  }
  const descartar = async (it) => {
    if (!(await confirmar({ titulo: '¿Descartar este registro?', texto: 'No se subirá a la base de datos. No se puede deshacer.', si: 'Sí, descartar' }))) return
    await quitarDeCola(it.id)
  }
  const reintentar = async (it) => { await actualizarEnCola({ ...it, error: null }); subirPendientes(true) }

  const tono = !enLinea ? 'bg-amber-50 ring-amber-300 text-amber-900'
    : conError.length ? 'bg-red-50 ring-red-300 text-red-800' : 'bg-sky-50 ring-sky-300 text-sky-900'
  const titulo = !enLinea ? 'Sin conexión: puedes seguir vendiendo'
    : conError.length ? `${conError.length} sin poder subir: revísalos`
    : subiendo ? `Subiendo ${Math.min(avance.hechos + 1, avance.total)} de ${avance.total}…` : `${pendientes} pendiente(s) por subir`
  const sub = !enLinea
    ? (cola.length ? `${cola.length} guardado(s) en este equipo; se suben solos al volver internet` : 'Lo que registres se guarda en este equipo y se sube solo')
    : conError.length ? 'Toca para ver el motivo y qué hacer' : 'Se suben solas; toca para ver el detalle'

  return (
    <>
      <button onClick={() => setDetalle(true)} className={`w-full rounded-2xl ring-1 px-4 py-2.5 grid grid-cols-[1fr_auto] gap-3 items-center text-left ${tono}`}>
        <span className="min-w-0">
          <span className="block text-sm font-semibold">{titulo}</span>
          <span className="block text-xs opacity-80">{sub}</span>
        </span>
        <span aria-hidden="true">›</span>
        {subiendo && avance.total > 0 && (
          <span className="col-span-2 block" role="progressbar" aria-valuemin={0} aria-valuemax={avance.total} aria-valuenow={avance.hechos}>
            <span className="block h-2 rounded-full bg-black/10 overflow-hidden">
              <span className="block h-full rounded-full bg-sky-500 transition-[width] duration-300"
                    style={{ width: `${Math.max(6, Math.round((avance.hechos / avance.total) * 100))}%` }} />
            </span>
          </span>
        )}
      </button>
      {detalle && createPortal(
        <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center bg-black/50" onClick={() => setDetalle(false)}>
          <div className="w-full max-w-md max-h-[88dvh] overflow-y-auto bg-white rounded-t-3xl sm:rounded-3xl p-5 space-y-3" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-bold text-marca">Pendientes por subir</h2>
              <button onClick={() => setDetalle(false)} className="h-10 w-10 rounded-full bg-slate-100 text-slate-500">✕</button>
            </div>
            <p className="text-xs text-slate-500">{enLinea ? 'Hay internet.' : 'Sin internet ahora.'} Todo se sube en orden y solo; aquí puedes forzarlo.</p>
            <div className="rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-600 space-y-1">
              <p><b>Se sube solo</b> cuando vuelve el internet; no tienes que hacer nada.</p>
              <p>Una venta puede ser <b>rechazada</b> al subirla si, por ejemplo, ya no hay stock suficiente, un precio cambió o el cliente superó su cupo. Entonces queda en rojo con el motivo:</p>
              <p>· <b>Reintentar</b>: úsalo si ya lo arreglaste (repusiste stock, subiste el cupo…).</p>
              <p>· <b>Descartar</b>: úsalo si esa venta ya no vale; no se sube y no se puede deshacer.</p>
            </div>
            {cola.length === 0 ? <p className="text-sm text-slate-400">No queda nada pendiente.</p> : (
              <ul className="divide-y divide-slate-100">
                {cola.map(it => (
                  <li key={it.id} className="py-2 space-y-1">
                    <p className="text-sm font-medium">{textoItem(it)}</p>
                    <p className="text-xs text-slate-400">{fechaHora(new Date(it.creado).toISOString())}</p>
                    {it.error && (
                      <>
                        <p className="text-xs text-red-600 bg-red-50 rounded-lg px-2 py-1">{it.error}</p>
                        <div className="grid grid-cols-2 gap-2">
                          <button onClick={() => reintentar(it)} className="h-9 rounded-lg bg-slate-100 text-xs font-medium text-slate-600">Reintentar</button>
                          <button onClick={() => descartar(it)} className="h-9 rounded-lg bg-red-50 text-xs font-medium text-red-600">Descartar</button>
                        </div>
                      </>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {resultado && <p className="text-sm text-marca bg-lima/20 rounded-lg px-3 py-2">{resultado}</p>}
            <div className="grid grid-cols-2 gap-3">
              <button onClick={() => setDetalle(false)} className="h-12 rounded-xl bg-slate-100 text-slate-600 font-medium">Volver</button>
              <button onClick={subir} disabled={!enLinea || subiendo || cola.length === 0}
                className="h-12 rounded-xl bg-marca text-white font-semibold disabled:opacity-40">{subiendo ? 'Subiendo…' : 'Subir ahora'}</button>
            </div>
          </div>
        </div>, document.body)}
    </>
  )
}
