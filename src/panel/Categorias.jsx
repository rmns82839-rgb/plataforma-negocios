import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { traerTodo } from '../lib/traerTodo'
import { mensajeError } from '../lib/errores'
import { Btn, Volver, Aviso, Campo, clsInput } from '../tienda/ui'
import { Titulo, Insignia, SoloLectura } from './piezas'

export default function Categorias({ ctx, volver }) {
  const nid = ctx.neg.negocio_id
  const [lista, setLista] = useState(null)
  const [nombre, setNombre] = useState('')
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [borrar, setBorrar] = useState(null)

  const cargar = useCallback(async () => {
    const { data, error: e } = await supabase.from('categorias').select('id,nombre,orden,activa').eq('negocio_id', nid).order('orden').order('nombre')
    if (e) setError(mensajeError(e)); else setLista(data)
  }, [nid])
  useEffect(() => { cargar() }, [cargar])

  async function envolver(fn) { setOcupado(true); setError(''); setInfo(''); try { await fn() } catch (e) { setError(mensajeError(e)) } setOcupado(false) }

  const agregar = () => envolver(async () => {
    const n = nombre.trim()
    if (!n) throw new Error('Escribe el nombre de la categoría')
    const { error: e } = await supabase.from('categorias').insert({ negocio_id: nid, nombre: n, orden: (lista?.length || 0) + 1 })
    if (e) throw e
    setNombre(''); await cargar()
  })

  const mover = (i, d) => envolver(async () => {
    const j = i + d
    if (j < 0 || j >= lista.length) return
    const nueva = [...lista]; [nueva[i], nueva[j]] = [nueva[j], nueva[i]]
    for (let k = 0; k < nueva.length; k++) {
      if (nueva[k].orden !== k + 1) {
        const { error: e } = await supabase.from('categorias').update({ orden: k + 1 }).eq('negocio_id', nid).eq('id', nueva[k].id)
        if (e) throw e
      }
    }
    await cargar()
  })

  const alternar = (c) => envolver(async () => {
    const { error: e } = await supabase.from('categorias').update({ activa: !c.activa }).eq('negocio_id', nid).eq('id', c.id)
    if (e) throw e
    await cargar()
  })

  const eliminar = (c) => envolver(async () => {
    const { data, error: e } = await supabase.from('categorias').delete().eq('negocio_id', nid).eq('id', c.id).select('id')
    if (e) throw e
    if (!data?.length) throw new Error('Solo el dueño puede borrar categorías.')
    setBorrar(null); await cargar()
  })

  const traerDeProductos = () => envolver(async () => {
    const { data } = await traerTodo(() => supabase.from('productos').select('categoria').eq('negocio_id', nid).eq('activo', true).not('categoria', 'is', null).order('id'))
    const existentes = new Set((lista || []).map((c) => c.nombre))
    const nuevas = [...new Set((data || []).map((x) => x.categoria).filter((n) => n && !existentes.has(n)))]
    if (!nuevas.length) return setInfo('Ya tienes todas las categorías de tus productos.')
    const { error: e } = await supabase.from('categorias').insert(nuevas.map((n, i) => ({ negocio_id: nid, nombre: n, orden: (lista?.length || 0) + i + 1 })))
    if (e) throw e
    setInfo(`Se agregaron ${nuevas.length} categorías.`); await cargar()
  })

  return (
    <div className="pb-6">
      <Volver onClick={volver} texto="Volver al panel" />
      <Titulo sub="Las categorías salen como botones en tu tienda, en este orden.">Categorías</Titulo>
      {ctx.soloLectura && <SoloLectura />}
      {error && <div className="mb-4"><Aviso tipo="error">{error}</Aviso></div>}
      {info && <div className="mb-4"><Aviso tipo="ok">{info}</Aviso></div>}

      {!ctx.soloLectura && (
        <div className="mb-6 space-y-3">
          <Campo etiqueta="Nueva categoría"><input className={clsInput} value={nombre} maxLength={60} onChange={(e) => setNombre(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && agregar()} placeholder="Por ejemplo: Granos" /></Campo>
          <div className="grid grid-cols-2 gap-3">
            <Btn variante="suave" disabled={ocupado} onClick={traerDeProductos}>Traer las de mis productos</Btn>
            <Btn disabled={ocupado || !nombre.trim()} onClick={agregar}>Agregar</Btn>
          </div>
        </div>
      )}

      {!lista && !error && <p className="py-8 text-center text-xl text-tinta/60">Cargando…</p>}
      {lista?.length === 0 && <p className="rounded-2xl border-2 border-black/10 bg-white p-6 text-center text-xl">Aún no tienes categorías.</p>}
      <div className="space-y-3">
        {lista?.map((c, i) => (
          <div key={c.id} className="rounded-2xl border-2 border-black/5 bg-white p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="break-words text-xl font-bold">{c.nombre}</p>
              {!c.activa && <Insignia tono="gris">Oculta</Insignia>}
            </div>
            {!ctx.soloLectura && (
              <>
                <div className="mt-3 grid grid-cols-3 gap-2">
                  <Btn variante="suave" disabled={ocupado || i === 0} onClick={() => mover(i, -1)} aria-label="Subir">↑ Subir</Btn>
                  <Btn variante="suave" disabled={ocupado || i === lista.length - 1} onClick={() => mover(i, 1)} aria-label="Bajar">↓ Bajar</Btn>
                  <Btn variante="suave" disabled={ocupado} onClick={() => alternar(c)}>{c.activa ? 'Ocultar' : 'Mostrar'}</Btn>
                </div>
                {ctx.esDueno && (borrar === c.id
                  ? <div className="mt-3 grid grid-cols-2 gap-2"><Btn variante="suave" onClick={() => setBorrar(null)}>No</Btn><Btn disabled={ocupado} onClick={() => eliminar(c)}>Sí, borrar</Btn></div>
                  : <button onClick={() => setBorrar(c.id)} className="mt-3 min-h-[48px] text-lg font-semibold text-red-700 underline">Borrar categoría</button>)}
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
