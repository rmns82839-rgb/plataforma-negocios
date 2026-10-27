import { useState } from 'react'

// Video corto de la publicidad: arranca solo, sin sonido, en bucle. Si el cliente ahorra datos, solo ve la foto.
function VideoAnuncio({ src, poster }) {
  const [sonido, setSonido] = useState(false)
  if (navigator.connection?.saveData) return poster ? <img src={poster} alt="" className="w-full max-h-64 object-cover" /> : null
  return (
    <div className="relative bg-black">
      <video src={src} poster={poster || undefined} autoPlay muted={!sonido} loop playsInline preload="auto" className="w-full max-h-72 object-contain" />
      <button onClick={() => setSonido(s => !s)} aria-label={sonido ? 'Quitar el sonido' : 'Poner el sonido'}
        className="absolute left-3 bottom-3 h-11 px-4 rounded-full bg-black/60 text-white text-base backdrop-blur active:bg-black/80">{sonido ? '🔊 Sonido' : '🔇 Sin sonido'}</button>
    </div>
  )
}
// Contenido de la ventana de publicidad (lo usan el catálogo y la vista previa del dueño).
export const enlaceAnuncio = (a, whatsapp) => {
  if (a.boton_enlace) return a.boton_enlace
  if (a.boton_texto && whatsapp) return `https://wa.me/${whatsapp}?text=${encodeURIComponent(`Hola, vi el anuncio "${a.titulo}" en la tienda y quiero más información.`)}`
  return ''
}

export default function AnuncioTarjeta({ anuncio: a, whatsapp, onCerrar, vistaPrevia = false, cierreAuto = false }) {
  const url = enlaceAnuncio(a, whatsapp)
  const [quieto, setQuieto] = useState(false)           // el cliente la toca o la señala: se detiene el tiempo
  const seg = cierreAuto && a.segundos && !a.video ? a.segundos : 0     // con video no se cierra sola: el cliente lo ve completo
  return (
    <div onPointerEnter={() => setQuieto(true)} onPointerLeave={() => setQuieto(false)} onPointerDown={() => setQuieto(true)}
         className="relative w-full max-w-sm overflow-hidden rounded-3xl bg-white shadow-2xl ring-1 ring-white/20 anuncio-entra">
      {seg > 0 && (
        <span aria-hidden="true" className="absolute inset-x-0 top-0 z-10 h-1 bg-black/10">
          <span onAnimationEnd={onCerrar} style={{ animationDuration: `${seg}s`, animationPlayState: quieto ? 'paused' : 'running' }}
                className="block h-full bg-champagne anuncio-barra" />
        </span>
      )}
      <button onClick={onCerrar} aria-label="Cerrar publicidad"
        className="absolute right-3 top-3 z-10 h-9 w-9 rounded-full bg-black/55 text-white grid place-items-center backdrop-blur active:bg-black/70">✕</button>
      {a.video ? <VideoAnuncio src={a.video} poster={a.imagen} /> : a.imagen ? (
        <img src={a.imagen} alt="" className="w-full max-h-64 object-cover" />
      ) : (
        <div className="h-28 bg-gradient-to-br from-cibus-profundo via-cibus-oscuro to-cibus grid place-items-center">
          <img src="/isotipo-oro.png" alt="" className="h-12 w-12 object-contain opacity-80" />
        </div>
      )}
      <div className="p-5 space-y-3 text-center">
        <p className="text-[10px] uppercase tracking-[0.25em] text-slate-400">Publicidad</p>
        <h2 className="text-xl font-bold leading-tight text-cibus-oscuro">{a.titulo}</h2>
        {a.texto && <p className="text-sm text-slate-600 leading-relaxed">{a.texto}</p>}
        <div className="grid gap-2 pt-1">
          {url && (
            <a href={url} target="_blank" rel="noopener noreferrer sponsored" onClick={vistaPrevia ? (e) => e.preventDefault() : undefined}
               className="h-12 rounded-xl bg-cibus text-white font-semibold grid place-items-center active:opacity-90">
              {a.boton_texto || 'Ver más'}
            </a>
          )}
          <button onClick={onCerrar} className="h-10 rounded-xl text-sm text-slate-500 active:bg-slate-100">{vistaPrevia ? 'Cerrar vista previa' : 'No, gracias'}</button>
        </div>
      </div>
    </div>
  )
}
