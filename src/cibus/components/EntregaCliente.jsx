// En «Mis pedidos» del cliente: quién le lleva el pedido y, al recibirlo, calificar la entrega.
import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import Estrellas from './Estrellas'

export default function EntregaCliente({ pedido }) {
  const [en, setEn] = useState(null)
  const [estrellas, setEstrellas] = useState(null)
  const [error, setError] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const domicilio = pedido.entrega !== 'recoger'
  useEffect(() => {
    if (!domicilio || !pedido.id) return
    let vivo = true
    supabase.rpc('mi_entrega_pedido', { p_pedido_id: pedido.id }).then(({ data }) => { if (vivo) setEn(data ?? null) })
    return () => { vivo = false }
  }, [domicilio, pedido.id, pedido.seguimiento])
  if (!en || !en.nombre) return null
  const calificar = async () => {
    setOcupado(true); setError('')
    const { error: e } = await supabase.rpc('calificar_entrega_cliente', { p_pedido_id: pedido.id, p_estrellas: estrellas })
    setOcupado(false)
    if (e) return setError(e.message)
    setEn({ ...en, calificado: true, mi_calificacion: estrellas })
  }
  return (
    <div className="rounded-xl bg-slate-50 p-3 space-y-2">
      <p className="text-base text-slate-700 break-words">
        {en.estado === 'entregada' ? 'Lo entregó' : 'Lo lleva'}: <b>{en.nombre}</b>{en.calificacion ? ` · ★ ${Number(en.calificacion).toFixed(1)}` : ''}
      </p>
      {en.estado === 'entregada' && (en.calificado ? (
        <p className="text-base text-slate-600">Gracias por calificar: {'★'.repeat(en.mi_calificacion || 0)}</p>
      ) : (
        <>
          <p className="text-base text-slate-700">¿Cómo fue la entrega?</p>
          <Estrellas valor={estrellas} onElegir={setEstrellas} />
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button disabled={ocupado || !estrellas} onClick={calificar} className="w-full min-h-12 rounded-xl bg-negro text-champagne text-base font-semibold disabled:opacity-40">Enviar calificación</button>
        </>
      ))}
    </div>
  )
}
