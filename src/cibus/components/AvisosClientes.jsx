// Pantalla del dueño: enviar un aviso a los clientes que tienen la app y activaron los avisos.
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { claseInput } from '../lib/estilos'
import { confirmar } from '../lib/confirmar'
import { enviarAviso } from '../lib/avisosPush'
import AvisosAuto from './AvisosAuto'

export default function AvisosClientes() {
  const [cant, setCant] = useState(null)
  const [menu, setMenu] = useState('')
  const [titulo, setTitulo] = useState('')
  const [cuerpo, setCuerpo] = useState('')
  const [msg, setMsg] = useState('')
  const [error, setError] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [config, setConfig] = useState(null)

  useEffect(() => {
    supabase.rpc('listar_cantidad_push').then(({ data, error: e }) => {
      if (e) setError(/could not find the function|schema cache/i.test(e.message) ? 'Falta ejecutar migracion-v44.sql en Supabase' : e.message)
      else setCant(Number(data) || 0)
    })
    supabase.from('menu_hoy_publico').select('nombre').maybeSingle().then(({ data }) => setMenu(data?.nombre ?? ''), () => {})
    fetch('/api/enviar-push').then(r => r.json()).then(j => setConfig(j.configurado)).catch(() => setConfig(null))
  }, [])

  const enviar = async () => {
    setError(''); setMsg('')
    if (!titulo.trim() || !cuerpo.trim()) return setError('Escribe el título y el mensaje')
    if (!(await confirmar({ titulo: `¿Enviar este aviso a ${cant ?? 0} ${cant === 1 ? 'cliente' : 'clientes'}?`, texto: `${titulo}\n${cuerpo}`, si: 'Sí, enviar' }))) return
    setOcupado(true)
    try {
      const r = await enviarAviso({ titulo, cuerpo, tag: 'aviso-tienda' })
      setMsg(`Enviado a ${r.enviados} ${r.enviados === 1 ? 'aparato' : 'aparatos'}${r.fallidos ? ` (${r.fallidos} no se pudieron)` : ''}.`)
    } catch (e) { setError(e.message) }
    setOcupado(false)
  }

  return (
    <div className="space-y-4 max-w-2xl">
      <AvisosAuto />
      <div>
        <h2 className="text-xl font-bold">Enviar un aviso ahora</h2>
        <p className="text-sm text-slate-500">Llega como notificación al celular de los clientes que instalaron la app y activaron los avisos.</p>
      </div>
      <p className="rounded-2xl bg-white shadow-sm p-4 text-base"><b>{cant ?? '…'}</b> {cant === 1 ? 'cliente tiene' : 'clientes tienen'} los avisos activados.</p>
      {config === false && <p className="rounded-lg bg-amber-50 text-amber-800 p-3 text-base">Faltan las llaves de avisos en Vercel (VAPID). Aún no se pueden enviar.</p>}
      <div className="flex flex-wrap gap-2">
        {menu && <button onClick={() => { setTitulo('🍽️ Hoy cocina…'); setCuerpo(`${menu}. Pide los ingredientes en la tienda.`) }} className="min-h-11 px-4 rounded-full bg-white ring-1 ring-slate-200 text-sm font-semibold">Usar el menú de hoy</button>}
        <button onClick={() => { setTitulo('🔥 Ofertas de hoy'); setCuerpo('Entra al catálogo y mira las ofertas de esta semana.') }} className="min-h-11 px-4 rounded-full bg-white ring-1 ring-slate-200 text-sm font-semibold">Ofertas</button>
      </div>
      <label className="block text-sm font-semibold">Título
        <input value={titulo} maxLength={60} onChange={e => setTitulo(e.target.value)} className={`${claseInput} mt-1`} /></label>
      <label className="block text-sm font-semibold">Mensaje
        <textarea value={cuerpo} maxLength={200} rows={3} onChange={e => setCuerpo(e.target.value)} className={`${claseInput} mt-1`} /></label>
      {msg && <p className="rounded-lg bg-emerald-50 text-emerald-800 p-3 text-base">{msg}</p>}
      {error && <p className="rounded-lg bg-red-50 text-red-700 p-3 text-base">{error}</p>}
      <button disabled={ocupado || !cant} onClick={enviar} className="w-full min-h-14 rounded-xl bg-cibus text-white text-lg font-bold disabled:opacity-50">{ocupado ? 'Enviando…' : 'Enviar aviso'}</button>
      <p className="text-xs text-slate-400">Envía avisos con medida: pocos y útiles. Si molestan, la gente los desactiva.</p>
    </div>
  )
}
