import { useCallback, useEffect, useMemo, useState } from 'react'
import { usePersistido, borrarBorradores, TREINTA_MIN } from '../lib/usePersistido'
import { supabase } from '../lib/supabase'
import { dinero, fechaSolo } from '../lib/formato'
import { claseInput } from '../lib/estilos'
import { coincide } from '../lib/buscar'
import { diasDesde, yaVencio, desgloseDeuda } from '../lib/cartera'
import { textoMetodo } from '../lib/pagos'
import PrestamoRapido from './PrestamoRapido'
import ClienteDetalle from './ClienteDetalle'

const FILTROS = [
  { id: 'debe', texto: 'Pendientes' },
  { id: 'pagado', texto: 'Pagados' },
  { id: 'todos', texto: 'Todos' },
]

// Lista aparte de los préstamos rápidos: a quién, cuánto, para qué, y cuánto falta por devolver.
export default function PrestamosRapidos({ clientes, onCambio }) {
  const [filas, setFilas] = useState([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [texto, setTexto] = useState('')
  const [filtro, setFiltro] = useState('debe')
  const [nuevo, setNuevo] = usePersistido('prestamosrapidos:nuevo', false, true, TREINTA_MIN)
  const [abierto, setAbierto] = usePersistido('prestamosrapidos:abierto', null, true, TREINTA_MIN)

  const cargar = useCallback(async () => {
    setCargando(true); setError('')
    const [m, p] = await Promise.all([
      supabase.from('fiado_movimientos')
        .select('id, fecha, monto, metodo, nota, fecha_limite, cliente_id, clientes(nombre, telefono)')
        .eq('concepto', 'prestamo').order('fecha', { ascending: false }).range(0, 999),
      supabase.from('fiado_pendiente').select('cargo_id, pendiente').range(0, 4999),
    ])
    if (m.error || p.error) {
      setError('Falta correr migracion-v30.sql en Supabase para ver los préstamos rápidos.')
      setFilas([]); setCargando(false); return
    }
    const pendiente = new Map((p.data ?? []).map(x => [x.cargo_id, Number(x.pendiente)]))
    setFilas((m.data ?? []).map(x => ({ ...x, debe: pendiente.get(x.id) ?? 0 })))
    setCargando(false)
  }, [])
  useEffect(() => { cargar() }, [cargar])

  const totales = useMemo(() => ({
    prestado: filas.reduce((s, f) => s + Number(f.monto), 0),
    porCobrar: filas.reduce((s, f) => s + f.debe, 0),
  }), [filas])

  const visibles = filas.filter(f => {
    if (!coincide([f.clientes?.nombre, f.nota, f.clientes?.telefono], texto)) return false
    if (filtro === 'debe') return f.debe > 0
    if (filtro === 'pagado') return f.debe <= 0
    return true
  })

  // Si el cliente además tiene fiado de ventas, se avisa aquí con el total de las dos deudas
  const porId = useMemo(() => new Map(clientes.map(c => [c.id, c])), [clientes])
  const otraDeuda = (id) => {
    const d = desgloseDeuda(porId.get(id))
    return d.hay && d.fiado > 0 ? `También tiene fiado ${dinero(d.fiado)} · debe en total ${dinero(d.saldo)}` : ''
  }

  const abrirCliente = async (f) => {
    const { data } = await supabase.from('clientes_saldo').select('*').eq('id', f.cliente_id).single()
    if (data) setAbierto(data)
  }
  const recargar = () => { cargar(); onCambio?.() }

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl shadow-sm p-4 space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <p className="text-xs text-slate-400">Por cobrar</p>
            <p className="text-2xl font-bold text-naranja-oscuro">{dinero(totales.porCobrar)}</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-slate-400">Prestado en total</p>
            <p className="text-2xl font-bold text-marca">{dinero(totales.prestado)}</p>
          </div>
        </div>
        <button onClick={() => setNuevo(true)}
          className="w-full h-11 rounded-xl bg-negro text-champagne text-sm font-semibold active:opacity-90">
          + Préstamo rápido
        </button>
      </div>

      <input value={texto} onChange={e => setTexto(e.target.value)}
             placeholder="Buscar por cliente o nota" className={claseInput} />
      <div className="grid grid-cols-3 gap-2">
        {FILTROS.map(f => (
          <button key={f.id} onClick={() => setFiltro(f.id)}
            className={`h-10 rounded-xl text-xs font-medium ${filtro === f.id ? 'bg-marca text-white' : 'bg-white text-slate-600 shadow-sm'}`}>
            {f.texto}
          </button>
        ))}
      </div>

      {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}

      {cargando ? (
        <p className="text-center text-sm text-slate-400 py-8">Cargando…</p>
      ) : visibles.length === 0 ? (
        <p className="text-center text-sm text-slate-400 py-8">
          {filtro === 'debe' ? 'No hay préstamos pendientes' : filtro === 'pagado' ? 'Aún no hay préstamos pagados' : 'Todavía no has hecho préstamos rápidos'}
        </p>
      ) : (
        <ul className="bg-white rounded-2xl shadow-sm divide-y divide-slate-100 lg:bg-transparent lg:shadow-none lg:divide-y-0 lg:grid lg:grid-cols-2 lg:gap-3 [&>li]:lg:bg-white [&>li]:lg:rounded-2xl [&>li]:lg:shadow-sm lg:[&>li:last-child:nth-child(odd)]:col-span-2">
          {visibles.map(f => {
            const vencido = f.debe > 0 && yaVencio(f.fecha_limite)
            return (
              <li key={f.id}>
                <button onClick={() => abrirCliente(f)}
                  className="w-full min-h-16 px-4 py-2 grid grid-cols-[1fr_auto] gap-3 items-center text-left active:bg-slate-50">
                  <div className="min-w-0">
                    <p className="text-sm font-medium break-words">{f.clientes?.nombre ?? 'Cliente'}</p>
                    <p className="text-xs text-slate-500 break-words">{f.nota && f.nota !== 'Préstamo rápido' ? f.nota : 'Sin nota'}</p>
                    {f.debe > 0 && otraDeuda(f.cliente_id) && (
                      <p className="text-[11px] text-naranja-oscuro">{otraDeuda(f.cliente_id)}</p>
                    )}
                    <p className={`text-xs ${vencido ? 'text-red-500 font-medium' : 'text-slate-400'}`}>
                      {fechaSolo(f.fecha)} · hace {diasDesde(f.fecha)} {diasDesde(f.fecha) === 1 ? 'día' : 'días'} · {textoMetodo(f.metodo)}
                      {f.fecha_limite ? ` · ${vencido ? 'venció' : 'límite'} ${fechaSolo(f.fecha_limite)}` : ''}
                    </p>
                  </div>
                  <div className="grid justify-items-end gap-1">
                    <span className="text-sm font-semibold">{dinero(f.monto)}</span>
                    <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                      f.debe <= 0 ? 'bg-lima/20 text-marca' : vencido ? 'bg-red-50 text-red-600' : 'bg-champagne/40 text-naranja-oscuro'}`}>
                      {f.debe <= 0 ? 'Pagado' : f.debe < Number(f.monto) ? `Falta ${dinero(f.debe)}` : 'Debe'}
                    </span>
                  </div>
                </button>
              </li>
            )
          })}
        </ul>
      )}

      {nuevo && (
        <PrestamoRapido clientes={clientes} onCerrar={() => setNuevo(false)}
          onHecho={() => { setNuevo(false); recargar() }} />
      )}
      {abierto && (
        <ClienteDetalle cliente={abierto} onCerrar={() => setAbierto(null)} onCambio={recargar} />
      )}
    </div>
  )
}
