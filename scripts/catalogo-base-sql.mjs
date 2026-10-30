// Genera supabase/38-catalogo-base-datos-*.sql desde el CSV exportado de Cibus (sin precios).
//   node scripts/catalogo-base-sql.mjs datos/catalogo-base-cibus.csv
// Solo conserva la foto cuando es una foto real (_real.jpg); las demás son tarjetas de texto.
import fs from 'node:fs'
const [, , ruta] = process.argv
const txt = fs.readFileSync(ruta, 'utf8').replace(/^﻿/, '')
const filas = []; let f = [], c = '', q = false
for (let i = 0; i <= txt.length; i++) {
  const ch = txt[i]
  if (q) { if (ch === '"' && txt[i + 1] === '"') { c += '"'; i++ } else if (ch === '"') q = false; else c += ch }
  else if (ch === '"') q = true
  else if (ch === ',') { f.push(c); c = '' }
  else if (ch === '\n' || ch === undefined) { f.push(c.replace(/\r$/, '')); c = ''; if (f.some(Boolean)) filas.push(f); f = [] }
  else c += ch
}
const cab = filas.shift(); const col = (k) => cab.indexOf(k)
const EXCLUIR = new Set(['ropa', 'temu', 'Servicios', 'No registra'])
const vistos = new Set(), vistosN = new Set(), out = []
for (const r of filas) {
  let nombre = (r[col('nombre')] || '').replace(/\s+/g, ' ').trim()
  const cat = (r[col('categoria')] || '').trim() || 'Otros'
  let codigo = (r[col('codigo')] || '').trim()
  if (EXCLUIR.has(cat) || nombre.length < 4 || /^domicilio$/i.test(nombre)) continue
  nombre = nombre.charAt(0).toUpperCase() + nombre.slice(1)
  if (!/^[0-9A-Za-z-]{3,40}$/.test(codigo)) codigo = ''
  const foto = (r[col('foto_1_url')] || '').trim()
  const clave = codigo ? 'c' + codigo : 'n' + nombre.toLowerCase()
  if (vistos.has(clave) || (!codigo && vistosN.has(nombre.toLowerCase()))) continue
  vistos.add(clave); if (!codigo) vistosN.add(nombre.toLowerCase())
  out.push({ codigo, nombre, cat, unidad: (r[col('unidad')] || 'und') === 'kg' ? 'kg' : 'und', foto: /_real\.jpg$/.test(foto) && /^https:\/\//.test(foto) ? foto : '' })
}
const s = (v) => (v ? `'${v.replace(/'/g, "''")}'` : 'null')
const PARTES = 3, tam = Math.ceil(out.length / PARTES)
for (let p = 0; p < PARTES; p++) {
  const trozo = out.slice(p * tam, (p + 1) * tam)
  let sql = `-- 38 · Catálogo base, parte ${p + 1} de ${PARTES} (${trozo.length} productos). Se puede correr dos veces sin repetir nada.\n`
  sql += 'insert into catalogo_base (codigo, nombre, categoria, unidad, foto) values\n'
  sql += trozo.map((x) => `(${s(x.codigo)},${s(x.nombre)},${s(x.cat)},'${x.unidad}',${s(x.foto)})`).join(',\n')
  sql += '\non conflict do nothing;\n'
  const acumulado = Math.min((p + 1) * tam, out.length)
  sql += `\n-- VERIFICACIÓN: debe decir ok = true (si corriste las partes en orden, hay ${acumulado} productos)\nselect 'catalogo_base tiene los productos de la parte ${p + 1}' as chequeo, count(*) as productos, count(*) >= ${acumulado} as ok from catalogo_base;\n`
  fs.writeFileSync(new URL(`../supabase/38-catalogo-base-datos-${p + 1}.sql`, import.meta.url), sql)
}
console.log(`${out.length} productos en ${PARTES} archivos; con foto real: ${out.filter((x) => x.foto).length}; categorías: ${new Set(out.map((x) => x.cat)).size}`)
console.log([...new Set(out.map((x) => x.cat))].filter(() => true).join(' | '))
