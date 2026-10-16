import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { Pagina, Tarjeta, Boton, Mensaje } from './Piezas'

export default function Login({ titulo = 'Ingresar' }) {
  const [correo, setCorreo] = useState('')
  const [clave, setClave] = useState('')
  const [error, setError] = useState('')
  const [ocupado, setOcupado] = useState(false)

  async function entrar(e) {
    e.preventDefault()
    setOcupado(true); setError('')
    const { error } = await supabase.auth.signInWithPassword({ email: correo.trim(), password: clave })
    if (error) setError('Correo o contraseña incorrectos')
    setOcupado(false)
  }

  return (
    <Pagina ancho="max-w-md">
      <Tarjeta>
        <h1 className="mb-1 text-xl font-semibold">{titulo}</h1>
        <p className="mb-5 text-sm text-tinta/60">Usa el correo y la contraseña que te dio el administrador.</p>
        <form onSubmit={entrar} className="grid gap-3">
          <input type="email" required autoComplete="username" placeholder="Correo" value={correo}
            onChange={(e) => setCorreo(e.target.value)}
            className="min-h-[44px] rounded-xl border border-black/10 px-4 text-sm outline-none focus:border-principal" />
          <input type="password" required autoComplete="current-password" placeholder="Contraseña" value={clave}
            onChange={(e) => setClave(e.target.value)}
            className="min-h-[44px] rounded-xl border border-black/10 px-4 text-sm outline-none focus:border-principal" />
          {error && <Mensaje tipo="error">{error}</Mensaje>}
          <Boton type="submit" disabled={ocupado}>{ocupado ? 'Entrando…' : 'Entrar'}</Boton>
        </form>
      </Tarjeta>
    </Pagina>
  )
}
