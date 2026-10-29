// Registro del cliente en pasos, una sola vez: 1) entrar con Google · 2) sus datos · 3) cómo recibe (domicilio con su puerta en el mapa, o recoger).
// Al terminar todo queda guardado: en las próximas compras no escribe ni marca nada. Cada paso tiene su «Volver».
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { claseInput } from '../lib/estilos'
import { Campo } from './Modal'
import CarritoCorriendo from './CarritoCorriendo'
import LogoTienda from './LogoTienda'
import AvatarCliente from './AvatarCliente'
import BotonGoogle from './BotonGoogle'
import UbicacionCliente from './UbicacionCliente'
import Icono from './Iconos'
import { slugActual } from '../lib/enlaces'
import { primerNombre, fotoDeGoogle, validarDatosRegistro, validarEntrega, textoEntrega } from '../lib/cuentaVista'
import { telefono10 } from '../lib/datosCliente'

const BENEFICIOS = [
  ['rapido', 'Pides en un toque', 'Tus datos ya están: solo confirmas.'],
  ['pin', 'El domicilio se calcula solo', 'Marcas tu puerta una vez y listo.'],
  ['ventas', 'Ves tus últimas compras', 'Y repites un pedido con un toque.'],
]

export default function RegistroCliente({ cuenta, n, pasoInicial = 0, onCerrar, onTerminado }) {
  const { sesion, googleActivo, entrarConGoogle, salir, guardar } = cuenta
  const meta = sesion?.user?.user_metadata ?? {}
  const [paso, setPaso] = useState(sesion ? Math.max(1, pasoInicial) : 0)
  const [datos, setDatos] = useState({ nombre: meta.full_name || meta.name || '', telefono: '', acepta_datos: false, acepta_promos: false })
  const [entrega, setEntrega] = useState('domicilio')
  const [ubic, setUbic] = useState(null)               // { direccion, lat, lng } ya confirmada
  const [cambiando, setCambiando] = useState(false)
  const [referencia, setReferencia] = useState('')
  const [error, setError] = useState('')
  const [guardando, setGuardando] = useState(false)
  useEffect(() => { if (!sesion && paso > 0 && paso < 3) setPaso(0) }, [sesion]) // eslint-disable-line react-hooks/exhaustive-deps
  const poner = (k) => (e) => { setDatos(d => ({ ...d, [k]: e.target.value })); setError('') }
  const marcar = (k) => (e) => setDatos(d => ({ ...d, [k]: e.target.checked }))
  const slug = slugActual()
  const foto = fotoDeGoogle(sesion)

  const alPaso2 = () => {
    const falla = validarDatosRegistro(datos)
    if (falla) return setError(falla)
    setError(''); setPaso(2)
  }

  const terminar = async () => {
    const falla = validarEntrega({ entrega, ...ubic })
    if (falla) return setError(falla)
    setGuardando(true); setError('')
    const domicilio = entrega === 'domicilio'
    const r = await guardar({
      nombre: datos.nombre.trim(), telefono: telefono10(datos.telefono), email: sesion?.user?.email ?? '',
      direccion: domicilio ? ubic.direccion : '', lat: domicilio ? ubic.lat : null, lng: domicilio ? ubic.lng : null,
      referencia: domicilio ? referencia.trim() : '', entrega_preferida: entrega,
      acepta_datos: true, acepta_promos: datos.acepta_promos,
    })
    setGuardando(false)
    if (r) setPaso(3)
  }

  const volver = () => { setError(''); setCambiando(false); setPaso(p => Math.max(1, p - 1)) }

  return createPortal(
    <div className="fixed inset-0 z-[80] bg-hueso overflow-y-auto overscroll-contain" role="dialog" aria-modal="true" aria-label="Registro de cliente">
      <div className="min-h-full max-w-md mx-auto flex flex-col bg-hueso">
        <header className="relative bg-gradient-to-b from-cibus-profundo to-cibus-oscuro px-4 pt-[calc(1rem+env(safe-area-inset-top))] text-center">
          <button onClick={onCerrar} aria-label="Cerrar" className="absolute right-3 top-[calc(0.75rem+env(safe-area-inset-top))] h-10 w-10 rounded-full bg-white/10 text-champagne active:bg-white/20">✕</button>
          <LogoTienda n={n} tam={60} />
          <p className="mt-2 font-display text-2xl font-semibold text-champagne leading-tight break-words">{n?.nombre}</p>
          <CarritoCorriendo modo={paso === 3 ? 'llega' : 'corre'} alto={76} />
        </header>

        <main className="flex-1 p-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] space-y-4">
          {paso < 3 && (
            <div className="space-y-1.5">
              <ol className="grid grid-cols-3 gap-1.5" aria-label={`Paso ${paso + 1} de 3`}>
                {[0, 1, 2].map(i => <li key={i} className={`h-1.5 rounded-full ${i <= paso ? 'bg-oro' : 'bg-slate-200'}`} />)}
              </ol>
              <p className="text-sm text-slate-500">Paso {paso + 1} de 3</p>
            </div>
          )}

          {paso === 0 && (
            <section className="space-y-4">
              <h2 className="font-display text-3xl font-semibold text-negro leading-tight">Regístrate una sola vez</h2>
              <p className="text-base text-slate-600">Guardamos tu nombre, tu dirección y el punto exacto de tu casa. Cuando vuelvas no escribes nada más.</p>
              <ul className="space-y-2">
                {BENEFICIOS.map(([ic, t, d]) => (
                  <li key={t} className="grid grid-cols-[auto_1fr] gap-3 items-center rounded-2xl bg-white ring-1 ring-slate-200 p-3">
                    <span className="grid h-11 w-11 place-items-center rounded-xl bg-cibus-profundo text-champagne"><Icono nombre={ic} className="h-6 w-6" /></span>
                    <span className="min-w-0"><span className="block text-base font-semibold text-slate-800">{t}</span><span className="block text-sm text-slate-500">{d}</span></span>
                  </li>
                ))}
              </ul>
              {googleActivo === false ? (
                <p className="text-base rounded-xl px-3 py-3 bg-champagne/30 text-negro">El registro con Google todavía no está disponible en esta tienda. Puedes comprar sin cuenta.</p>
              ) : (
                <div className="space-y-2">
                  <BotonGoogle disabled={googleActivo !== true} onClick={() => entrarConGoogle({ registro: true })}>Registrarme con Google</BotonGoogle>
                  <button type="button" onClick={() => entrarConGoogle({ registro: true })} disabled={googleActivo !== true}
                    className="w-full min-h-12 rounded-xl text-base font-semibold text-oro-oscuro underline disabled:opacity-50">Ya tengo cuenta · Entrar</button>
                </div>
              )}
              {cuenta.error && <p className="text-base text-red-600 bg-red-50 rounded-lg px-3 py-2 break-words">{cuenta.error}</p>}
              <p className="text-sm text-slate-500">Usamos tu cuenta de Google solo para reconocerte. No publicamos nada y puedes borrar tus datos cuando quieras.</p>
              <button type="button" onClick={onCerrar} className="w-full min-h-12 rounded-xl bg-slate-100 text-slate-600 text-base font-medium active:bg-slate-200">← Volver a la tienda</button>
            </section>
          )}

          {paso === 1 && (
            <section className="space-y-4">
              <h2 className="font-display text-3xl font-semibold text-negro leading-tight">Tus datos</h2>
              <div className="grid grid-cols-[auto_1fr_auto] gap-3 items-center rounded-2xl bg-white ring-1 ring-slate-200 p-3">
                <AvatarCliente nombre={datos.nombre} foto={foto} tam={44} />
                <span className="min-w-0"><span className="block text-sm text-slate-500">Cuenta de Google</span><span className="block text-base font-medium break-words">{sesion?.user?.email}</span></span>
                <button type="button" onClick={salir} className="min-h-11 px-3 rounded-xl bg-slate-100 text-slate-600 text-sm font-medium active:bg-slate-200">Cambiar</button>
              </div>
              <Campo etiqueta="Nombre completo *">
                <input value={datos.nombre} onChange={poner('nombre')} maxLength={80} autoComplete="name" placeholder="Ana Pérez" className={claseInput} />
              </Campo>
              <Campo etiqueta="Celular / WhatsApp *">
                <input value={datos.telefono} onChange={poner('telefono')} maxLength={20} inputMode="tel" autoComplete="tel" placeholder="300 123 4567" className={claseInput} />
              </Campo>
              <label className="grid grid-cols-[1.5rem_1fr] gap-3 items-start text-sm text-slate-700 leading-snug">
                <input type="checkbox" checked={datos.acepta_datos} onChange={marcar('acepta_datos')} className="h-6 w-6 mt-0.5 accent-[#0b0b0b]" />
                <span>Autorizo el tratamiento de mis datos personales para gestionar mis pedidos, según la{' '}
                  <a href="/privacidad" target="_blank" rel="noopener noreferrer" className="underline font-medium text-oro-oscuro">política de tratamiento de datos</a>
                  {' '}y los <a href="/terminos" target="_blank" rel="noopener noreferrer" className="underline font-medium text-oro-oscuro">términos</a>. *</span>
              </label>
              <label className="grid grid-cols-[1.5rem_1fr] gap-3 items-start text-sm text-slate-700 leading-snug">
                <input type="checkbox" checked={datos.acepta_promos} onChange={marcar('acepta_promos')} className="h-6 w-6 mt-0.5 accent-[#0b0b0b]" />
                <span>Quiero recibir promociones y novedades (opcional; puedes retirarte cuando quieras).</span>
              </label>
              {error && <p role="alert" className="text-base text-red-600 bg-red-50 rounded-lg px-3 py-2 break-words">{error}</p>}
              <div className="grid grid-cols-[auto_1fr] gap-3">
                <button type="button" onClick={onCerrar} className="h-14 px-5 rounded-xl bg-slate-100 text-slate-600 font-medium active:bg-slate-200">← Volver</button>
                <button type="button" onClick={alPaso2} className="h-14 rounded-xl bg-negro text-champagne text-lg font-semibold active:opacity-90">Siguiente</button>
              </div>
            </section>
          )}

          {paso === 2 && (
            <section className="space-y-4">
              <h2 className="font-display text-3xl font-semibold text-negro leading-tight">¿Cómo recibes tus pedidos?</h2>
              <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Cómo recibes tus pedidos">
                {[['domicilio', 'moto', 'A domicilio'], ['recoger', 'negocio', 'Recojo en la tienda']].map(([v, ic, t]) => (
                  <button key={v} type="button" role="radio" aria-checked={entrega === v} onClick={() => { setEntrega(v); setError('') }}
                    className={`min-h-20 rounded-2xl p-3 grid justify-items-center content-center gap-1 text-center text-base font-semibold leading-tight ring-2 ${entrega === v ? 'bg-cibus-profundo text-champagne ring-oro' : 'bg-white text-slate-700 ring-slate-200'}`}>
                    <Icono nombre={ic} className="h-7 w-7" /><span>{t}</span>
                  </button>
                ))}
              </div>

              {entrega === 'domicilio' && (
                ubic && !cambiando ? (
                  <div className="space-y-3">
                    <div className="rounded-2xl border-2 border-emerald-300 bg-emerald-50 p-4 space-y-1">
                      <p className="grid grid-cols-[auto_1fr] gap-2 items-center text-lg font-bold text-emerald-900"><Icono nombre="check" className="h-6 w-6" />Ubicación guardada</p>
                      <p className="text-base break-words">{ubic.direccion}</p>
                      <button type="button" onClick={() => setCambiando(true)} className="min-h-11 text-base font-semibold text-oro-oscuro underline">Cambiar mi ubicación</button>
                    </div>
                    <Campo etiqueta="Referencia para el domicilio (opcional)">
                      <input value={referencia} onChange={e => setReferencia(e.target.value)} maxLength={120} placeholder="Torre 2, apto 301 · timbre · portón verde" className={claseInput} />
                    </Campo>
                  </div>
                ) : (
                  <UbicacionCliente slug={slug} inicial={ubic} etiquetaBoton="Confirmar mi ubicación"
                    onConfirmar={(u) => { setUbic(u); setCambiando(false); setError('') }} />
                )
              )}
              {entrega === 'recoger' && (
                <p className="text-base rounded-2xl bg-champagne/20 px-4 py-3 text-slate-700"><b className="text-negro">Recoges en la tienda.</b> No necesitamos tu dirección. Si algún día quieres domicilio, la agregas desde Mi cuenta.</p>
              )}

              {error && <p role="alert" className="text-base text-red-600 bg-red-50 rounded-lg px-3 py-2 break-words">{error}</p>}
              {cuenta.error && <p role="alert" className="text-base text-red-600 bg-red-50 rounded-lg px-3 py-2 break-words">{cuenta.error}</p>}
              <div className="grid grid-cols-[auto_1fr] gap-3">
                <button type="button" onClick={volver} className="h-14 px-5 rounded-xl bg-slate-100 text-slate-600 font-medium active:bg-slate-200">← Volver</button>
                <button type="button" onClick={terminar} disabled={guardando || (entrega === 'domicilio' && !ubic)}
                  className="h-14 rounded-xl bg-negro text-champagne text-base font-semibold px-2 disabled:opacity-40 active:opacity-90">{guardando ? 'Guardando…' : 'Guardar y terminar'}</button>
              </div>
            </section>
          )}

          {paso === 3 && (
            <section className="space-y-4 text-center">
              <h2 className="font-display text-3xl font-semibold text-negro leading-tight">¡Listo, {primerNombre(datos.nombre)}!</h2>
              <p className="text-base text-slate-600">Tu registro quedó guardado. Desde ahora entras, eliges tus productos y confirmas: no vuelves a escribir tus datos.</p>
              <div className="grid grid-cols-[auto_1fr] gap-3 items-center text-left rounded-2xl bg-white ring-1 ring-slate-200 p-3">
                <AvatarCliente nombre={datos.nombre} foto={foto} tam={48} />
                <span className="min-w-0">
                  <span className="block text-base font-semibold break-words">{datos.nombre.trim()}</span>
                  <span className="block text-sm text-slate-500">{telefono10(datos.telefono)}</span>
                  <span className="grid grid-cols-[auto_1fr] gap-1.5 items-start text-sm text-slate-600 pt-0.5"><Icono nombre="pin" className="h-4 w-4 mt-0.5" /><span className="break-words">{textoEntrega({ entrega_preferida: entrega, direccion: ubic?.direccion })}</span></span>
                </span>
              </div>
              <button type="button" onClick={onTerminado} className="w-full h-14 rounded-xl bg-negro text-champagne text-lg font-semibold active:opacity-90">Empezar a comprar</button>
            </section>
          )}
        </main>
      </div>
    </div>,
    document.body)
}
