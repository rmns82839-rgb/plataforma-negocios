// Cuenta los pedidos pendientes que llegaron desde los catálogos en línea (/tienda y /ropa).
// Se revisa al abrir, cada minuto y al volver a la app; si sube el número, el celular vibra un momento.
import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from './supabase'
import { sonar } from './sonidos'

const contar = async (tabla) => {
  const { count, error } = await supabase.from(tabla).select('id', { count: 'exact', head: true }).eq('estado', 'pendiente')
  return error ? 0 : (count ?? 0)
}

// Resumen de los pendientes de la tienda (número, entrega y total) para el aviso. Si falta la columna "entrega", se pide sin ella.
const resumenTienda = async () => {
  let r = await supabase.from('pedidos_tienda').select('numero, entrega, total').eq('estado', 'pendiente').order('creado_en', { ascending: false }).range(0, 4)
  if (r.error) r = await supabase.from('pedidos_tienda').select('numero, total').eq('estado', 'pendiente').order('creado_en', { ascending: false }).range(0, 4)
  return r.error ? [] : (r.data ?? [])
}

// Opiniones de clientes por revisar (solo el dueño puede verlas; sin migracion-v39 da 0)
const contarOpiniones = async () => {
  const { data, error } = await supabase.rpc('listar_comentarios_admin')
  return error || !Array.isArray(data) ? 0 : data.filter(c => c.estado === 'pendiente').length
}

export function usePedidosNuevos(activo = true, conOpiniones = false) {
  const [n, setN] = useState({ tienda: 0, ropa: 0, opiniones: 0 })
  const [lista, setLista] = useState([])
  const antes = useRef(null)
  const antesOp = useRef(null)
  const revisar = useCallback(async () => {
    const [tienda, ropa, opiniones] = await Promise.all([contar('pedidos_tienda'), contar('pedidos_ropa'), conOpiniones ? contarOpiniones() : 0])
    setN({ tienda, ropa, opiniones })
    setLista(tienda > 0 ? await resumenTienda() : [])
    const suma = tienda + ropa
    if (antes.current !== null && suma > antes.current) { try { navigator.vibrate?.([200, 100, 200]) } catch { /* sin vibración */ }; sonar('pedido') }
    else if (antesOp.current !== null && opiniones > antesOp.current) { try { navigator.vibrate?.([120, 80, 120]) } catch { /* sin vibración */ }; sonar('opinion') }
    antes.current = suma
    antesOp.current = conOpiniones ? opiniones : null      // sin permiso todavía: no hay con qué comparar (evita un sonido falso al abrir)
  }, [conOpiniones])
  useEffect(() => {
    if (!activo) return undefined
    revisar()
    const t = setInterval(() => { if (!document.hidden) revisar() }, 60000)
    const v = () => { if (!document.hidden) revisar() }
    document.addEventListener('visibilitychange', v)
    // pedidos: aviso casi al instante (tiempo real); si no hay conexión en vivo, queda la revisión de cada minuto
    let canal = null, espera = null
    try {
      for (const c of supabase.getChannels()) if (c.topic === 'realtime:avisos-pedidos') supabase.removeChannel(c)
      canal = supabase.channel('avisos-pedidos')
      for (const tabla of ['pedidos_tienda', 'pedidos_ropa']) canal.on('postgres_changes', { event: 'INSERT', schema: 'public', table: tabla }, () => { clearTimeout(espera); espera = setTimeout(revisar, 800) })
      canal.subscribe()
    } catch { canal = null }
    return () => { clearInterval(t); clearTimeout(espera); document.removeEventListener('visibilitychange', v); if (canal) { try { supabase.removeChannel(canal) } catch { /* ya cerrado */ } } }
  }, [activo, revisar])
  return { ...n, listaTienda: lista, total: n.tienda + n.ropa, revisar }
}
