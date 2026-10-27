// Conexión del panel copiado de Cibus. Es la MISMA sesión de la plataforma, pero cada consulta lleva el negocio
// (dbDe): las pantallas se escriben igual que en Cibus (supabase.from('productos').select…) y aquí se les pone el
// negocio de la tienda abierta. El aislamiento real lo hace la base de datos (RLS); esto evita olvidos.
import { supabase as plataforma } from '../../lib/supabase'
import { dbDe } from '../../lib/negocioDb'
import { practicaActiva, contarSimulada } from './practica'

let negocioId = null
export function fijarNegocio(id) { negocioId = id }
export const negocioActual = () => negocioId
const db = () => { if (!negocioId) throw new Error('El panel no sabe de qué tienda es'); return dbDe(negocioId, plataforma) }

// ---------- La tabla «negocio» de Cibus (una fila) vive en la plataforma en negocio_config + negocio_reglas ----------
const CONFIG = { nombre: 'nombre_comercial', logo: 'logo_path', nit: 'nit', direccion: 'direccion', ciudad: 'ciudad', telefono: 'telefono', email: 'email', web: 'web', titulo_factura: 'titulo_factura', nota_pie: 'nota_pie', ver_logo: 'ver_logo', actualizado_en: 'actualizado_en' }
const REGLAS = ['prefijo_factura', 'comision_datafono', 'margen_minimo', 'mora_mensual', 'descuento_mayorista', 'bloquear_credito_mora', 'domicilio_costo', 'envio_gratis_desde', 'zona_domicilio', 'formas_pago_tienda']
const unir = (c, r) => {
  const o = { id: 1 }
  if (c) for (const [antes, ahora] of Object.entries(CONFIG)) o[antes] = c[ahora]
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

const RPC_DE_LECTURA = /^(es_|listar|tablero|mfa|registrar_acceso|mi_perfil|datos_domicilio|calcular_domicilio|mis_pedidos|estado_pedido|caja_dia|previsualizar|resumen_)/
const RPC_PUBLICAS = /^(crear_pedido_|registrar_visita|guardar_mi_perfil|borrar_mi_perfil|publicar_|borrar_mis_|guardar_suscripcion_push|borrar_mi_suscripcion_push|registrar_app_instalada)/

// Funciones de Cibus que en la plataforma se llaman distinto
const ALIAS = { listar_comentarios_admin: 'listar_opiniones_admin' }

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

const desdeNegocio = (tabla) => {
  if (tabla === 'negocio') return negocioFalso()
  const q = db().from(tabla)
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
const ESPACIOS = { prendas: ['negocios', 'productos'], 'musica-fondo': ['musica-negocios', ''], 'anuncios-video': ['negocios', 'anuncios'] }
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
    if (k === 'from') return desdeNegocio
    if (k === 'rpc') {
      return (nombre, args, opc) => {
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
