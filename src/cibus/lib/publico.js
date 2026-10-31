// Datos del catálogo PÚBLICO de una tienda (lo que ve el cliente, sin sesión).
// Las pantallas copiadas de Cibus piden «vistas» de una sola tienda (catalogo_productos, ofertas_vigentes…); en la plataforma
// el público lee funciones por tienda (negocio_publico, catalogo_tienda, extras_tienda). Aquí se arman las vistas con esas funciones.
import { supabase as plataforma, urlImagen } from '../../lib/supabase'

let modo = false, slug = null, cache = null, vista = 'tienda'      // vista: qué catálogo se muestra ('tienda' = productos · 'ropa' = prendas)
export const fijarVista = (v) => { vista = v === 'ropa' ? 'ropa' : 'tienda' }
export const modoPublico = () => modo
export function fijarPublico(s) { modo = Boolean(s); slug = s || null; cache = null }
export const publicoActual = () => slug

const url = (v) => (v ? (urlImagen(v) || v) : v)
const urlMusica = (ruta) => (ruta ? plataforma.storage.from('musica-negocios').getPublicUrl(ruta).data.publicUrl : null)

/** Trae (una sola vez por visita) lo público de la tienda. */
export function cargarPublico() {
  if (cache) return cache
  const mio = slug
  cache = (async () => {
    const { data: n, error: en } = await plataforma.rpc('negocio_publico', { p_slug: mio })
    if (en || !n) return { n: null, error: en }
    const mods = n.modulos || []
    const verCatalogo = mods.includes('catalogo_publico') && mods.includes('productos')
    const verRopa = mods.includes('catalogo_publico') && mods.includes('ropa')
    const [c, x, r] = await Promise.all([
      verCatalogo ? plataforma.rpc('catalogo_tienda', { p_slug: mio }) : Promise.resolve({ data: { productos: [], categorias: [], ofertas: [], promociones: [], anuncios: [], mas_vendidos: [] } }),
      mods.includes('catalogo_publico') && ['opiniones', 'menu_del_dia', 'musica_fondo'].some((m) => mods.includes(m)) ? plataforma.rpc('extras_tienda', { p_slug: mio }) : Promise.resolve({ data: null }),
      verRopa ? plataforma.rpc('catalogo_ropa', { p_slug: mio }) : Promise.resolve({ data: null }),
    ])
    return { n, c: c.data, errorCatalogo: c.error, x: x.data, r: r.data }
  })()
  return cache
}
export const recargarPublico = () => { cache = null; return cargarPublico() }

const dePublico = {
  negocio_publico: (d) => (d.n ? [{ ...d.n, logo: url(d.n.logo) }] : []),
  catalogo_productos: (d) => (d.c?.productos ?? []).map((p) => ({ ...p, imagenes: (p.imagenes ?? []).map(url), quedan: p.quedan ?? undefined })),
  catalogo_stock: () => [],
  catalogo_mas_vendidos: (d) => (d.c?.mas_vendidos ?? []).map((id, i) => ({ producto_id: id, puesto: i + 1 })),
  prendas: (d) => {        // las prendas con sus tallas dentro, como las pide la pantalla de ropa
    const vars = new Map()
    for (const v of d.r?.variantes ?? []) { if (!vars.has(v.prenda_id)) vars.set(v.prenda_id, []); vars.get(v.prenda_id).push(v) }
    return (d.r?.prendas ?? []).map((p) => ({ ...p, activo: true, imagen_url: url(p.imagen_url), imagenes: (p.imagenes ?? []).map(url), prenda_variantes: vars.get(p.id) ?? [] }))
  },
  promos_ropa_vigentes: (d) => d.r?.promociones ?? [],
  promos_tienda_vigentes: (d) => d.c?.promociones ?? [],
  ofertas_vigentes: (d) => ((vista === 'ropa' ? d.r : d.c)?.ofertas ?? []).map((o) => ({ ...o, imagen: url(o.imagen) })),
  anuncios_vigentes: (d) => ((vista === 'ropa' ? d.r : d.c)?.anuncios ?? []).map((a) => ({ ...a, imagen: url(a.imagen) })),
  menu_hoy_publico: (d) => (d.x?.menu_hoy ? [{ ...d.x.menu_hoy, foto: url(d.x.menu_hoy.foto) }] : []),
  musica_fondo_publica: (d) => (d.x?.musica ? [{ url: urlMusica(d.x.musica.ruta), nombre: d.x.musica.nombre }] : []),
  comentarios_resumen: (d) => (d.x?.opiniones ? [{ promedio: d.x.opiniones.promedio, total: d.x.opiniones.total }] : []),
  comentarios_publicos: (d) => d.x?.opiniones?.lista ?? [],
}

/** Consulta de lectura sobre una lista (select, eq, in, order, range, limit, maybeSingle, single). */
function consulta(promesaFilas) {
  const q = { filtros: [], orden: null, desde: 0, hasta: Infinity }
  const resolver = async () => {
    let f
    try { f = await promesaFilas() } catch (e) { return { data: null, error: { message: String(e?.message || e) }, count: null, status: 400 } }
    if (!Array.isArray(f)) return { data: null, error: { message: 'No se pudo cargar' }, count: null, status: 400 }
    for (const fn of q.filtros) f = f.filter(fn)
    if (q.orden) f = [...f].sort((a, b) => { const x = a[q.orden.col], y = b[q.orden.col]; const r = x === y ? 0 : x == null ? 1 : y == null ? -1 : x < y ? -1 : 1; return q.orden.asc ? r : -r })
    return { data: f.slice(q.desde, q.hasta === Infinity ? undefined : q.hasta + 1), error: null, count: f.length, status: 200 }
  }
  const b = {
    select() { return b },
    eq(col, v) { q.filtros.push((r) => r[col] === v || String(r[col]) === String(v)); return b },
    in(col, vals) { q.filtros.push((r) => vals.includes(r[col])); return b },
    order(col, o = {}) { q.orden = { col, asc: o.ascending !== false }; return b },
    range(a, z) { q.desde = a; q.hasta = z; return b },
    limit(n) { q.hasta = q.desde + n - 1; return b },
    maybeSingle: async () => { const r = await resolver(); return r.error ? r : { ...r, data: r.data[0] ?? null } },
    single: async () => { const r = await resolver(); return r.error ? r : (r.data[0] ? { ...r, data: r.data[0] } : { data: null, error: { message: 'No existe' }, status: 406 }) },
    then: (ok, mal) => resolver().then(ok, mal),
  }
  return b
}

export function desdePublico(tabla) {
  const f = dePublico[tabla]
  if (!f) return consulta(async () => { throw new Error(`La tabla ${tabla} no existe en el catálogo público`) })
  return consulta(async () => f(await cargarPublico()))
}

/** Pedido recién creado: se le pide al servidor que avise al celular del equipo. Si falla, el pedido igual quedó guardado. */
function avisarAlEquipo(r, tipo, args) {
  const numero = r?.data?.numero
  if (!r?.error && numero && slug) {
    try {
      fetch('/api/avisar-pedido', { method: 'POST', keepalive: true, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ slug, tipo, numero, telefono: args?.p_datos?.telefono ?? '' }) }).catch(() => {})
    } catch { /* el aviso es un extra */ }
  }
  return r
}

const FALTA = { data: null, error: { message: 'could not find the function (todavía no está en la plataforma)', code: 'PGRST202' }, status: 404 }

/** Funciones del catálogo: las de Cibus se traducen a las de la plataforma (que reciben la tienda por su nombre en la dirección). */
export async function rpcPublico(nombre, args = {}, opc) {
  const c = { slug }
  const R = (n, a) => plataforma.rpc(n, a, opc)
  switch (nombre) {
    case 'datos_domicilio': {
      const { n } = await cargarPublico()
      return { data: n ? { modo: n.domicilio_modo === 'km' && (n.modulos || []).includes('domicilio_km') ? 'km' : 'fijo', max_km: n.domicilio_radio_max_km ?? null } : null, error: null }
    }
    case 'crear_pedido_ropa': return avisarAlEquipo(await R('crear_pedido_ropa', { p_slug: c.slug, ...args }), 'ropa', args)
    case 'crear_pedido_tienda': return avisarAlEquipo(await R('crear_pedido_tienda', { p_slug: c.slug, ...args }), 'tienda', args)
    case 'registrar_visita': return R('registrar_visita', { p_slug: c.slug, ...args })
    case 'datos_pago_digital': return R('datos_pago_digital', { p_slug: c.slug })
    case 'registrar_pago_digital': return R('registrar_pago_digital', { p_slug: c.slug, ...args })
    case 'estado_pedido': return R('estado_pedido', { p_slug: c.slug, ...args })
    case 'publicar_comentario': return R('publicar_opinion', { p_slug: c.slug, ...args })
    case 'borrar_mis_comentarios': return R('borrar_mis_opiniones', { p_slug: c.slug })
    case 'mi_perfil': return R('mi_perfil_cliente', {})
    case 'guardar_mi_perfil': return R('guardar_perfil_cliente', args)
    case 'mi_resumen': return R('mi_resumen_cliente', { p_slug: c.slug })
    case 'mis_pedidos': {         // la plataforma da los de todas las tiendas: aquí solo los de esta, y cada línea se liga a su producto por nombre
      const r = await R('mis_pedidos', {})
      if (r.error || !Array.isArray(r.data)) return r
      const { c: cat } = await cargarPublico()
      const porNombre = new Map((cat?.productos ?? []).map((x) => [String(x.nombre).trim().toLowerCase(), x.id]))
      return { ...r, data: r.data.filter((p) => p.slug === slug).map((p) => ({ ...p, items: (p.items ?? []).map((i) => ({ ...i, producto_id: i.producto_id ?? porNombre.get(String(i.nombre).trim().toLowerCase()) })) })) }
    }
    case 'borrar_mi_perfil': case 'mis_direcciones': return R(nombre, args)
    default: return FALTA        // avisos push, instalaciones…: llegan en su etapa
  }
}
