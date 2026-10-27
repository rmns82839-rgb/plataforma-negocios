// Pantalla del dueño: avisos automáticos diarios y personalizados. Elige qué menús se pueden usar y escribe la novedad del día.
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { claseInput } from '../lib/estilos'
import { MENUS, TIPOS_MENU } from '../lib/menus'

export default function AvisosAuto() {
  const [cfg, setCfg] = useState(null)
  const [error, setError] = useState('')
  const [msg, setMsg] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [tipo, setTipo] = useState('todos')

  useEffect(() => {
    supabase.rpc('listar_avisos_auto').then(({ data, error: e }) => {
      if (e) return setError(/could not find the function|schema cache/i.test(e.message) ? 'Falta ejecutar migracion-v47.sql en Supabase' : e.message)
      const hoy = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date())
      setCfg({ ...data, novedad: data.novedad_dia === hoy ? (data.novedad ?? '') : '' })
    })
  }, [])
  if (!cfg) return error ? <p className="rounded-lg bg-red-50 text-red-700 p-3 text-base">{error}</p> : null

  const todos = cfg.menus_ids.length === 0
  const lista = MENUS.filter(m => tipo === 'todos' || m.tipo === tipo)
  const alternar = (id) => {
    const base = todos ? MENUS.map(m => m.id) : cfg.menus_ids
    const nuevo = base.includes(id) ? base.filter(x => x !== id) : [...base, id]
    setCfg({ ...cfg, menus_ids: nuevo.length === MENUS.length ? [] : nuevo })
  }
  const guardar = async (extra = {}) => {
    setOcupado(true); setError(''); setMsg('')
    const c = { ...cfg, ...extra }
    const { error: e } = await supabase.rpc('guardar_avisos_auto', { p_activo: c.activo, p_menu_auto: c.menu_auto, p_menus: c.menus_ids, p_novedad: c.novedad ?? '', p_max: c.max_semana })
    setOcupado(false)
    if (e) return setError(e.message)
    setCfg(c); setMsg('Guardado.')
  }
  const probar = async () => {
    setOcupado(true); setError(''); setMsg('')
    try {
      const { data } = await supabase.auth.getSession()
      const r = await fetch('/api/avisos-auto', { method: 'POST', headers: { Authorization: `Bearer ${data?.session?.access_token}` } })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(j.error || 'No se pudo probar')
      setMsg(j.enviados ? `Te enviamos un aviso de prueba: «${j.muestra?.[0]?.titulo ?? ''}»` : 'No hay aviso para ti: activa los avisos en tu celular (tarjeta "Activar avisos" en /tienda) y vuelve a probar.')
    } catch (e) { setError(e.message) }
    setOcupado(false)
  }

  return (
    <section className="space-y-4 rounded-2xl bg-white shadow-sm p-4">
      <div>
        <h3 className="text-lg font-bold">Avisos automáticos de cada día</h3>
        <p className="text-sm text-slate-500">Cada día a las 11 a. m. cada cliente recibe un solo aviso, distinto según lo que más compra, el menú del día y las novedades. Máximo una vez al día.</p>
      </div>
      <button onClick={() => guardar({ activo: !cfg.activo })} disabled={ocupado} aria-pressed={cfg.activo}
        className={`w-full min-h-14 rounded-2xl text-lg font-semibold ${cfg.activo ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-600'}`}>{cfg.activo ? '✅ Avisos automáticos ENCENDIDOS' : '⏸ Avisos automáticos apagados'}</button>
      <label className="block text-sm font-semibold">Novedad de hoy (opcional)
        <input value={cfg.novedad ?? ''} maxLength={120} onChange={e => setCfg({ ...cfg, novedad: e.target.value })} placeholder="Ej: Hoy llegó plátano maduro de calidad" className={`${claseInput} mt-1`} />
        <span className="block text-xs font-normal text-slate-500 mt-1">Solo vale por hoy. Si la dejas en blanco, los avisos usan lo que cada cliente compra y el menú.</span></label>
      <label className="flex items-center gap-3 text-base min-h-12"><input type="checkbox" className="h-6 w-6" checked={cfg.menu_auto} onChange={e => setCfg({ ...cfg, menu_auto: e.target.checked })} />
        Si no elijo menú, poner uno al azar entre los autorizados</label>
      <label className="block text-sm font-semibold">Máximo de avisos por cliente cada 7 días
        <select value={cfg.max_semana} onChange={e => setCfg({ ...cfg, max_semana: Number(e.target.value) })} className={`${claseInput} mt-1`}>
          {[1, 2, 3, 4, 5, 7].map(n => <option key={n} value={n}>{n}</option>)}</select></label>
      <div className="space-y-2">
        <p className="text-sm font-semibold">Menús autorizados ({todos ? 'todos' : `${cfg.menus_ids.length} de ${MENUS.length}`})</p>
        <div className="grid grid-cols-2 gap-2">
          <button onClick={() => setCfg({ ...cfg, menus_ids: [] })} className="min-h-11 rounded-xl bg-white ring-1 ring-slate-200 text-sm font-semibold">Todos</button>
          <button onClick={() => setCfg({ ...cfg, menus_ids: [MENUS[0].id] })} className="min-h-11 rounded-xl bg-white ring-1 ring-slate-200 text-sm font-semibold">Quitar todos</button>
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1">{['todos', ...TIPOS_MENU].map(t => (
          <button key={t} onClick={() => setTipo(t)} className={`min-h-10 px-3 rounded-full text-sm font-semibold whitespace-nowrap ${tipo === t ? 'bg-cibus text-white' : 'bg-white ring-1 ring-slate-200'}`}>{t === 'todos' ? 'Todos' : t}</button>))}</div>
        <ul className="space-y-1">{lista.map(m => {
          const on = todos || cfg.menus_ids.includes(m.id)
          return <li key={m.id}><button onClick={() => alternar(m.id)} aria-pressed={on} className={`w-full min-h-12 px-3 rounded-xl text-left text-sm font-semibold grid grid-cols-[auto_1fr] gap-2 items-center ring-1 ${on ? 'bg-emerald-50 ring-emerald-300' : 'bg-white ring-slate-200 text-slate-400'}`}><span>{on ? '✓' : '○'}</span><span className="break-words">{m.emoji} {m.nombre}</span></button></li>
        })}</ul>
      </div>
      {msg && <p className="rounded-lg bg-emerald-50 text-emerald-800 p-3 text-base">{msg}</p>}
      {error && <p className="rounded-lg bg-red-50 text-red-700 p-3 text-base">{error}</p>}
      <div className="grid gap-2">
        <button onClick={() => guardar()} disabled={ocupado} className="min-h-14 rounded-xl bg-cibus text-white text-lg font-bold disabled:opacity-50">{ocupado ? 'Espera…' : 'Guardar'}</button>
        <button onClick={probar} disabled={ocupado} className="min-h-14 rounded-xl bg-white ring-1 ring-cibus text-cibus text-lg font-bold disabled:opacity-50">Probar ahora (me llega a mí)</button>
      </div>
    </section>
  )
}
