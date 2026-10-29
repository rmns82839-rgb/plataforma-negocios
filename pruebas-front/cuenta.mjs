// Pruebas de las ayudas puras de la cuenta del cliente (nombres, validaciones, datos listos para guardar).  Uso: node pruebas-front/cuenta.mjs
import assert from 'node:assert/strict'
import { primerNombre, iniciales, fotoDeGoogle, direccionLista, tieneUbicacion, perfilSirvePara, payloadPerfil, validarDatosRegistro, validarEntrega, fechaCorta, resumenItems, textoEntrega } from '../src/cibus/lib/cuentaVista.js'
let ok = 0, mal = 0
const t = (n, f) => { try { f(); ok++ } catch (e) { mal++; console.log('✗', n, '→', e.message) } }

t('primer nombre', () => { assert.equal(primerNombre('  Ana María López '), 'Ana'); assert.equal(primerNombre(''), ''); assert.equal(primerNombre(null), '') })
t('iniciales: nombre y apellido', () => { assert.equal(iniciales('Ana María López'), 'AL'); assert.equal(iniciales('luis'), 'L'); assert.equal(iniciales(''), '?'); assert.equal(iniciales(undefined), '?') })
t('foto de Google solo https', () => {
  assert.equal(fotoDeGoogle({ user: { user_metadata: { avatar_url: 'https://lh3.googleusercontent.com/a/x' } } }), 'https://lh3.googleusercontent.com/a/x')
  assert.equal(fotoDeGoogle({ user: { user_metadata: { picture: 'https://x/y.png' } } }), 'https://x/y.png')
  assert.equal(fotoDeGoogle({ user: { user_metadata: { avatar_url: 'http://inseguro/x.png' } } }), null)
  assert.equal(fotoDeGoogle({ user: { user_metadata: { avatar_url: 'javascript:alert(1)' } } }), null)
  assert.equal(fotoDeGoogle(null), null)
})
t('dirección lista y ubicación', () => {
  assert.ok(direccionLista({ direccion: 'Calle 10 # 5-20' })); assert.ok(!direccionLista({ direccion: 'abc' })); assert.ok(!direccionLista(null))
  assert.ok(tieneUbicacion({ lat: 10.9, lng: -74.8 })); assert.ok(!tieneUbicacion({ lat: null, lng: null })); assert.ok(!tieneUbicacion({ lat: 10.9 })); assert.ok(!tieneUbicacion(null))
})
t('perfil que sirve para pedir', () => {
  assert.ok(!perfilSirvePara(null, { recoge: true }))
  assert.ok(perfilSirvePara({ direccion: '' }, { recoge: true }))
  assert.ok(!perfilSirvePara({ direccion: '' }, { recoge: false }))
  assert.ok(perfilSirvePara({ direccion: 'Calle 10 # 5-20' }, { recoge: false }))
})
t('payload: conserva todo y aplica los cambios', () => {
  const perfil = { nombre: 'Ana', telefono: '3001234567', email: 'a@b.co', direccion: 'Calle 1 # 2-3', lat: 10.9, lng: -74.8, referencia: 'Torre 2', entrega_preferida: 'domicilio', acepta_promos: true }
  const p = payloadPerfil(perfil, { acepta_promos: false })
  assert.equal(p.lat, 10.9); assert.equal(p.lng, -74.8); assert.equal(p.referencia, 'Torre 2'); assert.equal(p.acepta_promos, false); assert.equal(p.acepta_datos, true); assert.equal(p.email, 'a@b.co')
})
t('payload: perfil sin punto manda lat/lng null (no undefined)', () => { const p = payloadPerfil({ nombre: 'Ana', telefono: '3001234567' }); assert.equal(p.lat, null); assert.equal(p.lng, null); assert.equal(p.direccion, ''); assert.equal(p.entrega_preferida, 'domicilio') })
t('registro: valida nombre, celular y consentimiento', () => {
  assert.equal(validarDatosRegistro({ nombre: 'Ana', telefono: '300 123 4567', acepta_datos: true }), null)
  assert.match(validarDatosRegistro({ nombre: 'An', telefono: '3001234567', acepta_datos: true }), /nombre/)
  assert.match(validarDatosRegistro({ nombre: 'Ana', telefono: '123', acepta_datos: true }), /celular/)
  assert.match(validarDatosRegistro({ nombre: 'Ana', telefono: '+57 300 123 4567', acepta_datos: false }), /autorizar/)
  assert.equal(validarDatosRegistro({ nombre: 'Ana', telefono: '+573001234567', acepta_datos: true }), null)
})
t('entrega: recoger no pide nada; domicilio pide dirección y punto', () => {
  assert.equal(validarEntrega({ entrega: 'recoger' }), null)
  assert.match(validarEntrega({ entrega: 'domicilio', direccion: 'abc' }), /dirección/)
  assert.match(validarEntrega({ entrega: 'domicilio', direccion: 'Calle 10 # 5-20' }), /mapa/)
  assert.equal(validarEntrega({ entrega: 'domicilio', direccion: 'Calle 10 # 5-20', lat: 10.9, lng: -74.8 }), null)
  assert.equal(validarEntrega({ entrega: 'domicilio', direccion: 'Calle 10 # 5-20' }, { exigirPunto: false }), null)
})
t('fecha corta', () => { assert.match(fechaCorta('2026-10-27T15:00:00Z'), /27/); assert.equal(fechaCorta('basura'), ''); assert.equal(fechaCorta(null), '') })
t('resumen de productos', () => {
  assert.equal(resumenItems([{ nombre: 'Arroz', cantidad: 2 }, { nombre: 'Aceite', cantidad: 1 }]), 'Arroz ×2, Aceite')
  assert.equal(resumenItems([1, 2, 3, 4, 5].map(i => ({ nombre: 'P' + i, cantidad: 1 }))), 'P1, P2, P3 y 2 más')
  assert.equal(resumenItems([]), ''); assert.equal(resumenItems(null), '')
  assert.equal(resumenItems([{ nombre: 'Queso', cantidad: 0.5 }]), 'Queso ×0,5')
})
t('texto de la entrega', () => {
  assert.equal(textoEntrega({ entrega_preferida: 'recoger', direccion: 'Calle 1' }), 'Recoges en la tienda')
  assert.equal(textoEntrega({ entrega_preferida: 'domicilio', direccion: ' Calle 1 # 2 ' }), 'Calle 1 # 2')
  assert.equal(textoEntrega({ entrega_preferida: 'domicilio', direccion: '' }), 'Aún sin dirección')
  assert.equal(textoEntrega(null), '')
})
console.log(`${ok} ok, ${mal} mal`)
process.exit(mal ? 1 : 0)
