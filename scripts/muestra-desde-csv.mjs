// Arma public/muestra-cibus.json (la muestra de la portada) desde el CSV del catálogo base exportado de Cibus.
//   node scripts/muestra-desde-csv.mjs ruta/catalogo-base.csv [cantidad]
// Toma productos que tengan foto, de categorías variadas. No usa precios.
import fs from 'node:fs'
const [, , ruta, n = '12'] = process.argv
const txt = fs.readFileSync(ruta, 'utf8').replace(/^﻿/, '')
const filas = []; let f = [], c = '', q = false
for (let i = 0; i <= txt.length; i++) {
  const ch = txt[i]
  if (q) { if (ch === '"' && txt[i + 1] === '"') { c += '"'; i++ } else if (ch === '"') q = false; else c += ch }
  else if (ch === '"') q = true
  else if (ch === ',' ) { f.push(c); c = '' }
  else if (ch === '\n' || ch === undefined) { f.push(c.replace(/\r$/, '')); c = ''; if (f.some(Boolean)) filas.push(f); f = [] }
  else c += ch
}
const cab = filas.shift(); const col = (k) => cab.indexOf(k)
const prods = filas.map((r) => ({ nombre: r[col('nombre')], categoria: r[col('categoria')], foto: r[col('foto_1_url')] })).filter((p) => p.nombre && /^https?:/.test(p.foto || ''))
const porCat = new Map(); for (const p of prods) { const k = p.categoria || '-'; if (!porCat.has(k)) porCat.set(k, []); porCat.get(k).push(p) }
const out = []; const colas = [...porCat.values()]
while (out.length < Number(n) && colas.some((x) => x.length)) for (const x of colas) { if (x.length && out.length < Number(n)) out.push(x.splice(Math.floor(Math.random() * x.length), 1)[0]) }
fs.writeFileSync(new URL('../public/muestra-cibus.json', import.meta.url), JSON.stringify(out, null, 1))
console.log(`${out.length} productos en public/muestra-cibus.json (de ${prods.length} con foto)`)
