// Imagen genérica de un producto (cuando no hay foto): ícono de su categoría + nombre, dibujada en el celular.
// No es una foto real: se guarda con "generica-" en el nombre del archivo para poder reconocerla y cambiarla después.

const ICONOS = [
  [/agua|bebida|gaseosa|jugo|energiz|cerveza|licor|refresco/, '🥤', ['#E3F2FD', '#BBDEFB']],
  [/caf[eé]|mezclas/, '☕', ['#EFEBE9', '#D7CCC8']],
  [/aseo|limpi|detergente|insectic/, '🧴', ['#E0F7FA', '#B2EBF2']],
  [/personal|belleza|higiene/, '🧼', ['#F3E5F5', '#E1BEE7']],
  [/droguer|farmacia|medic/, '💊', ['#E8F5E9', '#C8E6C9']],
  [/dulce|mecato|snack|galleta|pasteles|ponqu|helado/, '🍬', ['#FCE4EC', '#F8BBD0']],
  [/pan/, '🍞', ['#FFF3E0', '#FFE0B2']],
  [/l[aá]cteo|leche|queso|huevo/, '🥛', ['#F1F8E9', '#DCEDC8']],
  [/carne|fr[ií]as|pollo|embutido/, '🥩', ['#FFEBEE', '#FFCDD2']],
  [/fruta/, '🍎', ['#FFEBEE', '#FFCDD2']],
  [/verdura|hortaliza/, '🥕', ['#F1F8E9', '#DCEDC8']],
  [/salsa|vinagre|condiment|especi|sopa/, '🧂', ['#FFF8E1', '#FFECB3']],
  [/v[ií]veres|abarrote|grano/, '🛒', ['#FFFDE7', '#FFF9C4']],
  [/mascota/, '🐾', ['#EDE7F6', '#D1C4E9']],
  [/ferreter|el[eé]ctric/, '🔧', ['#ECEFF1', '#CFD8DC']],
  [/cigarr|tabaco/, '🚬', ['#ECEFF1', '#CFD8DC']],
  [/infantil|beb[eé]/, '🍼', ['#E1F5FE', '#B3E5FC']],
]
const POR_DEFECTO = ['📦', ['#F5F5F5', '#E0E0E0']]

const sinTildes = (t) => String(t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

export const iconoDe = (categoria, nombre) => {
  const t = sinTildes(`${categoria ?? ''} ${nombre ?? ''}`)
  for (const [re, icono, colores] of ICONOS) if (re.test(t)) return [icono, colores]
  return POR_DEFECTO
}

export const esGenerica = (url) => /\/productos\/generica-/.test(String(url ?? ''))

// Parte el nombre en líneas que quepan en el ancho (el nombre se muestra completo, nunca cortado con "…")
function lineas(ctx, texto, ancho) {
  const out = []; let actual = ''
  for (const palabra of String(texto).split(/\s+/).filter(Boolean)) {
    const prueba = actual ? `${actual} ${palabra}` : palabra
    if (ctx.measureText(prueba).width <= ancho || !actual) actual = prueba
    else { out.push(actual); actual = palabra }
  }
  if (actual) out.push(actual)
  return out
}

export function dibujarGenerica(producto, tam = 900) {
  const [icono, [c1, c2]] = iconoDe(producto.categoria, producto.nombre)
  const lienzo = document.createElement('canvas')
  lienzo.width = lienzo.height = tam
  const ctx = lienzo.getContext('2d')
  const fondo = ctx.createLinearGradient(0, 0, tam, tam)
  fondo.addColorStop(0, c1); fondo.addColorStop(1, c2)
  ctx.fillStyle = fondo; ctx.fillRect(0, 0, tam, tam)
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
  ctx.font = `${Math.round(tam * 0.36)}px "Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif`
  ctx.fillText(icono, tam / 2, tam * 0.38)
  ctx.fillStyle = '#1f2937'
  let tamLetra = Math.round(tam * 0.072)
  let ls
  for (;;) {
    ctx.font = `700 ${tamLetra}px system-ui,-apple-system,"Segoe UI",Roboto,sans-serif`
    ls = lineas(ctx, producto.nombre, tam * 0.84)
    if (ls.length <= 3 || tamLetra <= 28) break
    tamLetra -= 4
  }
  const alto = tamLetra * 1.2
  const y0 = tam * 0.74
  ls.forEach((l, i) => ctx.fillText(l, tam / 2, y0 + i * alto))
  return new Promise((ok, mal) => lienzo.toBlob(b => (b ? ok(b) : mal(new Error('No se pudo dibujar la imagen'))), 'image/jpeg', 0.85))
}
