// Pruebas del horario de atención (src/lib/horario.js): estado abierto/cerrado, textos y validación.   node pruebas/horario.mjs
import assert from 'node:assert/strict'
import { estadoHorario, textoEstado, resumenHorario, validarSemana, hora12, finDeHoy, textoDistancia, ahoraBogota } from '../src/lib/horario.js'

let n = 0
const prueba = (nombre, f) => { f(); n++; console.log('  ✓', nombre) }
// Fechas en hora de Colombia (UTC−5): martes 27 oct 2026 = día 2
const col = (dia, h, m = 0) => new Date(Date.UTC(2026, 9, dia, h + 5, m))
const SEM = { 1: [['07:00', '12:00'], ['14:00', '20:00']], 2: [['07:00', '12:00'], ['14:00', '20:00']], 3: [['07:00', '20:00']], 6: [['08:00', '14:00']] }

prueba('hora12', () => { assert.equal(hora12('20:00'), '8:00 p. m.'); assert.equal(hora12('00:00'), '12:00 a. m.'); assert.equal(hora12('12:30'), '12:30 p. m.'); assert.equal(hora12('x'), '') })
prueba('ahora en Colombia', () => assert.deepEqual(ahoraBogota(col(27, 9, 5)), { dow: 2, hora: '09:05' }))
prueba('abierto en la mañana', () => assert.deepEqual(estadoHorario(SEM, null, col(27, 9)), { abierto: true, cierra: '12:00' }))
prueba('cerrado en el almuerzo: abre hoy a las 2', () => assert.deepEqual(estadoHorario(SEM, null, col(27, 12, 30)), { abierto: false, abre_dia: 2, abre_hora: '14:00', abre_hoy: true }))
prueba('cerrado de noche: abre mañana', () => { const e = estadoHorario(SEM, null, col(27, 21)); assert.deepEqual(e, { abierto: false, abre_dia: 3, abre_hora: '07:00', abre_hoy: false }); assert.equal(textoEstado(e, col(27, 21)).texto, 'Cerrado · abre mañana 7:00 a. m.') })
prueba('el límite de cierre ya está cerrado', () => assert.equal(estadoHorario(SEM, null, col(27, 20)).abierto, false))
prueba('el viernes cerrado salta al sábado', () => { const e = estadoHorario(SEM, null, col(30, 10)); assert.equal(e.abre_dia, 6); assert.equal(textoEstado(e, col(30, 10)).texto, 'Cerrado · abre mañana 8:00 a. m.') })
prueba('domingo cerrado: abre el lunes', () => assert.equal(estadoHorario(SEM, null, col(25, 10)).abre_dia, 1))
prueba('sin horario cargado no dice nada', () => { assert.deepEqual(estadoHorario(null), { abierto: null }); assert.equal(textoEstado({ abierto: null }), null) })
prueba('cierre temporal', () => { const e = estadoHorario(SEM, col(28, 0).toISOString(), col(27, 9)); assert.deepEqual(e, { abierto: false, temporal: true }); assert.equal(textoEstado(e).texto, 'Cerrado por hoy') })
prueba('cierre temporal vencido ya no cuenta', () => assert.equal(estadoHorario(SEM, col(27, 8).toISOString(), col(27, 9)).abierto, true))
prueba('todo cerrado', () => assert.deepEqual(estadoHorario({}, null, col(27, 9)), { abierto: false }))
prueba('texto abierto', () => assert.equal(textoEstado({ abierto: true, cierra: '20:00' }).texto, 'Abierto ahora · cierra 8:00 p. m.'))
prueba('texto otro día', () => assert.equal(textoEstado({ abierto: false, abre_dia: 6, abre_hora: '08:00', abre_hoy: false }, col(27, 21)).texto, 'Cerrado · abre el sábado 8:00 a. m.'))
prueba('resumen agrupa días iguales', () => assert.equal(resumenHorario({ 1: [['07:00', '20:00']], 2: [['07:00', '20:00']], 3: [['07:00', '20:00']], 0: [['08:00', '14:00']] }), 'Lun a mié 7:00 a. m. – 8:00 p. m. · Dom 8:00 a. m. – 2:00 p. m.'))
prueba('resumen con almuerzo y todos los días', () => { const t = { 7: 0 }; const s = {}; for (let d = 0; d < 7; d++) s[d] = [['08:00', '12:00'], ['14:00', '18:00']]; assert.equal(resumenHorario(s), 'Todos los días 8:00 a. m. – 12:00 p. m. y 2:00 p. m. – 6:00 p. m.'); assert.equal(resumenHorario({}), 'Cerrado'); assert.equal(resumenHorario(null), '') })
prueba('validación', () => {
  assert.equal(validarSemana(SEM), null); assert.equal(validarSemana(null), null)
  assert.match(validarSemana({ 1: [['12:00', '08:00']] }), /Lunes: la hora de cierre/)
  assert.match(validarSemana({ 3: [['08:00', '13:00'], ['12:00', '18:00']] }), /Miércoles: las dos franjas/)
  assert.match(validarSemana({ 0: [['08:00', '09:00'], ['10:00', '11:00'], ['12:00', '13:00']] }), /Domingo: máximo/)
})
prueba('fin de hoy es medianoche de Colombia', () => assert.equal(finDeHoy(col(27, 22)), '2026-10-28T05:00:00.000Z'))
prueba('distancia', () => { assert.equal(textoDistancia(7.2), 'a 7,2 km'); assert.equal(textoDistancia(0.43), 'a 450 m'); assert.equal(textoDistancia(null), '') })
console.log(`\n  ${n} pruebas correctas`)
