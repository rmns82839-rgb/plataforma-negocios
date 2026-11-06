import assert from 'node:assert/strict'
import { traerFoto, esPrivada } from '../api/_traerFoto.js'
const N = '11111111-1111-4111-8111-111111111111'
const base = 'https://x.supabase.co', anon = 'anon'
const publico = async () => ['93.184.216.34']
const resp = (o) => ({ ok: o.status === undefined || (o.status >= 200 && o.status < 300), status: o.status ?? 200, headers: { get: (k) => (o.h ?? {})[k.toLowerCase()] ?? null }, arrayBuffer: async () => o.cuerpo ?? new Uint8Array([1, 2, 3]).buffer })
const mundo = (personal, web) => async (u, o) => (String(u).includes('/rpc/es_personal') ? { ok: true, json: async () => personal } : web(String(u), o))
const base0 = { base, anon, resolver: publico }
assert.equal((await traerFoto({ ...base0, cuerpo: { url: 'https://a.com/x.jpg', negocio_id: N }, token: '' }, mundo(true, async () => resp({})))).http, 401)
assert.equal((await traerFoto({ ...base0, cuerpo: { url: 'https://a.com/x.jpg' }, token: 't' }, mundo(true, async () => resp({})))).http, 400)                  // sin tienda
assert.equal((await traerFoto({ ...base0, cuerpo: { url: 'https://a.com/x.jpg', negocio_id: N }, token: 't' }, mundo(false, async () => resp({})))).http, 403)    // no es del equipo de esa tienda
let llamadoRpc; await traerFoto({ ...base0, cuerpo: { url: 'https://a.com/x.jpg', negocio_id: N }, token: 'tok' }, async (u, o) => { if (String(u).includes('/rpc/')) { llamadoRpc = JSON.parse(o.body); return { ok: true, json: async () => true } } return resp({ h: { 'content-type': 'image/jpeg' } }) })
assert.deepEqual(llamadoRpc, { p_negocio_id: N })                                                                                                     // la sesión se valida CONTRA esa tienda
const ok = await traerFoto({ ...base0, cuerpo: { url: 'https://a.com/x.jpg', negocio_id: N }, token: 't' }, mundo(true, async () => resp({ h: { 'content-type': 'image/jpeg; charset=x' } })))
assert.equal(ok.http, 200); assert.equal(ok.tipo, 'image/jpeg'); assert.equal(ok.datos.length, 3)
for (const url of ['http://127.0.0.1/x.jpg', 'http://192.168.1.5/x.jpg', 'http://169.254.169.254/latest', 'http://[::1]/x', 'ftp://a.com/x.jpg', 'https://u:p@a.com/x.jpg', 'no es enlace']) {
  const r = await traerFoto({ ...base0, cuerpo: { url, negocio_id: N }, token: 't' }, mundo(true, async () => resp({ h: { 'content-type': 'image/jpeg' } })))
  assert.equal(r.http, 422, url)
}
assert.equal((await traerFoto({ ...base0, resolver: async () => ['10.0.0.8'], cuerpo: { url: 'https://interno.com/x.jpg', negocio_id: N }, token: 't' }, mundo(true, async () => resp({})))).http, 422)   // un nombre que apunta a la red interna
const salto = await traerFoto({ ...base0, resolver: async (h) => (h === 'malo.com' ? ['10.0.0.1'] : ['93.184.216.34']), cuerpo: { url: 'https://a.com/x.jpg', negocio_id: N }, token: 't' },
  mundo(true, async () => resp({ status: 302, h: { location: 'https://malo.com/secreto' } })))
assert.equal(salto.http, 422)                                                                                                                         // redirección hacia la red interna
assert.match((await traerFoto({ ...base0, cuerpo: { url: 'https://a.com/p.html', negocio_id: N }, token: 't' }, mundo(true, async () => resp({ h: { 'content-type': 'text/html' } })))).cuerpo.error, /no es una foto/)
assert.match((await traerFoto({ ...base0, cuerpo: { url: 'https://a.com/g.jpg', negocio_id: N }, token: 't' }, mundo(true, async () => resp({ h: { 'content-type': 'image/jpeg', 'content-length': String(9 * 1024 * 1024) } })))).cuerpo.error, /pesa demasiado/)
assert.ok(esPrivada('10.1.2.3') && esPrivada('172.20.0.1') && esPrivada('fd00::1') && !esPrivada('8.8.8.8'))
console.log('✓ traer-foto: sesión y tienda, direcciones privadas, redirecciones, tipo y tamaño')
