// Lógica de la importación de Cibus (tienda de Nelson) a la plataforma. Se prueba con PGlite (pruebas/migracion.mjs) y se usa con
// Postgres real en 02-importar-nelson.mjs. Todo ocurre en UNA transacción: si algo falla o es un ensayo en seco, no queda nada.
import fs from 'fs'
import path from 'path'

// Orden de copia (con triggers apagados el orden no es obligatorio, pero así se lee mejor)
export const TABLAS = ['clientes', 'productos', 'producto_componentes', 'lotes', 'prendas', 'prenda_variantes', 'formas_pago', 'ventas', 'venta_items',
  'venta_pagos', 'venta_consumos', 'ventas_claves', 'acciones_claves', 'fiado_movimientos', 'compras', 'compra_items', 'gastos', 'caja_movimientos',
  'ajustes_inventario', 'prestamos', 'prestamo_cuotas', 'prestamo_pagos', 'prepago_movimientos', 'prepago_bono_usos', 'pedidos_ropa', 'pedido_ropa_items',
  'pedidos_tienda', 'pedido_tienda_items', 'ofertas', 'promociones', 'anuncios', 'menu_hoy', 'musica_fondo', 'perfil_cliente', 'comentarios_tienda',
  'suscripciones_push', 'perfiles', 'auditoria', 'accesos', 'visitas', 'avisos_auto', 'avisos_log', 'instalaciones_app']

// Tablas con la misma forma (solo se añade negocio_id). Las demás tienen su propia transformación.
const REF_USUARIO = ['user_id', 'cliente_user_id', 'creado_por', 'usuario', 'anulada_por']
const DESTINO = { comentarios_tienda: 'opiniones' }
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// La tabla «negocio» de Cibus (una fila) se reparte en negocio_config y negocio_reglas
const CONFIG = { nombre: 'nombre_comercial', logo: 'logo_path', nit: 'nit', direccion: 'direccion', ciudad: 'ciudad', telefono: 'telefono', email: 'email', web: 'web',
  titulo_factura: 'titulo_factura', nota_pie: 'nota_pie', ver_logo: 'ver_logo', whatsapp: 'whatsapp', instagram: 'instagram', facebook: 'facebook', tiktok: 'tiktok',
  horario: 'horario', maps_url: 'maps_url', razon_social: 'razon_social', correo_datos: 'correo_datos' }
const REGLAS = { prefijo_factura: 'prefijo_factura', comision_datafono: 'comision_datafono', margen_minimo: 'margen_minimo', mora_mensual: 'mora_mensual',
  descuento_mayorista: 'descuento_mayorista', bloquear_credito_mora: 'bloquear_credito_mora', domicilio_costo: 'domicilio_costo', envio_gratis_desde: 'envio_gratis_desde',
  zona_domicilio: 'zona_domicilio', formas_pago_tienda: 'formas_pago_tienda', domicilio_costo_ropa: 'domicilio_costo_ropa', envio_gratis_desde_ropa: 'envio_gratis_desde_ropa',
  dom_modo: 'domicilio_modo', dom_base: 'domicilio_costo', dom_por_km: 'domicilio_valor_km', dom_max_km: 'domicilio_radio_max_km', dom_redondeo: 'domicilio_redondeo',
  dom_km_incluidos: 'domicilio_km_incluidos', pago_digital_numero: 'pago_digital_numero', pago_digital_medios: 'pago_digital_medios', pago_digital_titular: 'pago_digital_titular' }

const MODULOS_CIBUS = ['productos', 'ropa', 'caja', 'fiados', 'compras', 'reportes', 'catalogo_publico', 'pedidos_en_linea', 'domicilio_km', 'mis_pedidos', 'opiniones',
  'menu_del_dia', 'musica_fondo', 'avisos_push', 'anuncios_video', 'publicidad', 'resumen_semanal', 'prestamos', 'carga_masiva', 'catalogo_maestro']

const leer = (dir, t) => { const f = path.join(dir, 'tablas', t + '.json'); return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : [] }

/**
 * q(sql, params) → { rows }.  Opciones: dir (carpeta del respaldo), slug, urlViejo (https://xxxx.supabase.co), mapaUsuarios {viejo: nuevo},
 * aplicar (false = ensayo en seco: se hace todo y se deshace), limpiar (borra lo ya importado de esta tienda antes de copiar).
 */
export async function importar({ q, dir, slug = 'cibus', correoDueno = 'matrizcibus@gmail.com', urlViejo = '', mapaUsuarios = {}, aplicar = false, limpiar = false, log = console.log }) {
  const informe = { tablas: {}, avisos: [], archivos: [], sumas: [], ok: true }
  const aviso = (m) => { informe.avisos.push(m); log('  ⚠', m) }
  await q('begin')
  try {
    await q(`set local session_replication_role = replica`)           // sin triggers ni llaves: se copia tal cual, sin recalcular nada
    let neg = (await q(`select id from negocios where slug = $1`, [slug])).rows[0]?.id
    if (!neg) {
      neg = (await q(`select (crear_negocio($1, 'Cibus', 'mixto', $2, 'completo')->>'id')::uuid id`, [slug, correoDueno])).rows[0].id
      log('Tienda creada:', slug, neg)
    }
    const hay = (await q(`select (select count(*) from productos where negocio_id=$1)::int p, (select count(*) from ventas where negocio_id=$1)::int v`, [neg])).rows[0]
    if (hay.p + hay.v > 0) {
      if (!limpiar) throw new Error(`La tienda "${slug}" ya tiene datos (${hay.p} productos, ${hay.v} ventas). Usa --limpiar para repetir el ensayo desde cero.`)
      for (const t of [...TABLAS].reverse()) {
        if (t === 'perfiles' || t === 'suscripciones_push' || t === 'perfil_cliente') continue
        await q(`delete from "${DESTINO[t] ?? t}" where negocio_id = $1`, [neg])
      }
      await q(`delete from negocio_miembros where negocio_id = $1 and rol = 'cajero'`, [neg]); await q(`delete from suscripciones_personal where negocio_id = $1`, [neg])
      await q(`delete from negocio_contadores where negocio_id = $1`, [neg])
      log('Datos anteriores de la tienda borrados (--limpiar).')
    }

    // ---- usuarios ----
    const mu = (v) => (v && UUID.test(String(v)) ? (mapaUsuarios[v] ?? null) : v ?? null)
    const roles = new Map(leer(dir, 'perfiles').map((p) => [p.user_id, p.rol]))
    // ---- archivos de Storage: toda dirección pública del proyecto viejo se reescribe a la ruta nueva y se anota para copiarla ----
    const porRuta = new Map()
    const cambiarUrl = (v) => {
      if (typeof v !== 'string' || !urlViejo || !v.startsWith(urlViejo)) return v
      const m = /\/storage\/v1\/object\/(?:public|sign)\/([^/]+)\/(.+?)(?:\?.*)?$/.exec(v)
      if (!m) return v
      const [, bucket, ruta0] = m, ruta = decodeURIComponent(ruta0)
      const [espacio, nueva] = bucket === 'prendas' ? ['negocios', `${neg}/productos/${ruta}`] : bucket === 'anuncios-video' ? ['negocios', `${neg}/anuncios/${ruta}`]
        : bucket === 'musica-fondo' ? ['musica-negocios', `${neg}/${ruta}`] : ['negocios', `${neg}/${bucket}/${ruta}`]
      porRuta.set(`${bucket}/${ruta}`, { bucket, ruta, espacio, nueva })
      return nueva
    }
    const reescribir = (o) => {
      for (const k of Object.keys(o)) {
        const v = o[k]
        if (typeof v === 'string') o[k] = cambiarUrl(v)
        else if (Array.isArray(v) && v.some((x) => typeof x === 'string')) o[k] = v.map(cambiarUrl)
      }
      return o
    }

    // ---- transformaciones por tabla: devuelven la fila lista para la tabla destino (o null para omitirla) ----
    const T = {
      productos: (f) => ({ ...f, controla_stock: true }),      // en Cibus todo producto controla su stock (en la plataforma lo calcula un trigger que aquí está apagado)
      perfil_cliente: (f) => { const u = mu(f.user_id); if (!u) { aviso(`perfil_cliente: se omite el cliente ${f.email || f.user_id} (sin cuenta nueva)`); return null } const { cliente_id, ...r } = f; return { ...r, user_id: u } },
      comentarios_tienda: (f) => { const { acepta_publicar_en, ...r } = f; return r },
      menu_hoy: (f) => { const { id, foto_url, ...r } = f; return { ...r, foto: foto_url ?? null } },
      caja_movimientos: (f) => { const { creado_por, ...r } = f; return { ...r, usuario: creado_por } },
      pedidos_tienda: (f) => { const { dom_km, user_id, ...r } = f; return { ...r, km_informado: dom_km ?? null, cliente_user_id: user_id } },
      musica_fondo: (f) => { const { id, url, ...r } = f; return { ...r, ruta: url ?? null } },
    }
    const salida = {}      // tabla destino → filas a insertar

    for (const t of TABLAS) {
      if (t === 'perfiles' || t === 'suscripciones_push') continue
      let filas = leer(dir, t)
      informe.tablas[t] = { respaldo: filas.length }
      if (t === 'formas_pago') await q(`delete from formas_pago where negocio_id = $1`, [neg])         // las de la tienda nueva se cambian por las de Cibus
      const tr = T[t] ?? ((f) => f)
      const destino = DESTINO[t] ?? t
      const out = []
      for (const f of filas) {
        let r = tr({ ...f })
        if (!r) continue
        r = reescribir(r)
        for (const k of REF_USUARIO) if (k in r && t !== 'perfil_cliente') r[k] = mu(r[k])
        if (t !== 'perfil_cliente') r.negocio_id = neg         // el perfil de cliente es de la persona (sirve en todas las tiendas), no de una tienda
        out.push(r)
      }
      if (t === 'musica_fondo' && out.length > 1) { out.sort((a, b) => String(b.actualizado_en).localeCompare(String(a.actualizado_en))); out.length = 1; aviso('musica_fondo: la plataforma guarda una sola canción por tienda; se dejó la más reciente') }
      if (t === 'avisos_auto' && out.length > 1) out.length = 1
      if (t === 'avisos_auto') for (const r of out) delete r.id
      salida[destino] = out
      informe.tablas[t].esperadas = out.length
    }

    // perfiles → negocio_miembros (el rol «soporte» de Iván no es un miembro: es administrador de la plataforma)
    const miembros = []
    for (const p of leer(dir, 'perfiles')) {
      const u = mu(p.user_id)
      if (!u) { aviso(`perfiles: ${p.nombre || p.user_id} (${p.rol}) no tiene cuenta nueva`); continue }
      if (!['dueno', 'cajero'].includes(p.rol)) continue
      miembros.push({ negocio_id: neg, user_id: u, rol: p.rol, nombre: p.nombre ?? null, activo: true })
    }
    informe.tablas.perfiles = { respaldo: leer(dir, 'perfiles').length, esperadas: miembros.length }
    // suscripciones_push → del personal (con su tienda) o de cliente
    const susp = leer(dir, 'suscripciones_push'), sPers = [], sCli = []
    for (const s of susp) {
      const u = mu(s.user_id); if (!u) continue
      const base = { endpoint: s.endpoint, user_id: u, p256dh: s.p256dh, auth: s.auth, creado_en: s.creado_en }
      if (roles.has(s.user_id)) sPers.push({ ...base, negocio_id: neg }); else sCli.push(base)
    }
    informe.tablas.suscripciones_push = { respaldo: susp.length, esperadas: sPers.length + sCli.length }

    // ---- insertar ----
    const poner = async (tabla, filas) => {
      if (!filas.length) return
      const meta = new Map((await q(`select column_name c, is_nullable n, column_default d from information_schema.columns where table_schema = 'public' and table_name = $1`, [tabla])).rows.map((r) => [r.c, r]))
      const sobran = new Set()
      const grupos = new Map()      // filas con las mismas columnas se insertan juntas; lo que sea nulo y la plataforma exija con valor por defecto, se omite para que lo use
      for (const f of filas) {
        const g = {}
        for (const [k, v] of Object.entries(f)) {
          const m = meta.get(k)
          if (!m) { sobran.add(k); continue }
          if (v === null && m.n === 'NO' && m.d !== null) continue
          g[k] = v
        }
        const firma = Object.keys(g).sort().join(',')
        if (!grupos.has(firma)) grupos.set(firma, [])
        grupos.get(firma).push(g)
      }
      if (sobran.size) aviso(`${tabla}: la plataforma no tiene las columnas ${[...sobran].join(', ')} (no se copian)`)
      for (const [firma, lote] of grupos) {
        const cols = firma.split(',').map((k) => `"${k}"`).join(', ')
        for (let i = 0; i < lote.length; i += 400) {
          await q(`insert into "${tabla}" (${cols}) select ${cols} from jsonb_populate_recordset(null::"${tabla}", $1::jsonb)`, [JSON.stringify(lote.slice(i, i + 400))])
        }
      }
    }
    if ((salida.perfil_cliente ?? []).length) await q(`delete from perfil_cliente where user_id = any($1::uuid[])`, [salida.perfil_cliente.map((f) => f.user_id)])      // las cuentas nuevas solo existen por la migración
    for (const [tabla, filas] of Object.entries(salida)) { await poner(tabla, filas); log(String(filas.length).padStart(7), tabla) }
    if (miembros.length) await q(`delete from negocio_miembros where negocio_id = $1 and user_id = any($2::uuid[])`, [neg, miembros.map((m) => m.user_id)])
    const eps = [...sPers, ...sCli].map((x) => x.endpoint)
    if (eps.length) { await q(`delete from suscripciones_cliente where endpoint = any($1::text[])`, [eps]); await q(`delete from suscripciones_personal where endpoint = any($1::text[])`, [eps]) }
    await poner('negocio_miembros', miembros); await poner('suscripciones_personal', sPers); await poner('suscripciones_cliente', sCli)

    // ---- datos de la tienda (la tabla «negocio») ----
    const nego = leer(dir, 'negocio')[0]
    if (nego) {
      const cfg = {}, reg = {}
      for (const [a, b] of Object.entries(CONFIG)) if (nego[a] !== undefined && nego[a] !== null) cfg[b] = nego[a]
      for (const [a, b] of Object.entries(REGLAS)) if (nego[a] !== undefined && nego[a] !== null) reg[b] = nego[a]
      if (typeof nego.dom_origen === 'string' && /^-?\d+(\.\d+)?\s*,\s*-?\d+(\.\d+)?$/.test(nego.dom_origen)) { const [la, lo] = nego.dom_origen.split(',').map(Number); cfg.lat = la; cfg.lng = lo }
      else if (nego.dom_origen) aviso(`dom_origen es una dirección escrita («${nego.dom_origen}»), no coordenadas: revisa el punto de la tienda en Datos del negocio`)
      if (typeof nego.logo === 'string' && /^data:image\/(png|jpeg);base64,/.test(nego.logo)) {      // el logo de Cibus vive como texto en la base: se guarda como archivo para subirlo a la carpeta de marca
        const ext = nego.logo.startsWith('data:image/png') ? 'png' : 'jpg', archivo = path.join(dir, `logo-cibus.${ext}`)
        fs.writeFileSync(archivo, Buffer.from(nego.logo.split(',')[1], 'base64'))
        cfg.logo_path = `${neg}/marca/logo-migrado.${ext}`; cfg.icono_path = cfg.logo_path
        informe.logo = { archivo, espacio: 'negocios', nueva: cfg.logo_path, tipo: ext === 'png' ? 'image/png' : 'image/jpeg' }
      } else if (cfg.logo_path && !String(cfg.logo_path).startsWith(neg + '/marca/')) { aviso('el logo no es una imagen incrustada: revísalo en Datos del negocio'); delete cfg.logo_path }
      const cfgOk = cfg
      const set = (tabla, o) => { const ks = Object.keys(o); return ks.length ? q(`update "${tabla}" set ${ks.map((k, i) => `"${k}" = $${i + 2}`).join(', ')} where negocio_id = $1`, [neg, ...ks.map((k) => o[k])]) : null }
      await set('negocio_config', cfgOk); await set('negocio_reglas', reg)
      informe.tablas.negocio = { respaldo: 1, esperadas: 1 }
    }

    // ---- contadores de numeración (el siguiente número no puede repetir uno ya usado) ----
    for (const [tipo, tabla] of [['venta', 'ventas'], ['pedido_ropa', 'pedidos_ropa'], ['pedido_tienda', 'pedidos_tienda']]) {
      const mx = (await q(`select coalesce(max(numero), 0)::bigint m from "${tabla}" where negocio_id = $1`, [neg])).rows[0].m
      await q(`insert into negocio_contadores (negocio_id, tipo, ultimo) values ($1, $2, $3) on conflict (negocio_id, tipo) do update set ultimo = excluded.ultimo`, [neg, tipo, mx])
    }
    // ---- secuencias (los id numéricos nuevos deben seguir después del último importado) ----
    const seqs = (await q(`select table_name t, column_name c, pg_get_serial_sequence('public.' || table_name, column_name) s from information_schema.columns
                            where table_schema = 'public' and column_default like 'nextval%'`)).rows
    for (const s of seqs) if (s.s) await q(`select setval($1, greatest(coalesce((select max("${s.c}") from "${s.t}"), 0), 1))`, [s.s]).catch(() => {})

    // ---- módulos propios de Cibus ----
    for (const m of MODULOS_CIBUS) {
      await q(`insert into negocio_modulos (negocio_id, modulo, activo, origen) select $1, clave, true, 'extra' from modulos where clave = $2
               on conflict (negocio_id, modulo) do update set activo = true`, [neg, m])
    }

    // ---- verificación: cantidades y sumas de cada tabla, respaldo contra base nueva ----
    for (const [t, info] of Object.entries(informe.tablas)) {
      const d = DESTINO[t] ?? t
      if (['negocio', 'perfiles', 'suscripciones_push'].includes(t)) continue
      if (t === 'perfil_cliente') {
        const n = (await q(`select count(*)::int n from perfil_cliente where user_id = any($1::uuid[])`, [(salida.perfil_cliente ?? []).map((f) => f.user_id)])).rows[0].n
        info.en_plataforma = n; if (n !== info.esperadas) { informe.ok = false; log('  ✗ perfil_cliente esperadas', info.esperadas, 'en plataforma', n) }
        continue
      }
      const n = (await q(`select count(*)::int n from "${d}" where negocio_id = $1`, [neg])).rows[0].n
      info.en_plataforma = n
      if (n !== info.esperadas) { informe.ok = false; log('  ✗', t, 'esperadas', info.esperadas, 'en plataforma', n) }
      const cols = (await q(`select column_name c from information_schema.columns where table_schema='public' and table_name = $1 and data_type in ('numeric','integer','bigint','smallint','double precision')
                              and column_name not in ('id','numero','negocio_id')`, [d])).rows.map((r) => r.c)
      const ex = salida[d] ?? []
      for (const c of cols) {
        const a = ex.reduce((s, f) => s + (Number(f[c]) || 0), 0)
        const b = Number((await q(`select coalesce(sum("${c}"), 0) s from "${d}" where negocio_id = $1`, [neg])).rows[0].s)
        if (a !== 0 || b !== 0) { const bien = Math.abs(a - b) < 0.5; informe.sumas.push({ tabla: t, col: c, respaldo: a, plataforma: b, bien }); if (!bien) { informe.ok = false; log('  ✗ suma', t, c, a, b) } }
      }
    }
    informe.archivos.push(...porRuta.values())
    informe.negocio_id = neg
    await q(aplicar && informe.ok ? 'commit' : 'rollback')
    informe.aplicado = aplicar && informe.ok
    return informe
  } catch (e) { await q('rollback').catch(() => {}); throw e }
}
