// PASO 1 de la migración de Cibus (tienda de Nelson) — RESPALDO. SOLO LEE: no escribe, no borra ni cambia nada en su Supabase.
// Guarda cada tabla en un archivo JSON, la lista de usuarios (sin contraseñas) y la lista de archivos de Storage.
//
// Uso (PowerShell, dentro de C:\plataforma-negocios). Las claves se ponen SOLO en esa ventana, nunca en el código ni en el chat:
//   $env:NELSON_URL = "https://XXXX.supabase.co"
//   $env:NELSON_SERVICE_KEY = "la service_role de Nelson (Supabase > Project Settings > API)"
//   node scripts/migracion/01-respaldar-nelson.mjs
//   (opcional, descarga también los archivos: añade  --archivos )
import { createClient } from '@supabase/supabase-js'
import fs from 'fs'
import path from 'path'

const url = process.env.NELSON_URL, key = process.env.NELSON_SERVICE_KEY
if (!url || !key) { console.error('Falta NELSON_URL o NELSON_SERVICE_KEY (ver las instrucciones al inicio de este archivo).'); process.exit(1) }
const bajarArchivos = process.argv.includes('--archivos')
const sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })

const TABLAS = ['accesos', 'acciones_claves', 'ajustes_inventario', 'anuncios', 'auditoria', 'avisos_auto', 'avisos_log', 'caja_movimientos', 'clientes',
  'comentarios_tienda', 'compra_items', 'compras', 'fiado_movimientos', 'formas_pago', 'gastos', 'instalaciones_app', 'lotes', 'menu_hoy', 'musica_fondo',
  'negocio', 'ofertas', 'pedido_ropa_items', 'pedido_tienda_items', 'pedidos_ropa', 'pedidos_tienda', 'perfil_cliente', 'perfiles', 'prenda_variantes',
  'prendas', 'prepago_bono_usos', 'prepago_movimientos', 'prestamo_cuotas', 'prestamo_pagos', 'prestamos', 'producto_componentes', 'productos',
  'promociones', 'suscripciones_push', 'venta_consumos', 'venta_items', 'venta_pagos', 'ventas', 'ventas_claves', 'visitas']

const sello = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
const carpeta = path.join('respaldo-nelson', sello)
fs.mkdirSync(path.join(carpeta, 'tablas'), { recursive: true })
const resumen = { creado: new Date().toISOString(), tablas: {}, errores: [] }

async function tabla(nombre) {
  const filas = []
  for (let desde = 0; ; desde += 1000) {
    const { data, error } = await sb.from(nombre).select('*').range(desde, desde + 999)
    if (error) throw new Error(error.message)
    filas.push(...data)
    if (data.length < 1000) break
  }
  return filas
}

for (const t of TABLAS) {
  try {
    const filas = await tabla(t)
    fs.writeFileSync(path.join(carpeta, 'tablas', t + '.json'), JSON.stringify(filas))
    resumen.tablas[t] = filas.length
    console.log(String(filas.length).padStart(7), t)
  } catch (e) { resumen.errores.push(t + ': ' + e.message); console.log('  ERROR', t, '→', e.message) }
}

// Usuarios (sin contraseñas): para vincular a cada persona con su cuenta nueva por correo
try {
  const usuarios = []
  for (let pagina = 1; ; pagina++) {
    const { data, error } = await sb.auth.admin.listUsers({ page: pagina, perPage: 1000 })
    if (error) throw new Error(error.message)
    usuarios.push(...data.users.map((u) => ({ id: u.id, email: u.email, creado: u.created_at, ultimo_ingreso: u.last_sign_in_at,
      proveedores: (u.app_metadata?.providers || []), nombre: u.user_metadata?.full_name || u.user_metadata?.name || null, foto: u.user_metadata?.avatar_url || null,
      confirmado: !!u.email_confirmed_at, factores_2fa: (u.factors || []).length })))
    if (data.users.length < 1000) break
  }
  fs.writeFileSync(path.join(carpeta, 'usuarios.json'), JSON.stringify(usuarios, null, 1))
  resumen.usuarios = usuarios.length
  console.log(String(usuarios.length).padStart(7), 'usuarios (auth)')
} catch (e) { resumen.errores.push('usuarios: ' + e.message); console.log('  ERROR usuarios →', e.message) }

// Archivos de Storage (lista; y los descarga solo si pasas --archivos)
try {
  const { data: buckets, error } = await sb.storage.listBuckets()
  if (error) throw new Error(error.message)
  resumen.storage = {}
  for (const b of buckets) {
    const lista = []
    const recorrer = async (prefijo) => {
      for (let desde = 0; ; desde += 100) {
        const { data, error: e } = await sb.storage.from(b.id).list(prefijo, { limit: 100, offset: desde })
        if (e) throw new Error(e.message)
        for (const o of data) { if (o.id) lista.push(prefijo ? prefijo + '/' + o.name : o.name); else await recorrer(prefijo ? prefijo + '/' + o.name : o.name) }
        if (data.length < 100) break
      }
    }
    await recorrer('')
    resumen.storage[b.id] = { publico: b.public, archivos: lista.length }
    fs.writeFileSync(path.join(carpeta, `storage-${b.id}.json`), JSON.stringify(lista))
    console.log(String(lista.length).padStart(7), 'archivos en el bucket', b.id)
    if (bajarArchivos) {
      for (const ruta of lista) {
        const destino = path.join(carpeta, 'archivos', b.id, ruta); fs.mkdirSync(path.dirname(destino), { recursive: true })
        const { data: blob, error: e } = await sb.storage.from(b.id).download(ruta)
        if (e) { resumen.errores.push(`archivo ${b.id}/${ruta}: ${e.message}`); continue }
        fs.writeFileSync(destino, Buffer.from(await blob.arrayBuffer()))
      }
    }
  }
} catch (e) { resumen.errores.push('storage: ' + e.message); console.log('  ERROR storage →', e.message) }

fs.writeFileSync(path.join(carpeta, 'resumen.json'), JSON.stringify(resumen, null, 2))
console.log(`\nRespaldo en: ${path.resolve(carpeta)}`)
console.log(resumen.errores.length ? `${resumen.errores.length} ERRORES (revisa arriba)` : 'Sin errores.')
