// Carga masiva de productos: lee texto de Excel (copiado y pegado) o de un archivo CSV y lo convierte en filas validadas.

const COLUMNAS = {
  nombre: ['nombre', 'producto', 'articulo', 'artículo', 'descripcion corta'],
  categoria: ['categoria', 'categoría', 'seccion', 'sección'],
  precio: ['precio', 'precio venta', 'precio_venta', 'valor', 'pvp'],
  costo: ['costo', 'precio compra', 'precio_compra', 'compra'],
  unidad: ['unidad', 'medida'],
  codigo: ['codigo', 'código', 'cod', 'referencia', 'sku', 'codigo de barras', 'código de barras'],
  descripcion: ['descripcion', 'descripción', 'detalle'],
  publicado: ['publicado', 'mostrar', 'visible'],
  stock: ['stock', 'cantidad', 'existencias', 'inventario'],
}
export const UNIDADES = ['und', 'kg', 'lb', 'g', 'l', 'ml', 'paquete', 'caja', 'docena', 'metro']
export const MAX_FILAS = 500
export const PLANTILLA = 'nombre;categoria;precio;unidad;codigo;descripcion;publicado;stock\nArroz Diana 500 g;Granos;2500;und;1001;Arroz blanco;si;40\nPanela cuadrada;Despensa;3000;und;1002;;si;60\n'

const sinTildes = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()

// Separa por tabulador (Excel pegado), punto y coma o coma, respetando comillas
export function leerTabla(texto) {
  const t = String(texto || '').replace(/^﻿/, '').replace(/\r\n?/g, '\n').trim()
  if (!t) return []
  const primera = t.split('\n')[0]
  const sep = [['\t', primera.split('\t').length], [';', primera.split(';').length], [',', primera.split(',').length]].sort((a, b) => b[1] - a[1])[0][0]
  const filas = []; let fila = [], campo = '', comillas = false
  for (let i = 0; i < t.length; i++) {
    const c = t[i]
    if (comillas) {
      if (c === '"' && t[i + 1] === '"') { campo += '"'; i++ }
      else if (c === '"') comillas = false
      else campo += c
    } else if (c === '"') comillas = true
    else if (c === sep) { fila.push(campo); campo = '' }
    else if (c === '\n') { fila.push(campo); filas.push(fila); fila = []; campo = '' }
    else campo += c
  }
  fila.push(campo); filas.push(fila)
  return filas.filter((f) => f.some((x) => x.trim() !== ''))
}

// Precio colombiano: "$2.500", "2500", "2.500,50", "2,5"
export function leerPrecio(t) {
  let s = String(t ?? '').replace(/[$\s]/g, '')
  if (!s) return null
  if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) s = s.replace(/\./g, '').replace(',', '.')
  else if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) s = s.replace(/,/g, '')
  else s = s.replace(',', '.')
  if (!/^\d+(\.\d+)?$/.test(s)) return null
  return Math.round(Number(s) * 100) / 100
}

const SI = ['si', 'sí', 's', '1', 'true', 'x', 'yes']
const NO = ['no', 'n', '0', 'false']

// Devuelve { filas: [{ fila, datos, errores }], columnasFaltantes, truncado }
export function procesarProductos(texto) {
  const tabla = leerTabla(texto)
  if (tabla.length < 2) return { filas: [], columnasFaltantes: ['nombre', 'precio'], truncado: false, vacio: true }
  const enc = tabla[0].map(sinTildes)
  const idx = {}
  for (const [k, alias] of Object.entries(COLUMNAS)) idx[k] = enc.findIndex((h) => alias.map(sinTildes).includes(h))
  const columnasFaltantes = ['nombre', 'precio'].filter((k) => idx[k] < 0)
  if (columnasFaltantes.length) return { filas: [], columnasFaltantes, truncado: false }
  const cuerpo = tabla.slice(1)
  const truncado = cuerpo.length > MAX_FILAS
  const vistos = new Set()
  const filas = cuerpo.slice(0, MAX_FILAS).map((f, i) => {
    const v = (k) => (idx[k] >= 0 ? String(f[idx[k]] ?? '').trim() : '')
    const errores = []
    const nombre = v('nombre')
    if (nombre.length < 2) errores.push('Falta el nombre')
    if (nombre.length > 120) errores.push('El nombre es muy largo')
    const precio = leerPrecio(v('precio'))
    if (precio === null || precio <= 0) errores.push('Precio no válido')
    const costoT = v('costo'); const costo = costoT ? leerPrecio(costoT) : 0
    if (costo === null) errores.push('Costo no válido')
    let unidad = sinTildes(v('unidad')) || 'und'
    if (unidad === 'unidad' || unidad === 'unidades') unidad = 'und'
    if (!UNIDADES.includes(unidad)) errores.push(`Unidad no válida (${v('unidad')})`)
    const codigo = v('codigo') || null
    if (codigo && codigo.length > 40) errores.push('El código es muy largo')
    if (codigo) { if (vistos.has(codigo)) errores.push('Código repetido en la lista'); vistos.add(codigo) }
    const pubT = sinTildes(v('publicado'))
    const publicado = pubT === '' ? true : SI.map(sinTildes).includes(pubT) ? true : NO.includes(pubT) ? false : null
    if (publicado === null) errores.push('Publicado debe ser sí o no')
    const stockT = v('stock'); const stock = stockT ? leerPrecio(stockT) : null
    if (stockT && (stock === null || stock < 0)) errores.push('Stock no válido')
    const descripcion = v('descripcion') || null
    if (descripcion && descripcion.length > 300) errores.push('La descripción es muy larga')
    return {
      fila: i + 2, errores,
      datos: { nombre, categoria: v('categoria') || null, precio_venta: precio, precio_compra: costo || 0, unidad, codigo, descripcion, publicado: publicado !== false, stock },
    }
  })
  return { filas, columnasFaltantes: [], truncado }
}
