import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { Btn, Aviso, Campo, clsInput, PiePlataforma } from '../tienda/ui'
import { entrarConGoogle } from '../lib/google'
import { huboErrorDeLogin } from '../lib/reparar'
import MarcaMatriz from '../tienda/MarcaMatriz'
import { ir } from '../lib/ruta'

export default function Login({ titulo = 'Ingresar' }) {
  const [correo, setCorreo] = useState('')
  const [clave, setClave] = useState('')
  const [error, setError] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [ver, setVer] = useState(false)

  async function entrar(e) {
    e.preventDefault()
    setOcupado(true); setError('')
    const { error } = await supabase.auth.signInWithPassword({ email: correo.trim(), password: clave })
    if (error) setError(/Invalid login|invalid_credentials/i.test(error.message) ? 'El correo o la contraseña no coinciden. Revísalos e intenta de nuevo.' : `No pudimos entrar: ${error.message}`)
    setOcupado(false)
  }

  return (
    <main className="mx-auto w-full max-w-md px-4 py-10 text-lg">
      <div className="mb-8"><MarcaMatriz /></div>
      <h1 className="mb-1 text-3xl font-bold">{titulo}</h1>
      <p className="mb-6 text-lg text-tinta/70">Escribe el correo y la contraseña de tu cuenta.</p>
      <form onSubmit={entrar} className="space-y-5 rounded-2xl border-2 border-black/5 bg-white p-5">
        <Campo etiqueta="Correo"><input type="email" required autoComplete="username" inputMode="email" value={correo} onChange={(e) => setCorreo(e.target.value)} className={clsInput} /></Campo>
        <Campo etiqueta="Contraseña">
          <div className="grid grid-cols-[1fr_auto] gap-2">
            <input type={ver ? 'text' : 'password'} required autoComplete="current-password" value={clave} onChange={(e) => setClave(e.target.value)} className={clsInput} />
            <button type="button" onClick={() => setVer(!ver)} className="min-h-[56px] rounded-2xl border-2 border-black/10 px-4 text-lg font-semibold">{ver ? 'Ocultar' : 'Ver'}</button>
          </div>
        </Campo>
        {error && <Aviso tipo="error">{error}</Aviso>}
        <Btn type="submit" disabled={ocupado}>{ocupado ? 'Entrando…' : 'Entrar'}</Btn>
      </form>
      <div className="mt-5 space-y-3 rounded-2xl border-2 border-black/5 bg-white p-5">
        <p className="text-lg font-semibold leading-snug">¿Te invitaron a una tienda con tu correo de Google?</p>
        <Btn variante="suave" type="button" onClick={async () => { const e = await entrarConGoogle(); if (e) setError(e) }}>Entrar con Google</Btn>
      </div>
      {huboErrorDeLogin(window.location.search, window.location.hash) && (
        <div className="mt-5"><Aviso tipo="error">Google no pudo terminar de entrar. Toca «Reparar» abajo y vuelve a intentar.</Aviso></div>
      )}
      <div className="mt-5 space-y-3 rounded-2xl border-2 border-black/5 bg-white p-5">
        <p className="text-lg font-semibold leading-snug">¿No te deja entrar o se queda en blanco?</p>
        <p className="text-base leading-snug text-tinta/70">Esto borra lo que este navegador guardó de la plataforma. No pierdes nada de tu tienda; solo vuelves a iniciar sesión.</p>
        <Btn variante="suave" type="button" onClick={() => window.location.assign('/reparar')}>🔧 Reparar y reintentar</Btn>
      </div>
      <div className="mt-5 space-y-3 rounded-2xl border-2 border-black/5 bg-white p-5">
        <p className="text-lg font-semibold leading-snug">¿Buscas una tienda para comprar?</p>
        <Btn variante="suave" type="button" onClick={() => ir('/tiendas')}>Ver tiendas abiertas cerca de mí</Btn>
      </div>
      <div className="mt-5 space-y-3 rounded-2xl border-2 border-black/5 bg-white p-5">
        <p className="text-lg font-semibold leading-snug">¿Tienes un negocio y quieres vender en línea?</p>
        <Btn variante="suave" type="button" onClick={() => ir('/registro')}>Registrar mi negocio</Btn>
      </div>
      <PiePlataforma />
    </main>
  )
}
