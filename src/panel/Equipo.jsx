import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { mensajeError } from '../lib/errores'
import { Btn, Volver, Aviso, Campo, clsInput } from '../tienda/ui'
import { Titulo, Seccion, Insignia, Opciones, SoloLectura, fechaHora } from './piezas'

const ROL = { dueno: 'Dueño', cajero: 'Cajero' }

export default function Equipo({ ctx, volver, miId }) {
  const nid = ctx.neg.negocio_id
  const [miembros, setMiembros] = useState(null)
  const [pend, setPend] = useState([])
  const [f, setF] = useState({ email: '', nombre: '', rol: 'cajero' })
  const [msg, setMsg] = useState(null)
  const [ocupado, setOcupado] = useState(false)
  const [quitar, setQuitar] = useState(null)

  const cargar = useCallback(async () => {
    const a = await supabase.rpc('listar_miembros', { p_negocio_id: nid })
    if (a.error) return setMsg({ tipo: 'error', texto: mensajeError(a.error) })
    setMiembros(a.data)
    const b = await supabase.from('invitaciones').select('email,rol,vence_en').eq('negocio_id', nid).is('usada_en', null).gt('vence_en', new Date().toISOString())
    setPend(b.data || [])
  }, [nid])
  useEffect(() => { cargar() }, [cargar])

  async function agregar() {
    setOcupado(true); setMsg(null)
    const { data, error } = await supabase.rpc('invitar_miembro', { p_negocio_id: nid, p_email: f.email, p_rol: f.rol, p_nombre: f.nombre.trim() || null })
    setOcupado(false)
    if (error) return setMsg({ tipo: 'error', texto: mensajeError(error) })
    setMsg({ tipo: 'ok', texto: data === 'agregado' ? 'Listo: esa persona ya hace parte de tu equipo.' : 'Quedó invitada. Cuando se registre con ese correo, entrará a tu equipo.' })
    setF({ email: '', nombre: '', rol: 'cajero' }); cargar()
  }
  async function sacar(m) {
    setOcupado(true); setMsg(null)
    const { error } = await supabase.rpc('quitar_miembro', { p_negocio_id: nid, p_user_id: m.user_id })
    setOcupado(false); setQuitar(null)
    if (error) return setMsg({ tipo: 'error', texto: mensajeError(error) })
    cargar()
  }

  return (
    <div className="pb-6">
      <Volver onClick={volver} texto="Volver al panel" />
      <Titulo sub="Quién puede entrar a tu panel.">Mi equipo</Titulo>
      {ctx.soloLectura && <SoloLectura />}
      {msg && <div className="mb-4"><Aviso tipo={msg.tipo}>{msg.texto}</Aviso></div>}

      {!miembros && !msg && <p className="py-8 text-center text-xl text-tinta/60">Cargando…</p>}
      <div className="mb-6 space-y-3">
        {miembros?.map((m) => (
          <div key={m.user_id} className="rounded-2xl border-2 border-black/5 bg-white p-4">
            <p className="break-all text-xl font-bold">{m.nombre || m.email}</p>
            {m.nombre && <p className="break-all text-lg text-tinta/70">{m.email}</p>}
            <div className="mt-2 flex flex-wrap gap-2"><Insignia tono="azul">{ROL[m.rol] || m.rol}</Insignia>{!m.activo && <Insignia tono="gris">Inactivo</Insignia>}{m.user_id === miId && <Insignia tono="verde">Tú</Insignia>}</div>
            {m.ultimo_ingreso && <p className="mt-1 text-lg text-tinta/60">Último ingreso: {fechaHora(m.ultimo_ingreso)}</p>}
            {!ctx.soloLectura && m.user_id !== miId && (quitar === m.user_id
              ? <div className="mt-3 grid grid-cols-2 gap-2"><Btn variante="suave" onClick={() => setQuitar(null)}>No</Btn><Btn disabled={ocupado} onClick={() => sacar(m)}>Sí, quitar</Btn></div>
              : <button onClick={() => setQuitar(m.user_id)} className="mt-3 min-h-[48px] text-lg font-semibold text-red-700 underline">Quitar del equipo</button>)}
          </div>
        ))}
      </div>

      {pend.length > 0 && (
        <Seccion titulo="Invitaciones pendientes">
          <ul className="space-y-2 text-lg">{pend.map((p) => <li key={p.email} className="break-all"><b>{p.email}</b> · {ROL[p.rol]} · vence {fechaHora(p.vence_en)}</li>)}</ul>
        </Seccion>
      )}

      {!ctx.soloLectura && (
        <Seccion titulo="Agregar a alguien">
          <div className="space-y-5">
            <Campo etiqueta="Correo de la persona"><input className={clsInput} type="email" inputMode="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Campo>
            <Campo etiqueta="Nombre (opcional)"><input className={clsInput} value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} maxLength={80} /></Campo>
            <Campo etiqueta="¿Qué puede hacer?">
              <Opciones valor={f.rol} onChange={(rol) => setF({ ...f, rol })} opciones={[['cajero', 'Cajero'], ['dueno', 'Dueño']]} />
              <span className="mt-2 block text-base text-tinta/60">El cajero atiende pedidos y productos. El dueño además cambia la tienda, el equipo y el plan.</span>
            </Campo>
            <Btn disabled={ocupado || !f.email.includes('@')} onClick={agregar}>{ocupado ? 'Agregando…' : 'Agregar al equipo'}</Btn>
          </div>
        </Seccion>
      )}
    </div>
  )
}
