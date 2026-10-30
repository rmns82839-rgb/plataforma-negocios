// Pruebas de la solicitud de negocio nuevo (src/lib/solicitud.js): validación, precios, dirección sugerida y aviso por WhatsApp.   node pruebas/solicitud.mjs
import assert from 'node:assert/strict'
import { TIPOS_NEGOCIO, validarSolicitud, precioTexto, slugSugerido, slugValido, enlaceAviso, soloCelular } from '../src/lib/solicitud.js'

let n = 0
const prueba = (nombre, f) => { f(); n++; console.log('  ✓', nombre) }
const BUENA = { tipo: 'ropa', plan: 'tienda', nombre_negocio: 'Moda Luna', ciudad: 'Bogotá', nombre_contacto: 'Luisa Pérez', email: 'luisa@correo.com', telefono: '300 123 4567', mensaje: '', acepta: true }

prueba('hay 9 tipos y coinciden con los de la base de datos', () => assert.deepEqual(TIPOS_NEGOCIO.map((t) => t.clave).sort(), ['ferreteria', 'miscelanea', 'mixto', 'papeleria', 'repuestos', 'ropa', 'tecnologia', 'tienda', 'veterinaria']))
prueba('solicitud completa: sin errores', () => assert.deepEqual(validarSolicitud(BUENA, 'revisar'), {}))
prueba('paso tipo: exige elegir', () => assert.ok(validarSolicitud({ ...BUENA, tipo: '' }, 'tipo').tipo))
prueba('paso tipo: tipo inventado no sirve', () => assert.ok(validarSolicitud({ ...BUENA, tipo: 'bar' }, 'tipo').tipo))
prueba('paso plan: exige elegir', () => assert.ok(validarSolicitud({ ...BUENA, plan: '' }, 'plan').plan))
prueba('paso datos: no pide aceptar todavía', () => assert.deepEqual(validarSolicitud({ ...BUENA, acepta: false }, 'datos'), {}))
prueba('revisar: exige aceptar', () => assert.ok(validarSolicitud({ ...BUENA, acepta: false }, 'revisar').acepta))
prueba('nombres muy cortos', () => { const e = validarSolicitud({ ...BUENA, nombre_negocio: 'A', nombre_contacto: 'Li', ciudad: 'B' }, 'datos'); assert.ok(e.nombre_negocio && e.nombre_contacto && e.ciudad) })
prueba('espacios no cuentan como letras', () => assert.ok(validarSolicitud({ ...BUENA, nombre_negocio: '    ' }, 'datos').nombre_negocio))
prueba('correo mal escrito', () => { for (const m of ['luisa', 'luisa@', 'luisa@correo', '@correo.com', 'lu isa@correo.com']) assert.ok(validarSolicitud({ ...BUENA, email: m }, 'datos').email, m) })
prueba('celular: 10 dígitos, con espacios, guiones o +57', () => { for (const t of ['3001234567', '300 123 4567', '300-123-4567', '+57 300 123 4567', '573001234567']) assert.deepEqual(validarSolicitud({ ...BUENA, telefono: t }, 'datos'), {}, t) })
prueba('celular incompleto o con letras', () => { for (const t of ['300123456', '', 'abc', '30012345678901']) assert.ok(validarSolicitud({ ...BUENA, telefono: t }, 'datos').telefono, t) })
prueba('soloCelular quita el 57', () => { assert.equal(soloCelular('+57 300 123 4567'), '3001234567'); assert.equal(soloCelular(null), '') })
prueba('mensaje de más de 300 letras', () => assert.ok(validarSolicitud({ ...BUENA, mensaje: 'x'.repeat(301) }, 'datos').mensaje))
prueba('precio gratis', () => assert.deepEqual(precioTexto({ precio_mensual: 0 }), { principal: 'Gratis', detalle: '' }))
prueba('precio con lanzamiento', () => { const p = precioTexto({ precio_mensual: 29900, precio_fundador: 19900, meses_fundador: 6 }); assert.match(p.principal, /19\.900\/mes/); assert.match(p.detalle, /primeros 6 meses.*29\.900/) })
prueba('precio de fundador que se mantiene (0 meses)', () => { const p = precioTexto({ precio_mensual: 59900, precio_fundador: 39900, meses_fundador: 0 }); assert.match(p.principal, /39\.900\/mes/); assert.match(p.detalle, /se mantiene mientras sigas/); assert.match(p.detalle, /59\.900/) })
prueba('precio sin lanzamiento', () => assert.deepEqual(precioTexto({ precio_mensual: 59900, precio_fundador: null }), { principal: '$59.900/mes', detalle: '' }))
prueba('precio de lanzamiento igual al normal no se anuncia', () => assert.deepEqual(precioTexto({ precio_mensual: 59900, precio_fundador: 59900, meses_fundador: 6 }), { principal: '$59.900/mes', detalle: '' }))
prueba('dirección sugerida: tildes, símbolos y espacios', () => { assert.equal(slugSugerido('Moda Luna & Cía'), 'moda-luna-cia'); assert.equal(slugSugerido('  ¡Ñandú Fresco!  '), 'nandu-fresco'); assert.equal(slugSugerido('Ab'), '') })
prueba('dirección sugerida de nombre larguísimo cabe y no termina en guion', () => { const s = slugSugerido('Distribuidora de Abarrotes y Víveres Don Eduardo de la Costa Caribe S.A.S'); assert.ok(s.length <= 38 && !s.endsWith('-') && slugValido(s), s) })
prueba('slugValido', () => { assert.ok(slugValido('moda-luna')); for (const s of ['Moda', 'a', '-ab', 'ab-', 'con espacio', 'ñandu', '']) assert.ok(!slugValido(s), s) })
prueba('aviso de aprobada: lleva el nombre, el correo y la dirección', () => {
  const u = decodeURIComponent(enlaceAviso({ telefono: '300 123 4567', nombre_contacto: 'Luisa Pérez', nombre_negocio: 'Moda Luna', email: 'luisa@correo.com' }, { aprobada: true, slug: 'moda-luna', base: 'https://matriz.app' }))
  assert.ok(u.startsWith('https://wa.me/573001234567?text=')); assert.match(u, /Hola Luisa/); assert.match(u, /luisa@correo\.com/); assert.match(u, /matriz\.app\/t\/moda-luna/)
})
prueba('aviso de rechazada: lleva el motivo', () => assert.match(decodeURIComponent(enlaceAviso({ telefono: '3001234567', nombre_contacto: 'Luisa', nombre_negocio: 'X', email: 'a@b.co' }, { aprobada: false, nota: 'Datos incompletos' })), /Motivo: Datos incompletos/))
console.log(`\n  ${n} pruebas correctas`)
