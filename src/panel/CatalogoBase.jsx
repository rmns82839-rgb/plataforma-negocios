import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { mensajeError } from '../lib/errores'
import { Btn, Volver, Aviso, BarraFija } from '../tienda/ui'
import { Titulo } from './piezas'

// Pantalla "Productos base": el tendero marca las categorías y la plataforma copia a su inventario
// los productos conocidos (nombre, código de barras, foto real cuando existe), SIN precio y ocultos.
export default function CatalogoBase({ ctx, volver }) {
  const nid = ctx.neg.negocio_id
  const [cats, setCats] = useState(null)
  const [marcadas, setMarcadas] = useState(new Set())
  const [error, setError] = useState('')
  const [cargando, setCargando] = useState(false)
  const [hecho, setHecho] = useState(null)

  useEffect(() => {
    let vivo = true
    supabase.rpc('catalogo_base_categorias', { p_negocio_id: nid }).then(({ data, error: e }) => {
      if (!vivo) return
      if (e) return setError(mensajeError(e))
      setCats(data || [])
      setMarcadas(new Set((data || []).filter((c) => c.nuevos > 0).map((c) => c.categoria)))
    })
    return () => { vivo = false }
  }, [nid])

  const total = useMemo(() => (cats || []).filter((c) => marcadas.has(c.categoria)).reduce((s, c) => s + c.nuevos, 0), [cats, marcadas])
  const alternar = (k) => setMarcadas((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n })
  const disponibles = (cats || []).filter((c) => c.nuevos > 0)

  async function cargar() {
    setCargando(true); setError('')
    const { data, error: e } = await supabase.rpc('cargar_catalogo_base', { p_negocio_id: nid, p_categorias: [...marcadas] })
    setCargando(false)
    if (e) return setError(mensajeError(e))
    setHecho(data?.cargados ?? 0)
  }

  if (hecho !== null) {
    return (
      <div>
        <Titulo>¡Listo!</Titulo>
        <Aviso tipo="ok">Se agregaron <b>{hecho}</b> productos a tu inventario. Entran <b>ocultos y en $0</b>: ponles el precio y toca «Mostrar» solo en los que vendes.</Aviso>
        <div className="mt-5"><Btn onClick={volver}>Ver mis productos</Btn></div>
      </div>
    )
  }

  return (
    <div className="pb-40">
      <Volver onClick={volver} texto="Volver a los productos" />
      <Titulo sub="Ya traen nombre, código de barras y, cuando hay, la foto. Tú solo les pones el precio.">Productos base</Titulo>
      {error && <div className="mb-4"><Aviso tipo="error">{error}</Aviso></div>}
      {!cats && !error && <p className="py-8 text-center text-xl text-tinta/60">Buscando productos…</p>}
      {cats && cats.length === 0 && <Aviso>Todavía no tenemos catálogo base para este tipo de negocio. Puedes crear tus productos uno por uno o con «Cargar muchos».</Aviso>}
      {cats && cats.length > 0 && disponibles.length === 0 && <Aviso tipo="ok">Ya tienes todos los productos base de tu tipo de negocio.</Aviso>}

      {disponibles.length > 0 && (
        <>
          <div className="mb-3 grid grid-cols-2 gap-3">
            <Btn variante="suave" onClick={() => setMarcadas(new Set(disponibles.map((c) => c.categoria)))}>Marcar todas</Btn>
            <Btn variante="suave" onClick={() => setMarcadas(new Set())}>Quitar todas</Btn>
          </div>
          <ul className="space-y-2">
            {disponibles.map((c) => {
              const on = marcadas.has(c.categoria)
              return (
                <li key={c.categoria}>
                  <label className={`flex min-h-[64px] cursor-pointer items-center gap-4 rounded-2xl border-2 px-4 py-3 ${on ? 'border-principal bg-principal/5' : 'border-black/10 bg-white'}`}>
                    <input type="checkbox" checked={on} onChange={() => alternar(c.categoria)} className="h-7 w-7 shrink-0 accent-principal" />
                    <span className="min-w-0 flex-1 break-words text-xl font-semibold leading-snug">{c.categoria}</span>
                    <span className="shrink-0 rounded-full bg-black/5 px-3 py-1 text-lg font-bold">{c.nuevos}</span>
                  </label>
                </li>
              )
            })}
          </ul>
          <BarraFija>
            <p className="mb-2 text-center text-lg">Se agregarán <b>{total}</b> productos, ocultos y en $0</p>
            <Btn disabled={cargando || total === 0} onClick={cargar}>{cargando ? 'Agregando…' : 'Agregar a mi inventario'}</Btn>
          </BarraFija>
        </>
      )}
    </div>
  )
}
