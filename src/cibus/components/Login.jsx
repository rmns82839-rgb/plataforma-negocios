import { useState } from 'react'
import { supabase } from '../lib/supabase'
import Marca from './Marca'
import Icono from './Iconos'

const campo =
  'w-full h-12 px-4 rounded-xl bg-white/5 border border-champagne/25 text-hueso placeholder:text-hueso/40 ' +
  'focus:border-champagne focus:ring-2 focus:ring-champagne/20 outline-none'

export default function Login() {
  const [correo, setCorreo] = useState('')
  const [clave, setClave] = useState('')
  const [verClave, setVerClave] = useState(false)
  const [error, setError] = useState('')
  const [cargando, setCargando] = useState(false)

  const entrar = async () => {
    setError(''); setCargando(true)
    const { error } = await supabase.auth.signInWithPassword({
      email: correo.trim(), password: clave,
    })
    if (error) { setError(error.message); console.error(error) }
    setCargando(false)
  }

  return (
    <div className="min-h-full bg-negro flex items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-8">
        <Marca tam="lg" />

        <div className="space-y-3">
          <input
            type="email" inputMode="email" autoComplete="username"
            placeholder="Correo"
            value={correo} onChange={e => setCorreo(e.target.value)}
            className={campo}
          />
          <div className="relative">
            <input
              type={verClave ? 'text' : 'password'} autoComplete="current-password"
              autoCapitalize="none" autoCorrect="off" spellCheck={false}
              placeholder="Contraseña"
              value={clave} onChange={e => setClave(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && entrar()}
              className={`${campo} pr-14`}
            />
            <button type="button" onClick={() => setVerClave(v => !v)}
              aria-label={verClave ? 'Ocultar contraseña' : 'Mostrar contraseña'} aria-pressed={verClave}
              className="absolute inset-y-0 right-0 w-12 grid place-items-center text-champagne/70 active:text-champagne focus-visible:text-champagne outline-none">
              <Icono nombre={verClave ? 'ojoTachado' : 'ojo'} className="h-5 w-5" />
            </button>
          </div>

          {error && <p className="text-sm text-red-300 bg-red-500/10 border border-red-400/20 rounded-lg px-3 py-2">{error}</p>}

          <button
            onClick={entrar} disabled={cargando || !correo || !clave}
            className="w-full h-12 rounded-xl bg-gradient-to-b from-champagne-claro to-champagne text-negro font-semibold
                       disabled:opacity-40 active:opacity-80 transition"
          >
            {cargando ? 'Entrando…' : 'Entrar'}
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <a href="/tienda" className="h-11 rounded-xl border border-champagne/25 text-champagne text-sm grid place-items-center active:bg-white/5">
            Catálogo de productos
          </a>
          <a href="/ropa" className="h-11 rounded-xl border border-champagne/25 text-champagne text-sm grid place-items-center active:bg-white/5">
            Catálogo de ropa
          </a>
        </div>
      </div>
    </div>
  )
}
