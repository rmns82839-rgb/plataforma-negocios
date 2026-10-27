// Copia de seguridad manual: un ZIP con todos los datos del negocio (solo el dueño).
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useDueno } from '../context/rol'
import { generarRespaldo, ultimoRespaldo, diasDesde, avisoRespaldo, fijarAviso } from '../lib/respaldo'
import { hayCarpetas, carpetaGuardada, elegirCarpeta, olvidarCarpeta, permisoCarpeta } from '../lib/carpetaRespaldo'

const AVISOS = [
  { id: 'dia', texto: 'Cada día' },
  { id: 'semana', texto: 'Cada semana' },
  { id: 'off', texto: 'No avisar' },
]

const cuando = (ms) => {
  if (!ms) return 'Aún no has hecho ninguna copia en este equipo'
  const d = diasDesde(ms)
  const f = new Date(ms).toLocaleString('es-CO', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })
  return `${d === 0 ? 'Hoy' : d === 1 ? 'Ayer' : `Hace ${d} días`} · ${f}`
}

export default function Respaldo() {
  const dueno = useDueno()
  const [ultimo, setUltimo] = useState(ultimoRespaldo())
  const [aviso, setAviso] = useState(avisoRespaldo())
  const [prog, setProg] = useState(null)       // { hechas, total, tabla }
  const [res, setRes] = useState(null)
  const [error, setError] = useState('')
  const [carpeta, setCarpeta] = useState(null)       // carpeta fija elegida (Chrome/Edge en PC)
  useEffect(() => { carpetaGuardada().then(setCarpeta) }, [])

  if (dueno !== true) {
    return <p className="text-sm text-slate-500 bg-white rounded-2xl shadow-sm p-4">Solo el dueño puede hacer la copia de seguridad.</p>
  }

  const descargar = async () => {
    setError(''); setRes(null); setProg({ hechas: 0, total: 1, tabla: '' })
    try {
      const usar = carpeta && (await permisoCarpeta(carpeta)) ? carpeta : null     // el permiso se pide ahora, con el toque del botón
      const r = await generarRespaldo(supabase, (hechas, total, tabla) => setProg({ hechas, total, tabla }), usar)
      setRes(r); setUltimo(ultimoRespaldo())
    } catch (e) {
      setError(e.message || 'No se pudo hacer la copia')
    }
    setProg(null)
  }
  const cambiarCarpeta = async () => {
    setError('')
    try { setCarpeta(await elegirCarpeta()) }
    catch (e) { if (e?.name !== 'AbortError') setError('No se pudo usar esa carpeta. Crea una carpeta nueva (por ejemplo "Copias Matriz") y elígela.') }
  }
  const quitarCarpeta = async () => { await olvidarCarpeta(); setCarpeta(null) }
  const elegirAviso = (id) => { setAviso(id); fijarAviso(id) }
  const pct = prog ? Math.round((prog.hechas / prog.total) * 100) : 0

  return (
    <div className="space-y-4 lg:max-w-2xl lg:mx-auto">
      <div className="bg-negro rounded-2xl p-5 grid gap-3">
        <div className="grid gap-1">
          <p className="text-xs text-champagne/70">Última copia de seguridad</p>
          <p className="font-display text-2xl font-semibold text-champagne">{cuando(ultimo)}</p>
        </div>
        <p className="text-xs text-hueso/70">
          Un solo archivo ZIP con ventas, productos, clientes, fiados, préstamos, gastos, promociones y más.
          Guárdalo en tu Drive, tu correo o una memoria USB.
        </p>
        <button onClick={descargar} disabled={Boolean(prog)}
          className="h-14 rounded-xl bg-champagne text-negro text-base font-semibold disabled:opacity-60 active:bg-champagne-claro">
          {prog ? `Preparando… ${pct}%` : 'Descargar copia ahora'}
        </button>
        {prog && (
          <div className="grid gap-1">
            <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
              <div className="h-full bg-champagne transition-all duration-300" style={{ width: `${pct}%` }} />
            </div>
            <p className="text-[11px] text-hueso/50 truncate">{prog.tabla ? `Leyendo ${prog.tabla}…` : 'Armando el archivo…'}</p>
          </div>
        )}
      </div>

      {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
      {res && (
        <div className="text-sm text-marca bg-lima/20 rounded-2xl px-4 py-3 space-y-1">
          <p className="font-semibold">Listo: {res.nombre}</p>
          <p className="text-xs">{res.tablas} tablas · {res.filas.toLocaleString('es-CO')} filas · {(res.bytes / 1024 / 1024 < 1 ? `${Math.max(1, Math.round(res.bytes / 1024))} KB` : `${(res.bytes / 1024 / 1024).toFixed(1)} MB`)}</p>
          <p className="text-xs">{res.enCarpeta ? `Quedó en tu carpeta “${res.enCarpeta}”.` : 'Quedó en tu carpeta de Descargas. Muévelo a un lugar seguro.'}</p>
          {res.omitidas.length > 0 && <p className="text-xs text-oro-oscuro">Algunas tablas no se pudieron leer; el detalle está en LEEME.txt dentro del ZIP.</p>}
        </div>
      )}

      {hayCarpetas() && (
        <div className="bg-white rounded-2xl shadow-sm p-4 space-y-3">
          <p className="text-xs font-medium text-slate-500">Carpeta de las copias (solo en este computador)</p>
          <p className="text-sm text-slate-600">
            {carpeta ? <>Las copias se guardan en <b>{carpeta.name}</b>, sin pasar por Descargas.</> : 'Sin carpeta fija: las copias van a la carpeta Descargas.'}
          </p>
          <div className={`grid gap-2 ${carpeta ? 'grid-cols-2' : 'grid-cols-1'}`}>
            <button onClick={cambiarCarpeta} className="h-11 rounded-xl bg-negro text-champagne text-sm font-semibold active:opacity-90">{carpeta ? 'Cambiar carpeta' : 'Elegir carpeta'}</button>
            {carpeta && <button onClick={quitarCarpeta} className="h-11 rounded-xl bg-slate-100 text-slate-600 text-sm font-medium active:bg-slate-200">Quitar carpeta</button>}
          </div>
          <p className="text-[11px] text-slate-400">
            Crea antes una carpeta (por ejemplo <b>C:\Copias Matriz</b>) y elígela aquí una sola vez. El navegador puede volver a pedir permiso de vez en cuando; se acepta con un toque.
            Si la carpeta está dentro de Google Drive o OneDrive, la copia también queda en la nube.
          </p>
        </div>
      )}

      <div className="bg-white rounded-2xl shadow-sm p-4 space-y-3">
        <p className="text-xs font-medium text-slate-500">Recordatorio (solo en este equipo)</p>
        <div className="grid grid-cols-3 gap-2">
          {AVISOS.map(a => (
            <button key={a.id} onClick={() => elegirAviso(a.id)}
              className={`h-11 rounded-xl text-sm font-medium ${aviso === a.id ? 'bg-marca text-white' : 'bg-slate-100 text-slate-600'}`}>
              {a.texto}
            </button>
          ))}
        </div>
        <p className="text-[11px] text-slate-400">
          Cuando toque, te sale un aviso en el menú "Más". La copia nunca se hace sola: tú decides cuándo bajarla.
        </p>
      </div>

      <div className="bg-white rounded-2xl shadow-sm p-4 space-y-1 text-xs text-slate-500">
        <p className="font-medium text-slate-600">Qué NO incluye</p>
        <p>Las fotos de las prendas (siguen guardadas en línea) y las contraseñas de los usuarios (esas las protege Supabase).</p>
      </div>
    </div>
  )
}
