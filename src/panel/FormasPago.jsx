// Formas de pago de la tienda: el dueño las enciende, las ordena, les pone comisión y agrega otras.
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { mensajeError } from '../lib/errores'
import { idForma, leerComision } from '../lib/caja'
import { Btn, Aviso, Campo, clsInput } from '../tienda/ui'
import { Seccion, Insignia, Interruptor, Opciones } from './piezas'

const TIPOS = { efectivo: 'Efectivo', digital: 'Pago digital', datafono: 'Datáfono o tarjeta', fiado: 'Fiado (queda debiendo)' }

function Tarjeta({ f, i, total, editable, onGuardar, onMover }) {
  const [nombre, setNombre] = useState(f.nombre)
  const [comision, setComision] = useState(String(Number(f.comision || 0)).replace('.', ','))
  const [activa, setActiva] = useState(f.activa)
  const [msg, setMsg] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const conComision = f.tipo === 'digital' || f.tipo === 'datafono'
  const com = leerComision(comision)
  const cambio = nombre.trim() !== f.nombre || (conComision && com !== Number(f.comision || 0)) || activa !== f.activa
  const fija = f.tipo === 'efectivo'

  async function guardar() {
    setMsg('')
    if (!nombre.trim()) return setMsg('El nombre no puede quedar vacío')
    if (conComision && com === null) return setMsg('La comisión debe ser un número entre 0 y 20')
    setOcupado(true)
    const e = await onGuardar(f.id, { nombre: nombre.trim(), activa, ...(conComision ? { comision: com } : {}) })
    setOcupado(false)
    setMsg(e || '✓ Guardado')
  }
  return (
    <div className={`rounded-2xl border-2 p-4 ${activa ? 'border-black/10 bg-white' : 'border-black/5 bg-black/5'}`}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><Insignia tono={f.tipo === 'fiado' ? 'ambar' : 'gris'}>{TIPOS[f.tipo]}</Insignia>{!activa && <Insignia tono="rojo">Apagada</Insignia>}</div>
      <Campo etiqueta="Nombre"><input className={clsInput} maxLength={30} value={nombre} disabled={!editable} onChange={(e) => setNombre(e.target.value)} /></Campo>
      {conComision && (
        <div className="mt-3"><Campo etiqueta="Comisión (% que cobra el banco o el datáfono)" ayuda="Se descuenta de la ganancia en Reportes. Pon 0 si no cobra.">
          <input className={clsInput} inputMode="decimal" value={comision} disabled={!editable} onChange={(e) => setComision(e.target.value)} placeholder="0" />
        </Campo></div>
      )}
      {!fija && <div className="mt-3"><Interruptor valor={activa} onChange={setActiva} deshabilitado={!editable} texto={activa ? 'Encendida: sale al cobrar' : 'Apagada: no sale al cobrar'} /></div>}
      {fija && <p className="mt-3 text-base text-tinta/60">El efectivo siempre está encendido.</p>}
      {msg && <p className={`mt-3 text-lg font-semibold ${msg.startsWith('✓') ? 'text-green-800' : 'text-red-700'}`}>{msg}</p>}
      {editable && (
        <div className="mt-3 grid grid-cols-3 gap-2">
          <button type="button" disabled={i === 0} onClick={() => onMover(f.id, -1)} aria-label={`Subir ${f.nombre}`} className="min-h-[56px] rounded-2xl border-2 border-black/10 bg-white text-xl font-bold disabled:opacity-30">▲ Subir</button>
          <button type="button" disabled={i === total - 1} onClick={() => onMover(f.id, 1)} aria-label={`Bajar ${f.nombre}`} className="min-h-[56px] rounded-2xl border-2 border-black/10 bg-white text-xl font-bold disabled:opacity-30">▼ Bajar</button>
          <button type="button" disabled={!cambio || ocupado} onClick={guardar} className="min-h-[56px] rounded-2xl bg-principal text-lg font-bold text-white disabled:opacity-40">{ocupado ? '…' : 'Guardar'}</button>
        </div>
      )}
    </div>
  )
}

export default function FormasPago({ ctx }) {
  const nid = ctx.neg.negocio_id
  const editable = ctx.esDueno
  const [lista, setLista] = useState(null)
  const [error, setError] = useState('')
  const [nueva, setNueva] = useState({ nombre: '', tipo: 'digital', comision: '' })
  const [msgNueva, setMsgNueva] = useState('')

  async function cargar() {
    const { data, error: e } = await supabase.from('formas_pago').select('id,nombre,tipo,orden,activa,comision').eq('negocio_id', nid).order('orden')
    if (e) {
      const r = await supabase.from('formas_pago').select('id,nombre,tipo,orden,activa').eq('negocio_id', nid).order('orden')
      if (r.error) return setError(mensajeError(r.error))
      setError('Falta correr el archivo 18 en Supabase para poder poner comisiones.'); return setLista(r.data || [])
    }
    setLista(data || [])
  }
  useEffect(() => { cargar() /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [nid])

  async function guardar(id, datos) {
    const { error: e } = await supabase.from('formas_pago').update(datos).eq('negocio_id', nid).eq('id', id)
    if (e) return mensajeError(e)
    await cargar(); return ''
  }
  async function mover(id, dir) {
    const i = lista.findIndex((f) => f.id === id), j = i + dir
    if (j < 0 || j >= lista.length) return
    const a = lista[i], b = lista[j]
    const r1 = await supabase.from('formas_pago').update({ orden: b.orden }).eq('negocio_id', nid).eq('id', a.id)
    const r2 = await supabase.from('formas_pago').update({ orden: a.orden }).eq('negocio_id', nid).eq('id', b.id)
    if (r1.error || r2.error) setError(mensajeError(r1.error || r2.error))
    await cargar()
  }
  async function agregar() {
    setMsgNueva('')
    const id = idForma(nueva.nombre, lista.map((f) => f.id))
    const com = leerComision(nueva.comision)
    if (!nueva.nombre.trim() || !id) return setMsgNueva('Escribe el nombre de la forma de pago')
    if (com === null) return setMsgNueva('La comisión debe ser un número entre 0 y 20')
    const orden = Math.max(0, ...lista.map((f) => f.orden)) + 10
    const { error: e } = await supabase.from('formas_pago').insert({ negocio_id: nid, id, nombre: nueva.nombre.trim().slice(0, 30), tipo: nueva.tipo, comision: com, orden })
    if (e) return setMsgNueva(mensajeError(e))
    setNueva({ nombre: '', tipo: 'digital', comision: '' }); setMsgNueva('✓ Agregada'); await cargar()
  }

  if (!lista && !error) return <p className="py-8 text-center text-xl text-tinta/60">Cargando…</p>
  return (
    <div>
      <p className="mb-4 text-lg text-tinta/70">Estas son las formas con las que tus clientes pueden pagar en la caja. Aquí decides cuáles salen, en qué orden y cuánto cobra cada una de comisión.</p>
      {error && <div className="mb-4"><Aviso tipo="error">{error}</Aviso></div>}
      {!editable && <div className="mb-4"><Aviso>Solo el dueño puede cambiar las formas de pago.</Aviso></div>}
      <div className="space-y-3">
        {lista?.map((f, i) => <Tarjeta key={`${f.id}-${f.nombre}-${f.activa}-${f.comision}`} f={f} i={i} total={lista.length} editable={editable} onGuardar={guardar} onMover={mover} />)}
      </div>
      {editable && lista && (
        <Seccion titulo="Agregar otra forma de pago" className="mt-5">
          <div className="space-y-3">
            <Campo etiqueta="Nombre"><input className={clsInput} maxLength={30} value={nueva.nombre} onChange={(e) => setNueva({ ...nueva, nombre: e.target.value })} placeholder="Ej: Bre-B, Bancolombia" /></Campo>
            <Opciones valor={nueva.tipo} opciones={[['digital', 'Pago digital'], ['datafono', 'Datáfono o tarjeta']]} onChange={(tipo) => setNueva({ ...nueva, tipo })} />
            <Campo etiqueta="Comisión en % (opcional)"><input className={clsInput} inputMode="decimal" value={nueva.comision} onChange={(e) => setNueva({ ...nueva, comision: e.target.value })} placeholder="0" /></Campo>
            {msgNueva && <p className={`text-lg font-semibold ${msgNueva.startsWith('✓') ? 'text-green-800' : 'text-red-700'}`}>{msgNueva}</p>}
            <Btn onClick={agregar}>Agregar</Btn>
            <p className="text-base text-tinta/60">Las formas nuevas sirven para cobrar ventas. Los abonos de fiados aceptan efectivo, transferencia, Nequi, Daviplata y datáfono.</p>
          </div>
        </Seccion>
      )}
    </div>
  )
}
