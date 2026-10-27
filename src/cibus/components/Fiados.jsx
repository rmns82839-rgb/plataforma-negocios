import { useCallback, useEffect, useMemo, useState } from 'react'
import { usePersistido, borrarBorradores, TREINTA_MIN } from '../lib/usePersistido'
import { supabase } from '../lib/supabase'
import { dinero } from '../lib/formato'
import { claseInput } from '../lib/estilos'
import { coincide } from '../lib/buscar'
import { diasDesde, estaVencido, desgloseDeuda, actividadCliente } from '../lib/cartera'
import ClienteForm from './ClienteForm'
import ClienteDetalle from './ClienteDetalle'
import PrestamoRapido from './PrestamoRapido'
import PrestamosRapidos from './PrestamosRapidos'
import { useDueno } from '../context/rol'
import BarraFija from './BarraFija'

const FILTROS = [
  { id: 'deben',    texto: 'Con deuda' },
  { id: 'vencidos', texto: 'Vencidos' },
  { id: 'fiado',    texto: 'Con fiado' },
  { id: 'prestamo', texto: 'Con préstamo' },
  { id: 'sindeuda', texto: 'Sin deuda' },
  { id: 'todos',    texto: 'Todos' },
]

export default function Fiados() {
  const [clientes, setClientes] = useState([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [texto, setTexto] = useState('')
  const [filtro, setFiltro] = useState('deben')
  const [nuevo, setNuevo] = usePersistido('fiados:nuevo', false, true, TREINTA_MIN)
  const [abierto, setAbierto] = usePersistido('fiados:abierto', null, true, TREINTA_MIN)
  const [prestando, setPrestando] = usePersistido('fiados:prestando', false, true, TREINTA_MIN)
  const [vista, setVista] = usePersistido('fiados:vista', 'clientes', true, TREINTA_MIN)       // 'clientes' | 'prestamos' (lista aparte de préstamos rápidos)
  const dueno = useDueno()

  const cargar = useCallback(async () => {
    setCargando(true)
    const { data, error: err } = await supabase.from('clientes_saldo').select('*').order('nombre').range(0, 4999)
    if (err) setError(err.message)
    setClientes(data ?? [])
    setCargando(false)
  }, [])
  useEffect(() => { cargar() }, [cargar])

  const totalDeuda = clientes.reduce((s, c) => s + Math.max(Number(c.saldo), 0), 0)
  const vencidos = useMemo(() => clientes.filter(estaVencido), [clientes])
  const visibles = clientes.filter(c => {
    if (!coincide([c.nombre, c.documento, c.telefono, c.email, c.direccion], texto)) return false
    if (filtro === 'deben') return Number(c.saldo) > 0
    if (filtro === 'vencidos') return estaVencido(c)
    if (filtro === 'fiado') return desgloseDeuda(c).fiado > 0
    if (filtro === 'prestamo') return desgloseDeuda(c).prestamo > 0
    if (filtro === 'sindeuda') return !(Number(c.saldo) > 0)
    return true
  })
  const cuenta = useMemo(() => ({
    vencidos: vencidos.length,
    fiado: clientes.filter(c => desgloseDeuda(c).fiado > 0).length,
    prestamo: clientes.filter(c => desgloseDeuda(c).prestamo > 0).length,
  }), [clientes, vencidos])

  const vacio = {
    deben: 'Nadie debe nada', vencidos: 'No hay clientes vencidos', todos: 'No hay clientes',
    fiado: 'Nadie debe fiado de ventas', prestamo: 'Nadie debe un préstamo rápido', sindeuda: 'Todos tienen deuda',
  }

  const pestanas = dueno === true && (
    <div className="grid grid-cols-2 gap-2">
      {[['clientes', 'Clientes'], ['prestamos', 'Préstamos rápidos']].map(([id, t]) => (
        <button key={id} onClick={() => setVista(id)}
          className={`h-11 rounded-xl text-sm font-semibold ${vista === id ? 'bg-negro text-champagne' : 'bg-white text-slate-600 shadow-sm'}`}>
          {t}
        </button>
      ))}
    </div>
  )

  if (vista === 'prestamos' && dueno === true) {
    return (
      <div className="space-y-4">
        {pestanas}
        <PrestamosRapidos clientes={clientes} onCambio={cargar} />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {pestanas}
      <BarraFija>
      <div className="bg-white rounded-2xl shadow-sm p-4 space-y-3">
        <div>
          <p className="text-xs text-slate-400">Te deben en total</p>
          <p className="text-2xl font-bold text-marca">{dinero(totalDeuda)}</p>
        </div>
        <div className={`grid gap-2 ${dueno === true ? 'grid-cols-2' : 'grid-cols-1'}`}>
          <button onClick={() => setNuevo(true)}
            className="h-11 rounded-xl bg-marca text-white text-sm font-semibold active:bg-marca-oscuro">
            + Cliente
          </button>
          {dueno === true && (
            <button onClick={() => setPrestando(true)}
              className="h-11 rounded-xl bg-negro text-champagne text-sm font-semibold active:opacity-90">
              Préstamo rápido
            </button>
          )}
        </div>
      </div>

      <input value={texto} onChange={e => setTexto(e.target.value)}
             placeholder="Buscar por nombre, documento o teléfono" className={claseInput} />

      <div className="grid grid-cols-3 gap-2">
        {FILTROS.map(f => (
          <button key={f.id} onClick={() => setFiltro(f.id)}
            className={`h-10 rounded-xl text-xs font-medium ${
              filtro === f.id
                ? (f.id === 'vencidos' ? 'bg-red-500 text-white' : 'bg-marca text-white')
                : 'bg-white text-slate-600 shadow-sm'}`}>
            {f.texto}{cuenta[f.id] != null ? ` (${cuenta[f.id]})` : ''}
          </button>
        ))}
      </div>
      </BarraFija>

      {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}

      {cargando ? (
        <p className="text-center text-sm text-slate-400 py-8">Cargando…</p>
      ) : visibles.length === 0 ? (
        <p className="text-center text-sm text-slate-400 py-8">{vacio[filtro]}</p>
      ) : (
        <ul className="bg-white rounded-2xl shadow-sm divide-y divide-slate-100 lg:bg-transparent lg:shadow-none lg:divide-y-0 lg:grid lg:grid-cols-2 lg:gap-3 [&>li]:lg:bg-white [&>li]:lg:rounded-2xl [&>li]:lg:shadow-sm lg:[&>li:last-child:nth-child(odd)]:col-span-2">
          {visibles.map(c => {
            const debe = Number(c.saldo) > 0
            const vencido = estaVencido(c)
            const d = desgloseDeuda(c)
            const actividad = actividadCliente(c, dinero)
            return (
              <li key={c.id}>
                <button onClick={() => setAbierto(c)}
                  className="w-full min-h-14 px-4 py-2 grid grid-cols-[1fr_auto] gap-3 items-center text-left active:bg-slate-50">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{c.nombre}</p>
                    <p className={`text-xs truncate ${vencido ? 'text-red-500 font-medium' : 'text-slate-400'}`}>
                      {debe && c.deuda_desde
                        ? `${vencido ? 'Vencido · ' : ''}debe hace ${diasDesde(c.deuda_desde)} días`
                        : [c.documento && `${c.tipo_documento ?? ''} ${c.documento}`.trim(), c.telefono].filter(Boolean).join(' · ') || 'Sin deuda'}
                    </p>
                    {actividad && <p className="text-[11px] text-slate-400 truncate">{actividad}</p>}
                    {debe && d.hay && (
                      <p className="text-[11px] text-slate-400 truncate">
                        {d.fiado > 0 ? `Fiado ${dinero(d.fiado)} · ` : ''}Préstamo rápido {dinero(d.prestamo)}
                      </p>
                    )}
                  </div>
                  <span className={`text-sm font-semibold ${
                    vencido ? 'text-red-500' : debe ? 'text-naranja-oscuro' : 'text-slate-400'}`}>
                    {dinero(c.saldo)}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}

      {nuevo && (
        <ClienteForm onCerrar={() => setNuevo(false)} onGuardado={(c) => { setNuevo(false); cargar(); setAbierto({ ...c, saldo: 0 }) }} />
      )}

      {prestando && (
        <PrestamoRapido clientes={clientes} onCerrar={() => setPrestando(false)}
          onHecho={async (c) => {
            setPrestando(false); cargar()
            const { data } = await supabase.from('clientes_saldo').select('*').eq('id', c.id).single()
            setAbierto(data ?? c)
          }} />
      )}

      {abierto && (
        <ClienteDetalle cliente={abierto} onCerrar={() => setAbierto(null)} onCambio={cargar} />
      )}
    </div>
  )
}
