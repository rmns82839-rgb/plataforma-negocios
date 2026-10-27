import { useState } from 'react'
import { fotosDe } from '../lib/fotos'
import { supabase } from '../lib/supabase'
import { useDueno } from '../context/rol'
import { textoMetodo } from '../lib/pagos'
import { construirExcel, bajarArchivo } from '../lib/exportar'
import { hoyTexto } from '../lib/periodo'
import { etiquetaRango, hojasResumen, pedirTablero } from '../lib/tablero'
import FiltroFechas from './FiltroFechas'

// Trae todas las filas de una consulta, de 1000 en 1000 (el servidor entrega máximo 1000 por vez).
async function traerTodo(armar) {
  const filas = []
  for (let desde = 0; ; desde += 1000) {
    const { data, error } = await armar().range(desde, desde + 999)
    if (error) throw error
    filas.push(...data)
    if (data.length < 1000) return filas
  }
}
const entre = (q, rango, campo = 'fecha') => {
  q = q.gte(campo, rango.desde)
  return rango.hasta ? q.lt(campo, rango.hasta) : q
}
const formasDe = (v) => (v.venta_pagos?.length
  ? v.venta_pagos.map(p => `${textoMetodo(p.metodo)} ${Number(p.monto).toLocaleString('es-CO')}`).join(' + ')
  : textoMetodo(v.metodo))
const doc = (c) => (c?.documento ? `${c.tipo_documento ?? ''} ${c.documento}`.trim() : '')

const CONJUNTOS = [
  {
    id: 'productos', texto: 'Productos y stock', nota: 'Todo el inventario actual',
    cargar: async () => ({
      nombre: 'Productos',
      filas: await traerTodo(() => supabase.from('productos').select('*').order('nombre')),
      columnas: [
        { titulo: 'Código de barras', ancho: 18, valor: f => f.codigo },
        { titulo: 'Nombre', ancho: 32, valor: f => f.nombre },
        { titulo: 'Categoría', valor: f => f.categoria },
        { titulo: 'Unidad', ancho: 8, valor: f => f.unidad },
        { titulo: 'Precio compra', tipo: 'numero', valor: f => f.precio_compra },
        { titulo: 'Precio venta', tipo: 'numero', valor: f => f.precio_venta },
        { titulo: 'Stock', tipo: 'numero', ancho: 10, valor: f => f.stock },
        { titulo: 'Stock mínimo', tipo: 'numero', ancho: 12, valor: f => f.stock_minimo },
        { titulo: 'Vencimiento', tipo: 'fecha', valor: f => f.fecha_vencimiento },
        { titulo: 'Activo', ancho: 8, valor: f => (f.activo ? 'Sí' : 'No') },
        { titulo: 'Tiene foto', ancho: 11, valor: f => (fotosDe(f).length > 0 ? 'Sí' : 'No') },
        { titulo: 'Cant. fotos', tipo: 'numero', ancho: 11, valor: f => fotosDe(f).length },
      ],
    }),
  },
  {
    id: 'sinfoto', texto: 'Productos sin foto', nota: 'Solo los que aún no tienen foto, por categoría, para imprimir',
    cargar: async () => ({
      nombre: 'Sin foto',
      filas: (await traerTodo(() => supabase.from('productos').select('*').eq('activo', true).order('categoria').order('nombre')))
        .filter(f => fotosDe(f).length === 0),
      columnas: [
        { titulo: 'Categoría', ancho: 20, valor: f => f.categoria },
        { titulo: 'Nombre', ancho: 38, valor: f => f.nombre },
        { titulo: 'Código de barras', ancho: 18, valor: f => f.codigo },
        { titulo: 'Precio venta', tipo: 'numero', valor: f => f.precio_venta },
        { titulo: 'Stock', tipo: 'numero', ancho: 9, valor: f => f.stock },
        { titulo: 'Foto lista', ancho: 11, valor: () => '' },
      ],
    }),
  },
  {
    id: 'lotes', texto: 'Lotes de mercancía', nota: 'Entradas por lote y cuánto queda',
    cargar: async () => ({
      nombre: 'Lotes',
      filas: await traerTodo(() => supabase.from('lotes_saldo').select('*').order('fecha', { ascending: false })),
      columnas: [
        { titulo: 'Entrada', tipo: 'fecha', valor: f => f.fecha },
        { titulo: 'Código de barras', ancho: 18, valor: f => f.producto_codigo },
        { titulo: 'Producto', ancho: 32, valor: f => f.producto_nombre },
        { titulo: 'Lote', valor: f => f.numero },
        { titulo: 'Vence', tipo: 'fecha', valor: f => f.fecha_vencimiento },
        { titulo: 'Cantidad', tipo: 'numero', valor: f => f.cantidad },
        { titulo: 'Queda', tipo: 'numero', valor: f => f.restante },
        { titulo: 'Costo unitario', tipo: 'numero', valor: f => f.costo_unitario },
      ],
    }),
  },
  {
    id: 'clientes', texto: 'Clientes y fiados', nota: 'Datos, cupo y lo que deben',
    cargar: async () => ({
      nombre: 'Clientes',
      filas: await traerTodo(() => supabase.from('clientes_saldo').select('*').order('nombre')),
      columnas: [
        { titulo: 'Nombre', ancho: 30, valor: f => f.nombre },
        { titulo: 'Tipo doc.', ancho: 10, valor: f => f.tipo_documento },
        { titulo: 'Documento', ancho: 16, valor: f => f.documento },
        { titulo: 'Teléfono', valor: f => f.telefono },
        { titulo: 'Segundo contacto', ancho: 22, valor: f => f.contacto2 },
        { titulo: 'Teléfono 2', valor: f => f.telefono2 },
        { titulo: 'Correo', ancho: 26, valor: f => f.email },
        { titulo: 'Dirección', ancho: 30, valor: f => f.direccion },
        { titulo: 'Cupo de crédito', tipo: 'numero', valor: f => f.cupo_credito },
        { titulo: 'Plazo (días)', tipo: 'numero', valor: f => f.dias_credito },
        { titulo: 'Debe', tipo: 'numero', valor: f => f.saldo },
        { titulo: 'Vence el', tipo: 'fecha', valor: f => (Number(f.saldo) > 0 ? f.vence_el : null) },
      ],
    }),
  },
  {
    id: 'ventas', texto: 'Ventas (detalle)', nota: 'Una fila por producto vendido', rango: true,
    cargar: async (rango) => {
      const pedir = (sel) => traerTodo(() => entre(supabase.from('ventas').select(sel)
        .order('fecha', { ascending: false }), rango))
      let ventas
      try {
        ventas = await pedir('*, clientes(nombre, tipo_documento, documento), venta_items(nombre, cantidad, precio_unitario, costo_unitario, descuento_linea, promo), venta_pagos(metodo, monto, comision)')
      } catch {   // todavía sin migracion-v8/v9
        ventas = await pedir('*, clientes(nombre, tipo_documento, documento), venta_items(nombre, cantidad, precio_unitario, costo_unitario)')
      }
      const filas = ventas.flatMap(v => v.venta_items.map((it, i) => ({ v, it, primero: i === 0 })))
      return {
        nombre: 'Ventas', filas,
        columnas: [
          { titulo: 'N.º factura', tipo: 'numero', valor: f => f.v.numero },
          { titulo: 'Fecha', tipo: 'fechahora', ancho: 18, valor: f => f.v.fecha },
          { titulo: 'Forma(s) de pago', ancho: 24, valor: f => formasDe(f.v) },
          { titulo: 'Cliente', ancho: 26, valor: f => f.v.clientes?.nombre },
          { titulo: 'Documento', valor: f => doc(f.v.clientes) },
          { titulo: 'Producto', ancho: 30, valor: f => f.it.nombre },
          { titulo: 'Cantidad', tipo: 'numero', valor: f => f.it.cantidad },
          { titulo: 'Precio', tipo: 'numero', valor: f => f.it.precio_unitario },
          { titulo: 'Subtotal', tipo: 'numero', valor: f => Number(f.it.precio_unitario) * Number(f.it.cantidad) },
          { titulo: 'Descuento del producto', tipo: 'numero', valor: f => Number(f.it.descuento_linea || 0) },
          { titulo: 'Promoción', ancho: 20, valor: f => f.it.promo },
          { titulo: 'Costo', tipo: 'numero', valor: f => Number(f.it.costo_unitario) * Number(f.it.cantidad) },
          // lo de toda la factura solo se pone en su primera fila para no sumarlo de más
          { titulo: 'Descuento de la factura', tipo: 'numero', valor: f => (f.primero ? Number(f.v.descuento) : null) },
          { titulo: 'Comisión datáfono', tipo: 'numero', valor: f => (f.primero ? (f.v.venta_pagos ?? []).reduce((s, p) => s + Number(p.comision || 0), 0) : null) },
          { titulo: 'Domicilio', ancho: 10, valor: f => (f.v.domicilio ? 'Sí' : 'No') },
          { titulo: 'Costo del envío', tipo: 'numero', valor: f => (f.primero && f.v.domicilio ? Number(f.v.dom_costo || 0) : null) },
          { titulo: 'Total de la factura', tipo: 'numero', valor: f => (f.primero ? Number(f.v.total) : null) },
          { titulo: 'Nota de la venta', ancho: 30, valor: f => (f.primero ? f.v.nota : null) },
          { titulo: 'Estado', valor: f => (f.v.anulada ? 'Anulada' : 'Válida') },
        ],
      }
    },
  },
  {
    id: 'pagos', texto: 'Pagos y abonos', nota: 'Abonos de fiados (y préstamos si eres el dueño)', rango: true,
    cargar: async (rango, dueno) => {
      const ab = await traerTodo(() => entre(supabase.from('fiado_movimientos')
        .select('fecha, monto, metodo, clientes(nombre, tipo_documento, documento)').eq('tipo', 'abono')
        .order('fecha', { ascending: false }), rango))
      const pp = dueno ? await traerTodo(() => entre(supabase.from('prestamo_pagos')
        .select('fecha, monto, metodo, prestamos(clientes(nombre, tipo_documento, documento))')
        .order('fecha', { ascending: false }), rango)) : []
      const filas = [
        ...ab.map(a => ({ ...a, tipo: 'Abono a fiado', cliente: a.clientes })),
        ...pp.map(g => ({ ...g, tipo: 'Pago de préstamo', cliente: g.prestamos?.clientes })),
      ].sort((a, b) => new Date(b.fecha) - new Date(a.fecha))
      return {
        nombre: 'Pagos', filas,
        columnas: [
          { titulo: 'Fecha', tipo: 'fechahora', ancho: 18, valor: f => f.fecha },
          { titulo: 'Tipo', ancho: 18, valor: f => f.tipo },
          { titulo: 'Cliente', ancho: 26, valor: f => f.cliente?.nombre },
          { titulo: 'Documento', valor: f => doc(f.cliente) },
          { titulo: 'Forma de pago', valor: f => textoMetodo(f.metodo) },
          { titulo: 'Valor', tipo: 'numero', valor: f => f.monto },
        ],
      }
    },
  },
  {
    id: 'domicilios', texto: 'Domicilios', nota: 'Dirección, envío y estado de cada entrega', rango: true,
    cargar: async (rango) => ({
      nombre: 'Domicilios',
      filas: await traerTodo(() => entre(supabase.from('ventas')
        .select('numero, fecha, total, anulada, dom_direccion, dom_telefono, dom_costo, dom_estado, dom_entregado_en, clientes(nombre)')
        .eq('domicilio', true).order('fecha', { ascending: false }), rango)),
      columnas: [
        { titulo: 'N.º factura', tipo: 'numero', valor: f => f.numero },
        { titulo: 'Fecha', tipo: 'fechahora', ancho: 18, valor: f => f.fecha },
        { titulo: 'Cliente', ancho: 26, valor: f => f.clientes?.nombre },
        { titulo: 'Dirección', ancho: 34, valor: f => f.dom_direccion },
        { titulo: 'Teléfono', valor: f => f.dom_telefono },
        { titulo: 'Costo del envío', tipo: 'numero', valor: f => f.dom_costo },
        { titulo: 'Total', tipo: 'numero', valor: f => f.total },
        { titulo: 'Estado', valor: f => ({ pendiente: 'Pendiente', en_camino: 'En camino', entregado: 'Entregado', cancelado: 'Cancelado' }[f.dom_estado] ?? f.dom_estado) },
        { titulo: 'Entregado', tipo: 'fechahora', ancho: 18, valor: f => f.dom_entregado_en },
      ],
    }),
  },
  {
    id: 'mora', texto: 'Cartera y mora', nota: 'Quién debe, cuánto está vencido y el recargo', soloDueno: true,
    cargar: async () => {
      const cl = await traerTodo(() => supabase.from('clientes_saldo').select('*').order('nombre'))
      const { data: mo } = await supabase.from('clientes_mora').select('*')   // vacío si falta migracion-v9
      const mora = Object.fromEntries((mo ?? []).map(m => [m.cliente_id, m]))
      return {
        nombre: 'Cartera y mora',
        filas: cl.filter(c => Number(c.saldo) > 0).sort((a, b) => Number(b.saldo) - Number(a.saldo)),
        columnas: [
          { titulo: 'Cliente', ancho: 28, valor: f => f.nombre },
          { titulo: 'Teléfono', valor: f => f.telefono },
          { titulo: 'Debe', tipo: 'numero', valor: f => f.saldo },
          { titulo: 'Cupo de crédito', tipo: 'numero', valor: f => f.cupo_credito },
          { titulo: 'Plazo (días)', tipo: 'numero', valor: f => f.dias_credito },
          { titulo: 'Vencido', tipo: 'numero', valor: f => Number(mora[f.id]?.vencido ?? 0) },
          { titulo: 'Días de atraso', tipo: 'numero', valor: f => mora[f.id]?.dias_atraso ?? 0 },
          { titulo: 'Recargo por mora', tipo: 'numero', valor: f => Number(mora[f.id]?.recargo ?? 0) },
        ],
      }
    },
  },
  {
    id: 'resumen', texto: 'Resumen del periodo (tablero)', nota: 'Indicadores, ventas por día y hora, más vendidos', rango: true, soloDueno: true,
    cargar: async (rango) => {
      const r = await pedirTablero(supabase, rango)
      if (r.error) throw new Error(r.error)
      return hojasResumen(r.datos, etiquetaRango(rango))
    },
  },
  {
    id: 'gastos', texto: 'Gastos', nota: 'Arriendo, servicios, nómina…', rango: true,
    cargar: async (rango) => ({
      nombre: 'Gastos',
      filas: await traerTodo(() => entre(supabase.from('gastos').select('*').order('fecha', { ascending: false }), rango)),
      columnas: [
        { titulo: 'Fecha', tipo: 'fechahora', ancho: 18, valor: f => f.fecha },
        { titulo: 'Tipo', valor: f => f.tipo },
        { titulo: 'Descripción', ancho: 32, valor: f => f.descripcion },
        { titulo: 'Valor', tipo: 'numero', valor: f => f.monto },
      ],
    }),
  },
  {
    id: 'prestamos', texto: 'Préstamos y cuotas', nota: 'Solo el dueño', soloDueno: true,
    cargar: async () => {
      const pr = await traerTodo(() => supabase.from('prestamos_resumen').select('*').order('creado_en', { ascending: false }))
      const cu = await traerTodo(() => supabase.from('prestamo_cuotas').select('*').order('fecha_limite'))
      const por = Object.fromEntries(pr.map(p => [p.id, p]))
      return [
        {
          nombre: 'Préstamos', filas: pr,
          columnas: [
            { titulo: 'Fecha', tipo: 'fecha', valor: f => f.fecha_inicio },
            { titulo: 'Cliente', ancho: 28, valor: f => f.cliente_nombre },
            { titulo: 'Documento', valor: f => (f.cliente_documento ? `${f.cliente_tipo_documento ?? ''} ${f.cliente_documento}`.trim() : '') },
            { titulo: 'Teléfono', valor: f => f.cliente_telefono },
            { titulo: 'Prestado', tipo: 'numero', valor: f => f.monto },
            { titulo: 'Interés mensual %', tipo: 'numero', valor: f => f.tasa_mensual },
            { titulo: 'Frecuencia', valor: f => f.frecuencia },
            { titulo: 'Cuotas', tipo: 'numero', valor: f => f.num_cuotas },
            { titulo: 'Interés total', tipo: 'numero', valor: f => f.interes_total },
            { titulo: 'Total a pagar', tipo: 'numero', valor: f => f.total_a_pagar },
            { titulo: 'Pagado', tipo: 'numero', valor: f => f.pagado_total },
            { titulo: 'Saldo', tipo: 'numero', valor: f => f.saldo },
            { titulo: 'Estado', valor: f => f.estado },
          ],
        },
        {
          nombre: 'Cuotas', filas: cu,
          columnas: [
            { titulo: 'Cliente', ancho: 28, valor: f => por[f.prestamo_id]?.cliente_nombre },
            { titulo: 'Cuota', tipo: 'numero', ancho: 8, valor: f => f.numero },
            { titulo: 'Fecha límite', tipo: 'fecha', valor: f => f.fecha_limite },
            { titulo: 'Capital', tipo: 'numero', valor: f => f.capital },
            { titulo: 'Interés', tipo: 'numero', valor: f => f.interes },
            { titulo: 'Valor', tipo: 'numero', valor: f => f.valor },
            { titulo: 'Pagado', tipo: 'numero', valor: f => f.pagado },
          ],
        },
      ]
    },
  },
]

// Base de datos exportable: Excel con una hoja por tema.
export default function Exportar() {
  const dueno = useDueno()
  const disponibles = CONJUNTOS.filter(c => !c.soloDueno || dueno)
  const [elegidos, setElegidos] = useState(() => new Set(['productos', 'clientes', 'ventas']))
  const [trabajando, setTrabajando] = useState(false)
  const [error, setError] = useState('')
  const [hecho, setHecho] = useState('')

  const alternar = (id) => setElegidos(prev => {
    const s = new Set(prev); if (s.has(id)) s.delete(id); else s.add(id); return s
  })

  const descargar = async (rango) => {
    const lista = disponibles.filter(c => elegidos.has(c.id))
    if (lista.length === 0) return setError('Elige al menos un tema')
    setTrabajando(true); setError(''); setHecho('')
    try {
      const hojas = (await Promise.all(lista.map(c => c.cargar(rango, dueno)))).flat()
      const blob = await construirExcel(hojas)
      const nombre = `${(import.meta.env.VITE_NOMBRE_TIENDA || 'Matriz').replace(/[^\w]+/g, '-')}-${hoyTexto()}.xlsx`
      bajarArchivo(blob, nombre)
      setHecho(`Listo: ${nombre} (${hojas.reduce((s, h) => s + h.filas.length, 0)} filas)`)
    } catch (e) {
      setError(e.message || 'No se pudo exportar')
    }
    setTrabajando(false)
  }

  return (
    <FiltroFechas inicial="mes">
      {(rango) => (
        <div className="space-y-4">
          <p className="text-xs text-slate-500">
            Elige qué quieres llevar a Excel. Las fechas aplican a ventas, pagos y gastos; lo demás sale completo.
          </p>
          <ul className="bg-white rounded-2xl shadow-sm divide-y divide-slate-100">
            {disponibles.map(c => (
              <li key={c.id}>
                <label className="min-h-14 px-4 py-2 grid grid-cols-[1.5rem_1fr] gap-3 items-center">
                  <input type="checkbox" checked={elegidos.has(c.id)} onChange={() => alternar(c.id)}
                         className="h-5 w-5 accent-[#1F6F54]" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{c.texto}{c.rango ? ' · por fechas' : ''}</p>
                    <p className="text-xs text-slate-400">{c.nota}</p>
                  </div>
                </label>
              </li>
            ))}
          </ul>
          {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
          {hecho && <p className="text-sm text-marca bg-lima/20 rounded-lg px-3 py-2">{hecho}</p>}
          <button onClick={() => descargar(rango)} disabled={trabajando}
            className="w-full h-12 rounded-xl bg-marca text-white font-semibold disabled:opacity-40 active:bg-marca-oscuro">
            {trabajando ? 'Preparando…' : 'Descargar Excel'}
          </button>
        </div>
      )}
    </FiltroFechas>
  )
}
