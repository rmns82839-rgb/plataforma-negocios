// Pruebas de las ayudas del saldo prepago y del resumen semanal (sin navegador ni base de datos)
import assert from 'node:assert/strict'
import * as P from '../src/lib/prepago.js'
import * as R from '../src/lib/resumenSemana.js'
let ok = 0
const t = (n, f) => { try { f(); ok++; console.log('✓', n) } catch (e) { console.log('✗', n, '→', e.message); process.exitCode = 1 } }

t('signo: recarga, bono, reverso y ajuste+ suman', () => ['recarga', 'bono', 'reverso', 'ajuste_mas'].forEach((x) => assert.equal(P.signoMov({ tipo: x }), 1)))
t('signo: consumo, devolución y ajuste− restan', () => ['consumo', 'devolucion', 'ajuste_menos'].forEach((x) => assert.equal(P.signoMov({ tipo: x }), -1)))
t('todos los tipos tienen texto', () => ['recarga', 'consumo', 'reverso', 'devolucion', 'ajuste_mas', 'ajuste_menos', 'bono'].forEach((x) => assert.ok(P.TEXTO_MOV[x])))
t('formas de recarga: sin fiado ni prepago ni inactivas', () => assert.deepEqual(P.formasDeRecarga([{ id: 'efectivo', tipo: 'efectivo' }, { id: 'fiado', tipo: 'fiado' }, { id: 'prepago', tipo: 'prepago' }, { id: 'nequi', tipo: 'digital' }, { id: 'x', tipo: 'digital', activa: false }]).map((f) => f.id), ['efectivo', 'nequi']))
t('bono 10 % de 50 000', () => assert.equal(P.valorBono('10', 50000, ''), 5000))
t('bono 5 % de 30 000', () => assert.equal(P.valorBono('5', 30000, ''), 1500))
t('bono otro valor escrito con puntos', () => assert.equal(P.valorBono('otro', 50000, '$ 7.500'), 7500))
t('sin bono', () => assert.equal(P.valorBono('no', 50000, ''), 0))
t('bono sin recarga es cero', () => assert.equal(P.valorBono('10', 0, ''), 0))
t('fechaEn suma días', () => assert.equal(P.fechaEn(30, new Date(2026, 0, 15)), '2026-02-14'))
t('textoFecha', () => assert.match(P.textoFecha('2026-11-20'), /20/))
t('maxConSaldo: lo que alcance', () => { assert.equal(P.maxConSaldo(5000, 8000), 5000); assert.equal(P.maxConSaldo(20000, 8000), 8000); assert.equal(P.maxConSaldo(-5, 100), 0); assert.equal(P.maxConSaldo(null, 100), 0) })
t('idNuevo parece un uuid y no se repite', () => { const a = P.idNuevo(), b = P.idNuevo(); assert.match(a, /^[0-9a-f-]{36}$/); assert.notEqual(a, b) })

const r = { dias: 7, visitas: { actual: 120, anterior: 100 }, pedidos: { actual: 10, anterior: 5 }, ventas: { actual: 250000, anterior: 0 }, domicilios: 6, recoger: 4, clientes_nuevos: 3, cancelados: 1,
  opiniones: { nuevas: 2, pendientes: 1, promedio: 4.5 }, productos: [{ nombre: 'Arroz', cantidad: 12, veces: 5 }], mejor_dia: { dow: 6, pedidos: 4 } }
t('comparar sube', () => assert.deepEqual(R.comparar(120, 100), { texto: '+20 % frente a antes', tono: 'sube' }))
t('comparar baja', () => assert.equal(R.comparar(50, 100).tono, 'baja'))
t('comparar sin antes', () => assert.equal(R.comparar(5, 0).tono, 'nuevo'))
t('conversión 10/120', () => assert.equal(R.conversion(r), 8))
t('ticket promedio', () => assert.equal(R.ticketPromedio(r), 25000))
t('texto de WhatsApp con nombre de la tienda y mejor día', () => { const x = R.textoResumen(r, 'Tienda A'); assert.match(x, /Tienda A/); assert.match(x, /sábado/); assert.match(x, /Arroz/); assert.match(x, /Cancelados: 1/) })
t('texto vacío sin datos', () => assert.equal(R.textoResumen(null), ''))
console.log(`\n${ok} pruebas correctas`)
