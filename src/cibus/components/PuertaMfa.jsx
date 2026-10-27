// Si la cuenta tiene verificación en dos pasos y esta sesión todavía no escribió el código,
// se muestra la pantalla del código en lugar de la aplicación.
import { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { necesitaCodigo, factorActivo, verificarCodigo, soloDigitos, mensajeMfa } from '../lib/mfa'
import Marca from './Marca'

function PantallaCodigo({ onListo }) {
  const { salir } = useAuth()
  const [codigo, setCodigo] = useState('')
  const [error, setError] = useState('')
  const [enviando, setEnviando] = useState(false)

  const verificar = async () => {
    if (codigo.length !== 6) return setError('El código tiene 6 dígitos')
    setError(''); setEnviando(true)
    const f = await factorActivo()
    if (!f) { setEnviando(false); return onListo() }   // ya no tiene el segundo paso (se lo quitaron)
    const { error: err } = await verificarCodigo(f.id, codigo)
    setEnviando(false)
    if (err) { setCodigo(''); return setError(mensajeMfa(err)) }
    onListo()
  }

  return (
    <div className="min-h-full bg-negro flex items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-8">
        <Marca tam="md" />
        <div className="space-y-3 text-center">
          <h1 className="font-display text-2xl font-semibold text-hueso">Verificación en dos pasos</h1>
          <p className="text-sm text-hueso/70">Abre tu app de autenticación y escribe el código de 6 dígitos de Matriz.</p>
          <input
            value={codigo} onChange={e => setCodigo(soloDigitos(e.target.value))}
            onKeyDown={e => e.key === 'Enter' && verificar()}
            inputMode="numeric" autoComplete="one-time-code" autoFocus placeholder="000000" aria-label="Código de 6 dígitos"
            className="w-full h-14 text-center text-2xl tracking-[0.5em] pl-[0.5em] rounded-xl bg-white/5 border border-champagne/25 text-hueso
                       placeholder:text-hueso/20 focus:border-champagne focus:ring-2 focus:ring-champagne/20 outline-none"
          />
          {error && <p role="alert" className="text-sm text-red-300 bg-red-500/10 border border-red-400/20 rounded-lg px-3 py-2">{error}</p>}
          <button onClick={verificar} disabled={enviando || codigo.length !== 6}
            className="w-full h-12 rounded-xl bg-gradient-to-b from-champagne-claro to-champagne text-negro font-semibold disabled:opacity-40 active:opacity-80">
            {enviando ? 'Verificando…' : 'Verificar'}
          </button>
          <button onClick={salir} className="w-full h-11 rounded-xl border border-champagne/25 text-champagne text-sm active:bg-white/5">
            Salir
          </button>
        </div>
      </div>
    </div>
  )
}

export default function PuertaMfa({ children }) {
  const { sesion } = useAuth()
  const [estado, setEstado] = useState('cargando')     // cargando | pedir | ok
  const token = sesion?.access_token

  useEffect(() => {
    let vivo = true
    necesitaCodigo().then(pedir => { if (vivo) setEstado(pedir ? 'pedir' : 'ok') })
    return () => { vivo = false }
  }, [token])

  if (estado === 'cargando') return <div className="min-h-full grid place-items-center text-slate-400">Cargando…</div>
  if (estado === 'pedir') return <PantallaCodigo onListo={() => setEstado('ok')} />
  return children
}
