// Bandeja del administrador de la plataforma: solicitudes de negocios nuevos. Aprobar crea la tienda (sin publicar) y deja al dueño invitado.
import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useSesion } from '../lib/sesion'
import { ir } from '../lib/ruta'
import { Btn, Aviso, Campo, clsInput, PiePlataforma } from '../tienda/ui'
import MarcaMatriz from '../tienda/MarcaMatriz'
import Login from './Login'
import { Cargando } from './Piezas'
import { NOMBRE_TIPO, slugSugerido, slugValido, enlaceAviso, soloCelular } from '../lib/solicitud'

const ESTADOS = [['pendiente', 'Pendientes'], ['aprobada', 'Aprobadas'], ['rechazada', 'Rechazadas']]
const fecha = (iso) => new Date(iso).toLocaleString('es-CO', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })

function Dato({ k, children }) {
  return (
    <div className="grid grid-cols-[6.5rem_1fr] gap-3">
      <dt className="text-base text-tinta/60">{k}</dt>
      <dd className="min-w-0 break-words font-semibold">{children}</dd>
    </div>
  )
}

function Tarjeta({ s, planes, alResolver }) {
  const [modo, setModo] = useState(null)            // null | 'aprobar' | 'rechazar'
  const [slug, setSlug] = useState(s.slug_sugerido || slugSugerido(s.nombre_negocio))
  const [plan, setPlan] = useState(s.plan)
  const [nota, setNota] = useState('')
  const [error, setError] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [hecho, setHecho] = useState(null)          // { aprobada, slug }
  const base = window.location.origin
  const datos = { telefono: s.telefono, nombre_contacto: s.nombre_contacto, nombre_negocio: s.nombre_negocio, email: s.email }

  async function aprobar() {
    if (!slugValido(slug)) { setError('La dirección debe tener letras minúsculas, números o guiones (3 a 40 caracteres)'); return }
    setOcupado(true); setError('')
    const { data, error: e } = await supabase.rpc('aprobar_solicitud_negocio', { p_id: s.id, p_slug: slug, p_plan: plan })
    setOcupado(false)
    if (e) { setError(e.message); return }
    setHecho({ aprobada: true, slug: data?.slug || slug })
  }
  async function rechazar() {
    setOcupado(true); setError('')
    const { error: e } = await supabase.rpc('rechazar_solicitud_negocio', { p_id: s.id, p_nota: nota })
    setOcupado(false)
    if (e) { setError(e.message); return }
    setHecho({ aprobada: false, nota })
  }

  return (
    <article className="space-y-4 rounded-2xl border-2 border-black/5 bg-white p-4 shadow-sm">
      <header className="space-y-1">
        <h2 className="break-words text-2xl font-bold leading-tight">{s.nombre_negocio}</h2>
        <p className="text-base text-tinta/60">Enviada el {fecha(s.creado_en)}</p>
      </header>
      <dl className="space-y-2">
        <Dato k="Vende">{NOMBRE_TIPO[s.tipo] || s.tipo}</Dato>
        <Dato k="Plan">{s.plan_nombre}</Dato>
        <Dato k="Ciudad">{s.ciudad}</Dato>
        <Dato k="Contacto">{s.nombre_contacto}</Dato>
        <Dato k="Celular"><a className="text-principal underline" href={`https://wa.me/57${soloCelular(s.telefono)}`} target="_blank" rel="noreferrer">{soloCelular(s.telefono)}</a></Dato>
        <Dato k="Correo">{s.email}</Dato>
        {s.mensaje && <Dato k="Mensaje">{s.mensaje}</Dato>}
        {s.estado === 'aprobada' && s.slug_creado && <Dato k="Tienda"><a className="text-principal underline" href={`/t/${s.slug_creado}`}>/t/{s.slug_creado}</a></Dato>}
        {s.estado === 'rechazada' && s.nota_equipo && <Dato k="Motivo">{s.nota_equipo}</Dato>}
      </dl>

      {hecho && (
        <div className="space-y-3">
          <Aviso tipo="ok">{hecho.aprobada ? <>Tienda creada: <b>/t/{hecho.slug}</b>. Aún no está publicada; el dueño la verá al entrar con <b className="break-words">{s.email}</b>.</> : 'Solicitud rechazada.'}</Aviso>
          <a href={enlaceAviso(datos, { aprobada: hecho.aprobada, slug: hecho.slug, base, nota: hecho.nota })} target="_blank" rel="noreferrer"><Btn variante="verde" type="button">Avisarle por WhatsApp</Btn></a>
          <Btn variante="suave" type="button" onClick={alResolver}>Listo</Btn>
        </div>
      )}

      {!hecho && s.estado === 'pendiente' && modo === null && (
        <div className="grid grid-cols-2 gap-3">
          <Btn variante="suave" type="button" onClick={() => setModo('rechazar')}>Rechazar</Btn>
          <Btn type="button" onClick={() => setModo('aprobar')}>Aprobar</Btn>
        </div>
      )}

      {!hecho && modo === 'aprobar' && (
        <div className="space-y-4 rounded-2xl bg-principal/5 p-4">
          <Campo etiqueta="Dirección de la tienda" ayuda={`${base}/t/${slug || '…'}`}>
            <input value={slug} onChange={(e) => { setSlug(e.target.value.toLowerCase().replace(/\s+/g, '-')); setError('') }} maxLength={40} autoCapitalize="none" className={clsInput} />
          </Campo>
          <Campo etiqueta="Plan">
            <select value={plan} onChange={(e) => setPlan(e.target.value)} className={clsInput}>
              {(planes ?? [{ clave: s.plan, nombre: s.plan_nombre }]).map((p) => <option key={p.clave} value={p.clave}>{p.nombre}</option>)}
            </select>
          </Campo>
          {error && <Aviso tipo="error">{error}</Aviso>}
          <div className="grid grid-cols-2 gap-3">
            <Btn variante="suave" type="button" onClick={() => { setModo(null); setError('') }} disabled={ocupado}>← Volver</Btn>
            <Btn type="button" onClick={aprobar} disabled={ocupado}>{ocupado ? 'Creando…' : 'Crear tienda'}</Btn>
          </div>
        </div>
      )}

      {!hecho && modo === 'rechazar' && (
        <div className="space-y-4 rounded-2xl bg-red-50 p-4">
          <Campo etiqueta="Motivo (opcional, se le puede enviar)">
            <input value={nota} onChange={(e) => setNota(e.target.value)} maxLength={300} className={clsInput} />
          </Campo>
          {error && <Aviso tipo="error">{error}</Aviso>}
          <div className="grid grid-cols-2 gap-3">
            <Btn variante="suave" type="button" onClick={() => { setModo(null); setError('') }} disabled={ocupado}>← Volver</Btn>
            <Btn type="button" onClick={rechazar} disabled={ocupado}>{ocupado ? 'Guardando…' : 'Rechazar'}</Btn>
          </div>
        </div>
      )}

      {s.estado === 'aprobada' && !hecho && s.slug_creado && (
        <a href={enlaceAviso(datos, { aprobada: true, slug: s.slug_creado, base })} target="_blank" rel="noreferrer"><Btn variante="suave" type="button">Avisarle por WhatsApp</Btn></a>
      )}
    </article>
  )
}

export default function Solicitudes() {
  const sesion = useSesion()
  const [admin, setAdmin] = useState(undefined)
  const [estado, setEstado] = useState('pendiente')
  const [lista, setLista] = useState(null)
  const [pendientes, setPendientes] = useState(null)
  const [planes, setPlanes] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!sesion) return
    supabase.rpc('soy_administrador_plataforma').then(({ data }) => setAdmin(data === true))
    supabase.rpc('planes_publicos').then(({ data }) => setPlanes(Array.isArray(data) ? data : null))
  }, [sesion?.user?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const cargar = useCallback(async () => {
    setError('')
    const [a, p] = await Promise.all([supabase.rpc('listar_solicitudes_negocio', { p_estado: estado }), supabase.rpc('listar_solicitudes_negocio', { p_estado: 'pendiente' })])
    if (a.error) { setError(a.error.message); setLista([]); return }
    setLista(a.data ?? []); setPendientes((p.data ?? []).length)
  }, [estado])
  useEffect(() => { if (admin) { setLista(null); cargar() } }, [admin, cargar])

  if (sesion === undefined) return <Cargando />
  if (!sesion) return <Login titulo="Ingresar como administrador" />
  if (admin === undefined) return <Cargando />
  if (!admin) {
    return (
      <main className="mx-auto w-full max-w-xl px-4 py-10 text-lg">
        <div className="mb-8"><MarcaMatriz /></div>
        <Aviso tipo="error">Esta cuenta no es de un administrador de la plataforma.</Aviso>
        <div className="mt-4"><Btn variante="suave" onClick={() => ir('/')}>← Volver</Btn></div>
      </main>
    )
  }

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8 text-lg">
      <div className="mb-6"><MarcaMatriz tamano={56} /></div>
      <h1 className="mb-4 break-words text-3xl font-bold leading-tight">Solicitudes de negocios</h1>
      <div role="tablist" className="mb-5 grid grid-cols-3 gap-2">
        {ESTADOS.map(([k, t]) => (
          <button key={k} role="tab" aria-selected={estado === k} onClick={() => setEstado(k)}
            className={`min-h-[56px] rounded-2xl border-2 px-2 text-base font-semibold leading-tight ${estado === k ? 'border-principal bg-principal text-white' : 'border-black/10 bg-white'}`}>
            {t}{k === 'pendiente' && pendientes ? ` (${pendientes})` : ''}
          </button>
        ))}
      </div>
      {error && <Aviso tipo="error">{error}</Aviso>}
      {!lista && !error && <p className="py-10 text-center text-xl text-tinta/60">Cargando…</p>}
      {lista?.length === 0 && !error && <Aviso>No hay solicitudes {estado === 'pendiente' ? 'pendientes' : estado === 'aprobada' ? 'aprobadas' : 'rechazadas'}.</Aviso>}
      <div className="space-y-4">
        {lista?.map((s) => <Tarjeta key={s.id} s={s} planes={planes} alResolver={cargar} />)}
      </div>
      <div className="mt-6"><Btn variante="suave" onClick={() => ir('/')}>← Volver</Btn></div>
      <PiePlataforma />
    </main>
  )
}
