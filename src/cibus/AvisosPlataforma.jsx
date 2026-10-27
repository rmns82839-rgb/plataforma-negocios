// Avisos propios de la plataforma, arriba del panel: entradas del soporte y estado de la publicación de la tienda.
import { useEffect, useState } from 'react'
import { supabase } from './lib/supabase'
import { useDueno } from './context/rol'
import { usePlataforma } from './context/plataforma'

export default function AvisosPlataforma({ irAPublicar }) {
  const { ctx } = usePlataforma()
  const dueno = useDueno()
  const nid = ctx.neg.negocio_id
  const [avisos, setAvisos] = useState([])
  const [pub, setPub] = useState(null)
  useEffect(() => {
    let vivo = true
    ;(async () => {
      const [a, b] = await Promise.all([
        ctx.rol === 'dueno' ? supabase.rpc('accesos_pendientes') : { data: [] },
        supabase.rpc('estado_publicacion'),
      ])
      if (vivo) { setAvisos(a.data || []); setPub(b.data || null) }
    })()
    return () => { vivo = false }
  }, [ctx.rol, nid])
  const entendido = async () => { await supabase.rpc('marcar_accesos_vistos'); setAvisos([]) }
  return (
    <>
      {avisos.length > 0 && (
        <div className="rounded-2xl bg-amber-50 ring-1 ring-amber-300 px-4 py-3 grid grid-cols-[1fr_auto] gap-3 items-center">
          <span className="text-xs leading-snug text-amber-950"><b>El soporte de la plataforma entró a consultar tu negocio</b> ({avisos.length} {avisos.length === 1 ? 'vez' : 'veces'}). Solo puede ver, no modificar.</span>
          <button onClick={entendido} className="h-9 px-3 rounded-xl bg-white text-xs font-semibold text-amber-900 active:bg-amber-100">Entendido</button>
        </div>
      )}
      {pub && !pub.publicada && (
        <button onClick={dueno ? irAPublicar : undefined} className="w-full text-left rounded-2xl bg-white ring-1 ring-amber-400 px-4 py-3 text-sm leading-snug">
          <b>Tu tienda todavía no está publicada.</b> {pub.solicitada_en ? 'Ya pedimos publicarla; te avisamos cuando esté abierta.' : pub.lista ? (dueno ? 'Ya está lista: pide la publicación en «Datos del negocio».' : 'Ya está lista: el dueño debe pedir la publicación.') : `Falta: ${pub.faltantes?.[0] || 'revisar tus datos'}.`}
        </button>
      )}
    </>
  )
}
