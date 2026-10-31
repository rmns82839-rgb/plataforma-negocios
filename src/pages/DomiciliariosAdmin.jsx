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

export default function DomiciliariosAdmin() {
  const sesion = useSesion()
  const [admin, setAdmin] = useState(undefined)
  const [estado, setEstado] = useState('pendiente')
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
      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        <Btn variante="suave" onClick={() => ir('/solicitudes')}>Solicitudes de negocios</Btn>
        <Btn variante="suave" onClick={() => ir('/')}>← Volver</Btn>
      </div>
      <PiePlataforma />
    </main>
  )
}
