// Opiniones de los clientes en el catálogo: estrellas + comentario. Entran con Google (una sola vez) y el dueño aprueba antes de publicar.
// En público solo se ve el nombre corto ("María P."), nunca correo ni teléfono.
import { useEffect, useState } from 'react'
import Icono from './Iconos'
import { supabase } from '../lib/supabase'
import { usePersistido } from '../lib/usePersistido'
import { claseInput } from '../lib/estilos'
import Modal from './Modal'

const VOLVER_COMENTAR = 'cibus-volver-a-comentar'
const NOMBRES = ['', 'Muy malo', 'Malo', 'Regular', 'Bueno', 'Excelente']
const fechaCorta = (iso) => new Date(iso).toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' })

export const Estrellas = ({ n, grande = false }) => (
  <span role="img" aria-label={`${n} de 5 estrellas`} className={`inline-flex gap-0.5 ${grande ? 'text-2xl' : 'text-lg'} leading-none`}>
    {[1, 2, 3, 4, 5].map(i => <span key={i} className={i <= Math.round(n) ? 'text-amber-500' : 'text-slate-300'} aria-hidden="true">★</span>)}
  </span>
)

export default function ComentariosTienda({ cuenta }) {
  const [resumen, setResumen] = useState(null)
  const [lista, setLista] = useState(null)
  const [ver, setVer] = useState(4)
  const [abierto, setAbierto] = useState(false)

  const cargar = () => {
    supabase.from('comentarios_resumen').select('*').maybeSingle().then(({ data, error }) => { if (!error && data) setResumen(data) })
    supabase.from('comentarios_publicos').select('*').order('creado_en', { ascending: false }).range(0, 29)
      .then(({ data, error }) => setLista(!error && Array.isArray(data) ? data : null))   // sin migracion-v39: no se muestra nada
  }
  useEffect(cargar, [])

  // Venía de entrar con Google para comentar: se reabre el formulario
  useEffect(() => {
    if (!cuenta.sesion) return
    try { if (sessionStorage.getItem(VOLVER_COMENTAR) === '1') { sessionStorage.removeItem(VOLVER_COMENTAR); setAbierto(true) } } catch { /* sin almacenamiento */ }
  }, [cuenta.sesion])

  if (lista === null) return <span id="opiniones" />                  // cargando o sin migracion-v39: no se muestra nada

  const total = resumen?.total ?? lista.length
  return (
    <section id="opiniones" className="scroll-mt-4 max-w-md sm:max-w-3xl lg:max-w-6xl mx-auto px-4 mt-12 space-y-4" aria-label="Opiniones de los clientes">
      <div className="text-center space-y-1">
        <h2 className="font-display text-xl text-champagne tracking-wide">Lo que dicen nuestros clientes</h2>
        {total > 0 ? (
          <p className="text-hueso/90 text-base flex items-center justify-center gap-2 flex-wrap">
            <span className="text-3xl font-bold text-champagne">{Number(resumen?.promedio ?? 0).toFixed(1)}</span>
            <Estrellas n={Number(resumen?.promedio ?? 0)} grande />
            <span>({total} {total === 1 ? 'opinión' : 'opiniones'})</span>
          </p>
        ) : <p className="text-hueso/80 text-base">Todavía no hay opiniones. ¡Sé la primera persona en opinar!</p>}
      </div>

      {lista.length > 0 && (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {lista.slice(0, ver).map(c => (
            <li key={c.id} className="bg-white rounded-2xl p-4 space-y-2 text-left">
              <div className="grid grid-cols-[1fr_auto] gap-2 items-center">
                <span className="font-semibold text-base text-slate-800 break-words">{c.nombre}</span>
                <Estrellas n={c.estrellas} />
              </div>
              {c.texto && <p className="text-base text-slate-700 break-words leading-snug">{c.texto}</p>}
              {c.respuesta && (
                <p className="text-sm rounded-xl bg-champagne/25 px-3 py-2 text-slate-700 break-words"><b>Respuesta de la tienda:</b> {c.respuesta}</p>
              )}
              <p className="text-sm text-slate-500">{fechaCorta(c.creado_en)}</p>
            </li>
          ))}
        </ul>
      )}
      {lista.length > ver && (
        <button onClick={() => setVer(v => v + 6)} className="w-full min-h-12 rounded-xl ring-1 ring-champagne/40 text-champagne text-base font-semibold active:bg-white/5">
          Ver más opiniones
        </button>
      )}
      {cuenta.googleActivo && (
        <button onClick={() => setAbierto(true)}
          className="w-full min-h-14 rounded-2xl bg-champagne text-negro text-lg font-semibold active:opacity-90">
          Dejar mi opinión
        </button>
      )}
      {abierto && <FormularioOpinion cuenta={cuenta} onCerrar={() => setAbierto(false)} onEnviado={cargar} />}
    </section>
  )
}

function FormularioOpinion({ cuenta, onCerrar, onEnviado }) {
  const [f, setF] = usePersistido('tienda:opinion', { estrellas: 0, texto: '' })
  const [acepta, setAcepta] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState('')
  const [hecho, setHecho] = useState(false)
  const [seguro, setSeguro] = useState(false)
  const nombre = String(cuenta.sesion?.user?.user_metadata?.full_name ?? cuenta.sesion?.user?.user_metadata?.name ?? '').split(' ')[0]

  const entrar = async () => {
    try { sessionStorage.setItem(VOLVER_COMENTAR, '1') } catch { /* sin almacenamiento */ }
    await cuenta.entrarConGoogle()
  }
  const enviar = async () => {
    if (!f.estrellas) return setError('Toca las estrellas para calificar')
    if (!acepta) return setError('Marca la casilla para que podamos publicar tu opinión')
    setEnviando(true); setError('')
    const { error: err } = await supabase.rpc('publicar_comentario', { p_estrellas: f.estrellas, p_texto: f.texto.trim(), p_acepta: true })
    setEnviando(false)
    if (err) return setError(err.message)
    setF({ estrellas: 0, texto: '' }); setHecho(true); onEnviado?.()
  }
  const borrar = async () => {
    const { error: err } = await supabase.rpc('borrar_mis_comentarios')
    setSeguro(false)
    if (err) return setError(err.message)
    setError(''); onEnviado?.(); setHecho('borrado')
  }

  return (
    <Modal titulo="Tu opinión" onCerrar={onCerrar}>
      {hecho ? (
        <div className="space-y-4 text-center py-2">
          <span className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-cibus-profundo text-champagne ring-2 ring-champagne/70" aria-hidden="true"><Icono nombre="check" className="h-9 w-9" /></span>
          <p className="text-xl font-semibold text-slate-800">{hecho === 'borrado' ? 'Listo, borramos tus opiniones' : '¡Gracias por tu opinión!'}</p>
          {hecho !== 'borrado' && <p className="text-base text-slate-600">La tienda la revisa y en poco tiempo la verás publicada.</p>}
          <button onClick={onCerrar} className="w-full h-14 rounded-xl bg-negro text-champagne text-lg font-semibold active:opacity-90">Cerrar</button>
        </div>
      ) : !cuenta.sesion ? (
        <div className="space-y-4">
          <p className="text-lg text-slate-800 font-semibold">Para dejar tu opinión, entra con Google</p>
          <p className="text-base text-slate-600">Es rápido y se hace una sola vez. Así evitamos opiniones falsas. Solo se verá tu nombre y la inicial del apellido.</p>
          {cuenta.error && <p className="text-base text-red-600 bg-red-50 rounded-lg px-3 py-2 break-words">{cuenta.error}</p>}
          <button onClick={entrar} className="w-full min-h-14 rounded-xl bg-negro text-champagne text-lg font-semibold active:opacity-90">Continuar con Google</button>
          <button onClick={onCerrar} className="w-full h-12 rounded-xl bg-slate-100 text-slate-600 text-base font-medium active:bg-slate-200">← Volver</button>
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-lg text-slate-800 font-semibold">{nombre ? `Hola, ${nombre}. ` : ''}¿Cómo te fue con nosotros?</p>
          <div>
            <div className="grid grid-cols-5 gap-2" role="radiogroup" aria-label="Calificación">
              {[1, 2, 3, 4, 5].map(i => (
                <button key={i} role="radio" aria-checked={f.estrellas === i} aria-label={`${i} ${i === 1 ? 'estrella' : 'estrellas'}: ${NOMBRES[i]}`}
                  onClick={() => { setF(p => ({ ...p, estrellas: i })); setError('') }}
                  className={`h-16 rounded-xl text-4xl leading-none ${i <= f.estrellas ? 'bg-amber-50 text-amber-500 ring-2 ring-amber-400' : 'bg-slate-100 text-slate-300'}`}>★</button>
              ))}
            </div>
            <p className="text-center text-lg font-semibold text-slate-700 mt-2 min-h-7">{NOMBRES[f.estrellas]}</p>
          </div>
          <label className="block space-y-1">
            <span className="text-base font-medium text-slate-700">Cuéntanos más (opcional)</span>
            <textarea value={f.texto} onChange={e => setF(p => ({ ...p, texto: e.target.value.slice(0, 300) }))} rows={4}
              placeholder="Ej. Muy buena atención y el domicilio llegó rápido" className={`${claseInput} h-auto py-3 text-base`} />
            <span className="block text-sm text-slate-500 text-right">{f.texto.length}/300</span>
          </label>
          <label className="grid grid-cols-[1.75rem_1fr] gap-3 items-start text-base text-slate-700 leading-snug">
            <input type="checkbox" checked={acepta} onChange={e => { setAcepta(e.target.checked); setError('') }} className="h-7 w-7 accent-[#0b0b0b]" />
            <span>Acepto que se publique mi nombre (por ejemplo «María P.») y mi opinión.</span>
          </label>
          {error && <p className="text-base text-red-600 bg-red-50 rounded-lg px-3 py-2 break-words">{error}</p>}
          <div className="grid grid-cols-[auto_1fr] gap-3">
            <button onClick={onCerrar} className="h-14 px-5 rounded-xl bg-slate-100 text-slate-600 text-base font-medium active:bg-slate-200">← Volver</button>
            <button onClick={enviar} disabled={enviando} className="h-14 rounded-xl bg-negro text-champagne text-lg font-semibold active:opacity-90 disabled:opacity-60">
              {enviando ? 'Enviando…' : 'Enviar mi opinión'}
            </button>
          </div>
          {!seguro
            ? <button onClick={() => setSeguro(true)} className="w-full text-sm text-slate-500 underline">Borrar mis opiniones anteriores</button>
            : (
              <div className="rounded-xl bg-red-50 p-3 space-y-2">
                <p className="text-base text-red-700">Se borran todas tus opiniones de esta tienda. ¿Seguro?</p>
                <div className="grid grid-cols-2 gap-2">
                  <button onClick={() => setSeguro(false)} className="h-12 rounded-xl bg-white ring-1 ring-slate-200 text-slate-700 text-base font-medium">No</button>
                  <button onClick={borrar} className="h-12 rounded-xl bg-red-600 text-white text-base font-semibold">Sí, borrar</button>
                </div>
              </div>
            )}
        </div>
      )}
    </Modal>
  )
}
