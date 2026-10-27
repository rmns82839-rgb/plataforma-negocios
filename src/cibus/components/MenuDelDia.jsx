// Pantalla del dueño: elegir el almuerzo del día entre 30 ideas, ponerle foto propia y enviarlo a los clientes.
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { traerTodo } from '../lib/traerTodo'
import { claseInput } from '../lib/estilos'
import { comprimirImagen } from '../lib/imagen'
import { MENUS, TIPOS_MENU, COLOR_TIPO } from '../lib/menus'
import { coincide } from '../lib/buscar'
import { cruzar } from '../lib/menuIngredientes'

export function TarjetaPlato({ menu, className = '' }) {
  const [a, b] = COLOR_TIPO[menu.tipo] ?? ['#334155', '#64748b']
  return menu.foto_url
    ? <img src={menu.foto_url} alt={menu.nombre} loading="lazy" className={`w-full object-cover ${className}`} />
    : <div className={`w-full grid place-items-center ${className}`} style={{ background: `linear-gradient(135deg, ${a}, ${b})` }} aria-hidden="true">
        <span className="text-6xl drop-shadow">{menu.emoji || '🍽️'}</span>
      </div>
}

export const textoMenu = (m, hay = []) =>
  `🍽️ *Hoy cocina: ${m.nombre}*\n${m.descripcion ? m.descripcion + '\n' : ''}` +
  (hay.length ? `\nTodo lo que necesitas lo tenemos en Cibus: ${hay.map(x => x.ing.n.toLowerCase()).join(', ')}.\n` : '') +
  `\nPide aquí 👉 ${location.origin}/tienda`

export default function MenuDelDia() {
  const [actual, setActual] = useState(undefined)       // undefined cargando | null sin menú | fila
  const [productos, setProductos] = useState([])
  const [tipo, setTipo] = useState('todos')
  const [texto, setTexto] = useState('')
  const [elegido, setElegido] = useState(null)          // menú en edición
  const [msg, setMsg] = useState('')
  const [error, setError] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [auto, setAuto] = useState(null)             // configuración de avisos automáticos (menús autorizados y 'poner uno al azar cada día')

  const cargar = async () => {
    const { data, error: err } = await supabase.from('menu_hoy').select('*').maybeSingle()
    if (err) { setError(/relation|does not exist|schema cache/i.test(err.message) ? 'Falta ejecutar migracion-v43.sql en Supabase' : err.message); return setActual(null) }
    setActual(data ?? null)
  }
  useEffect(() => {
    cargar()
    traerTodo(() => supabase.from('catalogo_productos').select('id, nombre, disponible').order('id')).then(({ data }) => setProductos(data ?? []))
    supabase.rpc('listar_avisos_auto').then(({ data }) => setAuto(data ?? null), () => {})
  }, [])

  const lista = useMemo(() => MENUS.filter(m => (tipo === 'todos' || m.tipo === tipo) && coincide([m.nombre, m.descripcion, m.tipo], texto)), [tipo, texto])
  const hoyMostrado = actual && actual.fecha === new Date(Date.now() - 5 * 3600e3).toISOString().slice(0, 10)

  const fijar = async (m, manana) => {
    setOcupado(true); setError(''); setMsg('')
    const { error: err } = await supabase.rpc('fijar_menu_hoy', { p_menu_id: m.menu_id ?? m.id ?? null, p_nombre: m.nombre, p_descripcion: m.descripcion ?? '', p_foto_url: m.foto_url ?? '',
      p_emoji: m.emoji ?? '', p_tipo: m.tipo ?? '', p_ingredientes: m.ingredientes ?? [], p_manana: !!manana })
    setOcupado(false)
    if (err) return setError(err.message)
    setMsg(manana ? 'Listo: mañana los clientes verán este menú.' : 'Listo: los clientes ya ven este menú en el catálogo.')
    setElegido(null); cargar(); window.scrollTo({ top: 0, behavior: 'smooth' })
  }
  // Un menú al azar entre los autorizados (si no hay lista, entre todos). Prefiere los que se pueden armar con lo que la tienda vende y no repite el de hoy.
  const alAzar = async () => {
    const permitidos = (auto?.menus_ids?.length ? MENUS.filter(m => auto.menus_ids.includes(m.id)) : MENUS).filter(m => m.id !== actual?.menu_id)
    const armables = permitidos.filter(m => { const { hay, faltan } = cruzar(m.ingredientes, productos); return hay.length >= 2 && hay.length >= faltan.length })
    const grupo = armables.length ? armables : permitidos
    if (!grupo.length) return setError('No hay menús autorizados para elegir. Revisa la lista en Avisos a la app.')
    const m = grupo[Math.floor(Math.random() * grupo.length)]
    await fijar({ ...m, menu_id: m.id }, false)
  }
  const cambiarAuto = async (valor) => {
    if (!auto) return
    setOcupado(true); setError('')
    const { error: err } = await supabase.rpc('guardar_avisos_auto', { p_activo: auto.activo, p_menu_auto: valor, p_menus: auto.menus_ids ?? [], p_novedad: auto.novedad_dia === new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date()) ? (auto.novedad ?? '') : '', p_max: auto.max_semana })
    setOcupado(false)
    if (err) return setError(err.message)
    setAuto({ ...auto, menu_auto: valor })
  }
  const quitar = async () => {
    setOcupado(true); const { error: err } = await supabase.rpc('quitar_menu_hoy'); setOcupado(false)
    if (err) return setError(err.message)
    setMsg('Menú quitado del catálogo.'); cargar()
  }
  const subirFoto = async (e) => {
    const f = e.target.files?.[0]; e.target.value = ''
    if (!f) return
    setOcupado(true); setError('')
    try {
      const blob = await comprimirImagen(f, 1000, 0.8)
      const ruta = `menus/${crypto.randomUUID()}.jpg`
      const { error: e1 } = await supabase.storage.from('prendas').upload(ruta, blob, { contentType: 'image/jpeg' })
      if (e1) throw e1
      setElegido(m => ({ ...m, foto_url: supabase.storage.from('prendas').getPublicUrl(ruta).data.publicUrl }))
    } catch (err) { setError('No se pudo subir la foto: ' + (err?.message || 'intenta de nuevo')) }
    setOcupado(false)
  }
  const compartir = async (m) => {
    const { hay } = cruzar(m.ingredientes, productos)
    const t = textoMenu(m, hay)
    try { if (navigator.share) return await navigator.share({ text: t }) } catch { return }
    window.open(`https://wa.me/?text=${encodeURIComponent(t)}`, '_blank', 'noopener')
  }

  if (elegido) {
    const { hay, faltan } = cruzar(elegido.ingredientes, productos)
    return (
      <div className="space-y-4 max-w-2xl">
        <button onClick={() => setElegido(null)} className="min-h-12 px-3 text-base font-semibold text-cibus">← Volver</button>
        <div className="rounded-2xl overflow-hidden bg-white shadow-sm">
          <TarjetaPlato menu={elegido} className="h-48" />
          <div className="p-4 space-y-3">
            <label className="block text-sm font-semibold">Nombre del plato
              <input value={elegido.nombre} onChange={e => setElegido({ ...elegido, nombre: e.target.value })} className={`${claseInput} mt-1`} /></label>
            <label className="block text-sm font-semibold">Descripción
              <textarea value={elegido.descripcion ?? ''} maxLength={400} rows={3} onChange={e => setElegido({ ...elegido, descripcion: e.target.value })} className={`${claseInput} mt-1`} /></label>
            <div className="flex flex-wrap gap-2">
              <label className="min-h-12 px-4 rounded-xl bg-lima/20 text-marca font-semibold grid place-items-center cursor-pointer">
                {ocupado ? 'Subiendo…' : elegido.foto_url ? '📷 Cambiar foto' : '📷 Subir foto del plato'}
                <input type="file" accept="image/*" className="hidden" onChange={subirFoto} disabled={ocupado} /></label>
              {elegido.foto_url && <button onClick={() => setElegido({ ...elegido, foto_url: '' })} className="min-h-12 px-4 rounded-xl bg-slate-100 font-semibold">Quitar foto</button>}
            </div>
            <div className="text-sm">
              <p className="font-semibold">En tu tienda hay ({hay.length}):</p>
              <p className="text-slate-600">{hay.length ? hay.map(x => `${x.ing.n} → ${x.producto.nombre}`).join(' · ') : 'Ningún ingrediente coincide todavía con tus productos.'}</p>
              {faltan.length > 0 && <p className="text-slate-400 mt-1">No tienes: {faltan.map(x => x.n).join(', ')}</p>}
            </div>
          </div>
        </div>
        {error && <p className="rounded-lg bg-red-50 text-red-700 p-3 text-base">{error}</p>}
        <div className="grid gap-2">
          <button disabled={ocupado} onClick={() => fijar(elegido, false)} className="min-h-14 rounded-xl bg-cibus text-white text-lg font-bold disabled:opacity-50">Poner como menú de HOY</button>
          <button disabled={ocupado} onClick={() => fijar(elegido, true)} className="min-h-14 rounded-xl bg-white ring-1 ring-cibus text-cibus text-lg font-bold disabled:opacity-50">Programar para MAÑANA</button>
          <button onClick={() => compartir(elegido)} className="min-h-14 rounded-xl bg-esmeralda text-white text-lg font-bold">Enviar por WhatsApp</button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4 max-w-3xl">
      <div>
        <h2 className="text-xl font-bold">Menú del día</h2>
        <p className="text-sm text-slate-500">Elige qué se cocina hoy. Los clientes lo ven en el catálogo y pueden agregar los ingredientes que tú vendes.</p>
      </div>
      {msg && <p className="rounded-lg bg-emerald-50 text-emerald-800 p-3 text-base">{msg}</p>}
      {error && <p className="rounded-lg bg-red-50 text-red-700 p-3 text-base">{error}</p>}
      {actual && (
        <div className="rounded-2xl overflow-hidden bg-white shadow-sm ring-2 ring-cibus/30">
          <TarjetaPlato menu={actual} className="h-32" />
          <div className="p-3 space-y-2">
            <p className="text-xs font-bold text-cibus">{hoyMostrado ? 'MENÚ DE HOY (visible)' : 'PROGRAMADO / NO VISIBLE HOY'}</p>
            <p className="font-semibold">{actual.nombre}</p>
            <div className="flex gap-2">
              <button onClick={() => compartir(actual)} className="min-h-12 px-4 rounded-xl bg-esmeralda text-white font-semibold">Enviar por WhatsApp</button>
              <button disabled={ocupado} onClick={quitar} className="min-h-12 px-4 rounded-xl bg-slate-100 font-semibold">Quitar</button>
            </div>
          </div>
        </div>
      )}
      <div className="rounded-2xl bg-white shadow-sm ring-1 ring-slate-200 p-3 space-y-3">
        <button disabled={ocupado} onClick={alAzar} className="w-full min-h-14 rounded-xl bg-cibus text-white text-lg font-bold disabled:opacity-50 active:opacity-80">
          🎲 Elegir uno al azar y publicarlo hoy
        </button>
        <p className="text-sm text-slate-500">Escoge entre los menús autorizados{auto?.menus_ids?.length ? ` (${auto.menus_ids.length})` : ' (todos)'} y prefiere los que puedes armar con lo que vendes. Si no te gusta, toca otra vez.</p>
        {auto && (
          <>
            <button onClick={() => cambiarAuto(!auto.menu_auto)} disabled={ocupado} aria-pressed={!!auto.menu_auto}
              className={`w-full min-h-12 rounded-xl text-base font-semibold px-2 leading-tight ${auto.menu_auto ? 'bg-negro text-champagne' : 'bg-slate-100 text-slate-700'}`}>
              {auto.menu_auto ? '✓ Cada día se publica uno solo si yo no elijo' : 'Publicar uno solo cada día si yo no elijo'}
            </button>
            {auto.menu_auto && !auto.activo && <p className="text-sm rounded-lg bg-amber-50 text-amber-800 px-3 py-2">Para que se publique solo, también debes encender los avisos automáticos en <b>Avisos a la app</b>. Se publica a las 11:00 a. m.</p>}
            {auto.menu_auto && auto.activo && <p className="text-sm text-slate-500">Se publica solo a las 11:00 a. m. si ese día no pusiste ninguno.</p>}
          </>
        )}
      </div>
      <input value={texto} onChange={e => setTexto(e.target.value)} placeholder="Buscar un plato (pollo, sopa, arroz…)" aria-label="Buscar un plato" className={claseInput} />
      <div className="flex gap-2 overflow-x-auto pb-1">
        {['todos', ...TIPOS_MENU].map(t => (
          <button key={t} onClick={() => setTipo(t)} className={`min-h-11 px-4 rounded-full text-sm font-semibold whitespace-nowrap ${tipo === t ? 'bg-cibus text-white' : 'bg-white ring-1 ring-slate-200'}`}>{t === 'todos' ? 'Todos' : t}</button>
        ))}
      </div>
      <ul className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {lista.map(m => (
          <li key={m.id}>
            <button onClick={() => setElegido({ ...m })} className="w-full text-left rounded-2xl overflow-hidden bg-white shadow-sm active:opacity-80">
              <TarjetaPlato menu={m} className="h-24" />
              <span className="block p-2.5 text-sm font-semibold leading-snug">{m.nombre}</span>
            </button>
          </li>
        ))}
      </ul>
      {lista.length === 0 && <p className="text-center text-slate-400 py-8">No hay platos con eso.</p>}
    </div>
  )
}
