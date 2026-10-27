// Copia de seguridad: todas las tablas del negocio en un ZIP (un CSV por tabla + un JSON completo).
import { crearZip } from './zip'
import { bajarArchivo } from './exportar'
import { guardarEnCarpeta } from './carpetaRespaldo'

export const TABLAS = [
  'negocio_config', 'negocio_reglas', 'formas_pago', 'productos', 'producto_componentes', 'lotes', 'compras', 'compra_items', 'ajustes_inventario',
  'clientes', 'fiado_movimientos', 'prepago_movimientos', 'ventas', 'venta_items', 'venta_pagos', 'venta_consumos', 'caja_movimientos', 'gastos',
  'prestamos', 'prestamo_cuotas', 'prestamo_pagos', 'promociones', 'ofertas', 'anuncios', 'prendas', 'prenda_variantes',
  'negocio_miembros', 'auditoria',
]

const CLAVE = 'respaldo-ultimo'
const CLAVE_AVISO = 'respaldo-aviso'     // 'off' | 'dia' | 'semana'

const leer = (k) => { try { return localStorage.getItem(k) } catch { return null } }
const guardar = (k, v) => { try { localStorage.setItem(k, v) } catch { /* sin almacenamiento */ } }

export const ultimoRespaldo = () => { const n = Number(leer(CLAVE)); return n > 0 ? n : null }
export const avisoRespaldo = () => leer(CLAVE_AVISO) ?? 'semana'
export const fijarAviso = (v) => guardar(CLAVE_AVISO, v)

/** ¿Toca recordar la copia? (según la frecuencia elegida y la fecha de la última) */
export function toca(ahora = Date.now()) {
  const aviso = avisoRespaldo()
  if (aviso === 'off') return false
  const ult = ultimoRespaldo()
  if (!ult) return true
  return ahora - ult >= (aviso === 'dia' ? 1 : 7) * 86400000 - 3600000
}
export const diasDesde = (ms, ahora = Date.now()) => Math.floor((ahora - ms) / 86400000)

// "Más tarde": el aviso de la Caja se esconde hasta mañana (en el menú "Más" sigue)
const CLAVE_POSPUESTO = 'respaldo-pospuesto'
const hoyClave = () => new Date().toLocaleDateString('en-CA')
export const pospuestoHoy = () => leer(CLAVE_POSPUESTO) === hoyClave()
export const posponerAviso = () => guardar(CLAVE_POSPUESTO, hoyClave())

const celda = (v) => {
  if (v === null || v === undefined) return ''
  const t = typeof v === 'object' ? JSON.stringify(v) : String(v)
  return /[",\n\r;]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t
}
/** CSV con BOM para que Excel respete las tildes. */
export function aCsv(filas) {
  if (!filas.length) return '﻿'
  const cols = [...new Set(filas.flatMap(f => Object.keys(f)))]
  return '﻿' + [cols.join(','), ...filas.map(f => cols.map(c => celda(f[c])).join(','))].join('\r\n')
}

async function traerTabla(supabase, tabla) {
  const filas = []
  for (let desde = 0; ; desde += 1000) {
    let r = await supabase.from(tabla).select('*').order('id', { ascending: true }).range(desde, desde + 999)
    if (r.error && /column .*id|does not exist/i.test(r.error.message) && !/relation/i.test(r.error.message)) {
      r = await supabase.from(tabla).select('*').range(desde, desde + 999)   // tablas sin columna id
    }
    if (r.error) return { error: r.error.message, filas }
    filas.push(...r.data)
    if (r.data.length < 1000) return { filas }
  }
}

const dos = (n) => String(n).padStart(2, '0')
export const nombreRespaldo = (d = new Date()) =>
  `Matriz-respaldo-${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}_${dos(d.getHours())}${dos(d.getMinutes())}.zip`

/** Descarga todo y arma el ZIP. alAvanzar(hechas, total, tabla) para la barra de progreso. */
export async function generarRespaldo(supabase, alAvanzar = () => {}, carpeta = null) {
  const todo = {}
  const resumen = []
  const omitidas = []
  for (let i = 0; i < TABLAS.length; i++) {
    const t = TABLAS[i]
    alAvanzar(i, TABLAS.length, t)
    const r = await traerTabla(supabase, t)
    if (r.error) {
      omitidas.push(`${t}: ${r.error}`)
      if (r.filas.length === 0) continue
    }
    todo[t] = r.filas
    resumen.push(`${t.padEnd(24)} ${String(r.filas.length).padStart(7)} filas`)
  }
  alAvanzar(TABLAS.length, TABLAS.length, '')
  const ahora = new Date()
  const leeme = [
    'MATRIZ · COPIA DE SEGURIDAD',
    `Hecha el ${ahora.toLocaleString('es-CO')}`,
    '',
    'Qué trae este ZIP:',
    '  - datos/*.csv : una hoja por tabla; se abren con Excel.',
    '  - respaldo.json : todo junto, exacto. Sirve para restaurar la base de datos.',
    '',
    'Contenido:',
    ...resumen,
    ...(omitidas.length ? ['', 'No se pudieron leer (pueden ser tablas que aún no existen en tu base):', ...omitidas.map(o => `  - ${o}`)] : []),
    '',
    'Guárdalo en un lugar seguro (Drive, correo, memoria USB). Trae datos de clientes y de ventas: no lo compartas.',
    'Para restaurar, pásale este ZIP a quien administre el sistema.',
  ].join('\r\n')
  const archivos = [
    { nombre: 'LEEME.txt', datos: leeme },
    { nombre: 'respaldo.json', datos: JSON.stringify({ generado: ahora.toISOString(), tablas: todo }) },
    ...Object.entries(todo).map(([t, filas]) => ({ nombre: `datos/${t}.csv`, datos: aCsv(filas) })),
  ]
  const blob = crearZip(archivos, ahora)
  const nombre = nombreRespaldo(ahora)
  const enCarpeta = carpeta ? await guardarEnCarpeta(carpeta, blob, nombre) : null    // si falla, se descarga como siempre
  if (!enCarpeta) bajarArchivo(blob, nombre)
  guardar(CLAVE, String(ahora.getTime()))
  return { nombre, enCarpeta, tablas: resumen.length, filas: Object.values(todo).reduce((s, f) => s + f.length, 0), omitidas, bytes: blob.size }
}
