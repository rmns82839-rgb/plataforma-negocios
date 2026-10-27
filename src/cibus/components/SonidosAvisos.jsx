// Elegir con qué sonido avisa la caja cuando llega un pedido o una opinión. Se guarda en este equipo.
import { useState } from 'react'
import { useEffect } from 'react'
import { SONIDOS, leerPreferencias, guardarPreferencias, reproducir, cargarPropio, hayPropio, probarPropio } from '../lib/sonidos'
import { leerCancion, recortarAviso, guardarPropio, borrarPropio, MAX_SEG_AVISO } from '../lib/audioLocal'

// "Mi canción": se elige del celular, se recortan 10 segundos y queda guardada solo en este equipo
function CancionPropia({ tipo, valor, onElegir, volumen }) {
  const [tiene, setTiene] = useState(hayPropio(tipo))
  const [cancion, setCancion] = useState(null)       // { nombre, duracion, decodificado }
  const [inicio, setInicio] = useState(0)
  const [error, setError] = useState('')
  const [ocupado, setOcupado] = useState(false)
  useEffect(() => { cargarPropio(tipo).then(setTiene) }, [tipo])

  const elegir = async (e) => {
    const f = e.target.files?.[0]; e.target.value = ''
    if (!f) return
    setError(''); setOcupado(true)
    try { const c = await leerCancion(f); setCancion({ nombre: f.name, ...c }); setInicio(0) } catch (err) { setError(err.message) }
    setOcupado(false)
  }
  const guardar = async () => {
    setOcupado(true); setError('')
    try {
      await guardarPropio(tipo, await recortarAviso(cancion.decodificado, inicio))
      await cargarPropio(tipo); setTiene(true); setCancion(null); onElegir()
    } catch { setError('No se pudo guardar la canción en este equipo.') }
    setOcupado(false)
  }
  const quitar = async () => { await borrarPropio(tipo).catch(() => {}); await cargarPropio(tipo); setTiene(false); if (valor === 'propio') onElegir('campana') }
  const maxInicio = cancion ? Math.max(0, Math.floor(cancion.duracion - MAX_SEG_AVISO)) : 0
  return (
    <div className="rounded-xl bg-champagne/15 p-3 space-y-2">
      {tiene && !cancion && (
        <div className="grid grid-cols-[1fr_auto_auto] gap-2 items-center">
          <button onClick={() => onElegir()} aria-pressed={valor === 'propio'} className={`min-h-14 rounded-xl px-3 text-left ring-1 ${valor === 'propio' ? 'bg-negro text-champagne ring-negro' : 'bg-white text-slate-700 ring-slate-200'}`}>
            <span className="block text-base font-semibold">{valor === 'propio' ? '✓ ' : ''}Mi canción</span>
            <span className={`block text-sm ${valor === 'propio' ? 'text-champagne/80' : 'text-slate-500'}`}>{MAX_SEG_AVISO} segundos, solo en este celular</span>
          </button>
          <button onClick={() => probarPropio(tipo, volumen)} aria-label="Escuchar mi canción" className="h-14 w-14 rounded-xl bg-champagne/30 text-xl">▶</button>
          <button onClick={quitar} aria-label="Borrar mi canción" className="h-14 w-14 rounded-xl bg-red-50 text-red-600 text-xl">🗑</button>
        </div>
      )}
      {cancion ? (
        <div className="space-y-2">
          <p className="text-base font-semibold break-words">{cancion.nombre}</p>
          <label className="block text-sm text-slate-600">Empezar en el segundo: <b>{inicio}</b> (de {Math.floor(cancion.duracion)})
            <input type="range" min="0" max={maxInicio} value={inicio} onChange={e => setInicio(Number(e.target.value))} disabled={maxInicio === 0} className="w-full h-10 accent-[#0b0b0b]" /></label>
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => setCancion(null)} className="min-h-12 rounded-xl bg-white ring-1 ring-slate-200 font-semibold">← Volver</button>
            <button disabled={ocupado} onClick={guardar} className="min-h-12 rounded-xl bg-negro text-champagne font-semibold disabled:opacity-50">{ocupado ? 'Guardando…' : `Guardar ${MAX_SEG_AVISO} s`}</button>
          </div>
        </div>
      ) : (
        <label className="min-h-12 rounded-xl bg-white ring-1 ring-slate-300 text-base font-semibold grid place-items-center cursor-pointer active:bg-slate-50">
          {ocupado ? 'Leyendo…' : tiene ? '＋ Cambiar mi canción' : '＋ Usar una canción de mi celular'}
          <input type="file" accept="audio/*" className="hidden" onChange={elegir} disabled={ocupado} /></label>
      )}
      {error && <p className="text-sm text-red-700 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
    </div>
  )
}

function Lista({ titulo, tipo, valor, onElegir, volumen }) {
  return (
    <section className="bg-white rounded-2xl shadow-sm p-4 space-y-3">
      <h3 className="text-base font-semibold break-words">{titulo}</h3>
      <ul className="space-y-2">
        {SONIDOS.map(s => (
          <li key={s.id} className="grid grid-cols-[1fr_auto] gap-2 items-center">
            <button onClick={() => onElegir(s.id)} aria-pressed={valor === s.id}
              className={`min-h-14 rounded-xl px-3 text-left leading-tight ring-1 ${valor === s.id ? 'bg-negro text-champagne ring-negro' : 'bg-white text-slate-700 ring-slate-200 active:bg-slate-50'}`}>
              <span className="block text-base font-semibold">{valor === s.id ? '✓ ' : ''}{s.texto}</span>
              <span className={`block text-sm ${valor === s.id ? 'text-champagne/80' : 'text-slate-500'}`}>{s.nota}</span>
            </button>
            <button onClick={() => reproducir(s.id, volumen)} aria-label={`Escuchar ${s.texto}`}
              className="h-14 w-14 rounded-xl bg-champagne/30 text-negro text-xl active:bg-champagne/50">▶</button>
          </li>
        ))}
      </ul>
      <CancionPropia tipo={tipo} valor={valor} volumen={volumen} onElegir={(id = 'propio') => onElegir(id)} />
    </section>
  )
}

export default function SonidosAvisos() {
  const [p, setP] = useState(leerPreferencias)
  const [sinSonido, setSinSonido] = useState(false)
  const cambiar = (parcial) => { guardarPreferencias(parcial); setP(leerPreferencias()) }
  const probar = (id, vol, tipo) => { const ok = id === 'propio' ? probarPropio(tipo, vol) : reproducir(id, vol); setSinSonido(!ok) }

  return (
    <div className="space-y-4 lg:max-w-2xl lg:mx-auto">
      <div>
        <h2 className="text-xl font-bold text-slate-800">Sonidos de los avisos</h2>
        <p className="text-base text-slate-600">Elige cómo suena la caja cuando llega un pedido o una opinión. Se guarda en este equipo. Toca ▶ para escucharlo.</p>
      </div>
      <button onClick={() => cambiar({ activo: !p.activo })} aria-pressed={p.activo}
        className={`w-full min-h-14 rounded-2xl text-lg font-semibold ${p.activo ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-600'}`}>
        {p.activo ? '🔔 Sonidos encendidos' : '🔕 Sonidos apagados'}
      </button>
      <section className="bg-white rounded-2xl shadow-sm p-4 space-y-2">
        <label htmlFor="vol" className="text-base font-semibold">Volumen</label>
        <input id="vol" type="range" min="0.2" max="1" step="0.1" value={p.volumen}
          onChange={e => cambiar({ volumen: Number(e.target.value) })}
          onPointerUp={() => probar(p.pedido, p.volumen, 'pedido')} className="w-full h-10 accent-[#0b0b0b]" />
      </section>
      {sinSonido && <p className="text-base text-red-600 bg-red-50 rounded-lg px-3 py-2">Este equipo no dejó sonar. Sube el volumen del celular, quita el modo silencio y toca de nuevo.</p>}
      <Lista titulo="Cuando llega un pedido" tipo="pedido" valor={p.pedido} volumen={p.volumen} onElegir={(id) => { cambiar({ pedido: id }); probar(id, p.volumen, 'pedido') }} />
      <Lista titulo="Cuando llega una opinión" tipo="opinion" valor={p.opinion} volumen={p.volumen} onElegir={(id) => { cambiar({ opinion: id }); probar(id, p.volumen, 'opinion') }} />
      <p className="text-sm text-slate-500">Para que suene, la app debe estar abierta (aunque sea en segundo plano). El navegador pide que toques la pantalla una vez después de abrirla.</p>
    </div>
  )
}
