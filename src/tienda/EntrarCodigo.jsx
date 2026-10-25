// Entrar con un código que llega al correo (para volver a entrar desde otro celular y encontrar tus direcciones y pedidos).
import { useState } from 'react'
import { pedirCodigoCorreo, confirmarCodigoCorreo, correoValido } from '../lib/google'
import { Btn, Aviso, Campo, clsInput } from './ui'

export default function EntrarCodigo({ etiqueta = 'Entrar con un código a mi correo' }) {
  const [abierto, setAbierto] = useState(false)
  const [paso, setPaso] = useState('correo')   // correo · codigo
  const [correo, setCorreo] = useState('')
  const [codigo, setCodigo] = useState('')
  const [msg, setMsg] = useState('')
  const [ocupado, setOcupado] = useState(false)

  async function enviar() {
    setMsg('')
    if (!correoValido(correo)) { setMsg('Revisa que el correo esté bien escrito.'); return }
    setOcupado(true); const e = await pedirCodigoCorreo(correo); setOcupado(false)
    if (e) setMsg(e); else setPaso('codigo')
  }
  async function entrar() {
    setMsg(''); setOcupado(true); const e = await confirmarCodigoCorreo(correo, codigo); setOcupado(false)
    if (e) setMsg(e)          // si sale bien, la sesión cambia sola y la pantalla se actualiza
  }

  if (!abierto) return <Btn variante="suave" type="button" onClick={() => setAbierto(true)}>{etiqueta}</Btn>
  return (
    <div className="space-y-3 rounded-2xl border-2 border-black/10 bg-white p-4">
      <button type="button" onClick={() => { if (paso === 'codigo') { setPaso('correo'); setCodigo(''); setMsg('') } else setAbierto(false) }} className="min-h-[48px] text-lg font-semibold text-principal">← Volver</button>
      {msg && <Aviso tipo="error">{msg}</Aviso>}
      {paso === 'correo' ? (
        <>
          <Campo etiqueta="Tu correo" ayuda="Te enviamos un código para confirmar que eres tú. No necesitas contraseña.">
            <input className={clsInput} type="email" inputMode="email" autoComplete="email" value={correo} onChange={(e) => setCorreo(e.target.value)} />
          </Campo>
          <Btn type="button" disabled={ocupado} onClick={enviar}>{ocupado ? 'Enviando…' : 'Enviarme el código'}</Btn>
        </>
      ) : (
        <>
          <p className="text-lg leading-snug">Te enviamos un código a <b className="break-all">{correo}</b>. Mira también en «No deseados» (spam).</p>
          <Campo etiqueta="Código del correo">
            <input className={`${clsInput} text-center text-2xl tracking-widest`} inputMode="numeric" autoComplete="one-time-code" maxLength={10} value={codigo} onChange={(e) => setCodigo(e.target.value.replace(/\D/g, ''))} />
          </Campo>
          <Btn type="button" disabled={ocupado || codigo.length < 6} onClick={entrar}>{ocupado ? 'Entrando…' : 'Entrar'}</Btn>
          <button type="button" disabled={ocupado} onClick={enviar} className="min-h-[48px] text-lg font-semibold text-principal underline">Enviar el código otra vez</button>
        </>
      )}
    </div>
  )
}
