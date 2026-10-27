// Ayudas del tablero de indicadores (sin pantalla): variaciones, series completas y hojas de Excel.
import { textoMetodo } from './pagos'

const TZ = 'America/Bogota'
const fmtDia = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' })

/** Date/ISO → "2026-09-30" en hora de Colombia. */
export const diaBogota = (f) => fmtDia.format(new Date(f))

const sumarDias = (txt, n) => {
  const [y, m, d] = txt.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10)
}

/** Texto corto de un día "2026-09-30" → "30 sep". */
export const diaCorto = (txt) => {
  const [y, m, d] = txt.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('es-CO', { day: 'numeric', month: 'short', timeZone: 'UTC' }).replace('.', '')
}

/** "30 sep – 6 oct" (o un solo día). */
export const etiquetaRango = (r) => {
  const ini = diaBogota(r.desde)
  const fin = diaBogota(r.hasta ? new Date(new Date(r.hasta).getTime() - 1) : new Date())
  return ini === fin ? diaCorto(ini) : `${diaCorto(ini)} – ${diaCorto(fin)}`
}

/** Cambio frente al periodo anterior. null si no hay con qué comparar. */
export function variacion(actual, anterior) {
  const a = Number(actual) || 0
  const b = Number(anterior) || 0
  if (b <= 0) return a > 0 ? { nuevo: true, pct: null, sube: true } : null
  const pct = ((a - b) / b) * 100
  return { nuevo: false, pct, sube: pct >= 0 }
}
export const textoVariacion = (v) => {
  if (!v) return 'Sin periodo anterior para comparar'
  if (v.nuevo) return 'Antes no había ventas'
  const r = Math.round(Math.abs(v.pct))
  return r === 0 ? 'Igual que el periodo anterior' : `${v.sube ? '▲' : '▼'} ${r}% ${v.sube ? 'más' : 'menos'} que el periodo anterior`
}

/**
 * Una barra por día entre desde y hasta (los días sin ventas valen 0).
 * Si son más de 45 días se agrupa por semanas para que las barras se vean.
 */
export function serieDias(porDia, desde, hasta) {
  const mapa = new Map((porDia ?? []).map(d => [d.dia, d]))
  const ini = diaBogota(desde)
  const fin = diaBogota(hasta ? new Date(new Date(hasta).getTime() - 1) : new Date())
  const dias = []
  for (let d = ini, n = 0; d <= fin && n < 800; d = sumarDias(d, 1), n++) {
    const x = mapa.get(d)
    dias.push({ dia: d, ventas: x?.ventas ?? 0, vendido: Number(x?.vendido ?? 0) })
  }
  if (dias.length <= 45) return dias.map(d => ({ ...d, etiqueta: diaCorto(d.dia) }))
  const sem = []
  for (let i = 0; i < dias.length; i += 7) {
    const g = dias.slice(i, i + 7)
    sem.push({
      dia: g[0].dia,
      ventas: g.reduce((s, x) => s + x.ventas, 0),
      vendido: g.reduce((s, x) => s + x.vendido, 0),
      etiqueta: `${diaCorto(g[0].dia)} – ${diaCorto(g[g.length - 1].dia)}`,
    })
  }
  return sem
}

/** Todos los días ("2026-09-30") entre desde y hasta, hora de Colombia. */
export function diasDelRango(desde, hasta) {
  const ini = diaBogota(desde)
  const fin = diaBogota(hasta ? new Date(new Date(hasta).getTime() - 1) : new Date())
  const dias = []
  for (let d = ini, n = 0; d <= fin && n < 800; d = sumarDias(d, 1), n++) dias.push(d)
  return dias
}

/** 24 barras (0–23 h), con las horas sin ventas en 0. */
export function serieHoras(porHora) {
  const mapa = new Map((porHora ?? []).map(h => [h.hora, h]))
  return Array.from({ length: 24 }, (_, h) => ({
    hora: h, ventas: mapa.get(h)?.ventas ?? 0, vendido: Number(mapa.get(h)?.vendido ?? 0),
    etiqueta: horaTexto(h),
  }))
}
export const horaTexto = (h) => `${h % 12 === 0 ? 12 : h % 12} ${h < 12 ? 'am' : 'pm'}`

/** Hoja de Excel de dos columnas (indicador / valor). */
const hojaPares = (nombre, filas) => ({
  nombre, filas,
  columnas: [
    { titulo: 'Indicador', ancho: 34, valor: f => f[0] },
    { titulo: 'Valor', tipo: 'numero', ancho: 18, valor: f => f[1] },
  ],
})

/** Todas las hojas del resumen del periodo (para Excel). */
export function hojasResumen(d, etiquetaPeriodo) {
  const ventas = Number(d.ventas) || 0
  const vendido = Number(d.vendido) || 0
  const inv = d.inventario ?? {}
  const dias = serieDias(d.por_dia, d.desde, d.hasta_pedido ?? null)
  return [
    hojaPares('Resumen', [
      ['Periodo', etiquetaPeriodo],
      ['Vendido (sin domicilios)', vendido],
      ['Ventas (facturas)', ventas],
      ['Ticket promedio', ventas ? Math.round(vendido / ventas) : 0],
      ['Unidades vendidas', Number(d.unidades)],
      ['Descuentos dados', Number(d.descuentos)],
      ['Comisión del datáfono', Number(d.comisiones)],
      ['Ganancia de las ventas', Number(d.ganancia)],
      ['Gastos', Number(d.gastos)],
      ['Ganancia neta', Number(d.ganancia) - Number(d.gastos)],
      ['Abonos recibidos', Number(d.abonos)],
      ['Domicilios (cantidad)', Number(d.domicilios)],
      ['Cobrado por envíos', Number(d.envios)],
      ['Ventas anuladas (cantidad)', Number(d.anuladas)],
      ['Ventas anuladas (valor)', Number(d.anuladas_valor)],
      ['Vendido en el periodo anterior', Number(d.anterior?.vendido)],
      ['Ganancia en el periodo anterior', Number(d.anterior?.ganancia)],
      ['Por cobrar (fiados)', Number(d.cartera?.por_cobrar)],
      ['En mora (vencido)', Number(d.mora?.vencido)],
      ['Recargo por mora', Number(d.mora?.recargo)],
      ['Capital en inventario (a costo)', Number(inv.capital)],
      ['Inventario a precio de venta', Number(inv.valor_venta)],
      ['Productos con stock bajo', Number(inv.stock_bajo)],
      ['Productos agotados', Number(inv.agotados)],
      ['Lotes por vencer (30 días)', Number(inv.por_vencer)],
    ]),
    {
      nombre: 'Por día', filas: dias,
      columnas: [
        { titulo: 'Día', ancho: 18, valor: f => f.etiqueta },
        { titulo: 'Ventas', tipo: 'numero', valor: f => f.ventas },
        { titulo: 'Vendido', tipo: 'numero', valor: f => f.vendido },
      ],
    },
    {
      nombre: 'Por hora', filas: serieHoras(d.por_hora),
      columnas: [
        { titulo: 'Hora', ancho: 10, valor: f => f.etiqueta },
        { titulo: 'Ventas', tipo: 'numero', valor: f => f.ventas },
        { titulo: 'Vendido', tipo: 'numero', valor: f => f.vendido },
      ],
    },
    {
      nombre: 'Formas de pago', filas: d.por_pago ?? [],
      columnas: [
        { titulo: 'Forma de pago', ancho: 22, valor: f => textoMetodo(f.metodo) },
        { titulo: 'Ventas', tipo: 'numero', valor: f => f.ventas },
        { titulo: 'Monto', tipo: 'numero', valor: f => Number(f.monto) },
      ],
    },
    {
      nombre: 'Más vendidos', filas: d.top ?? [],
      columnas: [
        { titulo: 'Producto', ancho: 34, valor: f => f.nombre },
        { titulo: 'Unidades', tipo: 'numero', valor: f => Number(f.cantidad) },
        { titulo: 'Vendido', tipo: 'numero', valor: f => Number(f.venta) },
        { titulo: 'Ganancia', tipo: 'numero', valor: f => Number(f.ganancia) },
      ],
    },
    {
      nombre: 'Categorías', filas: d.categorias ?? [],
      columnas: [
        { titulo: 'Categoría', ancho: 26, valor: f => f.categoria },
        { titulo: 'Vendido', tipo: 'numero', valor: f => Number(f.venta) },
        { titulo: 'Ganancia', tipo: 'numero', valor: f => Number(f.ganancia) },
      ],
    },
    {
      nombre: 'Mejores clientes', filas: d.clientes ?? [],
      columnas: [
        { titulo: 'Cliente', ancho: 30, valor: f => f.nombre },
        { titulo: 'Compras', tipo: 'numero', valor: f => f.ventas },
        { titulo: 'Vendido', tipo: 'numero', valor: f => Number(f.vendido) },
      ],
    },
  ]
}

const DIA_MS = 24 * 60 * 60 * 1000
const finDeHoy = () => {
  const x = new Date(); x.setHours(24, 0, 0, 0); return x
}

/**
 * Con qué se compara el periodo. Si el rango incluye hoy (día en curso) se compara el mismo tramo
 * del periodo anterior (mismos días completos, hasta la misma hora), para no comparar un día a medias con uno completo.
 */
export function planComparacion(rango, ahora = new Date()) {
  const desde = new Date(rango.desde)
  const fin = rango.hasta ? new Date(rango.hasta) : finDeHoy()
  const incluyeHoy = !rango.hasta || fin > ahora
  const completo = fin - desde
  const ini = new Date(desde.getTime() - completo)
  if (!incluyeHoy) return { incluyeHoy: false, ini, fin: desde, parcial: false }
  const transcurrido = Math.max(ahora - desde, 60 * 1000)
  return { incluyeHoy: true, ini, fin: new Date(ini.getTime() + Math.min(transcurrido, completo)), parcial: true, hastaDia: desde }
}

const horaCorta = (f) => new Date(f).toLocaleTimeString('es-CO', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: TZ }).toLowerCase().replace(/[.\s\u00a0]/g, '')

/** Texto de "frente a qué": "frente al 13 – 14 oct" o, si incluye hoy, el tramo equivalente hasta la misma hora. */
export function textoComparacion(c) {
  if (!c) return ''
  const dias = etiquetaRango({ desde: c.ini, hasta: c.parcial ? new Date(new Date(c.ini).getTime() + (c.diasMs ?? DIA_MS)) : c.fin })
  return c.parcial
    ? `Incluye hoy (día en curso) · comparado con el mismo tramo del ${dias}, hasta las ${horaCorta(c.fin)}`
    : `Frente al ${dias}`
}

/** Trae el tablero. Devuelve { datos } o { error, falta } (falta = no se ejecutó migracion-v10.sql). */
export async function pedirTablero(supabase, rango) {
  const { data, error } = await supabase.rpc('tablero', { p_desde: rango.desde, p_hasta: rango.hasta })
  if (error) {
    const falta = /could not find the function|schema cache|does not exist|PGRST202/i.test(`${error.message} ${error.code}`)
    return { error: falta ? 'Falta ejecutar migracion-v10.sql en Supabase.' : error.message, falta }
  }
  const datos = { ...data, hasta_pedido: rango.hasta }
  const plan = planComparacion(rango)
  datos.comparacion = {
    ini: plan.ini.toISOString(), fin: plan.fin.toISOString(), parcial: plan.parcial,
    // días completos del periodo anterior (para escribir "13 – 14 oct" aunque la comparación llegue solo hasta cierta hora)
    diasMs: (rango.hasta ? new Date(rango.hasta) : finDeHoy()) - new Date(rango.desde),
  }
  if (plan.parcial) {
    const r = await supabase.rpc('tablero', { p_desde: plan.ini.toISOString(), p_hasta: plan.fin.toISOString() })
    if (!r.error && r.data) {
      datos.anterior = { vendido: r.data.vendido, ventas: r.data.ventas, ganancia: r.data.ganancia }
    }
  }
  return { datos }
}
