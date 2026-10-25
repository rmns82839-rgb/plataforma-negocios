// Elegir o crear un cliente (para fiar o llevar la cuenta). Sirve en la caja y en pedidos.
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { mensajeError } from '../lib/errores'
import { cop } from '../lib/pedido'
import { Btn, Campo, clsInput } from '../tienda/ui'
import { soloDigitos } from '../lib/caja'

export default function ClienteSelector({ nid, cliente, onElegir, soloLectura }) {
  const [abierto, setAbierto] = useState(false)
  const [q, setQ] = useState('')
  const [lista, setLista] = useState([])
  const [nuevo, setNuevo] = useState(false)
  const [f, setF] = useState({ nombre: '', telefono: '' })
  const [msg, setMsg] = useState('')
  const [ocupado, setOcupado] = useState(false)

  useEffect(() => {
    if (!abierto) return
    let vivo = true
    const t = setTimeout(async () => {
      let consulta = supabase.from('clientes_saldo').select('id,nombre,telefono,saldo,cupo_credito').eq('negocio_id', nid).order('nombre').limit(8)
      const txt = q.trim().replace(/[%,()]/g, ' ')
      if (txt) {
        const dig = soloDigitos(txt)
        consulta = dig.length >= 3 ? consulta.or(`nombre.ilike.%${txt}%,telefono.ilike.%${dig}%`) : consulta.ilike('nombre', `%${txt}%`)
      }
      const { data } = await consulta
      if (vivo) setLista(data || [])
    }, 250)
    return () => { vivo = false; clearTimeout(t) }
  }, [abierto, q, nid])

  async function crear() {
    setMsg('')
    const nombre = f.nombre.trim()
    if (nombre.length < 3) return setMsg('Escribe el nombre del cliente')
    let tel = soloDigitos(f.telefono)
    if (tel.length === 12 && tel.startsWith('57')) tel = tel.slice(2)
    if (tel && tel.length !== 10) return setMsg('El celular debe tener 10 dígitos (o déjalo vacío)')
    setOcupado(true)
    const { data, error } = await supabase.from('clientes').insert({ negocio_id: nid, nombre, telefono: tel || null }).select('id,nombre,telefono').single()
    setOcupado(false)
    if (error) return setMsg(mensajeError(error))
    onElegir({ ...data, saldo: 0, cupo_credito: 0 }); setAbierto(false); setNuevo(false); setF({ nombre: '', telefono: '' })
  }

  if (cliente && !abierto) {
    return (
      <div className="rounded-2xl border-2 border-black/10 bg-white p-4">
        <p className="break-words text-xl font-bold">{cliente.nombre}</p>
        {cliente.telefono && <p className="text-lg text-tinta/70">{cliente.telefono}</p>}
        {Number(cliente.saldo) > 0 && <p className="text-lg font-semibold text-amber-800">Debe {cop(cliente.saldo)}{Number(cliente.cupo_credito) > 0 ? ` · cupo ${cop(cliente.cupo_credito)}` : ''}</p>}
        <div className="mt-3 grid grid-cols-2 gap-3">
          <Btn variante="suave" type="button" onClick={() => setAbierto(true)}>Cambiar</Btn>
          <Btn variante="suave" type="button" onClick={() => onElegir(null)}>Quitar</Btn>
        </div>
      </div>
    )
  }
  if (!abierto) return <Btn variante="suave" type="button" onClick={() => setAbierto(true)}>Elegir un cliente (opcional)</Btn>

  return (
    <div className="space-y-3 rounded-2xl border-2 border-black/10 bg-white p-4">
      <button type="button" onClick={() => { setAbierto(false); setNuevo(false); setMsg('') }} className="min-h-[48px] text-lg font-semibold text-principal">← Volver</button>
      {!nuevo ? (
        <>
          <input className={clsInput} placeholder="Buscar por nombre o celular" value={q} onChange={(e) => setQ(e.target.value)} />
          <div className="grid grid-cols-1 gap-2">
            {lista.map((c) => (
              <button key={c.id} type="button" onClick={() => { onElegir(c); setAbierto(false) }} className="min-h-[64px] rounded-2xl border-2 border-black/10 bg-white px-4 py-2 text-left">
                <span className="block break-words text-lg font-bold">{c.nombre}</span>
                <span className="block text-base text-tinta/70">{c.telefono || 'Sin celular'}{Number(c.saldo) > 0 ? ` · debe ${cop(c.saldo)}` : ''}</span>
              </button>
            ))}
            {lista.length === 0 && <p className="text-lg text-tinta/60">No hay clientes con ese dato.</p>}
          </div>
          {!soloLectura && <Btn type="button" onClick={() => { setNuevo(true); setF({ nombre: q.trim(), telefono: '' }) }}>Crear un cliente nuevo</Btn>}
        </>
      ) : (
        <>
          {msg && <p className="text-lg font-semibold text-red-700">{msg}</p>}
          <Campo etiqueta="Nombre completo"><input className={clsInput} value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} /></Campo>
          <Campo etiqueta="Celular (opcional)" ayuda="10 dígitos. Sirve para recordarle su cuenta por WhatsApp."><input className={clsInput} inputMode="tel" value={f.telefono} onChange={(e) => setF({ ...f, telefono: e.target.value })} /></Campo>
          <Btn type="button" disabled={ocupado} onClick={crear}>{ocupado ? 'Guardando…' : 'Guardar cliente'}</Btn>
          <button type="button" onClick={() => { setNuevo(false); setMsg('') }} className="min-h-[48px] text-lg font-semibold text-principal">← Volver a la lista</button>
        </>
      )}
    </div>
  )
}
