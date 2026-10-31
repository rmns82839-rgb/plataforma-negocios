// Registro de un negocio nuevo: qué vende, qué plan, sus datos y enviar. No crea la tienda: el equipo la revisa y la aprueba.
// Pasos (siempre con «Volver»): 1 qué vendes · 2 tus datos · 3 plan, revisar y enviar.
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { ir } from '../lib/ruta'
import { Btn, Aviso, Campo, clsInput, BarraFija, PiePlataforma } from '../tienda/ui'
import MarcaMatriz from '../tienda/MarcaMatriz'
import SelectorCiudad from '../tienda/SelectorCiudad'
import { TIPOS_NEGOCIO, validarSolicitud, precioTexto, soloCelular } from '../lib/solicitud'

const PASOS = ['tipo', 'datos', 'revisar']
const TITULO = { tipo: '¿Qué vendes?', plan: 'Elige tu plan', datos: 'Cuéntanos de tu negocio', revisar: 'Tu plan y envío' }

function OpcionTipo({ t, activo, onClick }) {
  return (
    <button type="button" role="radio" aria-checked={activo} onClick={onClick}
      className={`flex min-h-[132px] flex-col items-start justify-between gap-2 rounded-2xl border-2 p-4 text-left transition active:scale-[0.99] ${activo ? 'border-principal bg-principal/5 ring-2 ring-principal' : 'border-black/10 bg-white'}`}>
      <img src={t.imagen} alt="" width="64" height="64" className="h-16 w-16 object-contain" />
      <span className="block">
        <span className="block break-words text-xl font-bold leading-tight">{t.nombre}</span>
        <span className="block break-words text-base leading-snug text-tinta/70">{t.ejemplos}</span>
      </span>
    </button>
  )
}

function TarjetaPlan({ p, activo, onClick, recomendado = false }) {
  const pr = precioTexto(p)
  return (
    <button type="button" role="radio" aria-checked={activo} onClick={onClick}
      className={`w-full rounded-2xl border-2 p-4 text-left transition active:scale-[0.99] ${activo ? 'border-principal bg-principal/5 ring-2 ring-principal' : 'border-black/10 bg-white'}`}>
      <span className="grid grid-cols-[1fr_auto] items-start gap-3">
        <span className="min-w-0">
          {recomendado && <span className="mb-1 inline-block rounded-full bg-champagne px-3 py-0.5 text-sm font-bold text-negro">Recomendado</span>}
          <span className="block break-words text-2xl font-bold leading-tight">{p.nombre}</span>
          {p.descripcion && <span className="mt-1 block break-words text-base leading-snug text-tinta/70">{p.descripcion}</span>}
        </span>
        <span className={`flex h-8 w-8 items-center justify-center rounded-full border-2 text-lg font-bold ${activo ? 'border-principal bg-principal text-white' : 'border-black/20 text-transparent'}`} aria-hidden="true">✓</span>
      </span>
      <span className="mt-3 block">
        <span className="block text-2xl font-bold text-principal">{pr.principal}</span>
        {pr.detalle && <span className="block text-base leading-snug text-tinta/70">{pr.detalle}</span>}
      </span>
      <span className="mt-3 block border-t border-black/10 pt-3 text-base leading-snug text-tinta/80">
        <span className="block font-semibold">Incluye</span>
        <span className="mt-1 block break-words">
          {p.max_productos ? `Hasta ${p.max_productos.toLocaleString('es-CO')} productos` : 'Productos sin límite'}
          {p.modulos?.length > 0 && ` · ${p.modulos.join(' · ')}`}
        </span>
      </span>
    </button>
  )
}

export default function Registro() {
  const [paso, setPaso] = useState('tipo')
  const [planes, setPlanes] = useState(null)
  const [errorPlanes, setErrorPlanes] = useState('')
  const [f, setF] = useState({ tipo: '', plan: '', nombre_negocio: '', ciudad: '', nombre_contacto: '', email: '', telefono: '', mensaje: '', acepta: false, sitio_web: '' })
  const [errores, setErrores] = useState({})
  const [error, setError] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [listo, setListo] = useState(null)       // { repetida }

  useEffect(() => {
    supabase.rpc('planes_publicos').then(({ data, error: e }) => {
      if (e || !Array.isArray(data) || data.length === 0) { setErrorPlanes('No pudimos cargar los planes. Revisa tu conexión e intenta de nuevo.'); return }
      setPlanes(data)
      setF((x) => (x.plan ? x : { ...x, plan: (data.find((p) => p.clave === 'gestion') || data.find((p) => p.clave !== 'vitrina') || data[0]).clave }))
    })
  }, [])
  useEffect(() => { window.scrollTo(0, 0) }, [paso, listo])

  const set = (k, v) => { setF((x) => ({ ...x, [k]: v })); setErrores((e) => ({ ...e, [k]: undefined })); setError('') }
  const planElegido = useMemo(() => planes?.find((p) => p.clave === f.plan), [planes, f.plan])
  const indice = PASOS.indexOf(paso)

  function seguir() {
    const v = validarSolicitud(f, paso)
    if (Object.keys(v).length) { setErrores(v); setError(v._general || ''); return }
    setErrores({}); setPaso(PASOS[indice + 1])
  }
  function volver() { if (indice === 0) ir('/'); else setPaso(PASOS[indice - 1]) }

  async function enviar() {
    const v = validarSolicitud(f, 'revisar')
    if (Object.keys(v).length) { setErrores(v); setError(v._general || 'Revisa los datos'); return }
    if (f.sitio_web) { setListo({ repetida: false }); return }            // campo trampa para robots: se hace como que salió bien
    setEnviando(true); setError('')
    const { data, error: e } = await supabase.rpc('enviar_solicitud_negocio', {
      p_datos: { tipo: f.tipo, plan: f.plan, nombre_negocio: f.nombre_negocio, ciudad: f.ciudad, nombre_contacto: f.nombre_contacto, email: f.email, telefono: f.telefono, mensaje: f.mensaje, acepta_datos: f.acepta },
    })
    setEnviando(false)
    if (e) { setError(e.message || 'No pudimos enviar la solicitud. Intenta de nuevo.'); return }
    setListo({ repetida: Boolean(data?.repetida) })
  }

  if (listo) {
    return (
      <main className="mx-auto w-full max-w-xl px-4 py-10 text-lg">
        <div className="mb-8"><MarcaMatriz /></div>
        <div className="space-y-4 rounded-2xl border-2 border-green-300 bg-green-50 p-5 text-green-950">
          <p className="text-4xl" aria-hidden="true">✅</p>
          <h1 className="break-words text-3xl font-bold leading-tight">{listo.repetida ? 'Ya teníamos tu solicitud' : '¡Recibimos tu solicitud!'}</h1>
          <p className="leading-snug">Revisaremos los datos de <b className="break-words">{f.nombre_negocio}</b> y te escribiremos al celular <b>{soloCelular(f.telefono)}</b> o al correo <b className="break-words">{f.email}</b> en los próximos días.</p>
          <p className="leading-snug">Cuando tu tienda esté lista, entra con el correo que escribiste (con Google) y la verás en «Mis tiendas».</p>
        </div>
        <div className="mt-6"><Btn onClick={() => ir('/')}>← Volver al inicio</Btn></div>
        <PiePlataforma />
      </main>
    )
  }

  return (
    <main className="mx-auto w-full max-w-xl px-4 pb-44 pt-8 text-lg">
      <div className="mb-6"><MarcaMatriz /></div>
      <p className="mb-1 text-base font-semibold uppercase tracking-wide text-principal">Paso {indice + 1} de {PASOS.length}</p>
      <div className="mb-4 grid gap-1.5" style={{ gridTemplateColumns: `repeat(${PASOS.length}, minmax(0, 1fr))` }} aria-hidden="true">
        {PASOS.map((p, i) => <span key={p} className={`h-2 rounded-full ${i <= indice ? 'bg-principal' : 'bg-black/10'}`} />)}
      </div>
      <h1 className="mb-5 break-words text-3xl font-bold leading-tight">{TITULO[paso]}</h1>

      {paso === 'tipo' && (
        <div role="radiogroup" aria-label="Qué vendes" className="grid grid-cols-2 gap-3">
          {TIPOS_NEGOCIO.map((t) => <OpcionTipo key={t.clave} t={t} activo={f.tipo === t.clave} onClick={() => set('tipo', t.clave)} />)}
        </div>
      )}
      {paso === 'tipo' && errores.tipo && <p className="mt-3 text-base font-semibold text-red-700">{errores.tipo}</p>}

      {paso === 'datos' && (
        <div className="space-y-5">
          <Campo etiqueta="Nombre de tu negocio" error={errores.nombre_negocio}>
            <input value={f.nombre_negocio} onChange={(e) => set('nombre_negocio', e.target.value)} maxLength={120} autoComplete="organization" className={clsInput} />
          </Campo>
          <Campo etiqueta="Ciudad" error={errores.ciudad}>
            <SelectorCiudad value={f.ciudad} onChange={(v) => set('ciudad', v)} className={clsInput} />
          </Campo>
          <Campo etiqueta="Tu nombre completo" error={errores.nombre_contacto}>
            <input value={f.nombre_contacto} onChange={(e) => set('nombre_contacto', e.target.value)} maxLength={80} autoComplete="name" className={clsInput} />
          </Campo>
          <Campo etiqueta="Tu celular (WhatsApp)" error={errores.telefono} ayuda="10 dígitos, por ejemplo 300 123 4567">
            <input value={f.telefono} onChange={(e) => set('telefono', e.target.value)} inputMode="tel" autoComplete="tel" maxLength={20} className={clsInput} />
          </Campo>
          <Campo etiqueta="Tu correo" error={errores.email} ayuda="Con este correo entrarás a tu tienda (de preferencia uno de Google)">
            <input type="email" value={f.email} onChange={(e) => set('email', e.target.value)} inputMode="email" autoComplete="email" maxLength={120} className={clsInput} />
          </Campo>
          <Campo etiqueta="¿Algo que quieras contarnos? (opcional)" error={errores.mensaje} ayuda={`${f.mensaje.length}/300`}>
            <textarea value={f.mensaje} onChange={(e) => set('mensaje', e.target.value)} maxLength={300} rows={3} className={`${clsInput} py-3`} />
          </Campo>
          <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
            <label>No llenar este campo<input tabIndex={-1} autoComplete="off" value={f.sitio_web} onChange={(e) => set('sitio_web', e.target.value)} /></label>
          </div>
        </div>
      )}

      {paso === 'revisar' && (
        <div className="space-y-4">
      <div role="radiogroup" aria-label="Plan" className="space-y-3">
            {errorPlanes && <Aviso tipo="error">{errorPlanes}</Aviso>}
            {!planes && !errorPlanes && <p className="py-10 text-center text-xl text-tinta/60">Cargando planes…</p>}
            {planes?.filter((p) => p.clave !== 'vitrina').map((p) => <TarjetaPlan key={p.clave} p={p} activo={f.plan === p.clave} onClick={() => set('plan', p.clave)} recomendado={p.clave === 'gestion'} />)}
            {planes?.filter((p) => p.clave === 'vitrina').map((p) => (
              <button key={p.clave} type="button" role="radio" aria-checked={f.plan === p.clave} onClick={() => set('plan', p.clave)}
                className={`w-full rounded-xl border px-4 py-3 text-left text-base leading-snug ${f.plan === p.clave ? 'border-principal bg-principal/5 font-semibold text-principal' : 'border-black/10 text-tinta/60'}`}>
                {f.plan === p.clave ? '✓ ' : ''}¿Solo quieres probar? Empieza con una <b>vitrina gratis</b>: tu catálogo y pedidos por WhatsApp, hasta {p.max_productos?.toLocaleString('es-CO') || 200} productos.
              </button>
            ))}
            {planes && <p className="text-base leading-snug text-tinta/60">El plan se puede cambiar después. Los precios de lanzamiento son por tiempo limitado.</p>}
          </div>
          <dl className="space-y-3 rounded-2xl border-2 border-black/5 bg-white p-4">
            {[
              ['Vendes', TIPOS_NEGOCIO.find((t) => t.clave === f.tipo)?.nombre],
              ['Plan', planElegido ? `${planElegido.nombre} · ${precioTexto(planElegido).principal}` : f.plan],
              ['Negocio', f.nombre_negocio], ['Ciudad', f.ciudad], ['Tu nombre', f.nombre_contacto],
              ['Celular', soloCelular(f.telefono)], ['Correo', f.email], ...(f.mensaje ? [['Mensaje', f.mensaje]] : []),
            ].map(([k, v]) => (
              <div key={k} className="grid grid-cols-[7rem_1fr] gap-3">
                <dt className="text-base text-tinta/60">{k}</dt>
                <dd className="break-words font-semibold">{v}</dd>
              </div>
            ))}
          </dl>
          <label className="flex items-start gap-3 rounded-2xl border-2 border-black/10 bg-white p-4">
            <input type="checkbox" checked={f.acepta} onChange={(e) => set('acepta', e.target.checked)} className="mt-1 h-7 w-7 shrink-0 accent-principal" />
            <span className="text-base leading-snug">Autorizo a Matriz a usar estos datos para contactarme y crear mi tienda, según la <a href="/privacidad" target="_blank" rel="noopener" className="font-semibold underline">política de datos personales</a> (Ley 1581 de 2012) y los <a href="/terminos" target="_blank" rel="noopener" className="font-semibold underline">términos</a>.</span>
          </label>
          {errores.acepta && <p className="text-base font-semibold text-red-700">{errores.acepta}</p>}
        </div>
      )}

      {error && <div className="mt-4"><Aviso tipo="error">{error}</Aviso></div>}

      <BarraFija>
        <div className="grid grid-cols-2 gap-3">
          <Btn variante="suave" type="button" onClick={volver} disabled={enviando}>← Volver</Btn>
          {paso === 'revisar'
            ? <Btn type="button" onClick={enviar} disabled={enviando}>{enviando ? 'Enviando…' : 'Enviar solicitud'}</Btn>
            : <Btn type="button" onClick={seguir} disabled={false}>Continuar</Btn>}
        </div>
      </BarraFija>
    </main>
  )
}
