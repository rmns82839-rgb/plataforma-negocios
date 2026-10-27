// "Mi cuenta": cada persona cambia su propia contraseña (la pide actual, por seguridad).
import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useDueno } from '../context/rol'
import { claseInput } from '../lib/estilos'
import { requisitosClave, errorClaveNueva, mensajeErrorAuth } from '../lib/clave'
import { Campo } from './Modal'
import DosPasos from './DosPasos'

export default function MiCuenta() {
  const { sesion } = useAuth()
  const dueno = useDueno()
  const correo = sesion?.user?.email ?? ''
  const [actual, setActual] = useState('')
  const [nueva, setNueva] = useState('')
  const [repetir, setRepetir] = useState('')
  const [ver, setVer] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState('')
  const [listo, setListo] = useState('')

  const requisitos = requisitosClave(nueva)
  const tipo = ver ? 'text' : 'password'

  const cambiar = async () => {
    setError(''); setListo('')
    const motivo = errorClaveNueva(actual, nueva, repetir)
    if (motivo) return setError(motivo)
    setEnviando(true)
    // 1) comprueba que de verdad es quien dice ser (la contraseña actual)
    const { error: e1 } = await supabase.auth.signInWithPassword({ email: correo, password: actual })
    if (e1) { setEnviando(false); return setError(mensajeErrorAuth(e1)) }
    // 2) cambia la contraseña (se manda la actual también por si Supabase la exige)
    const { error: e2 } = await supabase.auth.updateUser({ password: nueva, current_password: actual })
    if (e2) { setEnviando(false); return setError(mensajeErrorAuth(e2)) }
    // 3) cierra la sesión en los demás aparatos: si alguien más tenía abierta la cuenta, queda afuera
    let otras = true
    try { const { error: e3 } = await supabase.auth.signOut({ scope: 'others' }); if (e3) otras = false } catch { otras = false }
    setEnviando(false)
    setActual(''); setNueva(''); setRepetir('')
    setListo(otras
      ? 'Contraseña cambiada. Se cerró la sesión en los demás aparatos.'
      : 'Contraseña cambiada.')
  }

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl shadow-sm p-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
        <span className="text-slate-400">Correo</span>
        <span className="font-medium break-words">{correo}</span>
        <span className="text-slate-400">Rol</span>
        <span className="font-medium">{dueno === true ? 'Dueño' : dueno === false ? 'Cajero' : '…'}</span>
      </div>

      <div className="bg-white rounded-2xl shadow-sm p-4 space-y-3">
        <h2 className="font-display text-lg font-semibold">Cambiar mi contraseña</h2>

        <Campo etiqueta="Contraseña actual">
          <input type={tipo} autoComplete="current-password" value={actual}
                 onChange={e => setActual(e.target.value)} className={claseInput} />
        </Campo>
        <Campo etiqueta="Contraseña nueva">
          <input type={tipo} autoComplete="new-password" value={nueva}
                 onChange={e => setNueva(e.target.value)} className={claseInput} />
        </Campo>
        <ul className="grid grid-cols-2 gap-2 text-xs">
          {requisitos.map(r => (
            <li key={r.texto}
                className={`h-8 rounded-lg px-2 grid grid-cols-[auto_1fr] gap-1.5 items-center ${
                  r.ok ? 'bg-esmeralda/10 text-esmeralda' : 'bg-slate-100 text-slate-500'}`}>
              <span aria-hidden="true">{r.ok ? '✓' : '○'}</span>{r.texto}
            </li>
          ))}
        </ul>
        <Campo etiqueta="Repite la contraseña nueva">
          <input type={tipo} autoComplete="new-password" value={repetir}
                 onChange={e => setRepetir(e.target.value)}
                 onKeyDown={e => e.key === 'Enter' && cambiar()} className={claseInput} />
        </Campo>

        <label className="flex items-center gap-2 text-sm text-slate-500">
          <input type="checkbox" checked={ver} onChange={e => setVer(e.target.checked)} className="h-4 w-4" />
          Mostrar las contraseñas
        </label>

        {error && <p role="alert" className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
        {listo && <p role="status" className="text-sm text-esmeralda bg-esmeralda/10 rounded-lg px-3 py-2">{listo}</p>}

        <button onClick={cambiar} disabled={enviando || !actual || !nueva || !repetir}
          className="w-full h-12 rounded-xl bg-marca text-white font-semibold disabled:opacity-40 active:bg-marca-oscuro">
          {enviando ? 'Cambiando…' : 'Cambiar contraseña'}
        </button>
      </div>

      <DosPasos />

      <p className="text-xs text-slate-400 px-1">
        Usa una contraseña que no uses en ningún otro sitio. No la compartas: cada persona tiene la suya.
      </p>
    </div>
  )
}
