import { estadoCuenta, ordenarClientes, hace } from '../src/cibus/lib/estadoCuenta.js'
let f = 0; const ok = (c, m) => { console.log(c ? '✓' : '✗', m); if (!c) f++ }
const din = (n) => '$' + n
const ayer = new Date(Date.now() - 864e5).toISOString(), hoy = new Date().toISOString(), viejo = new Date(Date.now() - 20 * 864e5).toISOString()
ok(estadoCuenta({ saldo: 5000 }, undefined, din).tipo === 'debe', 'debe y sin abonos → debe')
ok(estadoCuenta({ saldo: 5000 }, { abonado_total: 1000, ultimo_abono: ayer, ultimo_abono_monto: 1000 }, din).tipo === 'abonando', 'debe y abonó → abonando')
ok(estadoCuenta({ saldo: 5000 }, { abonado_total: 1000, ultimo_abono: ayer, ultimo_abono_monto: 1000 }, din).detalle === 'Último abono $1000 · ayer', 'texto del último abono')
ok(estadoCuenta({ saldo: 5000, vencido: true }, { abonado_total: 1000, ultimo_abono: ayer, ultimo_abono_monto: 1000 }, din).tipo === 'vencido', 'vencido manda sobre abonando')
ok(estadoCuenta({ saldo: 0 }, { cargado_total: 9000, abonado_total: 9000, ultimo_abono: hoy, ultimo_abono_monto: 9000 }, din).tipo === 'pagado', 'saldo 0 con historial → pagado')
ok(estadoCuenta({ saldo: 0 }, undefined, din).tipo === 'libre', 'sin historial → libre')
ok(estadoCuenta({ saldo: -300 }, { cargado_total: 100, abonado_total: 400 }, din).tipo === 'pagado', 'saldo a favor cuenta como pagado')
ok(hace(hoy) === 'hoy' && hace(ayer) === 'ayer' && hace(viejo) === 'hace 20 días', 'textos de fecha')
const cl = [{ id: 1, nombre: 'Zoe', saldo: 10 }, { id: 2, nombre: 'Ana', saldo: 50 }, { id: 3, nombre: 'Beto', saldo: 0 }, { id: 4, nombre: 'Cami', saldo: 5 }]
const act = new Map([[1, { ultimo_movimiento: hoy }], [2, { ultimo_movimiento: viejo }], [3, { ultimo_movimiento: ayer }]])
ok(ordenarClientes(cl, act, 'recientes').map(c => c.id).join() === '1,3,2,4', 'recientes: lo último arriba, sin movimientos al final')
ok(ordenarClientes(cl, act, 'nombre').map(c => c.id).join() === '2,3,4,1', 'por nombre')
ok(ordenarClientes(cl, act, 'deuda').map(c => c.id).join() === '2,1,4,3', 'por mayor deuda')
ok(cl[0].id === 1, 'no modifica la lista original')
process.exit(f ? 1 : 0)
