// PASO 2 — Copia los datos de Cibus (del respaldo) a la plataforma, dentro de UNA transacción.
//   Sin --aplicar es un ENSAYO EN SECO: hace todo, compara cantidades y sumas y lo DESHACE (no queda nada).
//   Con --aplicar guarda, pero solo si todas las cantidades y sumas cuadran. --limpiar repite el ensayo desde cero.
//
//   $env:PLAT_DB_URL = "postgresql://postgres.XXXX:CLAVE@...pooler.supabase.com:5432/postgres"   (Supabase > Connect > Session pooler)
//   $env:NELSON_URL = "https://XXXX.supabase.co"      (solo para reconocer las direcciones de sus fotos)
//   node scripts/migracion/02-importar-nelson.mjs respaldo-nelson/<carpeta> [--aplicar] [--limpiar] [--slug=cibus]
import pg from 'pg'
import fs from 'fs'
import path from 'path'
import { importar } from './importar-lib.mjs'

const args = process.argv.slice(2), dir = args.find((a) => !a.startsWith('--'))
if (!dir || !process.env.PLAT_DB_URL) { console.error('Uso: node 02-importar-nelson.mjs <carpeta del respaldo> [--aplicar] [--limpiar]   (con PLAT_DB_URL en el entorno)'); process.exit(1) }
const mapaF = path.join(dir, 'mapa-usuarios.json')
if (!fs.existsSync(mapaF)) { console.error('Falta mapa-usuarios.json: corre primero 02a-preparar-usuarios.mjs'); process.exit(1) }
const slug = (args.find((a) => a.startsWith('--slug=')) || '--slug=cibus').split('=')[1]
const cli = new pg.Client({ connectionString: process.env.PLAT_DB_URL, ssl: { rejectUnauthorized: false } })
await cli.connect()
try {
  const informe = await importar({ q: (s, p) => cli.query(s, p), dir, slug, urlViejo: (process.env.NELSON_URL || '').replace(/\/+$/, ''),
    mapaUsuarios: JSON.parse(fs.readFileSync(mapaF, 'utf8')), aplicar: args.includes('--aplicar'), limpiar: args.includes('--limpiar') })
  fs.writeFileSync(path.join(dir, 'informe-importacion.json'), JSON.stringify(informe, null, 1))
  console.log('\n=== RESULTADO ===')
  for (const [t, i] of Object.entries(informe.tablas)) console.log(`${i.esperadas === i.en_plataforma || i.en_plataforma === undefined ? '✓' : '✗'} ${t.padEnd(22)} respaldo ${String(i.respaldo).padStart(6)}   a copiar ${String(i.esperadas ?? '').padStart(6)}   en plataforma ${String(i.en_plataforma ?? '-').padStart(6)}`)
  const malas = informe.sumas.filter((s) => !s.bien)
  console.log(`Sumas comparadas: ${informe.sumas.length} · con diferencia: ${malas.length}`)
  for (const m of malas) console.log('  ✗', m.tabla, m.col, 'respaldo', m.respaldo, 'plataforma', m.plataforma)
  console.log(`Archivos por copiar: ${informe.archivos.length}${informe.logo ? ' + el logo' : ''}`)
  console.log(informe.aplicado ? '\n✅ GUARDADO. Sigue el paso 3 (archivos).' : informe.ok ? '\n✅ ENSAYO EN SECO CORRECTO (no se guardó nada). Para guardar de verdad añade --aplicar.' : '\n❌ HAY DIFERENCIAS: no se guardó nada. Mándame este resultado.')
  if (informe.avisos.length) console.log('\nAvisos:\n - ' + informe.avisos.join('\n - '))
} finally { await cli.end() }
