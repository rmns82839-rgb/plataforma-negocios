// Bandeja del administrador de la plataforma: aprobar, rechazar, suspender y reactivar domiciliarios.
import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useSesion } from '../lib/sesion'
import { ir } from '../lib/ruta'
import { Btn, Aviso, clsInput, PiePlataforma } from '../tienda/ui'
import MarcaMatriz from '../tienda/MarcaMatriz'
import Login from './Login'
import { Cargando } from './Piezas'
import { nombreVehiculo } from './Domiciliario'

const ESTADOS = [['pendiente', 'Pendientes'], ['aprobado', 'Aprobados'], ['suspendido', 'Suspendidos'], ['rechazado', 'Rechazados']]
const fecha = (iso) => new Date(iso).toLocaleString('es-CO', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })

function Tarjeta({ d, alResolver }) {
  const [nota, setNota] = useState('')
  const [error, setError] = useState('')
  const [ocupado, setOcupado] = useState(false)
  async function resolver(accion) {
    setOcupado(true); setError('')
    const { error: e } = await supabase.rpc('resolver_domiciliario', { p_id: d.id, p_accion: accion, p_nota: nota })
    setOcupado(false)
    if (e) return setError(e.message)
    alResolver()
  }
  const acciones = { pendiente: [['aprobar', 'Aprobar', 'principal'], ['rechazar', 'Rechazar', 'suave']], aprobado: [['suspender', 'Suspender', 'suave']], suspendido: [['reactivar', 'Reactivar', 'principal']], rechazado: [] }[d.estado]
  return (
    <article className="space-y-3 rounded-2xl border-2 border-black/5 bg-white p-4 shadow-sm">
      <header>
        <h2 className="break-words text-2xl font-bold leading-tight">{d.nombre}</h2>
        <p className="text-base text-tinta/60">Registrado el {fecha(d.creado_en)}</p>
      </header>
      <dl className="grid grid-cols-[6.5rem_1fr] gap-x-3 gap-y-1 text-lg">
        <dt className="text-tinta/60">Ciudad</dt><dd className="break-words font-semibold">{d.ciudad}</dd>
        <dt className="text-tinta/60">Vehículo</dt><dd className="break-words font-semibold">{nombreVehiculo(d.vehiculo)}{d.placa ? ` · ${d.placa}` : ''}</dd>
        <dt className="text-tinta/60">Celular</dt><dd className="break-words font-semibold">{d.telefono}</dd>
        <dt className="text-tinta/60">Correo</dt><dd className="break-all font-semibold">{d.email}</dd>
        {d.presentacion && (<><dt className="text-tinta/60">Dice</dt><dd className="break-words">{d.presentacion}</dd></>)}
        {d.nota_equipo && (<><dt className="text-tinta/60">Nota</dt><dd className="break-words">{d.nota_equipo}</dd></>)}
      </dl>
      <div className="grid grid-cols-2 gap-2">
        <a href={`https://wa.me/57${d.telefono}`} target="_blank" rel="noreferrer" className="grid min-h-[56px] place-items-center rounded-2xl border-2 border-black/15 bg-white text-lg font-semibold">WhatsApp</a>
        <a href={`tel:${d.telefono}`} className="grid min-h-[56px] place-items-center rounded-2xl border-2 border-black/15 bg-white text-lg font-semibold">Llamar</a>
      </div>
      {acciones.length > 0 && (
        <>
          <input value={nota} onChange={(e) => setNota(e.target.value)} maxLength={300} placeholder="Nota para el domiciliario (opcional)" className={clsInput} />
          {error && <Aviso tipo="error">{error}</Aviso>}
          <div className={`grid gap-2 ${acciones.length === 2 ? 'grid-cols-2' : 'grid-cols-1'}`}>
            {acciones.map(([a, t, v]) => <Btn key={a} variante={v} disabled={ocupado} onClick={() => resolver(a)}>{t}</Btn>)}
          </div>
        </>
      )}
    </article>
  )
}

const dinero = (n) => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(Number(n) || 0)

// Comisión por pedido entregado: se cobra al domiciliario. Aquí se ve lo que debe cada uno y se registran sus pagos.
function Comisiones() {
  const [d, setD] = useState(null)
  const [error, setError] = useState('')
  const [valor, setValor] = useState('')
  const [dias, setDias] = useState('')
  const [montos, setMontos] = useState({})
  const [ocupado, setOcupado] = useState(false)
  const cargar = useCallback(async () => {
    const { data, error: e } = await supabase.rpc('comisiones_domiciliarios')
    if (e) return setError(e.message)
    setD(data); setValor(String(data.valor)); setDias(String(data.dias_gratis))
  }, [])
  useEffect(() => { cargar() }, [cargar])
  async function guardarConfig() {
    setOcupado(true); setError('')
    const { error: e } = await supabase.rpc('cambiar_comision', { p_valor: Number(valor), p_dias: Number(dias) })
    setOcupado(false)
    if (e) return setError(e.message)
    cargar()
  }
  async function pagar(f) {
    const monto = Number(montos[f.id] ?? f.debe)
    setOcupado(true); setError('')
    const { error: e } = await supabase.rpc('registrar_pago_comision', { p_domiciliario_id: f.id, p_monto: monto, p_nota: null })
    setOcupado(false)
    if (e) return setError(e.message)
    setMontos((m) => ({ ...m, [f.id]: undefined }))
    cargar()
  }
  if (!d && !error) return <p className="py-10 text-center text-xl text-tinta/60">Cargando…</p>
  return (
    <div className="space-y-4">
      {error && <Aviso tipo="error">{error}</Aviso>}
      {d && (
        <>
          <section className="space-y-3 rounded-2xl border-2 border-black/5 bg-white p-4 shadow-sm">
            <h2 className="break-words text-xl font-bold leading-tight">Cuánto se cobra</h2>
            <div className="grid grid-cols-2 gap-3">
              <label className="block text-base text-tinta/60">Por pedido entregado<input value={valor} onChange={(e) => setValor(e.target.value)} inputMode="numeric" className={clsInput} /></label>
              <label className="block text-base text-tinta/60">Días gratis al empezar<input value={dias} onChange={(e) => setDias(e.target.value)} inputMode="numeric" className={clsInput} /></label>
            </div>
            <Btn disabled={ocupado} onClick={guardarConfig}>Guardar</Btn>
            <p className="break-words text-base text-tinta/60">Solo cambia las entregas nuevas. Se le cobra al domiciliario; el negocio no paga nada.</p>
          </section>
          {d.filas.length === 0 && <Aviso>Todavía no hay domiciliarios aprobados.</Aviso>}
          {d.filas.map((f) => (
            <article key={f.id} className="space-y-3 rounded-2xl border-2 border-black/5 bg-white p-4 shadow-sm">
              <header className="grid grid-cols-[1fr_auto] items-start gap-3">
                <div className="min-w-0">
                  <h2 className="break-words text-xl font-bold leading-tight">{f.nombre}</h2>
                  <p className="break-words text-base text-tinta/60">{f.ciudad} · {f.telefono}</p>
                </div>
                <span className={`rounded-full px-3 py-1 text-lg font-bold ${Number(f.debe) > 0 ? 'bg-amber-100 text-amber-800' : 'bg-principal/10 text-principal'}`}>{dinero(f.debe)}</span>
              </header>
              <p className="break-words text-base text-tinta/60">Generado {dinero(f.generada)} · Pagado {dinero(f.pagada)}{new Date(f.gratis_hasta) > new Date() ? ` · Gratis hasta el ${new Date(f.gratis_hasta).toLocaleDateString('es-CO', { day: 'numeric', month: 'short' })}` : ''}</p>
              {Number(f.debe) > 0 && (
                <div className="grid grid-cols-[1fr_auto] gap-2">
                  <input value={montos[f.id] ?? f.debe} onChange={(e) => setMontos((m) => ({ ...m, [f.id]: e.target.value }))} inputMode="numeric" aria-label="Monto que pagó" className={clsInput} />
                  <Btn disabled={ocupado} onClick={() => pagar(f)}>Registrar pago</Btn>
                </div>
              )}
            </article>
          ))}
        </>
      )}
    </div>
  )
}

export default function DomiciliariosAdmin() {
  const sesion = useSesion()
  const [admin, setAdmin] = useState(undefined)
  const [estado, setEstado] = useState('pendiente')
  const [vista, setVista] = useState('red')
  const [lista, setLista] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!sesion) return
    supabase.rpc('soy_administrador_plataforma').then(({ data }) => setAdmin(data === true))
  }, [sesion?.user?.id]) // eslint-disable-line react-hooks/exhaustive-deps
  const cargar = useCallback(async () => {
    setError('')
    const { data, error: e } = await supabase.rpc('listar_domiciliarios', { p_estado: estado })
    if (e) { setError(e.message); setLista([]); return }
    setLista(data ?? [])
  }, [estado])
  useEffect(() => { if (admin) { setLista(null); cargar() } }, [admin, cargar])

  if (sesion === undefined) return <Cargando />
  if (!sesion) return <Login titulo="Ingresar como administrador" />
  if (admin === undefined) return <Cargando />
  if (!admin) {
    return (
      <main className="mx-auto w-full max-w-xl px-4 py-10 text-lg">
        <div className="mb-8"><MarcaMatriz /></div>
        <Aviso tipo="error">Esta cuenta no es de un administrador de la plataforma.</Aviso>
        <div className="mt-4"><Btn variante="suave" onClick={() => ir('/')}>← Volver</Btn></div>
      </main>
    )
  }
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8 text-lg">
      <div className="mb-6"><MarcaMatriz tamano={56} /></div>
      <h1 className="mb-4 break-words text-3xl font-bold leading-tight">Domiciliarios de la red</h1>
      <div role="tablist" className="mb-4 grid grid-cols-2 gap-2">
        {[['red', 'Domiciliarios'], ['comisiones', 'Comisiones']].map(([k, t]) => (
          <button key={k} role="tab" aria-selected={vista === k} onClick={() => setVista(k)}
            className={`min-h-[56px] rounded-2xl border-2 px-2 text-lg font-semibold leading-tight ${vista === k ? 'border-negro bg-negro text-white' : 'border-black/15 bg-white'}`}>{t}</button>
        ))}
      </div>
      {vista === 'comisiones' ? <Comisiones /> : (
        <>
      <div role="tablist" className="mb-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {ESTADOS.map(([k, t]) => (
          <button key={k} role="tab" aria-selected={estado === k} onClick={() => setEstado(k)}
            className={`min-h-[56px] rounded-2xl border-2 px-2 text-base font-semibold leading-tight ${estado === k ? 'border-principal bg-principal text-white' : 'border-black/15 bg-white'}`}>{t}</button>
        ))}
      </div>
      {error && <Aviso tipo="error">{error}</Aviso>}
      {!lista && !error && <p className="py-10 text-center text-xl text-tinta/60">Cargando…</p>}
      {lista?.length === 0 && !error && <Aviso>No hay domiciliarios en esta lista.</Aviso>}
      <div className="space-y-4">{lista?.map((d) => <Tarjeta key={d.id} d={d} alResolver={cargar} />)}</div>
        </>
      )}
      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        <Btn variante="suave" onClick={() => ir('/solicitudes')}>Solicitudes de negocios</Btn>
        <Btn variante="suave" onClick={() => ir('/')}>← Volver</Btn>
      </div>
      <PiePlataforma />
    </main>
  )
}
