// Clientes: buscar, ver sus datos y compras, y completar lo que hace falta para fiarles.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { mensajeError } from '../lib/errores'
import { cop } from '../lib/pedido'
import { soloDigitos } from '../lib/caja'
import { datosFaltantes, nombreTipoDoc } from '../lib/clientes'
import { Btn, Volver, Aviso, clsInput } from '../tienda/ui'
import { Titulo, Seccion, Insignia, Opciones, SoloLectura, fechaHora } from './piezas'
import ClienteForm from './ClienteForm'

const COLS = '*'

export default function Clientes({ ctx, volver, irAFiados }) {
  const nid = ctx.neg.negocio_id
  const [lista, setLista] = useState(null)
  const [error, setError] = useState('')
  const [q, setQ] = useState('')
  const [filtro, setFiltro] = useState('todos')
  const [vista, setVista] = useState(null)      // null · 'nuevo' · {id}
  const verFiados = ctx.modulos.includes('fiados')

  const cargar = useCallback(async () => {
    const { data, error: e } = await supabase.from('clientes_saldo').select(COLS).eq('negocio_id', nid).order('nombre').limit(1500)
    if (e) return setError(mensajeError(e))
    setError(''); setLista(data || [])
  }, [nid])
  useEffect(() => { cargar() }, [cargar])

  const visibles = useMemo(() => {
    if (!lista) return []
    const t = q.trim().toLowerCase(), d = soloDigitos(q)
    return lista
      .filter((c) => (filtro === 'deben' ? Number(c.saldo) > 0 : filtro === 'faltan' ? datosFaltantes(c).length > 0 : true))
      .filter((c) => !t || c.nombre.toLowerCase().includes(t) || (d.length >= 3 && (soloDigitos(c.telefono).includes(d) || soloDigitos(c.documento).includes(d) || soloDigitos(c.contacto2_telefono).includes(d))))
      .slice(0, 150)
  }, [lista, q, filtro])

  if (vista === 'nuevo') return <ClienteForm ctx={ctx} onVolver={() => setVista(null)} textoVolver="Volver a los clientes" onGuardado={(c) => { cargar(); setVista({ id: c.id }) }} />
  if (vista?.id) {
    const c = lista?.find((x) => x.id === vista.id)
    return <Detalle ctx={ctx} cliente={c} id={vista.id} verFiados={verFiados} irAFiados={irAFiados} volver={() => { setVista(null); cargar() }} />
  }

  return (
    <div>
      <Volver onClick={volver} texto="Volver al panel" />
      <Titulo sub="Datos de las personas que te compran.">Clientes</Titulo>
      {ctx.soloLectura && <SoloLectura />}
      {error && <div className="mb-4"><Aviso tipo="error">{error}</Aviso></div>}
      {!lista && !error && <p className="py-8 text-center text-xl text-tinta/60">Cargando…</p>}
      {lista && (
        <>
          <input className={`${clsInput} mb-3`} placeholder="Buscar por nombre, documento o celular" value={q} onChange={(e) => setQ(e.target.value)} />
          <div className="mb-4"><Opciones columnas={3} valor={filtro} opciones={[['todos', 'Todos'], ['deben', 'Los que deben'], ['faltan', 'Faltan datos']]} onChange={setFiltro} /></div>
          {visibles.length === 0 && <p className="rounded-2xl border-2 border-black/10 bg-white p-6 text-center text-xl">No hay clientes con ese dato.</p>}
          <div className="space-y-2">
            {visibles.map((c) => {
              const f = datosFaltantes(c)
              return (
                <button key={c.id} onClick={() => setVista({ id: c.id })} className="block w-full rounded-2xl border-2 border-black/5 bg-white p-4 text-left shadow-sm active:scale-[0.99]">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="break-words text-xl font-bold">{c.nombre}</span>
                    {Number(c.saldo) > 0 && <span className="shrink-0 text-xl font-bold text-principal">{cop(c.saldo)}</span>}
                  </div>
                  <p className="text-base text-tinta/70">{c.telefono || 'Sin celular'}{c.documento ? ` · ${c.tipo_documento || ''} ${c.documento}` : ''}</p>
                  {f.length > 0 && <div className="mt-1"><Insignia tono="ambar">Faltan datos para fiar</Insignia></div>}
                </button>
              )
            })}
          </div>
          {!ctx.soloLectura && <div className="mt-5"><Btn onClick={() => setVista('nuevo')}>Nuevo cliente</Btn></div>}
        </>
      )}
    </div>
  )
}

function Detalle({ ctx, cliente, id, verFiados, irAFiados, volver }) {
  const nid = ctx.neg.negocio_id
  const [c, setC] = useState(cliente)
  const [editar, setEditar] = useState(false)
  const [compras, setCompras] = useState(null)
  const [ok, setOk] = useState('')

  const recargar = useCallback(async () => {
    const [a, b] = await Promise.all([
      supabase.from('clientes_saldo').select(COLS).eq('negocio_id', nid).eq('id', id).single(),
      supabase.from('ventas').select('id,numero,fecha,total,anulada,metodo').eq('negocio_id', nid).eq('cliente_id', id).order('fecha', { ascending: false }).limit(30),
    ])
    if (a.data) setC(a.data)
    setCompras(b.data || [])
  }, [nid, id])
  useEffect(() => { recargar() }, [recargar])

  if (editar && c) return <ClienteForm ctx={ctx} cliente={c} resaltarFaltantes onVolver={() => setEditar(false)} textoVolver="Volver al cliente" onGuardado={() => { setEditar(false); setOk('✓ Datos guardados'); recargar() }} />
  if (!c) return <p className="py-8 text-center text-xl text-tinta/60">Cargando…</p>
  const falta = datosFaltantes(c)
  const saldo = Number(c.saldo || 0)
  const comprado = (compras || []).filter((v) => !v.anulada).reduce((s, v) => s + Number(v.total), 0)
  const dato = (k, v) => v ? <div className="flex justify-between gap-3 text-lg"><span className="text-tinta/60">{k}</span><span className="break-words text-right font-semibold">{v}</span></div> : null

  return (
    <div className="pb-6">
      <Volver onClick={volver} texto="Volver a los clientes" />
      <Titulo>{c.nombre}</Titulo>
      {ok && <div className="mb-4"><Aviso tipo="ok">{ok}</Aviso></div>}
      {falta.length > 0 && <div className="mb-4"><Aviso tipo="previa">Para poder fiarle falta: <b>{falta.join(', ')}</b>.</Aviso></div>}
      <div className="mb-5 grid grid-cols-2 gap-3">
        <div className="rounded-2xl border-2 border-black/5 bg-white p-4 text-center"><p className="break-words text-2xl font-bold text-principal">{saldo > 0 ? cop(saldo) : '$0'}</p><p className="text-lg text-tinta/70">Debe</p></div>
        <div className="rounded-2xl border-2 border-black/5 bg-white p-4 text-center"><p className="break-words text-2xl font-bold">{cop(comprado)}</p><p className="text-lg text-tinta/70">Compras recientes</p></div>
      </div>
      <Seccion titulo="Sus datos">
        <div className="space-y-2">
          {dato('Documento', c.documento ? `${nombreTipoDoc(c.tipo_documento) || ''} ${c.documento}`.trim() : '')}
          {dato('Celular', c.telefono)}
          {dato('Dirección', c.direccion)}
          {dato('Correo', c.email)}
          {dato('2.º contacto', c.contacto2_telefono ? `${c.contacto2_nombre || ''} · ${c.contacto2_telefono}` : '')}
          {ctx.esDueno && dato('Cupo', Number(c.cupo_credito) > 0 ? cop(c.cupo_credito) : '')}
          {ctx.esDueno && dato('Días para pagar', c.dias_credito > 0 ? String(c.dias_credito) : '')}
          {dato('Tipo', c.tipo_cliente === 'mayorista' ? 'Mayorista' : '')}
          {dato('Autorizó sus datos', c.acepta_datos_en ? fechaHora(c.acepta_datos_en) : '')}
          {!c.documento && !c.telefono && !c.direccion && <p className="text-lg text-tinta/60">Solo tiene el nombre.</p>}
        </div>
        {!ctx.soloLectura && <div className="mt-4"><Btn variante="suave" onClick={() => { setOk(''); setEditar(true) }}>{falta.length ? 'Completar los datos' : 'Corregir los datos'}</Btn></div>}
      </Seccion>
      {verFiados && <div className="mb-5"><Btn variante="suave" onClick={() => irAFiados(c.id)}>Ver su cuenta de fiado</Btn></div>}
      <Seccion titulo="Sus compras">
        {!compras && <p className="text-lg text-tinta/60">Cargando…</p>}
        {compras?.length === 0 && <p className="text-lg text-tinta/60">Todavía no tiene compras con su nombre.</p>}
        <ul className="space-y-3">
          {compras?.map((v) => (
            <li key={v.id} className="flex items-baseline justify-between gap-3 border-b border-black/5 pb-2 text-lg">
              <span><span className="block font-semibold">Venta #{v.numero}</span><span className="block text-base text-tinta/60">{fechaHora(v.fecha)}</span></span>
              <span className={`shrink-0 text-xl font-bold ${v.anulada ? 'text-tinta/40 line-through' : ''}`}>{cop(v.total)}</span>
            </li>
          ))}
        </ul>
      </Seccion>
    </div>
  )
}
