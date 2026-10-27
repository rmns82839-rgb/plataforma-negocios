// Importar fotos en bloque: lee el CSV, lo empareja con los productos y trae las fotos. Archivo .js aparte (Fast Refresh).
import { normalizar } from './buscar'
import { fotosDe } from './fotos'

/** Lee un CSV (coma o punto y coma, comillas, BOM). Devuelve filas como listas de texto. */
export function leerCsv(texto) {
  const t = String(texto ?? '').replace(/^﻿/, '')
  const primera = t.split(/\r?\n/, 1)[0] ?? ''
  const sep = (primera.match(/;/g) ?? []).length > (primera.match(/,/g) ?? []).length ? ';' : ','
  const filas = []
  let fila = [], campo = '', comillas = false
  for (let i = 0; i < t.length; i++) {
    const c = t[i]
    if (comillas) {
      if (c === '"') { if (t[i + 1] === '"') { campo += '"'; i++ } else comillas = false } else campo += c
    } else if (c === '"') comillas = true
    else if (c === sep) { fila.push(campo); campo = '' }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && t[i + 1] === '\n') i++
      fila.push(campo); campo = ''
      if (fila.some(x => x.trim() !== '')) filas.push(fila)
      fila = []
    } else campo += c
  }
  fila.push(campo)
  if (fila.some(x => x.trim() !== '')) filas.push(fila)
  return filas
}

const claveCodigo = (x) => String(x ?? '').trim().toLowerCase().replace(/\s+/g, '')
const esEnlace = (x) => /^https?:\/\//i.test(String(x ?? '').trim())
const MAX_POR_PRODUCTO = 3

/**
 * Empareja las filas del CSV con los productos (primero por código de barras, luego por nombre exacto).
 * Solo cuenta lo que tiene foto nueva y al producto aún no tiene foto: nunca se pisan fotos ya puestas.
 */
export function planImportacion(filasCsv, productos) {
  if (filasCsv.length < 2) return { listos: [], yaTienen: 0, sinCoincidencia: [], sinEnlaces: 0, error: 'El archivo está vacío' }
  const cab = filasCsv[0].map(h => normalizar(h).replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, ''))
  const iCod = cab.findIndex(h => ['codigo', 'codigo_barras', 'codigo_de_barras', 'barras', 'ean'].includes(h))
  const iNom = cab.findIndex(h => ['nombre', 'producto'].includes(h))
  const iFotos = cab.map((h, i) => (/^foto/.test(h) && !/nota|actual/.test(h) ? i : -1)).filter(i => i >= 0)
  const iActual = cab.findIndex(h => h === 'foto_actual')     // enlace de la "tarjeta de letras" que se quiere reemplazar por una foto real
  if (iFotos.length === 0) return { listos: [], yaTienen: 0, sinCoincidencia: [], sinEnlaces: 0, error: 'No encuentro columnas de fotos (foto_1_url, foto_2_url…)' }
  if (iCod < 0 && iNom < 0) return { listos: [], yaTienen: 0, sinCoincidencia: [], sinEnlaces: 0, error: 'Falta la columna codigo o nombre para saber de qué producto es cada foto' }

  const porCodigo = new Map(), porNombre = new Map()
  for (const p of productos) {
    const c = claveCodigo(p.codigo)
    if (c) porCodigo.set(c, p)
    porNombre.set(normalizar(p.nombre).trim(), p)
  }
  const listos = [], sinCoincidencia = []
  let yaTienen = 0, sinEnlaces = 0
  const vistos = new Set()
  for (const f of filasCsv.slice(1)) {
    const cod = iCod >= 0 ? claveCodigo(f[iCod]) : ''
    const nom = iNom >= 0 ? String(f[iNom] ?? '').trim() : ''
    const urls = [...new Set(iFotos.map(i => String(f[i] ?? '').trim()).filter(esEnlace))].slice(0, MAX_POR_PRODUCTO)
    if (!cod && !nom) continue
    const p = (cod && porCodigo.get(cod)) || (nom && porNombre.get(normalizar(nom).trim())) || null
    if (!p) { sinCoincidencia.push(nom || cod); continue }
    if (vistos.has(p.id)) continue
    vistos.add(p.id)
    const actual = fotosDe(p)
    const tarjeta = iActual >= 0 ? String(f[iActual] ?? '').trim() : ''
    // Solo se reemplaza si la foto que tiene hoy es EXACTAMENTE la tarjeta indicada en el archivo: una foto puesta a mano nunca se pisa
    const reemplaza = actual.length > 0 && tarjeta !== '' && actual[0] === tarjeta
    if (actual.length > 0 && !reemplaza) { yaTienen++; continue }
    if (urls.length === 0) { sinEnlaces++; continue }
    listos.push({ producto: p, urls, ...(reemplaza ? { reemplaza: true, tarjeta } : {}) })
  }
  return { listos, yaTienen, sinCoincidencia, sinEnlaces, error: '' }
}

const celda = (v) => {
  const s = String(v ?? '')
  return /[",;\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/** CSV con los productos que aún no tienen foto: sirve de plantilla para llenar los enlaces. */
export function plantillaSinFoto(productos) {
  const filas = [['codigo', 'nombre', 'categoria', 'foto_1_url', 'foto_2_url', 'foto_3_url']]
  for (const p of productos.filter(x => fotosDe(x).length === 0)) filas.push([p.codigo ?? '', p.nombre, p.categoria ?? '', '', '', ''])
  return '﻿' + filas.map(f => f.map(celda).join(',')).join('\r\n')
}

export const sinFoto = (p) => fotosDe(p).length === 0

/** Limpia el texto que una IA devuelve en el chat: quita ```, "csv", frases sueltas, comillas curvas y encabezados repetidos. */
export function limpiarTextoCsv(texto) {
  const lineas = String(texto ?? '').replace(/^\uFEFF/, '').split(/\r?\n/)
    .map(l => l.replace(/[\u201C\u201D]/g, '"'))
    .filter(l => !/^\s*```/.test(l) && l.trim().toLowerCase() !== 'csv')
  const esEncabezado = (l) => /nombre/i.test(l) && /foto_1|codigo|c[oó]digo/i.test(l) && /[,;]/.test(l)
  const ini = lineas.findIndex(esEncabezado)
  if (ini < 0) return ''
  const util = lineas.slice(ini).filter(l => l.trim() !== '' && /[,;]/.test(l))
  const enc = util[0].trim().toLowerCase()
  return util.filter((l, i) => i === 0 || l.trim().toLowerCase() !== enc).join('\r\n')
}

export const soloDigitos = (x) => String(x ?? '').replace(/\D/g, '')
export const codigoValido = (x) => { const d = soloDigitos(x); return d.length >= 8 && d.length <= 14 }
