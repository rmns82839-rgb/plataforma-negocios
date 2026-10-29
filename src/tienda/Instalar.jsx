import { useEffect, useState } from 'react'
import Icono from '../cibus/components/Iconos'
import { estaInstalada, guiaInstalacion, hayAviso, pedirInstalacion, suscribirPwa } from '../lib/pwa'
import { Btn } from './ui'

// Botón «Instalar la app»: en Android abre el aviso del navegador; en iPhone explica los 2 toques; si ya está instalada no aparece.
export default function Instalar({ texto = 'Instalar la app en mi celular' }) {
  const [, forzar] = useState(0)
  const [abierto, setAbierto] = useState(false)
  useEffect(() => suscribirPwa(() => forzar((n) => n + 1)), [])

  const g = guiaInstalacion({ instalada: estaInstalada(), tienePrompt: hayAviso(), ua: navigator.userAgent, maxTouch: navigator.maxTouchPoints })
  if (g.tipo === 'ninguna') return null
  if (g.tipo === 'boton') return <Btn variante="suave" onClick={() => pedirInstalacion()}><span className="inline-flex items-center justify-center gap-2"><Icono nombre="instalarApp" className="h-5 w-5" />{texto}</span></Btn>
  if (!abierto) return <Btn variante="suave" onClick={() => setAbierto(true)}><span className="inline-flex items-center justify-center gap-2"><Icono nombre="instalarApp" className="h-5 w-5" />{texto}</span></Btn>

  const pasos = g.tipo === 'ios'
    ? ['Toca el botón Compartir (el cuadro con una flecha hacia arriba), abajo en Safari.', 'Baja y toca «Añadir a pantalla de inicio».', 'Toca «Añadir». ¡Listo! Verás el ícono junto a tus otras apps.']
    : g.tipo === 'ios-otro-navegador'
      ? ['En iPhone solo Safari puede instalar apps. Abre esta misma página en Safari.', 'Toca Compartir (cuadro con flecha hacia arriba).', 'Elige «Añadir a pantalla de inicio» y toca «Añadir».']
      : ['Abre el menú del navegador (los tres puntos ⋮, arriba a la derecha).', 'Toca «Instalar app» o «Añadir a pantalla de inicio».', 'Confirma. Verás el ícono junto a tus otras apps.']
  return (
    <section aria-label="Cómo instalar la app" className="rounded-2xl border-2 border-black/10 bg-white p-4 text-left">
      <h3 className="mb-3 text-xl font-bold">Instalar la app</h3>
      <ol className="mb-4 space-y-3">{pasos.map((p, i) => (
        <li key={i} className="flex items-start gap-3 text-lg leading-snug"><span aria-hidden="true" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-principal text-lg font-bold text-white">{i + 1}</span><span className="pt-0.5">{p}</span></li>
      ))}</ol>
      <Btn variante="suave" onClick={() => setAbierto(false)}>← Volver</Btn>
    </section>
  )
}
