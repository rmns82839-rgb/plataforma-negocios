import { useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { fotosDe } from '../lib/fotos'
import { esGenerica } from '../lib/imagenGenerica'
import Modal from './Modal'

// Quita las imágenes «genéricas» (el dibujo con solo el nombre). Los productos NO se tocan: solo pierden esa imagen.
// Las fotos reales de un producto se conservan, aunque tenga una genérica al lado.
export default function QuitarGenericas({ productos, onCerrar, onGuardado }) {
  const afectados = useMemo(() => productos.filter(p => fotosDe(p).some(esGenerica)), [productos])
  const nImagenes = useMemo(() => afectados.reduce((a, p) => a + fotosDe(p).filter(esGenerica).length, 0), [afectados])
  const quedanSinFoto = useMemo(() => afectados.filter(p => fotosDe(p).every(esGenerica)), [afectados])
  const enLinea = quedanSinFoto.filter(p => p.publicado)
  const [ocultar, setOcultar] = useState(true)
  const [fase, setFase] = useState('ver')                 // ver | guardando | fin
  const [avance, setAvance] = useState(0)
  const [res, setRes] = useState(null)

  const quitar = async () => {
    setFase('guardando'); setAvance(0)
    let ok = 0, fallos = 0, motivo = '', ocultados = 0
    const rutas = []
    for (const [n, p] of afectados.entries()) {
      const nuevas = fotosDe(p).filter(x => !esGenerica(x))
      const viejas = fotosDe(p).filter(esGenerica)
      const cambio = { imagenes: nuevas }
      const oculta = ocultar && nuevas.length === 0 && p.publicado
      if (oculta) cambio.publicado = false
      const { error } = await supabase.from('productos').update(cambio).eq('id', p.id)
      if (error) { fallos++; motivo = motivo || error.message } else {
        ok++; if (oculta) ocultados++
        for (const u of viejas) { const m = /\/object\/public\/[^/]+\/(.+?)(?:\?|$)/.exec(u); if (m) rutas.push(decodeURIComponent(m[1])) }
      }
      setAvance(n + 1)
    }
    // borra también los archivos para no gastar espacio; si el permiso no alcanza, no pasa nada (la imagen ya no se usa)
    try { for (let i = 0; i < rutas.length; i += 50) await supabase.storage.from('prendas').remove(rutas.slice(i, i + 50)) } catch { /* opcional */ }
    setRes({ ok, fallos, motivo, ocultados }); setFase('fin'); onGuardado?.()
  }

  return (
    <Modal titulo="Quitar imágenes genéricas" onCerrar={fase === 'guardando' ? () => {} : onCerrar}>
      {fase === 'ver' && (afectados.length === 0 ? (
        <div className="space-y-3">
          <p className="text-base text-slate-700">No hay imágenes genéricas. Todo está limpio.</p>
          <button onClick={onCerrar} className="w-full min-h-12 rounded-xl bg-negro text-champagne text-base font-semibold">Cerrar</button>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-base text-slate-700 break-words">
            Hay <b>{nImagenes.toLocaleString('es-CO')}</b> {nImagenes === 1 ? 'imagen genérica' : 'imágenes genéricas'} (la que solo trae el nombre dibujado) en <b>{afectados.length.toLocaleString('es-CO')}</b> {afectados.length === 1 ? 'producto' : 'productos'}.
          </p>
          <ul className="text-sm text-slate-600 space-y-1 list-disc pl-5">
            <li>Los <b>productos no se borran</b>: solo pierden esa imagen.</li>
            <li>Las <b>fotos reales</b> no se tocan.</li>
            <li>{quedanSinFoto.length.toLocaleString('es-CO')} quedarán sin foto y volverán a salir en «Sin foto».</li>
          </ul>
          {enLinea.length > 0 && (
            <label className="flex items-start gap-3 rounded-xl bg-amber-50 p-3 text-base leading-snug">
              <input type="checkbox" checked={ocultar} onChange={e => setOcultar(e.target.checked)} className="mt-1 h-5 w-5 shrink-0" />
              <span>{enLinea.length.toLocaleString('es-CO')} de ellos se ven en la tienda en línea. Ocultarlos de la tienda hasta que tengan foto real.</span>
            </label>
          )}
          <div className="grid grid-cols-2 gap-2">
            <button onClick={onCerrar} className="min-h-12 rounded-xl bg-slate-100 text-slate-700 text-base font-semibold">← Cancelar</button>
            <button onClick={quitar} className="min-h-12 rounded-xl bg-red-600 text-white text-base font-semibold">Quitar imágenes</button>
          </div>
        </div>
      ))}
      {fase === 'guardando' && (
        <div className="space-y-2 py-2">
          <p className="text-sm font-medium text-slate-700 text-center">Quitando… {avance} de {afectados.length}</p>
          <div className="h-2.5 rounded-full bg-slate-100 overflow-hidden"><div className="h-full bg-marca" style={{ width: `${Math.max(6, Math.round(100 * avance / Math.max(1, afectados.length)))}%` }} /></div>
        </div>
      )}
      {fase === 'fin' && res && (
        <div className="space-y-3">
          <p className="text-base text-slate-700 break-words">Listo: se limpiaron <b>{res.ok}</b> productos{res.ocultados ? `, ${res.ocultados} ocultos de la tienda en línea hasta que tengan foto` : ''}.</p>
          {res.fallos > 0 && <p className="text-sm text-red-700 bg-red-50 rounded-lg px-3 py-2 break-words">{res.fallos} no se pudieron limpiar: {res.motivo}</p>}
          <button onClick={onCerrar} className="w-full min-h-12 rounded-xl bg-negro text-champagne text-base font-semibold">Cerrar</button>
        </div>
      )}
    </Modal>
  )
}
