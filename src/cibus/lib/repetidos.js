// Busca productos que parecen el MISMO escrito de distinta forma ("Azúcar Incauca 500 g" y "azucar incauca 500gr").
// Reglas (para no mezclar productos distintos):
//  · La medida tiene que ser la misma: 500 g y 1000 g NUNCA se juntan; 18 ml y 18 g tampoco.
//  · Las palabras tienen que parecerse mucho (3 de cada 4 o más), sin importar mayúsculas, tildes, plurales ni un error de letra.
//  · El mismo código de barras escrito distinto (con ceros delante) también cuenta.
// Solo sugiere: nada se borra sin que el dueño lo confirme.

const UNIDADES = { g: 'g', gr: 'g', grs: 'g', gramo: 'g', gramos: 'g', kg: 'kg', kilo: 'kg', kilos: 'kg', kgs: 'kg',
  ml: 'ml', cc: 'ml', l: 'l', lt: 'l', lts: 'l', litro: 'l', litros: 'l', oz: 'oz', und: 'u', un: 'u', unid: 'u', unidad: 'u', unidades: 'u',
  pulg: 'pul', pul: 'pul', cm: 'cm', mm: 'mm', m: 'm', mts: 'm', w: 'w', v: 'v' }
// palabras que no distinguen un producto de otro
const RELLENO = new Set(['de', 'del', 'la', 'el', 'los', 'las', 'y', 'e', 'con', 'para', 'por', 'en', 'x', 'por', 'un', 'una'])

const sinTildes = (t) => t.normalize('NFD').replace(/[̀-ͯ]/g, '')

/** Separa un nombre en { palabras, medidas }. */
export function descomponer(nombre) {
  let t = sinTildes(String(nombre ?? '').toLowerCase())
  t = t.replace(/(\d)\.(\d{3})(?!\d)/g, '$1$2').replace(/(\d)\.(\d{3})(?!\d)/g, '$1$2')   // 1.000 → 1000
  t = t.replace(/(\d),(\d)/g, '$1.$2')                                                  // 1,5 → 1.5
  t = t.replace(/(\d)([a-z])/g, '$1 $2').replace(/([a-z])(\d)/g, '$1 $2')               // 500g → 500 g
  const toks = t.replace(/[^a-z0-9.\s]/g, ' ').replace(/\.(?!\d)/g, ' ').split(/\s+/).filter(Boolean)
  const palabras = [], medidas = []
  for (let i = 0; i < toks.length; i++) {
    const k = toks[i]
    if (/^\d+(\.\d+)?$/.test(k)) {
      const u = UNIDADES[toks[i + 1]]
      if (u) { medidas.push(`${Number(k)}${u}`); i++ } else medidas.push(`n${Number(k)}`)   // número suelto (talla, referencia)
    } else if (!RELLENO.has(k)) {
      palabras.push(k.length > 3 && k.endsWith('s') ? k.slice(0, -1) : k)                // plural → singular
    }
  }
  return { palabras, medidas: medidas.sort() }
}

const igualesUnaLetra = (a, b) => {
  if (a === b) return true
  if (a.length < 4 || b.length < 4 || Math.abs(a.length - b.length) > 1) return false
  let i = 0
  while (i < a.length && i < b.length && a[i] === b[i]) i++
  if (a.length === b.length) return a.slice(i + 1) === b.slice(i + 1) || (a[i] === b[i + 1] && a[i + 1] === b[i] && a.slice(i + 2) === b.slice(i + 2))
  const [l, c] = a.length > b.length ? [a, b] : [b, a]
  return l.slice(i + 1) === c.slice(i)
}

/** Qué tan parecidas son las palabras (0 a 1). */
export function parecido(pa, pb) {
  if (pa.length === 0 || pb.length === 0) return 0
  const libres = [...pb]
  let coinciden = 0
  for (const w of pa) {
    const j = libres.findIndex(x => igualesUnaLetra(w, x))
    if (j >= 0) { coinciden++; libres.splice(j, 1) }
  }
  return coinciden / Math.max(pa.length, pb.length)
}

const codigoLimpio = (c) => String(c ?? '').replace(/\D/g, '').replace(/^0+/, '')

/** @param productos [{ id, nombre, codigo, ... }]  @returns [{ ids: [...], motivo }] (grupos de 2 a 8, los más seguros primero) */
export function buscarRepetidos(productos, { umbral = 0.75 } = {}) {
  const info = productos.map(p => ({ p, ...descomponer(p.nombre), cod: codigoLimpio(p.codigo) }))
  const padre = info.map((_, i) => i)
  const raiz = (i) => { while (padre[i] !== i) { padre[i] = padre[padre[i]]; i = padre[i] } return i }
  const unir = (a, b) => { const ra = raiz(a), rb = raiz(b); if (ra !== rb) padre[rb] = ra }
  const motivos = new Map()   // raíz → motivo más fuerte
  const marca = (a, b, m) => { unir(a, b); const r = raiz(a); const peso = { 'mismo código': 3, 'mismo nombre': 2, 'nombre parecido': 1 }; if (!motivos.has(r) || peso[m] > peso[motivos.get(r)]) motivos.set(r, m) }

  // 1) mismo código de barras (escrito distinto)
  const porCodigo = new Map()
  info.forEach((x, i) => { if (x.cod.length >= 6) { const l = porCodigo.get(x.cod) ?? []; l.push(i); porCodigo.set(x.cod, l) } })
  for (const l of porCodigo.values()) for (let k = 1; k < l.length; k++) marca(l[0], l[k], 'mismo código')

  // 2) nombre igual o parecido, con la misma medida
  const porMedida = new Map()
  info.forEach((x, i) => { if (x.palabras.length === 0) return; const k = x.medidas.join('|'); const l = porMedida.get(k) ?? []; l.push(i); porMedida.set(k, l) })
  for (const l of porMedida.values()) {
    for (let a = 0; a < l.length; a++) for (let b = a + 1; b < l.length; b++) {
      const A = info[l[a]], B = info[l[b]]
      const exacto = A.palabras.join(' ') === B.palabras.join(' ') || [...A.palabras].sort().join(' ') === [...B.palabras].sort().join(' ')
      if (exacto) marca(l[a], l[b], 'mismo nombre')
      else if (parecido(A.palabras, B.palabras) >= umbral) marca(l[a], l[b], 'nombre parecido')
    }
  }

  const grupos = new Map()
  info.forEach((x, i) => { const r = raiz(i); const g = grupos.get(r) ?? []; g.push(x.p.id); grupos.set(r, g) })
  const peso = { 'mismo código': 3, 'mismo nombre': 2, 'nombre parecido': 1 }
  return [...grupos.entries()].filter(([, ids]) => ids.length >= 2 && ids.length <= 8)
    .map(([r, ids]) => ({ ids, motivo: motivos.get(r) ?? 'nombre parecido' }))
    .sort((a, b) => peso[b.motivo] - peso[a.motivo] || b.ids.length - a.ids.length)
}
