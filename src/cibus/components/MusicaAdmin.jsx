// Pantalla del dueño: elegir (o quitar) la canción de fondo del catálogo.
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { cambiarMusica, quitarMusica, MAX_MUSICA_MB } from '../lib/musicaFondo'
import { confirmar } from '../lib/confirmar'

export default function MusicaAdmin() {
  const [actual, setActual] = useState(undefined)
  const [error, setError] = useState('')
  const [msg, setMsg] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [paso, setPaso] = useState('')

  const cargar = async () => {
    const { data, error: e } = await supabase.from('musica_fondo_publica').select('*').maybeSingle()
    if (e) { setError(/relation|does not exist|schema cache/i.test(e.message) ? 'Falta ejecutar migracion-v45.sql en Supabase' : e.message); return setActual(null) }
    setActual(data ?? null)
  }
  useEffect(() => { cargar() }, [])

  const subir = async (e) => {
    const f = e.target.files?.[0]; e.target.value = ''
    if (!f) return
    setOcupado(true); setError(''); setMsg('')
    const r = await cambiarMusica(f, actual?.url, setPaso)
    setOcupado(false); setPaso('')
    if (r.error) return setError(r.error)
    setMsg('Listo: la canción ya suena de fondo en el catálogo.' + (r.aviso ? ' ' + r.aviso : '')); cargar()
  }
  const quitar = async () => {
    if (!(await confirmar({ titulo: '¿Quitar la canción de fondo?', texto: 'Se borra también del almacenamiento.', si: 'Sí, quitar' }))) return
    setOcupado(true); const r = await quitarMusica(actual.url); setOcupado(false)
    if (r.error) return setError(r.error)
    setMsg('Canción quitada y borrada.'); cargar()
  }

  return (
    <div className="space-y-4 max-w-2xl">
      <div>
        <h2 className="text-xl font-bold">Música de fondo</h2>
        <p className="text-sm text-slate-500">Una canción que suena bajito mientras los clientes miran el catálogo. Ellos pueden silenciarla con un botón. Solo hay una a la vez: al cambiarla o quitarla, la anterior se borra.</p>
      </div>
      {msg && <p className="rounded-lg bg-emerald-50 text-emerald-800 p-3 text-base">{msg}</p>}
      {error && <p className="rounded-lg bg-red-50 text-red-700 p-3 text-base">{error}</p>}
      {actual && (
        <div className="rounded-2xl bg-white shadow-sm p-4 space-y-2">
          <p className="text-xs font-bold text-cibus">CANCIÓN ACTUAL</p>
          <p className="font-semibold break-words">{actual.nombre}</p>
          <audio src={actual.url} controls preload="none" className="w-full" />
          <button disabled={ocupado} onClick={quitar} className="w-full min-h-12 rounded-xl bg-red-50 text-red-700 font-semibold disabled:opacity-50">🗑 Quitar y borrar</button>
        </div>
      )}
      <label className={`w-full min-h-14 rounded-xl bg-cibus text-white text-lg font-bold grid place-items-center cursor-pointer ${ocupado ? 'opacity-50' : ''}`}>
        {ocupado ? (paso || 'Preparando…') : actual ? '＋ Cambiar la canción' : '＋ Subir una canción'}
        <input type="file" accept="audio/*" className="hidden" onChange={subir} disabled={ocupado} /></label>
      <p className="text-sm text-slate-500">Elige cualquier canción MP3 o M4A: si pesa más de {MAX_MUSICA_MB} MB, la app la comprime sola y, si aún así no cabe, la corta con un final suave. Suena en repetición y a volumen bajo.</p>
      <p className="text-sm rounded-lg bg-amber-50 text-amber-800 p-3">Ojo con los derechos de autor: poner música comercial en un negocio abierto al público puede requerir licencia (en Colombia, SAYCO y ACINPRO). Lo más tranquilo es usar música libre de derechos.</p>
    </div>
  )
}
