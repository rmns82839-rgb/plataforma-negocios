// Página del domiciliario (/domiciliarios): se registra con su cuenta de Google, espera la aprobación del equipo y, ya aprobado,
// activa «Estoy disponible» y edita sus datos. Pasos con «Volver». Los datos privados nunca se muestran a las tiendas sin pedido.
import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useSesion } from '../lib/sesion'
import { ir } from '../lib/ruta'
import { entrarConGoogle } from '../lib/google'
import { Btn, Aviso, Campo, clsInput, PiePlataforma } from '../tienda/ui'
import MarcaMatriz from '../tienda/MarcaMatriz'
import { Cargando } from './Piezas'
import SelectorCiudad from '../tienda/SelectorCiudad'
import DomiciliarioEntregas from './DomiciliarioEntregas'

export const VEHICULOS = [['moto', 'Moto'], ['bicicleta', 'Bicicleta'], ['carro', 'Carro'], ['a_pie', 'A pie']]
export const nombreVehiculo = (v) => VEHICULOS.find((x) => x[0] === v)?.[1] ?? v
const soloCelular = (t) => String(t || '').replace(/\D/g, '').slice(0, 10)

function Cabecera({ children }) {
  return (
    <>
      <div className="mb-6"><MarcaMatriz tamano={56} /></div>
      <h1 className="mb-2 break-words text-3xl font-bold leading-tight">{children}</h1>
    </>
  )
}

function Formulario({ inicial, alGuardar, enviar, textoBoton, volver }) {
  const [f, setF] = useState({ nombre: '', telefono: '', ciudad: '', vehiculo: 'moto', placa: '', presentacion: '', acepta: false, ...inicial })
  const [error, setError] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const poner = (k) => (e) => setF((p) => ({ ...p, [k]: k === 'telefono' ? soloCelular(e.target.value) : e.target.value }))
  const necesitaPlaca = f.vehiculo === 'moto' || f.vehiculo === 'carro'

  async function guardar(e) {
    e.preventDefault()
    if (f.nombre.trim().length < 3) return setError('Escribe tu nombre completo')
    if (f.telefono.length !== 10) return setError('El celular debe tener 10 números')
    if (f.ciudad.trim().length < 2) return setError('Escribe tu ciudad')
    if (necesitaPlaca && !f.placa.trim()) return setError('Escribe la placa del vehículo')
    if (enviar && !f.acepta) return setError('Debes aceptar el tratamiento de datos')
    setOcupado(true); setError('')
    const { error: err } = await alGuardar({ ...f, acepta: f.acepta })
    setOcupado(false)
    if (err) return setError(err.message)
  }

  return (
    <form onSubmit={guardar} className="space-y-5 rounded-2xl border-2 border-black/5 bg-white p-5">
      <Campo etiqueta="Nombre completo"><input value={f.nombre} onChange={poner('nombre')} autoComplete="name" className={clsInput} /></Campo>
      <Campo etiqueta="Celular (10 números)"><input value={f.telefono} onChange={poner('telefono')} inputMode="numeric" autoComplete="tel" className={clsInput} /></Campo>
      <Campo etiqueta="Ciudad donde haces domicilios"><SelectorCiudad value={f.ciudad} onChange={(v) => setF((p) => ({ ...p, ciudad: v }))} className={clsInput} /></Campo>
      <div role="radiogroup" aria-label="Cómo haces los domicilios" className="grid grid-cols-2 gap-2">
        {VEHICULOS.map(([v, t]) => (
          <button key={v} type="button" role="radio" aria-checked={f.vehiculo === v} onClick={() => setF((p) => ({ ...p, vehiculo: v }))}
            className={`min-h-[56px] rounded-2xl border-2 px-2 text-lg font-semibold ${f.vehiculo === v ? 'border-principal bg-principal text-white' : 'border-black/15 bg-white'}`}>{t}</button>
        ))}
      </div>
      {necesitaPlaca && <Campo etiqueta="Placa"><input value={f.placa} onChange={poner('placa')} maxLength={10} className={`${clsInput} uppercase`} /></Campo>}
      <Campo etiqueta="Cuéntanos de ti (opcional)"><textarea value={f.presentacion} onChange={poner('presentacion')} maxLength={300} rows={3} className={`${clsInput} py-3`} /></Campo>
      {enviar && (
        <label className="flex items-start gap-3 text-base leading-snug">
          <input type="checkbox" checked={f.acepta} onChange={(e) => setF((p) => ({ ...p, acepta: e.target.checked }))} className="mt-1 h-6 w-6 shrink-0 accent-principal" />
          <span>Autorizo el tratamiento de mis datos para que la plataforma me contacte y las tiendas de mi ciudad me asignen pedidos. Mi celular solo lo ve la tienda a la que le lleve un pedido.</span>
        </label>
      )}
      {error && <Aviso tipo="error">{error}</Aviso>}
      <div className="grid gap-3">
        <Btn type="submit" disabled={ocupado}>{ocupado ? 'Guardando…' : textoBoton}</Btn>
        {volver && <Btn type="button" variante="suave" onClick={volver}>← Volver</Btn>}
      </div>
    </form>
  )
}

export default function Domiciliario() {
  const sesion = useSesion()
  const [yo, setYo] = useState(undefined)       // undefined = cargando · null = sin registro
  const [editando, setEditando] = useState(false)
  const [error, setError] = useState('')
  const [errorGoogle, setErrorGoogle] = useState('')

  const cargar = useCallback(async () => {
    const { data, error: e } = await supabase.rpc('mi_domiciliario')
    if (e) { setError(e.message); setYo(null); return }
    setYo(data ?? null)
  }, [])
  useEffect(() => { if (sesion) cargar() }, [sesion?.user?.id, cargar]) // eslint-disable-line react-hooks/exhaustive-deps

  if (sesion === undefined) return <Cargando />
  if (!sesion) {
    return (
      <main className="mx-auto w-full max-w-md px-4 py-10 text-lg">
        <Cabecera>Haz domicilios con Matriz</Cabecera>
        <p className="mb-6 text-lg text-tinta/70">Regístrate, el equipo te aprueba y las tiendas de tu ciudad podrán asignarte pedidos.</p>
        {errorGoogle && <Aviso tipo="error">{errorGoogle}</Aviso>}
        <div className="grid gap-3">
          <Btn onClick={async () => setErrorGoogle(await entrarConGoogle())}>Continuar con Google</Btn>
          <Btn variante="suave" onClick={() => ir('/')}>← Volver</Btn>
        </div>
        <PiePlataforma />
      </main>
    )
  }
  if (yo === undefined) return <Cargando />

  const registrar = (f) => supabase.rpc('registrar_domiciliario', { p: f }).then((r) => { if (!r.error) cargar(); return r })
  const actualizar = (f) => supabase.rpc('actualizar_mi_domiciliario', { p: f }).then((r) => { if (!r.error) { setEditando(false); cargar() } return r })
  const disponible = async (v) => { setError(''); const { error: e } = await supabase.rpc('poner_disponible', { p_disponible: v }); if (e) setError(e.message); else cargar() }

  const sinRegistro = !yo || yo.estado === 'rechazado'
  return (
    <main className="mx-auto w-full max-w-md px-4 py-10 text-lg">
      {sinRegistro ? (
        <>
          <Cabecera>{yo ? 'Corrige y vuelve a enviar' : 'Regístrate como domiciliario'}</Cabecera>
          {yo?.nota_equipo && <div className="mb-4"><Aviso tipo="error">El equipo dejó esta nota: {yo.nota_equipo}</Aviso></div>}
          {error && <Aviso tipo="error">{error}</Aviso>}
          <Formulario inicial={yo ?? {}} alGuardar={registrar} enviar textoBoton="Enviar mi registro" volver={() => ir('/')} />
        </>
      ) : editando ? (
        <>
          <Cabecera>Mis datos</Cabecera>
          <Formulario inicial={yo} alGuardar={actualizar} textoBoton="Guardar cambios" volver={() => setEditando(false)} />
        </>
      ) : (
        <>
          <Cabecera>{yo.nombre}</Cabecera>
          <p className="mb-4 break-words text-lg text-tinta/70">{nombreVehiculo(yo.vehiculo)} · {yo.ciudad}</p>
          {error && <div className="mb-4"><Aviso tipo="error">{error}</Aviso></div>}
          {yo.estado === 'pendiente' && <Aviso>Recibimos tu registro. El equipo lo revisa y te aprobamos pronto.</Aviso>}
          {yo.estado === 'suspendido' && <Aviso tipo="error">Tu cuenta está suspendida.{yo.nota_equipo ? ` Motivo: ${yo.nota_equipo}` : ''}</Aviso>}
          {yo.estado === 'aprobado' && (
            <div className="space-y-4">
              <Aviso tipo="ok">Estás aprobado. Las tiendas de {yo.ciudad} te ven en su lista.</Aviso>
              <button onClick={() => disponible(!yo.disponible)} aria-pressed={yo.disponible}
                className={`min-h-[72px] w-full rounded-2xl border-2 px-4 text-2xl font-bold ${yo.disponible ? 'border-principal bg-principal text-white' : 'border-black/15 bg-white'}`}>
                {yo.disponible ? 'Estoy disponible' : 'No estoy disponible'}
              </button>
              <p className="text-base text-tinta/60">Toca el botón para cambiar. Las tiendas ven primero a quienes están disponibles.</p>
            </div>
          )}
          {yo.estado === 'aprobado' && <DomiciliarioEntregas disponible={yo.disponible} />}
          <div className="mt-6 grid gap-3">
            {yo.estado !== 'suspendido' && <Btn variante="suave" onClick={() => setEditando(true)}>Editar mis datos</Btn>}
            <Btn variante="suave" onClick={() => ir('/')}>← Volver</Btn>
          </div>
        </>
      )}
      <PiePlataforma />
    </main>
  )
}
