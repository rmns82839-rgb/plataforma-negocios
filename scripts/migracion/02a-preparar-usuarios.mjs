// PASO 2a — Crea en la plataforma una cuenta por cada persona de Cibus (misma dirección de correo) y guarda el mapa «cuenta vieja → cuenta nueva».
// No pone contraseñas: cada quien entra con Google o con un código al correo (y se vincula solo por el correo). No toca la base de Nelson.
//
//   $env:PLAT_URL = "https://XXXX.supabase.co"            (la plataforma: plataforma-negocios-pruebas)
//   $env:PLAT_SERVICE_KEY = "service_role de la plataforma"
//   node scripts/migracion/02a-preparar-usuarios.mjs respaldo-nelson/<carpeta>
import { createClient } from '@supabase/supabase-js'
import fs from 'fs'
import path from 'path'

const dir = process.argv[2]
if (!dir || !process.env.PLAT_URL || !process.env.PLAT_SERVICE_KEY) { console.error('Uso: node 02a-preparar-usuarios.mjs <carpeta del respaldo>   (con PLAT_URL y PLAT_SERVICE_KEY en el entorno)'); process.exit(1) }
const sb = createClient(process.env.PLAT_URL, process.env.PLAT_SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
const viejos = JSON.parse(fs.readFileSync(path.join(dir, 'usuarios.json'), 'utf8'))

const existentes = new Map()
for (let pagina = 1; ; pagina++) {
  const { data, error } = await sb.auth.admin.listUsers({ page: pagina, perPage: 1000 })
  if (error) { console.error(error.message); process.exit(1) }
  for (const u of data.users) if (u.email) existentes.set(u.email.toLowerCase(), u.id)
  if (data.users.length < 1000) break
}
const mapa = {}, sinCorreo = []
let creados = 0, ya = 0
for (const u of viejos) {
  const correo = (u.email || '').toLowerCase().trim()
  if (!correo) { sinCorreo.push(u.id); continue }
  if (existentes.has(correo)) { mapa[u.id] = existentes.get(correo); ya++; continue }
  const { data, error } = await sb.auth.admin.createUser({ email: correo, email_confirm: true, user_metadata: { full_name: u.nombre || undefined, avatar_url: u.foto || undefined, migrado_de: 'cibus' } })
  if (error) { console.log('  ERROR', correo, '→', error.message); continue }
  mapa[u.id] = data.user.id; creados++
}
fs.writeFileSync(path.join(dir, 'mapa-usuarios.json'), JSON.stringify(mapa, null, 1))
console.log(`Cuentas nuevas: ${creados} · ya existían: ${ya} · sin correo (no se migran): ${sinCorreo.length} · total en el mapa: ${Object.keys(mapa).length}/${viejos.length}`)
