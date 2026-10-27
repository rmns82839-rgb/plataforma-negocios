// Catálogo base: lista de productos con nombre, categoría, código de barras y fotos, SIN precios, costos ni cantidades.
// Sirve de semilla para el catálogo compartido de otras tiendas (cada tienda le pone después sus propios precios).
import { fotosDe } from './fotos'

const celda = (v) => {
  const s = String(v ?? '').replace(/\r?\n/g, ' ').trim()
  return /[",;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export const COLUMNAS_BASE = ['codigo', 'nombre', 'categoria', 'unidad', 'descripcion', 'foto_1_url', 'foto_2_url', 'foto_3_url']

/** CSV (UTF-8 con BOM para que Excel respete las tildes). Solo productos activos y que no sean combos. */
export function catalogoBaseCsv(productos) {
  const filas = [COLUMNAS_BASE]
  for (const p of productos.filter(x => x.activo !== false && !x.es_kit)) {
    const fotos = fotosDe(p)
    filas.push([p.codigo ?? '', p.nombre, p.categoria ?? '', p.unidad ?? 'und', p.descripcion ?? '', fotos[0] ?? '', fotos[1] ?? '', fotos[2] ?? ''])
  }
  return '﻿' + filas.map(f => f.map(celda).join(',')).join('\r\n')
}
