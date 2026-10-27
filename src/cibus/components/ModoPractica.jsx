// Pantalla para encender o apagar el modo práctica (dueño y soporte).
import { usePractica, activarPractica, desactivarPractica } from '../lib/practica'

export default function ModoPractica() {
  const { activa, acciones } = usePractica()
  return (
    <div className="space-y-4 lg:max-w-2xl lg:mx-auto">
      <div className="bg-white rounded-2xl shadow-sm p-4 space-y-3">
        <h2 className="text-base font-semibold">Modo práctica</h2>
        <p className="text-sm text-slate-600">Sirve para enseñar cómo se usa la app <b>sin guardar nada</b>: ventas, fiados, abonos, productos, formas de pago, gastos…</p>
        <ul className="text-sm text-slate-600 space-y-1 list-disc pl-5">
          <li>Todo responde como si funcionara, pero la base de datos <b>no recibe nada</b>.</li>
          <li>Lo que ves (productos, clientes, saldos) es real; lo que "guardes" no aparecerá después.</li>
          <li>Solo afecta a este dispositivo y se apaga solo a las 3 horas.</li>
          <li>Los pedidos de los clientes desde la tienda en línea nunca se simulan.</li>
        </ul>
      </div>
      {activa ? (
        <div className="bg-amber-50 ring-1 ring-amber-300 rounded-2xl p-4 space-y-3">
          <p className="text-sm font-semibold text-amber-900">Modo práctica encendido · {acciones} {acciones === 1 ? 'acción simulada' : 'acciones simuladas'}</p>
          <button onClick={desactivarPractica} className="w-full h-12 rounded-xl bg-negro text-champagne font-semibold active:opacity-90">Apagar modo práctica</button>
        </div>
      ) : (
        <button onClick={activarPractica} className="w-full h-12 rounded-xl bg-marca text-white font-semibold active:opacity-90">Encender modo práctica</button>
      )}
    </div>
  )
}
