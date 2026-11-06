import assert from 'node:assert/strict'
import { recachear } from './recachear-fotos.mjs'
// almacenamiento falso: carpeta productos con 2 fotos viejas, 1 ya lista, y un archivo raíz; una foto con tamaño que no coincide
const store = new Map([
  ['productos/a.jpg', { buf: Buffer.from('aaaa'), cc: 'max-age=3600' }],
  ['productos/b.jpg', { buf: Buffer.from('bbbbbb'), cc: 'max-age=3600' }],
  ['productos/c.jpg', { buf: Buffer.from('cc'), cc: 'max-age=31536000' }],
  ['suelta.jpg', { buf: Buffer.from('s'), cc: 'max-age=3600' }],
  ['productos/mala.jpg', { buf: Buffer.from('xx'), cc: 'max-age=3600', tamLista: 999 }],
])
const subidas = []
const sb = { storage: { from: () => ({
  list: async (pref) => {
    const items = []; const carpetas = new Set()
    for (const [k, v] of store) {
      if (pref === '' && k.includes('/')) { const c = k.split('/')[0]; if (!carpetas.has(c)) { carpetas.add(c); items.push({ name: c, id: null }) } }
      else if (k.startsWith(pref ? pref + '/' : '') && (pref === '' ? !k.includes('/') : true)) items.push({ name: k.split('/').pop(), id: 'x', metadata: { size: v.tamLista ?? v.buf.length, cacheControl: v.cc, mimetype: 'image/jpeg' } })
    }
    return { data: items, error: null }
  },
  download: async (r) => ({ data: { type: 'image/jpeg', arrayBuffer: async () => store.get(r).buf }, error: null }),
  upload: async (r, buf, o) => { subidas.push([r, o]); store.get(r).cc = 'max-age=' + o.cacheControl; return { error: null } },
}) } }
const seco = await recachear(sb, { log: () => {} })
assert.equal(seco.pendientes, 4); assert.equal(subidas.length, 0)           // sin --aplicar no toca nada
const r = await recachear(sb, { aplicar: true, log: () => {} })
assert.equal(r.hechas, 3); assert.equal(r.fallos.length, 1); assert.match(r.fallos[0], /mala\.jpg/)
assert.ok(subidas.every(([, o]) => o.upsert === true && o.cacheControl === '31536000'))
assert.equal(store.get('productos/mala.jpg').cc, 'max-age=3600')              // la que no coincide NO se toca
const otra = await recachear(sb, { aplicar: true, log: () => {} })
assert.equal(otra.hechas, 0 + 0); assert.equal(otra.pendientes, 1)             // volver a correr solo reintenta la que falló
console.log('✓ recachear-fotos')
