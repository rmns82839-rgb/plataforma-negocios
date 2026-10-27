// Computador: escucha los códigos que manda el celular y los entrega a onCodigo.
import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { canalPar } from '../lib/pistolaCelular'

export function useReceptorCelular(activo, codigo, onCodigo) {
  const [celulares, setCelulares] = useState(0)
  const [enLinea, setEnLinea] = useState(false)
  const [fallo, setFallo] = useState(false)
  const [detalle, setDetalle] = useState('')
  const cb = useRef(onCodigo)
  const canal = useRef(null)
  useEffect(() => { cb.current = onCodigo })

  useEffect(() => {
    if (!activo || !codigo) return undefined
    const ch = canalPar(codigo, 'pc')
    canal.current = ch
    ch.on('broadcast', { event: 'codigo' }, ({ payload }) => {
      const c = String(payload?.codigo ?? '').trim().slice(0, 64)
      if (!c) return
      cb.current?.(c)
      ch.send({ type: 'broadcast', event: 'ok', payload: { codigo: c } })
    })
    ch.on('presence', { event: 'sync' }, () => {
      setCelulares(Object.keys(ch.presenceState()).filter(k => k.startsWith('cel')).length)
    })
    ch.subscribe(async (estado, err) => {
      setEnLinea(estado === 'SUBSCRIBED')
      setFallo(estado === 'CHANNEL_ERROR' || estado === 'TIMED_OUT')
      setDetalle(estado === 'SUBSCRIBED' ? '' : `${estado}${err?.message ? ': ' + err.message : ''}`)
      if (estado === 'SUBSCRIBED') await ch.track({ rol: 'pc' })
    })
    return () => { canal.current = null; supabase.removeChannel(ch); setCelulares(0); setEnLinea(false); setFallo(false); setDetalle('') }
  }, [activo, codigo])

  // manda un mensaje al celular (por ejemplo la venta en curso)
  const enviar = useCallback((evento, payload) => {
    if (canal.current) canal.current.send({ type: 'broadcast', event: evento, payload })
  }, [])

  return { celulares, enLinea, fallo, detalle, enviar }
}
