import { useCallback, useEffect, useState } from 'react'
import { usePersistido, borrarBorradores, TREINTA_MIN } from '../lib/usePersistido'
import { supabase } from '../lib/supabase'
import { claseInput } from '../lib/estilos'
import { fechaHora } from '../lib/formato'
import { useDueno } from '../context/rol'
import { practicaActiva } from '../lib/practica'
import Modal, { Campo } from './Modal'
import { confirmar } from '../lib/confirmar'

const ROLES = { dueno: 'Dueño', cajero: 'Cajero', soporte: 'Soporte (solo lectura)' }

// Quién tiene acceso a la app. Solo el dueño.
// Flujo: crear el usuario en Supabase (Authentication > Users > Add user) y aquí darle acceso.
export default function Equipo() {
  const dueno = useDueno()
  const [gente, setGente] = useState([])
  const [error, setError] = useState('')
  const [nuevo, setNuevo] = usePersistido('equipo:abierto', false, true, TREINTA_MIN)         // (la contraseña nunca se guarda)
  const [correo, setCorreo] = usePersistido('equipo:correo', '')
  const [rol, setRol] = usePersistido('equipo:rol', 'cajero')
  const [trabajando, setTrabajando] = useState(false)
  const [modo, setModo] = usePersistido('equipo:modo', 'crear')           // crear = usuario nuevo con contraseña · existe = ya está en Supabase
  const [clave, setClave] = useState('')
  const [verClave, setVerClave] = useState(false)
  const [creado, setCreado] = useState(null)         // { email, clave } para entregárselo a la persona

  const cargar = useCallback(async () => {
    const { data, error: err } = await supabase.rpc('listar_equipo')
    if (err) setError(err.message); else setGente(Array.isArray(data) ? data : [])
  }, [])
  useEffect(() => { if (dueno) cargar() }, [cargar, dueno])

  if (!dueno) return <p className="text-center text-sm text-slate-400 py-8">Solo el dueño administra el equipo.</p>

  const accion = async (rpc, args, despues) => {
    setTrabajando(true); setError('')
    const { error: err } = await supabase.rpc(rpc, args)
    setTrabajando(false)
    if (err) return setError(err.message)
    despues?.(); cargar()
  }

  const generar = () => {
    const letras = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789'
    const b = crypto.getRandomValues(new Uint32Array(12))
    setClave(Array.from(b, x => letras[x % letras.length]).join('')); setVerClave(true)
  }

  const crear = async () => {
    if (practicaActiva()) return setError('Modo práctica: aquí no se crean usuarios de verdad.')
    setTrabajando(true); setError('')
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const r = await fetch('/api/crear-usuario', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token ?? ''}` },
        body: JSON.stringify({ email: correo, password: clave, rol }),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(j.error || 'No se pudo crear el usuario')
      setCreado({ email: correo.trim().toLowerCase(), clave }); setNuevo(false); cargar()
    } catch (e) { setError(e.message) }
    setTrabajando(false)
  }

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl shadow-sm p-4 grid grid-cols-2 gap-3 items-center">
        <div>
          <p className="text-xs text-slate-400">Personas con acceso</p>
          <p className="text-2xl font-bold">{gente.length}</p>
        </div>
        <button onClick={() => { setNuevo(true); setCorreo(''); setClave(''); setVerClave(false); setModo('crear'); setRol('cajero'); setError('') }}
          className="h-11 rounded-xl bg-marca text-white text-sm font-semibold active:bg-marca-oscuro">+ Dar acceso</button>
      </div>

      {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}

      <ul className="bg-white rounded-2xl shadow-sm divide-y divide-slate-100">
        {gente.map(g => (
          <li key={g.user_id} className="px-4 py-3 grid grid-cols-[1fr_auto] gap-3 items-center">
            <div className="min-w-0">
              <p className="text-sm font-medium break-words">{g.email}</p>
              <p className="text-xs text-slate-400 break-words">
                {ROLES[g.rol]}{g.ultimo_ingreso ? ` · último ingreso ${fechaHora(g.ultimo_ingreso)}` : ' · nunca ha entrado'}
              </p>
            </div>
            <button disabled={trabajando}
              onClick={async () => { if (await confirmar({ titulo: `¿Quitar el acceso a ${g.email}?`, texto: 'Ya no podrá entrar a la aplicación.' })) accion('quitar_personal', { p_user_id: g.user_id }) }}
              className="h-9 px-3 rounded-lg bg-red-50 text-red-600 text-xs font-semibold disabled:opacity-40">Quitar</button>
          </li>
        ))}
      </ul>

      {creado && (
        <div className="rounded-2xl bg-esmeralda/10 ring-1 ring-esmeralda/30 p-4 space-y-2">
          <p className="text-sm font-semibold text-esmeralda">Usuario creado. Entrégale estos datos:</p>
          <div className="rounded-xl bg-white p-3 text-sm space-y-1">
            <p><span className="text-slate-400">Correo: </span><span className="font-medium">{creado.email}</span></p>
            <p><span className="text-slate-400">Contraseña: </span><span className="font-mono font-medium">{creado.clave}</span></p>
          </div>
          <p className="text-xs text-slate-500">Puede cambiarla en Más → Mi cuenta. Esta contraseña no se vuelve a mostrar.</p>
          <button onClick={() => setCreado(null)} className="w-full h-10 rounded-xl bg-white text-slate-600 text-sm font-medium">Listo</button>
        </div>
      )}

      <p className="text-xs text-slate-400">
        Crea aquí a tu cajero con correo y contraseña. Quien no esté en esta lista no puede ver nada, aunque tenga cuenta.
      </p>

      {nuevo && (
        <Modal titulo="Dar acceso" onCerrar={() => setNuevo(false)}>
          <div className="grid grid-cols-2 gap-2">
            {[['crear', 'Crear usuario nuevo'], ['existe', 'Ya existe en Supabase']].map(([id, t]) => (
              <button key={id} onClick={() => { setModo(id); setError('') }}
                className={`min-h-11 rounded-xl text-xs font-medium px-1 ${modo === id ? 'bg-marca text-white' : 'bg-slate-100 text-slate-600'}`}>{t}</button>
            ))}
          </div>
          <Campo etiqueta={modo === 'crear' ? 'Correo del nuevo usuario' : 'Correo (ya creado en Supabase)'}>
            <input value={correo} onChange={e => setCorreo(e.target.value)} type="email" autoCapitalize="none"
                   inputMode="email" className={claseInput} />
          </Campo>
          {modo === 'crear' && (
            <Campo etiqueta="Contraseña (mínimo 8 caracteres)">
              <div className="grid grid-cols-[1fr_auto] gap-2">
                <input value={clave} onChange={e => setClave(e.target.value)} type={verClave ? 'text' : 'password'}
                       autoComplete="new-password" className={claseInput} />
                <button type="button" onClick={generar} className="h-12 px-4 rounded-xl bg-lima/20 text-marca text-sm font-semibold">Generar</button>
              </div>
            </Campo>
          )}
          <Campo etiqueta="Rol">
            <select value={rol} onChange={e => setRol(e.target.value)} className={claseInput}>
              <option value="cajero">Cajero: vende, fía y cuenta inventario</option>
              <option value="dueno">Dueño: además préstamos, cupos, equipo y auditoría</option>
            </select>
          </Campo>
          {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
          <button disabled={trabajando || !correo.trim() || (modo === 'crear' && clave.length < 8)}
            onClick={() => (modo === 'crear' ? crear() : accion('agregar_personal', { p_email: correo, p_rol: rol }, () => setNuevo(false)))}
            className="w-full h-12 rounded-xl bg-marca text-white font-semibold disabled:opacity-40 active:bg-marca-oscuro">
            {trabajando ? 'Guardando…' : modo === 'crear' ? 'Crear usuario' : 'Dar acceso'}
          </button>
        </Modal>
      )}
    </div>
  )
}
