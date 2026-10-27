import { useEffect, useRef, useState } from 'react'
import { supabase, urlImagen, urlMusica } from '../lib/supabase'
import { mensajeError } from '../lib/errores'
import { estrellasTexto, textoSeguimiento, soloDigitos } from '../lib/vitrina'
import { Btn, Aviso, Campo, clsInput } from './ui'

const leerLS = (k) => { try { return localStorage.getItem(k) } catch { return null } }
const guardarLS = (k, v) => { try { localStorage.setItem(k, v) } catch { /* sin almacenamiento: funciona igual */ } }

// ---------- Menú del día ----------
export function MenuDelDia({ menu }) {
  if (!menu) return null
  const foto = urlImagen(menu.foto)
  return (
    <section aria-label="Menú del día" className="mb-6 overflow-hidden rounded-2xl border-2 border-secundario/50 bg-white">
      {foto && <img src={foto} alt={menu.nombre} loading="lazy" className="aspect-[16/9] w-full bg-white object-cover" />}
      <div className="p-4">
        <p className="mb-1 text-base font-bold uppercase tracking-wide text-principal">{menu.emoji || '🍽️'} Menú de hoy{menu.tipo ? ` · ${menu.tipo}` : ''}</p>
        <h2 className="break-words text-2xl font-bold leading-snug">{menu.nombre}</h2>
        {menu.descripcion && <p className="mt-1 text-lg leading-snug text-tinta/80">{menu.descripcion}</p>}
        {menu.ingredientes?.length > 0 && (
          <ul className="mt-3 flex flex-wrap gap-2">
            {menu.ingredientes.map((i) => <li key={i.k} className="rounded-full bg-principal/10 px-3 py-1 text-base font-semibold text-principal">{i.n}</li>)}
          </ul>
        )}
      </div>
    </section>
  )
}

// ---------- Música de fondo (arranca solo cuando la persona toca el botón) ----------
export function MusicaFondo({ musica }) {
  const audio = useRef(null)
  const [suena, setSuena] = useState(false)
  const url = urlMusica(musica?.ruta)
  useEffect(() => () => audio.current?.pause(), [])
  if (!url) return null
  const alternar = async () => {
    const a = audio.current; if (!a) return
    if (a.paused) { try { await a.play(); setSuena(true); guardarLS('musica', '1') } catch { setSuena(false) } }
    else { a.pause(); setSuena(false); guardarLS('musica', '0') }
  }
  return (
    <>
      <audio ref={audio} src={url} loop preload="none" />
      <button onClick={alternar} aria-pressed={suena} aria-label={suena ? 'Apagar la música' : 'Poner música'}
        className="fixed right-4 top-4 z-30 flex min-h-[56px] items-center gap-2 rounded-full border-2 border-principal/30 bg-white px-4 text-lg font-semibold text-principal shadow">
        <span aria-hidden="true" className="text-2xl">{suena ? '🔊' : '🔇'}</span>{suena ? 'Música' : 'Poner música'}
      </button>
    </>
  )
}

// ---------- Opiniones ----------
export function Opiniones({ slug, datos, sesion, personal, entrarGoogle, recargar }) {
  const [abierto, setAbierto] = useState(false)
  const [estrellas, setEstrellas] = useState(0)
  const [texto, setTexto] = useState('')
  const [acepta, setAcepta] = useState(false)
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')
  const [enviando, setEnviando] = useState(false)
  if (!datos) return null

  async function enviar() {
    setError(''); setOk('')
    if (!estrellas) return setError('Elige de 1 a 5 estrellas')
    if (!acepta) return setError('Marca la casilla para que podamos publicar tu nombre y tu opinión')
    setEnviando(true)
    const { error: e } = await supabase.rpc('publicar_opinion', { p_slug: slug, p_estrellas: estrellas, p_texto: texto, p_acepta: true })
    setEnviando(false)
    if (e) return setError(mensajeError(e))
    setOk('¡Gracias! Tu opinión se publicará cuando la tienda la revise.')
    setAbierto(false); setEstrellas(0); setTexto(''); setAcepta(false); recargar?.()
  }
  async function borrar() {
    const { error: e } = await supabase.rpc('borrar_mis_opiniones', { p_slug: slug })
    if (e) return setError(mensajeError(e))
    setOk('Borramos tus opiniones de esta tienda.'); recargar?.()
  }

  return (
    <section aria-label="Opiniones" className="mt-10">
      <h2 className="mb-1 text-2xl font-bold">Lo que dicen nuestros clientes</h2>
      {datos.total > 0
        ? <p className="mb-4 text-xl"><span aria-hidden="true" className="text-secundario">{estrellasTexto(datos.promedio)}</span> <b>{Number(datos.promedio).toFixed(1)}</b> <span className="text-tinta/70">({datos.total} {datos.total === 1 ? 'opinión' : 'opiniones'})</span></p>
        : <p className="mb-4 text-lg text-tinta/70">Todavía no hay opiniones. ¡Sé la primera persona en opinar!</p>}

      <ul className="mb-4 space-y-3">
        {datos.lista.map((o) => (
          <li key={o.id} className="rounded-2xl border-2 border-black/5 bg-white p-4">
            <p className="flex items-baseline justify-between gap-3"><b className="break-words text-lg">{o.nombre}</b><span aria-label={`${o.estrellas} de 5 estrellas`} className="text-xl text-secundario">{estrellasTexto(o.estrellas)}</span></p>
            {o.texto && <p className="mt-1 break-words text-lg leading-snug">{o.texto}</p>}
            {o.respuesta && <p className="mt-2 break-words rounded-xl bg-principal/5 p-3 text-base leading-snug"><b>Respuesta de la tienda:</b> {o.respuesta}</p>}
          </li>
        ))}
      </ul>

      {ok && <div className="mb-3"><Aviso tipo="ok">{ok}</Aviso></div>}
      {error && <div className="mb-3"><Aviso tipo="error">{error}</Aviso></div>}

      {personal ? null : !sesion ? (
        <Btn variante="suave" onClick={entrarGoogle}>Entrar con Google para opinar</Btn>
      ) : !abierto ? (
        <div className="grid grid-cols-2 gap-2"><Btn variante="suave" onClick={() => setAbierto(true)}>Dejar mi opinión</Btn><Btn variante="suave" onClick={borrar}>Borrar mis opiniones</Btn></div>
      ) : (
        <div className="space-y-4 rounded-2xl border-2 border-black/10 bg-white p-4">
          <div>
            <p className="mb-2 text-lg font-semibold">¿Cómo te fue?</p>
            <div className="grid grid-cols-5 gap-2" role="group" aria-label="Estrellas">
              {[1, 2, 3, 4, 5].map((n) => (
                <button key={n} type="button" aria-pressed={estrellas === n} aria-label={`${n} ${n === 1 ? 'estrella' : 'estrellas'}`} onClick={() => setEstrellas(n)}
                  className={`min-h-[56px] rounded-2xl border-2 text-2xl font-bold ${estrellas === n ? 'border-principal bg-principal text-white' : 'border-black/10 bg-white'}`}>{n}★</button>
              ))}
            </div>
          </div>
          <Campo etiqueta="Tu opinión (opcional)" ayuda={`${texto.length}/300`}>
            <textarea value={texto} maxLength={300} onChange={(e) => setTexto(e.target.value)} rows={4} className={`${clsInput} py-3`} />
          </Campo>
          <label className="flex items-start gap-3 text-lg leading-snug">
            <input type="checkbox" checked={acepta} onChange={(e) => setAcepta(e.target.checked)} className="mt-1 h-7 w-7 shrink-0" />
            <span>Acepto que se publique mi nombre (solo el primero y la inicial del apellido) y mi opinión.</span>
          </label>
          <div className="grid grid-cols-2 gap-2"><Btn variante="suave" onClick={() => setAbierto(false)}>← Volver</Btn><Btn onClick={enviar} disabled={enviando}>{enviando ? 'Enviando…' : 'Enviar'}</Btn></div>
        </div>
      )}
    </section>
  )
}

// ---------- Seguir mi pedido sin cuenta: número + celular ----------
export function SeguirPedido({ slug }) {
  const [abierto, setAbierto] = useState(false)
  const [numero, setNumero] = useState('')
  const [tel, setTel] = useState('')
  const [res, setRes] = useState(undefined)   // undefined = no se ha buscado · null = no apareció
  const [error, setError] = useState('')
  const [cargando, setCargando] = useState(false)

  async function buscar() {
    setError(''); setRes(undefined)
    if (!soloDigitos(numero)) return setError('Escribe el número de tu pedido')
    if (soloDigitos(tel).length < 10) return setError('Escribe tu celular completo (10 números)')
    setCargando(true)
    const { data, error: e } = await supabase.rpc('estado_pedido', { p_slug: slug, p_numero: Number(soloDigitos(numero)), p_telefono: tel })
    setCargando(false)
    if (e) return setError(mensajeError(e))
    setRes(data ?? null)
  }

  if (!abierto) return <div className="mt-8"><Btn variante="suave" onClick={() => setAbierto(true)}>¿Ya hiciste un pedido? Mira cómo va</Btn></div>
  const s = textoSeguimiento(res)
  return (
    <section aria-label="Seguir mi pedido" className="mt-8 space-y-4 rounded-2xl border-2 border-black/10 bg-white p-4">
      <h2 className="text-2xl font-bold">Mira cómo va tu pedido</h2>
      <Campo etiqueta="Número del pedido"><input inputMode="numeric" value={numero} onChange={(e) => setNumero(e.target.value)} className={clsInput} /></Campo>
      <Campo etiqueta="Tu celular" ayuda="El mismo que dejaste al pedir"><input inputMode="tel" value={tel} onChange={(e) => setTel(e.target.value)} className={clsInput} /></Campo>
      {error && <Aviso tipo="error">{error}</Aviso>}
      {res === null && <Aviso>No encontramos ese pedido. Revisa el número y el celular.</Aviso>}
      {s && <div className="rounded-2xl bg-principal/5 p-4 text-center"><p aria-hidden="true" className="text-5xl">{s.icono}</p><p className="mt-1 text-2xl font-bold">{s.titulo}</p><p className="text-lg text-tinta/80">{s.detalle}</p></div>}
      <div className="grid grid-cols-2 gap-2"><Btn variante="suave" onClick={() => { setAbierto(false); setRes(undefined) }}>← Volver</Btn><Btn onClick={buscar} disabled={cargando}>{cargando ? 'Buscando…' : 'Buscar'}</Btn></div>
    </section>
  )
}
