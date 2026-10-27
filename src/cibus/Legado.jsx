// Pantallas que todavía son las de la plataforma anterior, dentro del menú y los colores de Cibus.
// Cada una se irá reemplazando por la de Cibus, una etapa a la vez.
import { lazy, Suspense } from 'react'
import { usePlataforma } from './context/plataforma'

const PANTALLAS = {
  productos: lazy(() => import('../panel/Productos')),
  fiados: lazy(() => import('../panel/Fiados')),
  reportes: lazy(() => import('../panel/Reportes')),
  clientes: lazy(() => import('../panel/Clientes')),
  pedidos: lazy(() => import('../panel/Pedidos')),
  formas: lazy(() => import('../panel/FormasPago')),
  plan: lazy(() => import('../panel/MiPlan')),
  categorias: lazy(() => import('../panel/Categorias')),
  tienda: lazy(() => import('../panel/MiTienda')),
  equipo: lazy(() => import('../panel/Equipo')),
  vitrina: lazy(() => import('../panel/Vitrina')),
  resumen: lazy(() => import('../panel/ResumenSemana')),
}
import { LEGADO } from './lib/etapas'

export default function Legado({ id, volver }) {
  const { ctx, userId } = usePlataforma()
  const [clave] = LEGADO[id] ?? []
  const Pantalla = PANTALLAS[clave]
  if (!Pantalla || !ctx) return null
  return (
    <div className="armazon rounded-2xl bg-papel p-4 sm:p-5 text-tinta">
      <Suspense fallback={<p className="py-8 text-center text-slate-400">Cargando…</p>}>
        <Pantalla ctx={ctx} volver={volver} miId={userId} irAFiados={() => {}} />
      </Suspense>
    </div>
  )
}
