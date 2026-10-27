// Botón opcional "Celular como pistola": empareja un celular por QR y recibe sus lecturas.
// Solo hace algo si el dueño lo enciende; si no se toca, la app funciona exactamente igual.
import { useEffect, useState } from 'react'
import Modal from './Modal'
import { useReceptorCelular } from '../hooks/useReceptorCelular'
import { nuevoCodigoPar, urlCelular } from '../lib/pistolaCelular'

const leer = (k) => { try { return sessionStorage.getItem(k) } catch { return null } }
const guardar = (k, v) => {
  try {
    if (v == null) sessionStorage.removeItem(k)
    else sessionStorage.setItem(k, v)
  } catch { /* sin almacenamiento */ }
}

export default function BotonCelular({ onCodigo, deshabilitado = false, venta = null }) {
  const [codigo, setCodigo] = useState(() => leer('pistola-codigo'))
  const [activo, setActivo] = useState(() => Boolean(leer('pistola-codigo')))
  const [abierto, setAbierto] = useState(false)
  const [qr, setQr] = useState('')
  const [copiado, setCopiado] = useState(false)
  const { celulares, enLinea, fallo, detalle, enviar } = useReceptorCelular(activo && !deshabilitado, codigo, (c) => { if (!deshabilitado) onCodigo?.(c) })
  const enlace = codigo ? urlCelular(codigo) : ''

  // La venta en curso se refleja en el celular: se manda al cambiar y cuando se conecta un celular
  useEffect(() => {
    if (!venta || !activo || !enLinea || celulares === 0 || deshabilitado) return
    enviar('venta', venta)
  }, [venta, activo, enLinea, celulares, deshabilitado, enviar])

  useEffect(() => {
    if (!abierto || !enlace) return undefined
    let vivo = true
    import('qrcode').then(m => m.toDataURL(enlace, { margin: 1, width: 260 })).then(u => { if (vivo) setQr(u) }).catch(() => {})
    return () => { vivo = false }
  }, [abierto, enlace])

  const encender = () => {
    const c = codigo ?? nuevoCodigoPar()
    guardar('pistola-codigo', c); setCodigo(c); setActivo(true); setAbierto(true)
  }
  const apagar = () => { guardar('pistola-codigo', null); setCodigo(null); setActivo(false); setAbierto(false); setQr('') }
  const copiar = async () => {
    try { await navigator.clipboard.writeText(enlace); setCopiado(true); setTimeout(() => setCopiado(false), 2000) } catch { /* sin portapapeles */ }
  }

  return (
    <>
      <button type="button" onClick={() => (activo ? setAbierto(true) : encender())}
        className={`w-full h-10 rounded-xl text-sm font-medium ${activo ? 'bg-champagne/30 text-slate-800 ring-1 ring-champagne' : 'bg-slate-100 text-slate-600 active:bg-slate-200'}`}>
        {activo
          ? (fallo ? 'No se pudo conectar · toca para ver' : celulares > 0 ? 'Celular conectado · toca para ver' : enLinea ? 'Esperando al celular · toca para ver' : 'Conectando…')
          : 'Usar el celular como pistola'}
      </button>

      {abierto && (
        <Modal titulo="Celular como pistola" onCerrar={() => setAbierto(false)}>
          <p className="text-sm text-slate-600">
            Abre la cámara del celular, escanea este QR y apunta a los códigos de barras. Cada lectura llega aquí, a la pantalla donde estás.
          </p>
          <div className="grid justify-items-center gap-2">
            {qr ? <img src={qr} alt="QR para emparejar el celular" width="260" height="260" className="rounded-xl ring-1 ring-slate-200" /> : <p className="text-sm text-slate-400 py-10">Preparando QR…</p>}
            <p role="status" className={`text-sm font-medium ${celulares > 0 ? 'text-esmeralda' : 'text-slate-500'}`}>
              {fallo ? 'No se pudo conectar' : celulares > 0 ? '✓ Celular conectado' : enLinea ? 'Esperando al celular…' : 'Conectando…'}
            </p>
            {fallo && <p className="text-xs text-red-600 text-center">Revisa tu internet y que ya hayas corrido migracion-v17.sql en Supabase.{detalle ? ` (${detalle})` : ''}</p>}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={copiar} className="h-11 rounded-xl bg-slate-100 text-sm font-medium text-slate-600 active:bg-slate-200">
              {copiado ? '¡Enlace copiado!' : 'Copiar enlace'}
            </button>
            <button type="button" onClick={() => setAbierto(false)} className="h-11 rounded-xl bg-marca text-white text-sm font-semibold active:bg-marca-oscuro">
              Listo
            </button>
          </div>
          <button type="button" onClick={apagar} className="w-full h-10 rounded-xl text-sm font-medium text-red-600 bg-red-50 active:bg-red-100">
            Desactivar y desemparejar
          </button>
          <p className="text-[11px] text-slate-400">El celular también debe tener la sesión iniciada. Al desactivar, el enlace deja de funcionar.</p>
        </Modal>
      )}
    </>
  )
}
