// PASO 3 — Copia las fotos, videos, música y el logo de Cibus al almacenamiento de la plataforma (solo LEE del proyecto de Nelson).
//   $env:NELSON_URL / NELSON_SERVICE_KEY  y  $env:PLAT_URL / PLAT_SERVICE_KEY
//   node scripts/migracion/03-copiar-archivos.mjs respaldo-nelson/<carpeta>
import { createClient } from '@supabase/supabase-js'
import fs from 'fs'
import path from 'path'

const dir = process.argv[2], e = process.env
if (!dir || !e.NELSON_URL || !e.NELSON_SERVICE_KEY || !e.PLAT_URL || !e.PLAT_SERVICE_KEY) { console.error('Faltan NELSON_URL, NELSON_SERVICE_KEY, PLAT_URL o PLAT_SERVICE_KEY.'); process.exit(1) }
const op = { auth: { persistSession: false, autoRefreshToken: false } }
const viejo = createClient(e.NELSON_URL, e.NELSON_SERVICE_KEY, op), nuevo = createClient(e.PLAT_URL, e.PLAT_SERVICE_KEY, op)
const informe = JSON.parse(fs.readFileSync(path.join(dir, 'informe-importacion.json'), 'utf8'))
let bien = 0; const fallos = []
if (informe.logo) {
  const { error } = await nuevo.storage.from(informe.logo.espacio).upload(informe.logo.nueva, fs.readFileSync(informe.logo.archivo), { contentType: informe.logo.tipo, upsert: true })
  if (error) fallos.push('logo: ' + error.message); else { bien++; console.log('✓ logo') }
}
for (const a of informe.archivos.filter((x) => x.bucket)) {
  const { data, error } = await viejo.storage.from(a.bucket).download(a.ruta)
  if (error) { fallos.push(`${a.bucket}/${a.ruta}: ${error.message}`); continue }
  const { error: e2 } = await nuevo.storage.from(a.espacio).upload(a.nueva, Buffer.from(await data.arrayBuffer()), { contentType: data.type || undefined, upsert: true })
  if (e2) fallos.push(`${a.nueva}: ${e2.message}`); else bien++
}
console.log(`Copiados: ${bien} · con error: ${fallos.length}`); for (const f of fallos) console.log('  ✗', f)
