// Pruebas de /api/crear-usuario (sin red: Supabase simulado)
import assert from 'node:assert/strict'
import { crearUsuario } from '../api/_usuario.js'
let ok = 0
const t = async (n, f) => { try { await f(); ok++; console.log('✓', n) } catch (e) { console.log('✗', n, '→', e.message); process.exitCode = 1 } }
const NEG = '11111111-1111-1111-1111-111111111111'
const base = 'https://x.supabase.co'
function sim(o = {}) {
  const llamadas = []
  const f = async (url, init) => {
    const ruta = url.replace(base, ''); llamadas.push(`${init?.method || 'GET'} ${ruta}`)
    const j = (c, s = 200) => ({ ok: s < 300, status: s, json: async () => c })
    if (ruta.endsWith('/rpc/es_dueno')) return j(o.dueno ?? true)
    if (ruta.endsWith('/rpc/es_soporte')) return j(o.soporte ?? false)
    if (ruta === '/auth/v1/admin/users') return o.yaExiste ? j({ msg: 'A user with this email address has already been registered' }, 422) : j({ id: 'u1' })
    if (ruta.endsWith('/rpc/invitar_miembro')) return o.sinCupo ? j({ message: 'Tu plan llegó al límite de personas' }, 400) : j('agregado')
    if (ruta.startsWith('/auth/v1/admin/users/')) return j({})
    throw new Error('ruta inesperada ' + ruta)
  }
  return { f, llamadas }
}
const base0 = { cuerpo: { negocio_id: NEG, email: 'Ana@Tienda.com ', password: 'clave1234', rol: 'cajero' }, token: 'jwt', base, anon: 'anon', servicio: 'srv' }

await t('dueño crea cajero: cuenta + acceso, correo en minúscula', async () => {
  const s = sim(); const r = await crearUsuario(base0, s.f)
  assert.equal(r.http, 200); assert.equal(r.cuerpo.email, 'ana@tienda.com'); assert.equal(r.cuerpo.rol, 'cajero')
  assert.deepEqual(s.llamadas.map((x) => x.split('/').pop()), ['es_dueno', 'es_soporte', 'users', 'invitar_miembro'])
})
await t('sin llave de servicio → 503 con instrucciones (no toca nada)', async () => { const s = sim(); const r = await crearUsuario({ ...base0, servicio: '' }, s.f); assert.equal(r.http, 503); assert.equal(s.llamadas.length, 0) })
await t('sin sesión → 401', async () => assert.equal((await crearUsuario({ ...base0, token: '' }, sim().f)).http, 401))
await t('quien pide NO es dueño de esa tienda → 403 y no crea cuenta', async () => {
  const s = sim({ dueno: false }); const r = await crearUsuario(base0, s.f); assert.equal(r.http, 403); assert.ok(!s.llamadas.some((x) => x.includes('/auth/')))
})
await t('soporte nunca crea usuarios → 403', async () => { const s = sim({ soporte: true }); assert.equal((await crearUsuario(base0, s.f)).http, 403); assert.ok(!s.llamadas.some((x) => x.includes('/auth/'))) })
await t('si no se puede comprobar el rol (error de red) → se niega', async () => {
  const f = async () => { throw new Error('red') }; assert.equal((await crearUsuario(base0, f)).http, 403)
})
await t('datos malos → 400 antes de llamar a nadie', async () => {
  for (const c of [{ ...base0.cuerpo, negocio_id: 'x' }, { ...base0.cuerpo, email: 'no-correo' }, { ...base0.cuerpo, password: 'corta' }, { ...base0.cuerpo, password: 'x'.repeat(80) }]) {
    const s = sim(); assert.equal((await crearUsuario({ ...base0, cuerpo: c }, s.f)).http, 400); assert.equal(s.llamadas.length, 0)
  }
})
await t('correo que ya tiene cuenta → 409 con la salida «Ya tiene cuenta»', async () => { const r = await crearUsuario(base0, sim({ yaExiste: true }).f); assert.equal(r.http, 409); assert.match(r.cuerpo.error, /Ya tiene cuenta/) })
await t('si falla el acceso (plan lleno) se borra la cuenta recién creada', async () => {
  const s = sim({ sinCupo: true }); const r = await crearUsuario(base0, s.f)
  assert.equal(r.http, 400); assert.match(r.cuerpo.error, /límite/); assert.ok(s.llamadas.includes('DELETE /auth/v1/admin/users/u1'))
})
await t('rol «dueno» se respeta; cualquier otro valor queda en cajero', async () => {
  assert.equal((await crearUsuario({ ...base0, cuerpo: { ...base0.cuerpo, rol: 'dueno' } }, sim().f)).cuerpo.rol, 'dueno')
  assert.equal((await crearUsuario({ ...base0, cuerpo: { ...base0.cuerpo, rol: 'admin' } }, sim().f)).cuerpo.rol, 'cajero')
})
console.log(`\n${ok} pruebas correctas`)
