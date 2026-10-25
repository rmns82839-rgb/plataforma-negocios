import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { cop } from '../lib/pedido'
import { mensajeError } from '../lib/errores'
import { Volver, Aviso } from '../tienda/ui'
import { Titulo, Seccion, Insignia } from './piezas'

export default function MiPlan({ ctx, volver }) {
  const [p, setP] = useState(null)
  const [planes, setPlanes] = useState([])
  const [error, setError] = useState('')
  useEffect(() => {
    supabase.rpc('mi_plan', { p_negocio_id: ctx.neg.negocio_id }).then(({ data, error: e }) => (e ? setError(mensajeError(e)) : setP(data)))
    supabase.from('planes').select('clave,nombre,descripcion,precio_mensual,max_productos').eq('activo', true).order('orden').then(({ data }) => setPlanes(data || []))
  }, [ctx.neg.negocio_id])

  const fecha = (d) => new Date(d + 'T12:00:00').toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' })
  return (
    <div className="pb-6">
      <Volver onClick={volver} texto="Volver al panel" />
      <Titulo>Mi plan</Titulo>
      {error && <Aviso tipo="error">{error}</Aviso>}
      {!p && !error && <p className="py-8 text-center text-xl text-tinta/60">Cargando…</p>}
      {p && (
        <>
          <Seccion>
            <p className="text-lg text-tinta/70">Tu plan</p>
            <p className="text-3xl font-bold text-principal">{p.nombre}</p>
            <p className="mt-2 text-2xl font-bold">{p.precio_vigente > 0 ? `${cop(p.precio_vigente)} al mes` : 'Sin costo'}</p>
            {p.fundador_hasta && p.precio_vigente < p.precio_mensual && <p className="mt-1 text-lg">Precio de fundador hasta el {fecha(p.fundador_hasta)}. Después: {cop(p.precio_mensual)} al mes.</p>}
          </Seccion>
          <Seccion titulo="Tu uso">
            <div className="space-y-2 text-lg">
              <div className="flex justify-between gap-3"><span>Productos</span><b>{p.productos_activos} de {p.max_productos ?? 'sin límite'}</b></div>
              {p.max_calculos_km_mes != null && <div className="flex justify-between gap-3"><span>Cálculos de domicilio por km este mes</span><b>{p.calculos_km_mes} de {p.max_calculos_km_mes}</b></div>}
            </div>
          </Seccion>
          <Seccion titulo="Lo que incluye tu tienda">
            <div className="flex flex-wrap gap-2">{p.modulos.map((m) => <Insignia key={m.modulo} tono="gris">{m.nombre}</Insignia>)}</div>
          </Seccion>
        </>
      )}
      {planes.length > 0 && (
        <Seccion titulo="Todos los planes">
          <div className="space-y-3">
            {planes.map((x) => (
              <div key={x.clave} className={`rounded-2xl border-2 p-4 ${p?.plan === x.clave ? 'border-principal bg-principal/5' : 'border-black/5'}`}>
                <div className="flex items-baseline justify-between gap-3"><p className="text-xl font-bold">{x.nombre}</p><p className="text-xl font-bold">{x.precio_mensual > 0 ? cop(x.precio_mensual) : 'Gratis'}</p></div>
                {x.descripcion && <p className="text-lg text-tinta/70">{x.descripcion}</p>}
                <p className="text-lg">Hasta {x.max_productos ?? 'sin límite de'} productos</p>
              </div>
            ))}
          </div>
          <p className="mt-3 text-lg text-tinta/70">Para cambiar de plan, escríbele a tu asesor de la plataforma.</p>
        </Seccion>
      )}
    </div>
  )
}
