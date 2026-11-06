// Hace que las fotos ya subidas se guarden 1 año en cada celular/computador en vez de 1 hora (así no se vuelven a bajar a cada rato).
// NO borra ni cambia ninguna foto: baja cada una, la vuelve a subir en el MISMO lugar con la misma imagen y comprueba que pesa igual.
// Si se corta, se puede volver a correr: salta las que ya están listas.
//   $env:SUPABASE_URL = "https://xxxx.supabase.co"   $env:SUPABASE_SERVICE_KEY = "(la service_role, no se pega en el chat)"
//   node recachear-fotos.mjs                       → solo cuenta (no cambia nada)
//   node recachear-fotos.mjs --aplicar             → lo hace
//   Opcional: --bucket=prendas (por defecto)  --paralelo=4
import { pathToFileURL } from 'node:url'

export const UN_ANIO = '31536000'
const yaListo = (it) => String(it?.metadata?.cacheControl ?? '').includes(UN_ANIO)

async function* archivos(sb, bucket, prefijo = '') {
  for (let desde = 0; ; desde += 1000) {
    const { data, error } = await sb.storage.from(bucket).list(prefijo, { limit: 1000, offset: desde, sortBy: { column: 'name', order: 'asc' } })
    if (error) throw new Error(`No se pudo listar ${bucket}/${prefijo}: ${error.message}`)
    for (const it of data ?? []) {
      const ruta = prefijo ? `${prefijo}/${it.name}` : it.name
      if (it.id === null || it.id === undefined) yield* archivos(sb, bucket, ruta)      // carpeta
      else yield { ruta, it }
    }
    if ((data ?? []).length < 1000) break
  }
}

export async function recachear(sb, { bucket = 'prendas', aplicar = false, paralelo = 4, log = console.log } = {}) {
  const pendientes = []
  let listos = 0, bytes = 0
  for await (const a of archivos(sb, bucket)) {
    if (yaListo(a.it)) { listos++; continue }
    pendientes.push(a); bytes += Number(a.it.metadata?.size ?? 0)
  }
  log(`${bucket}: ${listos} ya están listas · ${pendientes.length} por cambiar (${(bytes / 1048576).toFixed(0)} MB)`)
  if (!aplicar) { log('Solo conté. Para hacerlo: node recachear-fotos.mjs --aplicar'); return { listos, pendientes: pendientes.length, hechas: 0, fallos: [] } }
  let hechas = 0; const fallos = []
  const cola = [...pendientes]
  const trabajador = async () => {
    for (let a = cola.shift(); a; a = cola.shift()) {
      try {
        const { data, error } = await sb.storage.from(bucket).download(a.ruta)
        if (error) throw new Error('bajar: ' + error.message)
        const buf = Buffer.from(await data.arrayBuffer())
        const esperado = Number(a.it.metadata?.size ?? buf.length)
        if (buf.length !== esperado) throw new Error(`pesa ${buf.length} y debía pesar ${esperado}: no se toca`)
        const { error: e2 } = await sb.storage.from(bucket).upload(a.ruta, buf, { upsert: true, cacheControl: UN_ANIO, contentType: a.it.metadata?.mimetype || data.type || 'image/jpeg' })
        if (e2) throw new Error('subir: ' + e2.message)
        hechas++
        if (hechas % 100 === 0) log(`  …${hechas}/${pendientes.length}`)
      } catch (e) { fallos.push(`${a.ruta}: ${e.message}`) }
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, paralelo) }, trabajador))
  log(`Listo: ${hechas} fotos con caché de 1 año · con error: ${fallos.length}`)
  for (const f of fallos.slice(0, 20)) log('  ✗', f)
  return { listos, pendientes: pendientes.length, hechas, fallos }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const e = process.env, arg = (n) => process.argv.find(x => x.startsWith(`--${n}=`))?.split('=')[1]
  if (!e.SUPABASE_URL || !e.SUPABASE_SERVICE_KEY) { console.error('Faltan $env:SUPABASE_URL y $env:SUPABASE_SERVICE_KEY.'); process.exit(1) }
  const { createClient } = await import('@supabase/supabase-js')
  const sb = createClient(e.SUPABASE_URL, e.SUPABASE_SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
  const r = await recachear(sb, { bucket: arg('bucket') || 'prendas', aplicar: process.argv.includes('--aplicar'), paralelo: Number(arg('paralelo')) || 4 })
  if (r.fallos.length) process.exit(1)
}
