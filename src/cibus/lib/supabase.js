// Conexión del panel copiado de Cibus. Es la MISMA sesión de la plataforma, pero cada consulta lleva el negocio
// (dbDe): las pantallas se escriben igual que en Cibus (supabase.from('productos').select…) y aquí se les pone el
// negocio de la tienda abierta. El aislamiento real lo hace la base de datos (RLS); esto evita olvidos.
import { supabase as plataforma } from '../../lib/supabase'
import { dbDe } from '../../lib/negocioDb'
import { practicaActiva, contarSimulada } from './practica'
import { limpiarIndiceBusqueda } from './buscar'
import { modoPublico, desdePublico, rpcPublico } from './publico'

let negocioId = null
export function fijarNegocio(id) { negocioId = id; limpiarIndiceBusqueda() }
export const negocioActual = () => negocioId
const db = () => { if (!negocioId) throw new Error('El panel no sabe de qué tienda es'); return dbDe(negocioId, plataforma) }

// ---------- La tabla «negocio» de Cibus (una fila) vive en la plataforma en negocio_config + negocio_reglas ----------
const CONFIG = { nombre: 'nombre_comercial', logo: 'logo_path', nit: 'nit', direccion: 'direccion', ciudad: 'ciudad', telefono: 'telefono', email: 'email', web: 'web', titulo_factura: 'titulo_factura', nota_pie: 'nota_pie', ver_logo: 'ver_logo', whatsapp: 'whatsapp', instagram: 'instagram', facebook: 'facebook', tiktok: 'tiktok', horario: 'horario', horario_semana: 'horario_semana', cerrado_hasta: 'cerrado_hasta', en_directorio: 'en_directorio', maps_url: 'maps_url', razon_social: 'razon_social', correo_datos: 'correo_datos', actualizado_en: 'actualizado_en' }
const REGLAS = ['bloquear_agotados', 'prefijo_factura', 'comision_datafono', 'margen_minimo', 'mora_mensual', 'descuento_mayorista', 'bloquear_credito_mora', 'domicilio_costo', 'envio_gratis_desde', 'zona_domicilio', 'formas_pago_tienda', 'pago_digital_numero', 'pago_digital_medios', 'pago_digital_titular']
const unir = (c, r) => {
  const o = { id: 1 }
  if (c) for (const [antes, ahora] of Object.entries(CONFIG)) o[antes] = c[ahora]
  if (o.logo && !/^(data:|https?:)/.test(o.logo)) o.logo = plataforma.storage.from('negocios').getPublicUrl(o.logo).data.publicUrl
  if (r) for (const k of REGLAS) o[k] = r[k]
  return o
}
const quitar = (fila, cols) => { if (!fila || cols === '*' || !cols) return fila; const pide = String(cols).split(',').map(s => s.trim()); return Object.fromEntries(pide.map(k => [k, fila[k]])) }

function negocioFalso() {
  const q = { cols: '*', valores: null }
  const leer = async () => {
    const d = db()
    const [c, r] = await Promise.all([
      d.from('negocio_config').select('*').maybeSingle(),
      d.from('negocio_reglas').select('*').maybeSingle(),
    ])
    const error = c.error || r.error
    return { data: error ? null : quitar(unir(c.data, r.data), q.cols), error, count: null, status: error ? 400 : 200 }
  }
  const escribir = async () => {
    const d = db(), v = q.valores
    const cfg = {}, reg = {}
    if (typeof v.logo === 'string' && v.logo.startsWith('data:')) {      // logo nuevo: se sube a la carpeta de marca de la tienda
      const blob = await (await fetch(v.logo)).blob()
      const ruta = `${negocioId}/marca/logo-${Date.now()}.${blob.type === 'image/png' ? 'png' : 'jpg'}`
      const s = await plataforma.storage.from('negocios').upload(ruta, blob, { contentType: blob.type })
      if (s.error) return { data: null, error: s.error, count: null, status: 400 }
      v.logo = ruta; cfg.icono_path = ruta
    } else if (typeof v.logo === 'string' && /^https?:/.test(v.logo)) delete v.logo      // sin cambios (ya es la dirección pública)
    else if (v.logo === null) cfg.icono_path = null
    for (const [k, val] of Object.entries(v)) { if (CONFIG[k] && k !== 'actualizado_en') cfg[CONFIG[k]] = val; else if (REGLAS.includes(k)) reg[k] = val }
    for (const [tabla, vals] of [['negocio_config', cfg], ['negocio_reglas', reg]]) {
      if (Object.keys(vals).length === 0) continue
      const r = await d.from(tabla).update({ ...vals, actualizado_en: new Date().toISOString() })
      if (r.error) return { data: null, error: r.error, count: null, status: 400 }
    }
    return { data: null, error: null, count: null, status: 204 }
  }
  const b = {
    select(cols = '*') { q.cols = cols; return b },
    update(valores) { q.valores = valores; return b },
    eq() { return b },
    maybeSingle: () => leer(),
    single: () => leer(),
    then: (ok, mal) => (q.valores ? escribir() : leer()).then(ok, mal),
  }
  return b
}

// ---------- Modo práctica: las escrituras se simulan (ver lib/practica.js) ----------
const id = () => (globalThis.crypto?.randomUUID?.() ?? `practica-${Date.now()}`)
const conId = (f) => ({ id: id(), ...f })

/** Respuesta falsa que acepta cualquier cadena (.eq().select().single()…) y se resuelve sin error. */
const falso = (valor) => {
  const p = new Proxy(function () {}, {
    get(_, k) {
      if (k === 'then') return (ok, mal) => Promise.resolve({ data: valor, error: null, count: null, status: 200, statusText: 'OK' }).then(ok, mal)
      return () => p
    },
    apply() { return p },
  })
  return p
}

const RPC_DE_LECTURA = /^(ventas_recientes|tiene_pin_autorizacion|autorizar_stock|es_|listar|tablero|mfa|registrar_acceso|mi_perfil|datos_domicilio|calcular_domicilio|mis_pedidos|estado_pedido|caja_dia|previsualizar|resumen_)/
const RPC_PUBLICAS = /^(crear_pedido_|registrar_visita|guardar_mi_perfil|borrar_mi_perfil|publicar_|borrar_mis_|guardar_suscripcion_push|borrar_mi_suscripcion_push|registrar_app_instalada)/

// Funciones de Cibus que en la plataforma se llaman distinto
const ALIAS = { listar_resumen_semanal: 'resumen_semanal', listar_comentarios_admin: 'listar_opiniones_admin', listar_equipo: 'listar_miembros', quitar_personal: 'quitar_miembro', agregar_personal: 'invitar_miembro', moderar_comentario: 'moderar_opinion' }

// Los avisos en tiempo real también se limitan a esta tienda
const canalDeNegocio = (nombre, opc) => {
  const c = plataforma.channel(nombre, opc)
  const p = new Proxy(c, {
    get(t, k) {
      if (k === 'on') return (tipo, filtro, ...r) => { t.on(tipo, tipo === 'postgres_changes' && filtro && !filtro.filter ? { ...filtro, filter: `negocio_id=eq.${negocioId}` } : filtro, ...r); return p }
      const v = t[k]; return typeof v === 'function' ? v.bind(t) : v
    },
  })
  return p
}

// Productos: Cibus guarda la DIRECCIÓN de cada foto y no tiene «imagen_url» en la base de la plataforma; aquí la base guarda la RUTA.
const aRuta = (f) => { const m = /\/storage\/v1\/object\/public\/negocios\/(.+)$/.exec(String(f)); return m ? decodeURIComponent(m[1]) : f }
const limpiarProducto = (fila) => {
  if (!fila || typeof fila !== 'object') return fila
  const { imagen_url, ...resto } = fila
  if (Array.isArray(resto.imagenes)) resto.imagenes = resto.imagenes.map(aRuta)
  return resto
}
const conRutas = (v) => (Array.isArray(v) ? v.map(limpiarProducto) : limpiarProducto(v))
const sinImagenUrl = (cols) => (typeof cols === 'string' ? cols.split(',').map(c => c.trim()).filter(c => c !== 'imagen_url').join(',') || '*' : cols)
const adaptarProductos = (q) => ({
  ...q,
  select: (cols, ...a) => q.select(sinImagenUrl(cols), ...a),
  insert: (f, ...a) => q.insert(conRutas(f), ...a),
  upsert: (f, ...a) => q.upsert(conRutas(f), ...a),
  update: (f, ...a) => q.update(conRutas(f), ...a),
})

// Ofertas y anuncios: la base exige la RUTA de la foto ({negocio}/anuncios/archivo), no su dirección completa
const sinDireccion = (f) => (f && typeof f === 'object' && 'imagen' in f ? { ...f, imagen: f.imagen ? aRuta(f.imagen) : f.imagen } : f)
const adaptarImagen = (q) => ({ ...q, insert: (f, ...a) => q.insert(sinDireccion(f), ...a), update: (f, ...a) => q.update(sinDireccion(f), ...a) })

// Menú del día que se ve hoy: la plataforma lo guarda en menu_hoy con su fecha (Cibus tenía una vista aparte)
const hoyBogota = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date())
const soloHoy = (q) => ({ ...q, select: (...a) => q.select(...a).eq('fecha', hoyBogota()) })

const desdeNegocio = (tabla) => {
  if (tabla === 'negocio') return negocioFalso()
  const q0 = tabla === 'menu_hoy_publico' ? soloHoy(db().from('menu_hoy')) : db().from(tabla)
  const q = tabla === 'productos' ? adaptarProductos(q0) : (tabla === 'ofertas' || tabla === 'anuncios') ? adaptarImagen(q0) : q0
  if (!practicaActiva()) return q
  return new Proxy(q, {
    get(t, k) {
      if (k === 'insert' || k === 'upsert') return (fila) => { contarSimulada(); return falso(Array.isArray(fila) ? fila.map(conId) : conId(fila)) }
      if (k === 'update') return (fila) => { contarSimulada(); return falso(fila) }
      if (k === 'delete') return () => { contarSimulada(); return falso(null) }
      return t[k]
    },
  })
}

// Los archivos de la plataforma viven en un solo espacio («negocios») con una carpeta por tienda: {negocio}/{carpeta}/archivo
const ESPACIOS = { prendas: ['negocios', 'productos'], 'musica-fondo': ['musica-negocios', ''], 'anuncios-video': ['negocios', 'anuncios'], 'anuncios-foto': ['negocios', 'anuncios'] }
const destino = (bucket, ruta) => {
  const [espacio, carpeta] = ESPACIOS[bucket] ?? [bucket, '']
  const limpia = String(ruta).replace(/^\/+/, '')
  return [espacio, limpia.startsWith(`${negocioId}/`) ? limpia : [negocioId, carpeta, limpia].filter(Boolean).join('/')]
}
const almacen = (bucket) => {
  const pasa = (espacio) => plataforma.storage.from(espacio)
  const simulado = practicaActiva()
  return {
    upload: async (ruta, ...r) => { if (simulado) { contarSimulada(); return { data: { path: ruta }, error: null } } const [e, p] = destino(bucket, ruta); return pasa(e).upload(p, ...r) },
    remove: async (rutas) => { if (simulado) { contarSimulada(); return { data: [], error: null } } const por = {}; for (const r of rutas) { const [e, p] = destino(bucket, r); (por[e] ??= []).push(p) } const sal = await Promise.all(Object.entries(por).map(([e, ps]) => pasa(e).remove(ps))); return sal.find(s => s.error) ?? { data: sal.flatMap(s => s.data ?? []), error: null } },
    getPublicUrl: (ruta) => { const [e, p] = destino(bucket, ruta); return pasa(e).getPublicUrl(p) },
  }
}

export const supabase = new Proxy(plataforma, {
  get(t, k) {
    if (k === 'from') return (tabla) => (modoPublico() ? desdePublico(tabla) : desdeNegocio(tabla))
    if (k === 'rpc') {
      return (nombre, args, opc) => {
        if (modoPublico()) return rpcPublico(nombre, args, opc)
        if (nombre === 'listar_instalaciones_app') return Promise.resolve({ data: null, error: { message: 'could not find the function listar_instalaciones_app' } })      // se enciende en la etapa de instalaciones
        nombre = ALIAS[nombre] ?? nombre
        if (!practicaActiva() || RPC_DE_LECTURA.test(nombre) || RPC_PUBLICAS.test(nombre)) return db().rpc(nombre, args, opc)
        contarSimulada()
        return falso(/^registrar_(venta|compra)/.test(nombre) ? id() : null)
      }
    }
    if (k === 'storage') return { from: almacen }
    if (k === 'channel') return canalDeNegocio
    const v = t[k]
    return typeof v === 'function' ? v.bind(t) : v
  },
})
