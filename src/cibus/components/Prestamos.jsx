import { useCallback, useEffect, useMemo, useState } from 'react'
import Cifra from './Cifra'
import { usePersistido, borrarBorradores, TREINTA_MIN } from '../lib/usePersistido'
import { supabase } from '../lib/supabase'
import { dinero, fechaSolo } from '../lib/formato'
import { claseInput } from '../lib/estilos'
import { coincide } from '../lib/buscar'
import { useDueno } from '../context/rol'
import PrestamoNuevo from './PrestamoNuevo'
import PrestamoDetalle from './PrestamoDetalle'
import BarraFija from './BarraFija'

const FILTROS = [
  { id: 'activos',  texto: 'Activos' },
  { id: 'vencidos', texto: 'Vencidos' },
  { id: 'pagados',  texto: 'Pagados' },
]
const vencido = (p) => p.estado === 'activo' && Number(p.cuotas_vencidas) > 0

// Préstamos de dinero con interés. Solo el dueño.
export default function Prestamos() {
  const dueno = useDueno()
  const [lista, setLista] = useState([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [texto, setTexto] = useState('')
  const [filtro, setFiltro] = useState('activos')
  const [nuevo, setNuevo] = usePersistido('prestamos:nuevo', false, true, TREINTA_MIN)
  const [abierto, setAbierto] = usePersistido('prestamos:abierto', null, true, TREINTA_MIN)

  const cargar = useCallback(async () => {
    setCargando(true)
    const { data, error: err } = await supabase
      .from('prestamos_resumen').select('*').order('creado_en', { ascending: false }).range(0, 4999)
    if (err) setError(err.message)
    setLista(data ?? [])
    setCargando(false)
  }, [])
  useEffect(() => { if (dueno) cargar() }, [cargar, dueno])

  const porCobrar = lista.filter(p => p.estado === 'activo').reduce((s, p) => s + Number(p.saldo), 0)
  const prestado = lista.filter(p => p.estado === 'activo').reduce((s, p) => s + Number(p.monto), 0)
  const nVencidos = useMemo(() => lista.filter(vencido).length, [lista])

  const visibles = lista.filter(p => {
    if (!coincide([p.cliente_nombre, p.cliente_documento, p.cliente_telefono], texto)) return false
    if (filtro === 'activos') return p.estado === 'activo'
    if (filtro === 'vencidos') return vencido(p)
    return p.estado === 'pagado'
  })

  if (dueno === null) return <p className="text-center text-sm text-slate-400 py-8">Cargando…</p>
  if (!dueno) {
    return <p className="text-center text-sm text-slate-400 py-8">Los préstamos los maneja solo el dueño.</p>
  }

  return (
    <div className="space-y-4">
      <BarraFija>
      <div className="bg-white rounded-2xl shadow-sm p-4 grid grid-cols-2 gap-3 items-center">
        <div>
          <p className="text-xs text-slate-400">Por cobrar (con interés)</p>
          <Cifra className="text-2xl font-bold text-marca">{dinero(porCobrar)}</Cifra>
          <p className="text-xs text-slate-400">Prestado vigente {dinero(prestado)}</p>
        </div>
        <button onClick={() => setNuevo(true)}
          className="h-11 rounded-xl bg-marca text-white text-sm font-semibold active:bg-marca-oscuro">
          + Préstamo
        </button>
      </div>

      <input value={texto} onChange={e => setTexto(e.target.value)}
             placeholder="Buscar por nombre, documento o teléfono" className={claseInput} />

      <div className="grid grid-cols-3 gap-2">
        {FILTROS.map(f => (
          <button key={f.id} onClick={() => setFiltro(f.id)}
            className={`h-10 rounded-xl text-xs font-medium ${
              filtro === f.id ? (f.id === 'vencidos' ? 'bg-red-500 text-white' : 'bg-marca text-white')
                              : 'bg-white text-slate-600 shadow-sm'}`}>
            {f.texto}{f.id === 'vencidos' ? ` (${nVencidos})` : ''}
          </button>
        ))}
      </div>
      </BarraFija>

      {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}

      {cargando ? (
        <p className="text-center text-sm text-slate-400 py-8">Cargando…</p>
      ) : visibles.length === 0 ? (
        <p className="text-center text-sm text-slate-400 py-8">No hay préstamos aquí</p>
      ) : (
        <ul className="bg-white rounded-2xl shadow-sm divide-y divide-slate-100 lg:bg-transparent lg:shadow-none lg:divide-y-0 lg:grid lg:grid-cols-2 lg:gap-3 [&>li]:lg:bg-white [&>li]:lg:rounded-2xl [&>li]:lg:shadow-sm lg:[&>li:last-child:nth-child(odd)]:col-span-2">
          {visibles.map(p => (
            <li key={p.id}>
              <button onClick={() => setAbierto(p)}
                className="w-full min-h-14 px-4 py-2 grid grid-cols-[1fr_auto] gap-3 items-center text-left active:bg-slate-50">
                <div className="min-w-0">
                  <p className="text-sm font-medium break-words">{p.cliente_nombre}</p>
                  <p className={`text-xs break-words ${vencido(p) ? 'text-red-500 font-medium' : 'text-slate-400'}`}>
                    {p.estado === 'activo'
                      ? (vencido(p) ? `${p.cuotas_vencidas} cuota(s) vencida(s)` : `Próximo pago ${fechaSolo(p.proxima_fecha)}`)
                      : p.estado === 'pagado' ? 'Pagado' : 'Cancelado'}
                    {` · ${Number(p.tasa_mensual).toLocaleString("es-CO")}%`}
                  </p>
                </div>
                <span className={`text-sm font-semibold ${vencido(p) ? 'text-red-500' : 'text-slate-700'}`}>
                  {dinero(p.estado === 'activo' ? p.saldo : p.total_a_pagar)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {nuevo && <PrestamoNuevo onCerrar={() => setNuevo(false)} onCreado={() => { setNuevo(false); cargar() }} />}
      {abierto && <PrestamoDetalle prestamo={abierto} onCerrar={() => setAbierto(null)} onCambio={cargar} />}
    </div>
  )
}
