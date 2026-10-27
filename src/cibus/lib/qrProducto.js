// QR con datos del producto: intenta sacar código, nombre, precios, etc. de lo que trae el QR.
// Formatos: JSON, líneas "clave: valor", enlace con parámetros (?nombre=…) y GS1 Digital Link (/01/<GTIN>/10/<lote>).
// Un enlace acortado (qrco.de, bit.ly…) no se puede leer: la app no puede abrirlo, solo guarda el texto como código.
const CLAVES = {
  codigo: ['codigo', 'código', 'code', 'barcode', 'ean', 'gtin', 'sku', 'cod'],
  nombre: ['nombre', 'name', 'producto', 'product', 'descripcion', 'descripción', 'description', 'title'],
  categoria: ['categoria', 'categoría', 'category'],
  precio_venta: ['precio_venta', 'precioventa', 'precio', 'price', 'pvp', 'venta'],
  precio_compra: ['precio_compra', 'preciocompra', 'costo', 'cost', 'compra'],
  stock: ['stock', 'cantidad', 'qty', 'quantity', 'unidades'],
  fecha_vencimiento: ['vencimiento', 'fecha_vencimiento', 'vence', 'expiry', 'exp', 'expiration', 'caducidad'],
  unidad: ['unidad', 'unit'],
}
const sinTilde = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
const mapa = {}
for (const [campo, claves] of Object.entries(CLAVES)) for (const k of claves) mapa[sinTilde(k)] = campo

function desdePares(pares) {
  const r = {}
  for (const [k, v] of pares) {
    const campo = mapa[sinTilde(String(k).trim())]
    const val = String(v ?? '').trim()
    if (campo && val && r[campo] === undefined) r[campo] = val
  }
  return r
}

function fecha(v) {
  const s = String(v)
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (m) return `${m[1]}-${m[2]}-${m[3]}`
  m = s.match(/^(\d{2})[/-](\d{2})[/-](\d{4})$/)
  if (m) return `${m[3]}-${m[2]}-${m[1]}`
  m = s.match(/^(\d{2})(\d{2})(\d{2})$/)                  // GS1 AAMMDD
  if (m) return `20${m[1]}-${m[2]}-${m[3] === '00' ? '28' : m[3]}`
  return ''
}

/** Devuelve { codigo, nombre, … } o null si el texto es solo un código normal. */
export function leerQrProducto(texto) {
  const t = String(texto ?? '').trim()
  if (!t || /^\d{6,14}$/.test(t)) return null
  let r = null
  if (t.startsWith('{')) {
    try { r = desdePares(Object.entries(JSON.parse(t))) } catch { /* no era JSON */ }
  } else if (/^https?:\/\//i.test(t)) {
    try {
      const u = new URL(t)
      r = desdePares([...u.searchParams.entries()])
      const gtin = u.pathname.match(/\/01\/(\d{8,14})/)   // GS1 Digital Link
      if (gtin) r = { ...r, codigo: r.codigo ?? gtin[1] }
      const ven = u.pathname.match(/\/15\/(\d{6})|\/17\/(\d{6})/)
      if (ven) r = { ...r, fecha_vencimiento: fecha(ven[1] || ven[2]) }
    } catch { /* enlace raro */ }
  } else if (/[:=]/.test(t) && /[\n;|]/.test(t)) {
    r = desdePares(t.split(/[\n;|]+/).map(l => l.split(/[:=]/).map((x, i, a) => (i === 0 ? x : a.slice(1).join(':')))).map(a => [a[0], a[1]]))
  }
  if (!r || !Object.keys(r).length) return null
  if (r.fecha_vencimiento) r.fecha_vencimiento = fecha(r.fecha_vencimiento)
  for (const k of ['precio_venta', 'precio_compra', 'stock']) if (r[k] !== undefined) r[k] = String(r[k]).replace(/[^\d.,]/g, '')
  if (!r.codigo && !r.nombre) return null
  return r
}
