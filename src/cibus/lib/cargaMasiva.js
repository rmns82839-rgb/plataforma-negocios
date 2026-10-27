import { claveNombre } from './duplicados'
// Carga rápida de productos: el tendero pega su lista (de un Excel, de WhatsApp o escrita a mano) y la app la entiende.
// Archivo .js aparte (Fast Refresh). Formatos que entiende, una línea por producto:
//   Arroz Diana 1kg;5000;20;Víveres;7701234567890      (nombre; precio; cantidad; categoría; código de barras)
//   Arroz Diana 1kg    5000                            (pegado desde Excel, separado por tabulador)
//   Arroz Diana 1kg 5.000                              (nombre y precio al final)
// Con primera línea de títulos (nombre, precio, compra, cantidad, categoría, código) se acomoda sola.
import { normalizar } from './buscar'

export const MAX_FILAS = 500

/** "$5.000", "5,000", "5000", "5.5" → 5000, 5000, 5000, 6. NaN si no hay número. */
export function precioDe(txt) {
  const s = String(txt ?? '').replace(/[^\d.,]/g, '')
  if (!/\d/.test(s)) return NaN
  if (/^\d{1,3}([.,]\d{3})+$/.test(s)) return Number(s.replace(/[.,]/g, ''))          // separador de miles
  if (/^\d+[.,]\d{1,2}$/.test(s)) return Math.round(Number(s.replace(',', '.')))      // decimales: el precio va en pesos enteros
  return Number(s.replace(/[.,]/g, ''))
}
const cantidadDe = (txt) => {
  const s = String(txt ?? '').trim().replace(',', '.')
  const n = Number(s)
  return s !== '' && Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : NaN
}

const TITULOS = {
  nombre: ['nombre', 'producto', 'articulo', 'descripcion'],
  precio_venta: ['precio', 'precio venta', 'precio de venta', 'venta', 'valor', 'pvp'],
  precio_compra: ['compra', 'costo', 'precio compra', 'precio de compra'],
  stock: ['cantidad', 'stock', 'existencias', 'inventario', 'unidades'],
  categoria: ['categoria', 'grupo', 'tipo', 'linea'],
  codigo: ['codigo', 'codigo de barras', 'barras', 'ean', 'referencia'],
}
const ORDEN_SIN_TITULOS = ['nombre', 'precio_venta', 'stock', 'categoria', 'codigo']

const partir = (linea, sep) => linea.split(sep).map(x => x.trim().replace(/^"|"$/g, '').trim())

function detectarSeparador(lineas) {
  if (lineas.some(l => l.includes('\t'))) return '\t'
  if (lineas.some(l => l.includes(';'))) return ';'
  // coma: solo si separa de verdad (2 o más campos y no es un "5,000")
  const conComa = lineas.filter(l => l.includes(','))
  if (conComa.length && conComa.every(l => partir(l, ',').length >= 2 && !/^\d{3}$/.test(partir(l, ',')[1] ?? ''))) return ','
  return null
}

/** Lee el texto pegado. Devuelve { filas: [{ nombre, precio_venta, precio_compra, stock, categoria, codigo, linea }], invalidas: [{ linea, texto, motivo }], conTitulos } */
export function leerLista(texto) {
  const lineas = String(texto ?? '').replace(/^﻿/, '').split(/\r?\n/).map(l => l.trim()).filter(Boolean)
  const filas = [], invalidas = []
  if (lineas.length === 0) return { filas, invalidas, conTitulos: false }
  const sep = detectarSeparador(lineas)
  let columnas = ORDEN_SIN_TITULOS, desde = 0, conTitulos = false
  if (sep) {
    const cab = partir(lineas[0], sep).map(h => normalizar(h).replace(/[^a-z ]/g, '').trim())
    const mapa = cab.map(h => Object.keys(TITULOS).find(k => TITULOS[k].includes(h)) ?? null)
    if (mapa.includes('nombre') && mapa.filter(Boolean).length >= 2) { columnas = mapa; desde = 1; conTitulos = true }
  }
  const vistosCodigo = new Set(), vistosNombre = new Set()
  lineas.slice(desde).forEach((txt, i) => {
    const linea = i + 1 + desde
    const f = { nombre: '', precio_venta: NaN, precio_compra: NaN, stock: NaN, categoria: '', codigo: '' }
    if (sep) {
      const celdas = partir(txt, sep)
      columnas.forEach((k, j) => {
        const v = celdas[j] ?? ''
        if (!k || v === '') return
        if (k === 'nombre' || k === 'categoria') f[k] = v
        else if (k === 'codigo') f.codigo = v.replace(/\D/g, '')
        else if (k === 'stock') f.stock = cantidadDe(v)
        else f[k] = precioDe(v)
      })
    } else {
      const m = txt.match(/^(.*?\S)[\s\-–:=x×]+\$?\s*(\d[\d.,]*)\s*$/i)         // "Nombre 5.000" / "Nombre - 5000"
      if (m) { f.nombre = m[1].trim(); f.precio_venta = precioDe(m[2]) } else f.nombre = txt
    }
    f.nombre = f.nombre.replace(/\s+/g, ' ').trim()
    if (f.nombre.length < 2) return invalidas.push({ linea, texto: txt, motivo: 'Falta el nombre' })
    if (f.nombre.length > 120) return invalidas.push({ linea, texto: txt, motivo: 'El nombre es muy largo' })
    if (!(f.precio_venta > 0)) return invalidas.push({ linea, texto: txt, motivo: 'Falta el precio de venta' })
    if (f.precio_venta > 100000000) return invalidas.push({ linea, texto: txt, motivo: 'El precio parece un error' })
    if (f.codigo && (f.codigo.length < 6 || f.codigo.length > 14)) f.codigo = ''           // un código dudoso no se guarda: es mejor ninguno
    const n = normalizar(f.nombre)
    if (vistosNombre.has(n) || (f.codigo && vistosCodigo.has(f.codigo))) return invalidas.push({ linea, texto: txt, motivo: 'Está repetido en la lista' })
    vistosNombre.add(n); if (f.codigo) vistosCodigo.add(f.codigo)
    filas.push({ ...f, linea })
  })
  return { filas: filas.slice(0, MAX_FILAS), invalidas: filas.length > MAX_FILAS ? [...invalidas, { linea: 0, texto: '', motivo: `Solo se cargan ${MAX_FILAS} por vez: carga el resto después` }] : invalidas, conTitulos }
}

/** Separa lo que ya existe en el inventario (por código o por nombre) de lo nuevo. */
export function separarExistentes(filas, productos) {
  const nombres = new Set(productos.map(p => claveNombre(p.nombre)))
  const codigos = new Set(productos.map(p => String(p.codigo ?? '').replace(/\D/g, '')).filter(Boolean))
  const nuevas = [], yaExisten = []
  for (const f of filas) (nombres.has(claveNombre(f.nombre)) || (f.codigo && codigos.has(f.codigo)) ? yaExisten : nuevas).push(f)
  return { nuevas, yaExisten }
}

/** Fila lista para insertar en `productos`. */
export const filaProducto = (f, publicar = false) => ({
  nombre: f.nombre, codigo: f.codigo || null, categoria: f.categoria ? f.categoria.slice(0, 60) : null, unidad: 'und',
  precio_venta: f.precio_venta, precio_compra: Number.isFinite(f.precio_compra) && f.precio_compra >= 0 ? f.precio_compra : 0,
  stock: Number.isFinite(f.stock) ? f.stock : 0, stock_minimo: 0, publicado: publicar, activo: true,
})
