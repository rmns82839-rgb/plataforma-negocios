// Tarjeta del panel: activar el aviso de «pedido nuevo» en este celular, aunque la app esté cerrada.
import { useEffect, useState } from 'react'
import { estadoAvisosEquipo, activarAvisosEquipo, desactivarAvisosEquipo } from '../lib/avisosEquipo'

export default function AvisosPedidosEquipo({ compacto = false }) {
  const [estado, setEstado] = useState(null)
  const [error, setError] = useState('')
  const [ocupado, setOcupado] = useState(false)
  useEffect(() => { estadoAvisosEquipo().then(setEstado) }, [])

  if (!estado || estado === 'sin_llave' || estado === 'no_soportado') return null
  const accion = async (f) => {
    setOcupado(true); setError('')
    try { await f(); setEstado(await estadoAvisosEquipo()) } catch (e) { setError(e.message || 'No se pudo') }
    setOcupado(false)
  }
  if (estado === 'activo') {
    if (!compacto) return null
    return (
      <p className="flex items-center justify-center gap-2 rounded-2xl bg-white px-3 min-h-11 text-sm text-slate-600 shadow-sm">🔔 Avisos de pedidos activados en este celular
        <button disabled={ocupado} onClick={() => accion(desactivarAvisosEquipo)} className="min-h-11 px-2 font-semibold underline underline-offset-2">Quitar</button></p>
    )
  }
  return (
    <section className="rounded-2xl bg-amber-50 ring-1 ring-amber-300 p-4 space-y-3">
      {estado === 'ios_instalar' ? (
        <p className="text-base text-amber-900">🔔 Para recibir el aviso de pedidos en iPhone, instala la app: toca <b>Compartir</b> y luego <b>Agregar a pantalla de inicio</b>.</p>
      ) : estado === 'bloqueado' ? (
        <p className="text-base text-amber-900">🔔 Los avisos están bloqueados en este celular. Actívalos en los ajustes del navegador para este sitio.</p>
      ) : (
        <>
          <p className="text-base text-amber-900"><b>🔔 Entérate al instante</b> cuando llegue un pedido, aunque tengas la app cerrada.</p>
          <button disabled={ocupado} onClick={() => accion(activarAvisosEquipo)}
            className="w-full min-h-14 rounded-2xl bg-marca px-4 text-lg font-semibold text-white active:opacity-90 disabled:opacity-50">
            {ocupado ? 'Activando…' : 'Avisarme de los pedidos'}</button>
        </>
      )}
      {error && <p className="text-sm text-red-700 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
    </section>
  )
}
