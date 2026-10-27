import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { fechaHora } from '../lib/formato'
import { claseInput } from '../lib/estilos'
import { coincide } from '../lib/buscar'
import { useDueno } from '../context/rol'
import BarraFija from './BarraFija'

const TABLAS = {
  productos: 'Producto', clientes: 'Cliente', ventas: 'Venta', fiado_movimientos: 'Movimiento de fiado',
  gastos: 'Gasto', caja_movimientos: 'Retiro/ingreso de caja', prestamos: 'Préstamo', prestamo_pagos: 'Pago de préstamo', perfiles: 'Acceso de personal',
  pedidos_tienda: 'Pedido de la tienda', pedidos_ropa: 'Pedido de ropa', negocio: 'Datos del negocio',
  formas_pago: 'Forma de pago', compras: 'Compra', ajustes_inventario: 'Ajuste de inventario',
  anuncios: 'Anuncio', ofertas: 'Oferta', promociones: 'Promoción', accesos: 'Sesión',
}
const ACCIONES = { INSERT: 'creó', UPDATE: 'cambió', DELETE: 'borró', ENTRADA: 'entró a la app' }
const ROLES = { dueno: 'Dueño', cajero: 'Cajero', soporte: 'Soporte' }
const CAMPOS = {
  precio_venta: 'precio de venta', precio_compra: 'precio de compra', activo: 'activo', publicado: 'en tienda en línea',
  cupo_credito: 'cupo', dias_credito: 'plazo (días)', documento: 'documento', anulada: 'anulada', total: 'total',
  estado: 'estado', rol: 'rol', monto: 'monto', nombre: 'nombre', titulo: 'título', activa: 'encendido',
  direccion: 'dirección', telefono: 'teléfono', telefono2: 'teléfono 2', contacto2: 'segundo contacto', aplica_a: 'factura pagada', concepto: 'concepto', nit: 'NIT', eslogan: 'eslogan', tipo: 'tipo', cantidad: 'cantidad',
}
const corto = (v) => { const t = String(v ?? '—'); return t.length > 60 ? `${t.slice(0, 60)}…` : t }

const resumen = (a) => {
  if (a.accion === 'UPDATE' && a.despues) {
    return Object.keys(a.despues).map(k => `${CAMPOS[k] ?? k}: ${corto(a.antes?.[k])} → ${corto(a.despues[k])}`).join(' · ')
  }
  if (a.accion === 'ENTRADA') return `${ROLES[a.despues?.rol] ?? a.despues?.rol ?? ''}${a.despues?.detalle ? ` · desde ${a.despues.detalle}` : ''}`
  const d = a.despues ?? a.antes ?? {}
  return d.nombre || d.motivo_anulacion || d.monto || d.total_a_pagar || d.rol || ''
}

// Registro de quién hizo qué (cambios de precio, anulaciones, borrados, préstamos…). Solo el dueño.
export default function Auditoria({ rango }) {
  const dueno = useDueno()
  const [filas, setFilas] = useState([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [texto, setTexto] = useState('')

  const cargar = useCallback(async () => {
    setCargando(true); setError('')
    let q = supabase.from('auditoria').select('*').gte('fecha', rango.desde)
    if (rango.hasta) q = q.lt('fecha', rango.hasta)
    const { data, error: err } = await q.order('fecha', { ascending: false }).range(0, 999)
    if (err) setError(err.message)
    // las entradas a la app (tabla accesos) se mezclan en la misma lista; si falta la migración v28 se omiten
    let qa = supabase.from('accesos').select('id, fecha, correo, rol, detalle').gte('fecha', rango.desde)
    if (rango.hasta) qa = qa.lt('fecha', rango.hasta)
    const { data: acc, error: errAcc } = await qa.order('fecha', { ascending: false }).range(0, 499)
    const entradas = errAcc ? [] : (acc ?? []).map(x => ({
      id: `acc-${x.id}`, fecha: x.fecha, correo: x.correo, tabla: 'accesos', accion: 'ENTRADA',
      despues: { rol: x.rol, detalle: x.detalle }, antes: null, esSoporte: x.rol === 'soporte',
    }))
    setFilas([...(data ?? []), ...entradas].sort((x, y) => new Date(y.fecha) - new Date(x.fecha)))
    setCargando(false)
  }, [rango])
  useEffect(() => { if (dueno) cargar() }, [cargar, dueno])

  const visibles = useMemo(() => filas.filter(a =>
    coincide([a.correo, TABLAS[a.tabla], ACCIONES[a.accion], resumen(a)], texto)), [filas, texto])

  if (!dueno) return <p className="text-center text-sm text-slate-400 py-8">Solo el dueño ve la auditoría.</p>

  return (
    <div className="space-y-4">
      <BarraFija nivel={3.75}>
      <input value={texto} onChange={e => setTexto(e.target.value)}
             placeholder="Buscar por persona, producto o acción" className={claseInput} />
      </BarraFija>

      {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
      {cargando ? (
        <p className="text-center text-sm text-slate-400 py-8">Cargando…</p>
      ) : visibles.length === 0 ? (
        <p className="text-center text-sm text-slate-400 py-8">Sin movimientos para revisar</p>
      ) : (
        <ul className="bg-white rounded-2xl shadow-sm divide-y divide-slate-100">
          {visibles.map(a => (
            <li key={a.id} className="px-4 py-3 space-y-0.5">
              <p className={`text-sm font-medium ${a.esSoporte ? 'text-amber-800' : ''}`}>
                {a.correo ?? 'Cliente en línea'} {ACCIONES[a.accion]}{a.accion === 'ENTRADA' ? '' : ` · ${TABLAS[a.tabla] ?? a.tabla}`}
              </p>
              <p className="text-xs text-slate-500 break-words">{resumen(a)}</p>
              <p className="text-[11px] text-slate-400">{fechaHora(a.fecha)}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
