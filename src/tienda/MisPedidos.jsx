// Mis pedidos (cliente con Google): perfil guardado con consentimiento, estado de cada pedido y borrado de datos.
import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { entrarConGoogle } from '../lib/google'
import { ir } from '../lib/ruta'
import { mensajeError } from '../lib/errores'
import { cop } from '../lib/pedido'
import { detectarCambios } from '../lib/cambiosPedido'
import { estadoAvisosCliente, activarAvisosCliente, desactivarAvisosCliente } from '../lib/avisosCliente'
import { Btn, Volver, Aviso, Campo, clsInput, PiePlataforma } from './ui'

const fecha = (t) => new Date(t).toLocaleString('es-CO', { timeZone: 'America/Bogota', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })
const PASOS = (entrega) => [['recibido', 'Recibido'], ['preparando', 'Preparando'], ['en_camino', entrega === 'recoger' ? 'Listo' : 'En camino'], ['entregado', 'Entregado']]

function Linea({ p }) {
  const pasos = PASOS(p.entrega), idx = pasos.findIndex(([k]) => k === p.seguimiento)
  if (p.estado === 'cancelado') return <p className="rounded-2xl bg-red-50 px-4 py-3 text-lg font-bold text-red-800">Pedido cancelado</p>
  return (
    <div className="grid grid-cols-4 gap-2" aria-label={`Estado: ${pasos[idx]?.[1] || ''}`}>
      {pasos.map(([k, t], i) => (
        <div key={k} className="text-center">
          <div className={`mx-auto mb-1 h-3 rounded-full ${i <= idx ? 'bg-[#128C4A]' : 'bg-black/10'}`} />
          <span className={`block text-base leading-tight ${i === idx ? 'font-bold text-tinta' : 'text-tinta/60'}`}>{t}</span>
        </div>
      ))}
    </div>
  )
}

export default function MisPedidos({ slug, n, sesion }) {
  const [pedidos, setPedidos] = useState(null)
  const [perfil, setPerfil] = useState(undefined)         // undefined cargando · null sin perfil
  const [f, setF] = useState({ nombre: '', telefono: '', direccion: '', acepta_datos: false, acepta_promos: false })
  const [msg, setMsg] = useState(null)
  const [ocupado, setOcupado] = useState(false)
  const [confirmarBorrado, setConfirmarBorrado] = useState(false)
  const [dirs, setDirs] = useState([])
  const [dirBorrar, setDirBorrar] = useState(null)
  const activo = n?.modulos?.includes('mis_pedidos')
  const [cambios, setCambios] = useState([])          // avisos dentro de la app cuando cambia el estado de un pedido
  const [avisos, setAvisos] = useState('...')           // estado de los avisos push en este celular
  const antes = useRef(null)
  const recibir = useCallback((lista) => {
    const { mapa, cambios: c } = detectarCambios(antes.current, lista)
    antes.current = mapa
    if (c.length) { setCambios((x) => [...c.map((y) => y.texto), ...x].slice(0, 3)); if (navigator.vibrate) navigator.vibrate([200, 100, 200]) }
  }, [])

  const cargar = useCallback(async () => {
    const [a, b, c] = await Promise.all([supabase.rpc('mi_perfil_cliente'), supabase.rpc('mis_pedidos'), supabase.rpc('mis_direcciones')])
    if (!c.error) setDirs(c.data || [])
    if (!a.error) { setPerfil(a.data || null); if (a.data) setF((x) => ({ ...x, nombre: a.data.nombre, telefono: a.data.telefono, direccion: a.data.direccion || '', acepta_promos: !!a.data.acepta_promos })) }
    else setPerfil(null)
    if (!b.error) { setPedidos(b.data || []); recibir(b.data || []) } else setPedidos([])
  }, [recibir])

  useEffect(() => {
    if (!sesion) return
    cargar()
    const t = setInterval(() => supabase.rpc('mis_pedidos').then(({ data }) => { if (data) { setPedidos(data); recibir(data) } }), 20000)
    return () => clearInterval(t)
  }, [sesion, cargar, recibir])
  useEffect(() => { if (sesion) estadoAvisosCliente().then(setAvisos) }, [sesion])

  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value })
  const volver = () => ir(`/t/${slug}`)

  async function alternarAvisos() {
    setOcupado(true); setMsg(null)
    try { if (avisos === 'activo') await desactivarAvisosCliente(); else await activarAvisosCliente(); setAvisos(await estadoAvisosCliente()) }
    catch (e) { setMsg({ tipo: 'error', texto: e.message || 'No pudimos activar los avisos' }); setAvisos(await estadoAvisosCliente()) }
    setOcupado(false)
  }

  async function entrar() { const e = await entrarConGoogle(); if (e) setMsg({ tipo: 'error', texto: e }) }

  async function guardar() {
    setOcupado(true); setMsg(null)
    const { data, error } = await supabase.rpc('guardar_perfil_cliente', { p_datos: f })
    setOcupado(false)
    if (error) return setMsg({ tipo: 'error', texto: mensajeError(error) })
    setPerfil(data); setMsg({ tipo: 'ok', texto: 'Tus datos quedaron guardados.' })
  }

  async function borrarDir(id) {
    setOcupado(true); setMsg(null)
    const { error } = await supabase.rpc('borrar_direccion', { p_id: id })
    setOcupado(false); setDirBorrar(null)
    if (error) return setMsg({ tipo: 'error', texto: mensajeError(error) })
    setDirs((d) => d.filter((x) => x.id !== id)); setMsg({ tipo: 'ok', texto: 'Borramos esa dirección.' })
  }

  async function borrar() {
    setOcupado(true); setMsg(null)
    const { error } = await supabase.rpc('borrar_mi_perfil')
    setOcupado(false); setConfirmarBorrado(false)
    if (error) return setMsg({ tipo: 'error', texto: mensajeError(error) })
    setPerfil(null); setDirs([]); setF({ nombre: '', telefono: '', direccion: '', acepta_datos: false, acepta_promos: false }); setPedidos([])
    setMsg({ tipo: 'ok', texto: 'Borramos tu perfil y soltamos tu cuenta de tus pedidos. La tienda conserva solo el registro de la venta.' })
  }

  const Cabecera = <><Volver onClick={volver} texto="Volver a la tienda" /><h1 className="mb-4 break-words text-3xl font-bold leading-tight">Mis pedidos</h1></>

  if (n === undefined) return <p className="py-24 text-center text-xl text-tinta/60">Cargando…</p>
  if (!n || !activo) {
    return (
      <main className="mx-auto w-full max-w-3xl px-4 py-6 text-lg">
        {Cabecera}<Aviso>Esta tienda todavía no tiene activado el seguimiento de pedidos.</Aviso><PiePlataforma />
      </main>
    )
  }

  if (sesion === undefined) return <p className="py-24 text-center text-xl text-tinta/60">Cargando…</p>
  if (!sesion) {
    return (
      <main className="mx-auto w-full max-w-3xl px-4 py-6 text-lg">
        {Cabecera}
        <div className="space-y-4 rounded-2xl border-2 border-black/5 bg-white p-5">
          <p className="text-xl font-bold leading-snug">Entra con Google para ver el estado de tus pedidos.</p>
          <p className="leading-snug text-tinta/70">Así también guardas tus datos y no los escribes de nuevo. Sigues pudiendo pedir sin cuenta cuando quieras.</p>
          <Btn onClick={entrar}>Entrar con Google</Btn>
        </div>
        {msg && <div className="mt-4"><Aviso tipo={msg.tipo}>{msg.texto}</Aviso></div>}
        <PiePlataforma />
      </main>
    )
  }

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-6 pb-10 text-lg">
      {Cabecera}
      {msg && <div className="mb-4"><Aviso tipo={msg.tipo}>{msg.texto}</Aviso></div>}

      {cambios.length > 0 && (
        <div className="mb-4 space-y-2" role="status" aria-live="polite">
          {cambios.map((t, i) => <Aviso key={i} tipo="ok">🔔 {t}</Aviso>)}
          <Btn variante="suave" onClick={() => setCambios([])}>Entendido</Btn>
        </div>
      )}
      {!['sin_llave', '...', 'no_soportado'].includes(avisos) && (
        <section className="mb-5 rounded-2xl border-2 border-black/5 bg-white p-4">
          <h2 className="mb-1 text-xl font-bold leading-snug">Avisos en este celular</h2>
          {avisos === 'ios_instalar' && <p className="text-lg leading-snug text-tinta/70">En iPhone, para recibir avisos primero instala la app: en Safari toca Compartir y «Añadir a pantalla de inicio».</p>}
          {avisos === 'bloqueado' && <p className="text-lg leading-snug text-tinta/70">Los avisos están bloqueados en este navegador. Actívalos en los permisos del sitio y vuelve aquí.</p>}
          {(avisos === 'activo' || avisos === 'inactivo') && (
            <>
              <p className="mb-3 text-lg leading-snug text-tinta/70">{avisos === 'activo' ? 'Te avisamos cuando la tienda prepare, despache o entregue tu pedido.' : 'Activa los avisos y te decimos cuando la tienda prepare, despache o entregue tu pedido, aunque tengas la app cerrada.'}</p>
              <Btn variante={avisos === 'activo' ? 'suave' : 'principal'} disabled={ocupado} onClick={alternarAvisos}>{avisos === 'activo' ? 'Desactivar los avisos' : 'Activar los avisos'}</Btn>
            </>
          )}
        </section>
      )}

      <h2 className="mb-3 text-2xl font-bold">Estado de mis pedidos</h2>
      {pedidos === null && <p className="py-6 text-center text-tinta/60">Cargando tus pedidos…</p>}
      {pedidos?.length === 0 && <Aviso>Todavía no tienes pedidos con esta cuenta. Cuando hagas uno con tu sesión abierta, aparecerá aquí.</Aviso>}
      <div className="space-y-4">
        {pedidos?.map((p) => (
          <section key={p.id} className="rounded-2xl border-2 border-black/5 bg-white p-4">
            <div className="mb-1 flex flex-wrap items-baseline justify-between gap-x-3">
              <p className="break-words text-xl font-bold leading-snug">{p.tienda}</p>
              <p className="text-lg text-tinta/60">Pedido #{p.numero}</p>
            </div>
            <p className="mb-3 text-base text-tinta/60">{fecha(p.creado_en)} · {p.entrega === 'recoger' ? 'Recoges en la tienda' : 'A domicilio'}</p>
            <Linea p={p} />
            <ul className="mt-3 space-y-1">
              {(p.items || []).map((i, k) => <li key={k} className="break-words text-lg">{Number(i.cantidad)} × {i.nombre}</li>)}
            </ul>
            <div className="mt-3 flex items-baseline justify-between border-t border-black/10 pt-3 text-2xl font-bold"><span>Total</span><span>{cop(p.total)}</span></div>
          </section>
        ))}
      </div>

      <h2 className="mb-3 mt-8 text-2xl font-bold">Mis datos</h2>
      <div className="space-y-5 rounded-2xl border-2 border-black/5 bg-white p-4">
        <Campo etiqueta="Nombre completo"><input className={clsInput} autoComplete="name" value={f.nombre} onChange={set('nombre')} maxLength={80} /></Campo>
        <Campo etiqueta="Celular" ayuda="10 dígitos."><input className={clsInput} inputMode="tel" autoComplete="tel" value={f.telefono} onChange={set('telefono')} /></Campo>
        <Campo etiqueta="Dirección (opcional)"><input className={clsInput} autoComplete="street-address" value={f.direccion} onChange={set('direccion')} maxLength={160} /></Campo>
        {!perfil && (
          <label className="flex cursor-pointer items-start gap-4 text-lg leading-snug">
            <input type="checkbox" checked={f.acepta_datos} onChange={set('acepta_datos')} className="mt-1 h-8 w-8 shrink-0 accent-[rgb(var(--c-principal))]" />
            <span>Autorizo guardar mi nombre, celular y dirección para hacer mis pedidos más rápido, según la Ley 1581 de 2012. Puedo borrarlos cuando quiera desde esta pantalla.</span>
          </label>
        )}
        <label className="flex cursor-pointer items-start gap-4 text-lg leading-snug">
          <input type="checkbox" checked={f.acepta_promos} onChange={set('acepta_promos')} className="mt-1 h-8 w-8 shrink-0 accent-[rgb(var(--c-principal))]" />
          <span>Quiero que me avisen de ofertas (opcional).</span>
        </label>
        <Btn disabled={ocupado} onClick={guardar}>{ocupado ? 'Guardando…' : perfil ? 'Guardar cambios' : 'Guardar mis datos'}</Btn>
      </div>

      <h2 className="mb-3 mt-8 text-2xl font-bold">Mis direcciones</h2>
      {dirs.length === 0 && <Aviso>Aquí aparecerán las direcciones que guardes al hacer un pedido, para que no tengas que escribirlas otra vez.</Aviso>}
      <div className="space-y-3">
        {dirs.map((d) => (
          <section key={d.id} className="rounded-2xl border-2 border-black/5 bg-white p-4">
            <p className="text-xl font-bold leading-snug">{d.etiqueta}</p>
            <p className="break-words text-lg">{d.direccion}</p>
            {d.sena && <p className="break-words text-base text-tinta/70">Seña: {d.sena}</p>}
            {dirBorrar === d.id ? (
              <div className="mt-3 grid grid-cols-2 gap-3">
                <Btn variante="suave" onClick={() => setDirBorrar(null)}>No, volver</Btn>
                <Btn disabled={ocupado} onClick={() => borrarDir(d.id)}>Sí, borrar</Btn>
              </div>
            ) : <button onClick={() => setDirBorrar(d.id)} className="mt-2 min-h-[48px] text-lg font-semibold text-red-700 underline">Borrar esta dirección</button>}
          </section>
        ))}
      </div>

      <div className="mt-6 grid gap-3">
        <Btn variante="suave" onClick={() => supabase.auth.signOut()}>Salir de mi cuenta</Btn>
        {(perfil || dirs.length > 0) && !confirmarBorrado && <button onClick={() => setConfirmarBorrado(true)} className="min-h-[56px] text-lg font-semibold text-red-700 underline">Borrar mis datos</button>}
        {confirmarBorrado && (
          <div className="space-y-3 rounded-2xl border-2 border-red-300 bg-red-50 p-4">
            <p className="text-lg font-semibold text-red-900">¿Seguro? Se borra tu perfil y tus pedidos dejan de aparecer aquí.</p>
            <div className="grid grid-cols-2 gap-3">
              <Btn variante="suave" onClick={() => setConfirmarBorrado(false)}>No, volver</Btn>
              <Btn disabled={ocupado} onClick={borrar}>Sí, borrar</Btn>
            </div>
          </div>
        )}
      </div>
      <PiePlataforma />
    </main>
  )
}
