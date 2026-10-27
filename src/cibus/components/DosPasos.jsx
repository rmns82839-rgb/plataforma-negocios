// "Verificación en dos pasos" dentro de Mi cuenta: activar (QR + código), ver estado y desactivar.
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { factorActivo, empezarActivacion, verificarCodigo, soloDigitos, clavePorGrupos, qrComoImagen, mensajeMfa } from '../lib/mfa'
import { avisarCambioMfa } from '../lib/useDosPasos'
import { useCopiado, textoCopiar } from '../lib/useCopiado'

const campoCodigo =
  'w-full h-12 text-center text-xl tracking-[0.4em] pl-[0.4em] rounded-xl border border-slate-300 bg-white ' +
  'focus:border-oro focus:ring-2 focus:ring-oro/25 outline-none'

export default function DosPasos() {
  const [fase, setFase] = useState('cargando')   // cargando | inactivo | activando | activo | quitando
  const [factor, setFactor] = useState(null)     // verificado
  const [nuevo, setNuevo] = useState(null)       // { id, totp: { qr_code, secret } } en activación
  const [codigo, setCodigo] = useState('')
  const [error, setError] = useState('')
  const [listo, setListo] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [copiado, copiar] = useCopiado()

  useEffect(() => {
    let vivo = true
    factorActivo().then(f => { if (vivo) { setFactor(f); setFase(f ? 'activo' : 'inactivo') } })
    return () => { vivo = false }
  }, [])

  const empezar = async () => {
    setError(''); setListo(''); setOcupado(true)
    const { data, error: err } = await empezarActivacion()
    setOcupado(false)
    if (err) return setError(mensajeMfa(err))
    setNuevo(data); setCodigo(''); setFase('activando')
  }

  const cancelar = async () => {
    if (nuevo) await supabase.auth.mfa.unenroll({ factorId: nuevo.id })
    setNuevo(null); setCodigo(''); setError(''); setFase('inactivo')
  }

  const confirmar = async () => {
    if (codigo.length !== 6) return setError('El código tiene 6 dígitos')
    setError(''); setOcupado(true)
    const { error: err } = await verificarCodigo(nuevo.id, codigo)
    setOcupado(false)
    if (err) { setCodigo(''); return setError(mensajeMfa(err)) }
    const f = await factorActivo()
    setFactor(f); setNuevo(null); setCodigo(''); setFase('activo')
    setListo('Verificación en dos pasos activada. Desde ahora, al entrar te pedirá el código de tu app.')
    avisarCambioMfa()
  }

  const quitar = async () => {
    if (codigo.length !== 6) return setError('Escribe el código de tu app para confirmar')
    setError(''); setOcupado(true)
    const { error: e1 } = await verificarCodigo(factor.id, codigo)
    if (e1) { setOcupado(false); setCodigo(''); return setError(mensajeMfa(e1)) }
    const { error: e2 } = await supabase.auth.mfa.unenroll({ factorId: factor.id })
    setOcupado(false)
    if (e2) return setError(mensajeMfa(e2))
    setFactor(null); setCodigo(''); setFase('inactivo')
    setListo('Verificación en dos pasos desactivada.')
    avisarCambioMfa()
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm p-4 space-y-3">
      <h2 className="font-display text-lg font-semibold">Verificación en dos pasos</h2>

      {fase === 'cargando' && <p className="text-sm text-slate-400">Cargando…</p>}

      {fase === 'inactivo' && (
        <>
          <p className="text-sm text-slate-500">
            Además de la contraseña, te pide un código de 6 dígitos que cambia cada 30 segundos y solo
            lo ve tu celular. Si alguien se entera de tu contraseña, no puede entrar sin ese código.
          </p>
          <button onClick={empezar} disabled={ocupado}
            className="w-full h-12 rounded-xl bg-marca text-white font-semibold disabled:opacity-40 active:bg-marca-oscuro">
            {ocupado ? 'Preparando…' : 'Activar'}
          </button>
        </>
      )}

      {fase === 'activando' && nuevo && (
        <div className="space-y-3">
          <ol className="text-sm text-slate-600 space-y-1 list-decimal pl-5">
            <li>Instala en tu celular una app de autenticación (Google Authenticator, Microsoft Authenticator o Authy).</li>
            <li>Escanea este código QR con la app.</li>
            <li>Escribe aquí el código de 6 dígitos que te muestre.</li>
          </ol>
          <img src={qrComoImagen(nuevo.totp.qr_code)} alt="Código QR para tu app de autenticación"
               className="h-44 w-44 mx-auto rounded-xl border border-slate-200 bg-white p-2" />
          <div className="bg-slate-50 rounded-xl p-3 space-y-2">
            <p className="text-xs text-slate-500">¿No puedes escanear? Escribe esta clave en la app:</p>
            <div className="grid grid-cols-[1fr_auto] gap-2 items-center">
              <p className="font-mono text-sm break-all select-all" data-testid="clave-manual">{clavePorGrupos(nuevo.totp.secret)}</p>
              <button onClick={() => copiar(nuevo.totp.secret)}
                className="h-9 px-3 rounded-lg bg-lima/20 text-marca text-xs font-semibold min-w-[6.5rem]">
                {textoCopiar(copiado, 'Copiar clave')}
              </button>
            </div>
          </div>
          <input value={codigo} onChange={e => setCodigo(soloDigitos(e.target.value))}
                 onKeyDown={e => e.key === 'Enter' && confirmar()}
                 inputMode="numeric" autoComplete="one-time-code" placeholder="000000" aria-label="Código de 6 dígitos"
                 className={campoCodigo} />
          {error && <p role="alert" className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
          <div className="grid grid-cols-2 gap-3">
            <button onClick={cancelar} className="h-12 rounded-xl bg-slate-100 text-slate-600 font-medium">Cancelar</button>
            <button onClick={confirmar} disabled={ocupado || codigo.length !== 6}
              className="h-12 rounded-xl bg-marca text-white font-semibold disabled:opacity-40 active:bg-marca-oscuro">
              {ocupado ? 'Verificando…' : 'Confirmar'}
            </button>
          </div>
        </div>
      )}

      {(fase === 'activo' || fase === 'quitando') && (
        <div className="space-y-3">
          <p className="text-sm rounded-lg px-3 py-2 bg-esmeralda/10 text-esmeralda font-medium">✓ Activada en esta cuenta</p>
          <p className="text-xs text-slate-400">
            Si pierdes el celular, quien administre el proyecto en Supabase puede quitarte este paso para que vuelvas a entrar.
          </p>
          {fase === 'activo' ? (
            <button onClick={() => { setFase('quitando'); setCodigo(''); setError(''); setListo('') }}
              className="w-full h-11 rounded-xl bg-red-50 text-red-600 font-semibold active:bg-red-100">
              Desactivar
            </button>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-slate-500">Para desactivarla, escribe el código actual de tu app.</p>
              <input value={codigo} onChange={e => setCodigo(soloDigitos(e.target.value))}
                     onKeyDown={e => e.key === 'Enter' && quitar()}
                     inputMode="numeric" autoComplete="one-time-code" placeholder="000000" aria-label="Código de 6 dígitos"
                     className={campoCodigo} />
              {error && <p role="alert" className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
              <div className="grid grid-cols-2 gap-3">
                <button onClick={() => { setFase('activo'); setError('') }} className="h-12 rounded-xl bg-slate-100 text-slate-600 font-medium">Cancelar</button>
                <button onClick={quitar} disabled={ocupado || codigo.length !== 6}
                  className="h-12 rounded-xl bg-red-500 text-white font-semibold disabled:opacity-40 active:bg-red-600">
                  {ocupado ? 'Quitando…' : 'Desactivar'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {listo && <p role="status" className="text-sm text-esmeralda bg-esmeralda/10 rounded-lg px-3 py-2">{listo}</p>}
    </div>
  )
}
