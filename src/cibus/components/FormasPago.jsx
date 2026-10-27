// Formas de pago que ofrece la Caja. Solo el dueño las cambia.
// El efectivo no se puede desactivar. Nada se borra: se desactiva (las ventas viejas conservan su nombre).
import { useState } from 'react'
import { usePersistido, borrarBorradores } from '../lib/usePersistido'
import { supabase } from '../lib/supabase'
import { claseInput } from '../lib/estilos'
import { useDueno } from '../context/rol'
import { cargarConfig, useConfig } from '../lib/config'
import { confirmar } from '../lib/confirmar'

const TIPOS = [
  { id: 'digital',  texto: 'Digital (transferencia, Nequi…)' },
  { id: 'datafono', texto: 'Datáfono (cobra comisión)' },
  { id: 'efectivo', texto: 'Efectivo' },
  { id: 'fiado',    texto: 'Fiado (queda debiendo)' },
]

const idDe = (t) => t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 30)

export default function FormasPago() {
  const dueno = useDueno()
  const { formas, hayV8, listo } = useConfig()
  const [nuevo, setNuevo] = usePersistido('formaspago:nuevo', '')
  const [tipo, setTipo] = usePersistido('formaspago:tipo', 'digital')
  const [aviso, setAviso] = useState(null)
  const [ocupado, setOcupado] = useState(false)
  const [nombres, setNombres] = useState({})

  if (dueno !== true) {
    return <p className="text-sm text-slate-500 bg-white rounded-2xl shadow-sm p-4">Solo el dueño puede cambiar las formas de pago.</p>
  }
  if (!listo) return <p className="text-center text-sm text-slate-400 py-8">Cargando…</p>
  if (!hayV8) {
    return <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">Falta ejecutar migracion-v8.sql en Supabase.</p>
  }

  const tocar = async (q) => {
    setOcupado(true); setAviso(null)
    const { error } = await q
    setOcupado(false)
    if (error) return setAviso({ tipo: 'error', texto: error.message })
    await cargarConfig()
    return true
  }

  const alternar = async (f) => {
    if (f.activa && !(await confirmar({ titulo: `¿Apagar «${f.nombre}»?`, texto: 'Deja de salir en la Caja. Las ventas anteriores conservan su nombre.', si: 'Sí, apagar' }))) return
    return tocar(supabase.from('formas_pago').update({ activa: !f.activa }).eq('id', f.id))
  }
  const renombrar = async (f) => {
    const n = (nombres[f.id] ?? f.nombre).trim()
    if (!n || n === f.nombre) return
    if (await tocar(supabase.from('formas_pago').update({ nombre: n }).eq('id', f.id))) {
      setNombres(p => { const c = { ...p }; delete c[f.id]; return c })
      setAviso({ tipo: 'ok', texto: 'Nombre cambiado.' })
    }
  }
  const agregar = async () => {
    const n = nuevo.trim()
    const id = idDe(n)
    if (n.length < 2 || id.length < 2) return setAviso({ tipo: 'error', texto: 'Escribe el nombre de la forma de pago' })
    if (formas.some(f => f.id === id)) return setAviso({ tipo: 'error', texto: 'Ya existe una forma de pago con ese nombre' })
    const orden = Math.max(0, ...formas.map(f => Number(f.orden) || 0)) + 1
    if (await tocar(supabase.from('formas_pago').insert({ id, nombre: n, tipo, activa: true, orden }))) {
      setNuevo(''); setAviso({ tipo: 'ok', texto: 'Forma de pago agregada. Ya sale en la Caja.' })
    }
  }

  return (
    <div className="space-y-4 lg:max-w-2xl lg:mx-auto">
      <p className="text-sm text-slate-500">
        Estas son las formas de pago que aparecen al cobrar. Puedes cambiarles el nombre, apagarlas o agregar otras.
      </p>

      <ul className="bg-white rounded-2xl shadow-sm divide-y divide-slate-100">
        {formas.map(f => (
          <li key={f.id} className="p-3 grid grid-cols-[1fr_auto_auto] gap-2 items-center">
            <div className="min-w-0 space-y-1">
              <input value={nombres[f.id] ?? f.nombre} maxLength={40}
                     onChange={e => setNombres(p => ({ ...p, [f.id]: e.target.value }))}
                     onBlur={() => renombrar(f)} disabled={ocupado}
                     className={`${claseInput} !h-11 ${f.activa ? '' : 'opacity-50'}`} aria-label={`Nombre de ${f.nombre}`} />
              <p className="text-[11px] text-slate-400 px-1">{f.tipo === 'prepago' ? 'Saldo adelantado del cliente' : (TIPOS.find(t => t.id === f.tipo)?.texto ?? f.tipo)}</p>
            </div>
            <span className={`text-[11px] px-2 py-1 rounded-full ${f.activa ? 'bg-lima/20 text-marca' : 'bg-slate-100 text-slate-400'}`}>
              {f.activa ? 'Activa' : 'Apagada'}
            </span>
            <button onClick={() => alternar(f)} disabled={ocupado || f.id === 'efectivo'}
              className="h-11 w-24 rounded-xl bg-slate-100 text-slate-700 text-sm font-medium disabled:opacity-30 active:bg-slate-200">
              {f.activa ? 'Apagar' : 'Activar'}
            </button>
          </li>
        ))}
      </ul>

      <div className="bg-white rounded-2xl shadow-sm p-4 space-y-3">
        <p className="text-xs font-medium text-slate-500">Agregar otra forma de pago</p>
        <div className="grid grid-cols-2 gap-3">
          <input value={nuevo} onChange={e => setNuevo(e.target.value)} maxLength={40}
                 placeholder="Ej. Bancolombia, Bre-B" className={claseInput} />
          <select value={tipo} onChange={e => setTipo(e.target.value)} className={claseInput}>
            {TIPOS.filter(t => t.id !== 'efectivo').map(t => <option key={t.id} value={t.id}>{t.texto}</option>)}
          </select>
        </div>
        <button onClick={agregar} disabled={ocupado}
          className="w-full h-12 rounded-xl bg-marca text-white font-semibold disabled:opacity-40 active:bg-marca-oscuro">
          Agregar
        </button>
      </div>

      {aviso && (
        <p className={`text-sm rounded-lg px-3 py-2 ${aviso.tipo === 'ok' ? 'text-marca bg-lima/20' : 'text-red-600 bg-red-50'}`}>
          {aviso.texto}
        </p>
      )}
    </div>
  )
}
