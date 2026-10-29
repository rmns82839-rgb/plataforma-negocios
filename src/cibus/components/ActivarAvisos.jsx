// Tarjeta para el cliente: activar los avisos del pedido (va en camino, entregado) y del menú del día.
import { useEffect, useState } from 'react'
import Icono from './Iconos'
import { estadoAvisos, activarAvisos, desactivarAvisos } from '../lib/avisosPush'
import { modoPublico } from '../lib/publico'

export default function ActivarAvisos() {
  const [estado, setEstado] = useState(null)
  const [error, setError] = useState('')
  const [ocupado, setOcupado] = useState(false)
  useEffect(() => { estadoAvisos().then(setEstado) }, [])

  if (modoPublico()) return null            // en la plataforma los avisos al cliente llegan en una etapa posterior
  if (!estado || estado === 'sin_llave' || estado === 'no_soportado') return null
  const accion = async (f) => {
    setOcupado(true); setError('')
    try { await f(); setEstado(await estadoAvisos()) } catch (e) { setError(e.message || 'No se pudo') }
    setOcupado(false)
  }
  return (
    <section className="max-w-2xl mx-auto w-full">
      {estado === 'activo' ? (
        <p className="flex items-center justify-center gap-2 rounded-full bg-cibus-profundo ring-1 ring-oro/30 px-3 min-h-9 text-xs text-champagne/80"><Icono nombre="campana" className="h-4 w-4" />Avisos activados
          <button disabled={ocupado} onClick={() => accion(desactivarAvisos)} className="underline underline-offset-2 min-h-8 px-1">Desactivar</button></p>
      ) : estado === 'ios_instalar' ? (
        <p className="rounded-2xl bg-cibus-profundo ring-1 ring-oro/30 px-3 py-2 text-xs text-champagne/90 text-center"><Icono nombre="campana" className="h-4 w-4 inline-block align-text-bottom mr-1" />Para recibir avisos en iPhone, instala la app: toca <b>Compartir</b> y luego <b>Agregar a pantalla de inicio</b>.</p>
      ) : estado === 'bloqueado' ? (
        <p className="rounded-2xl bg-cibus-profundo ring-1 ring-oro/30 px-3 py-2 text-xs text-champagne/90 text-center"><Icono nombre="campana" className="h-4 w-4 inline-block align-text-bottom mr-1" />Los avisos están bloqueados en tu celular. Actívalos en los ajustes del navegador para este sitio.</p>
      ) : (
        <button disabled={ocupado} onClick={() => accion(activarAvisos)}
          className="w-full min-h-11 rounded-full ring-1 ring-oro/50 bg-cibus-profundo px-4 text-sm font-semibold text-champagne active:opacity-80 disabled:opacity-50">
          <span className="inline-flex items-center justify-center gap-2"><Icono nombre="campana" className="h-4 w-4" />{ocupado ? 'Activando…' : 'Avísame de mi pedido y del menú del día'}</span></button>
      )}
      {error && <p className="mt-1 text-xs text-red-200 bg-red-900/40 rounded-lg px-3 py-2">{error}</p>}
    </section>
  )
}
