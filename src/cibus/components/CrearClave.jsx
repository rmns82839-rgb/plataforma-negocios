// Primera vez: quien entró con Google o con un código al correo crea su contraseña para poder entrar después con correo y contraseña.
import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { claseInput } from '../lib/estilos'
import { requisitosClave, errorClaveCrear, mensajeErrorAuth } from '../lib/clave'
import { Campo } from './Modal'

export default function CrearClave({ correo, onCreada }) {
  const [nueva, setNueva] = useState('')
  const [repetir, setRepetir] = useState('')
  const [ver, setVer] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState('')
  const tipo = ver ? 'text' : 'password'

  const crear = async () => {
    setError('')
    const motivo = errorClaveCrear(nueva, repetir)
    if (motivo) return setError(motivo)
    setEnviando(true)
    const { error: e } = await supabase.auth.updateUser({ password: nueva, data: { tiene_clave: true } })
    setEnviando(false)
    if (e) return setError(mensajeErrorAuth(e))
    setNueva(''); setRepetir('')
    try { await supabase.auth.refreshSession() } catch { /* la marca igual quedó guardada */ }
    onCreada?.()
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm p-4 space-y-3 ring-2 ring-champagne">
      <h2 className="font-display text-lg font-semibold break-words">🔑 Crea tu contraseña</h2>
      <p className="text-sm text-slate-500 break-words">Así la próxima vez entras con tu correo <b className="break-all">{correo}</b> y tu contraseña, sin pedir códigos. Es opcional, pero más rápido.</p>
      <Campo etiqueta="Contraseña nueva">
        <input type={tipo} autoComplete="new-password" value={nueva} onChange={e => setNueva(e.target.value)} className={claseInput} />
      </Campo>
      <ul className="grid grid-cols-2 gap-2 text-xs">
        {requisitosClave(nueva).map(r => (
          <li key={r.texto} className={`h-8 rounded-lg px-2 grid grid-cols-[auto_1fr] gap-1.5 items-center ${r.ok ? 'bg-esmeralda/10 text-esmeralda' : 'bg-slate-100 text-slate-500'}`}>
            <span aria-hidden="true">{r.ok ? '✓' : '○'}</span>{r.texto}
          </li>
        ))}
      </ul>
      <Campo etiqueta="Repite la contraseña">
        <input type={tipo} autoComplete="new-password" value={repetir} onChange={e => setRepetir(e.target.value)} onKeyDown={e => e.key === 'Enter' && crear()} className={claseInput} />
      </Campo>
      <label className="flex items-center gap-2 text-sm text-slate-500">
        <input type="checkbox" checked={ver} onChange={e => setVer(e.target.checked)} className="h-4 w-4" />
        Mostrar las contraseñas
      </label>
      {error && <p role="alert" className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2 break-words">{error}</p>}
      <button onClick={crear} disabled={enviando || !nueva || !repetir} className="w-full h-12 rounded-xl bg-marca text-white font-semibold disabled:opacity-40 active:bg-marca-oscuro">
        {enviando ? 'Guardando…' : 'Crear mi contraseña'}
      </button>
    </div>
  )
}
