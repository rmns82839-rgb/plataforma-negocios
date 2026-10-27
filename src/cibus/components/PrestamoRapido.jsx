import { useMemo, useState } from 'react'
import { usePersistido, borrarBorradores } from '../lib/usePersistido'
import { supabase } from '../lib/supabase'
import { dinero, aNumero } from '../lib/formato'
import { claseInput } from '../lib/estilos'
import { METODOS_ABONO, textoMetodo } from '../lib/pagos'
import { coincide } from '../lib/buscar'
import Modal, { Campo } from './Modal'
import { encolarAccion, registrarAccionSegura } from '../lib/sincronizar'
import { esErrorDeRed, idNuevo } from '../lib/offline'

const RAPIDOS = [1000, 2000, 3000, 5000, 10000, 20000]

// Préstamo rápido: el dueño le presta una suma pequeña a un cliente ("préstame 2.000 que necesito pagar algo").
// Se suma a lo que el cliente debe y queda guardado para qué fue.
export default function PrestamoRapido({ cliente: inicial = null, clientes = [], onCerrar, onHecho }) {
  const base = `prestamo-rapido:${inicial?.id ?? 'x'}:`      // lo escrito sobrevive a recargar la página
  const [elegido, setElegido] = usePersistido(base + 'cliente', null)   // el cliente se guarda como id
  const [creado, setCreado] = useState(null)                  // cliente recién creado aquí (aún puede no estar en la lista)
  const cliente = inicial ?? creado ?? (elegido ? clientes.find(c => c.id === elegido.id) ?? elegido : null)
  const setCliente = (c) => { setCreado(c); setElegido(c ? { id: c.id, nombre: c.nombre, saldo: c.saldo ?? 0 } : null) }
  const [busca, setBusca] = usePersistido(base + 'busca', '')
  const [valor, setValor] = usePersistido(base + 'valor', '')
  const [metodo, setMetodo] = usePersistido(base + 'metodo', 'efectivo')
  const [nota, setNota] = usePersistido(base + 'nota', '')
  const [limite, setLimite] = usePersistido(base + 'limite', '')
  const cerrar = () => { borrarBorradores(base); onCerrar?.() }
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')
  // Cliente nuevo desde aquí mismo (solo el nombre es obligatorio)
  const [creando, setCreando] = usePersistido(base + 'creando', false)
  const [nuevo, setNuevo] = usePersistido(base + 'nuevo', { nombre: '', telefono: '', direccion: '' })
  const [errorNuevo, setErrorNuevo] = useState('')
  const setN = (k) => (e) => setNuevo(p => ({ ...p, [k]: e.target.value }))

  const monto = Math.round(aNumero(valor))
  const coincidencias = useMemo(
    () => (busca.trim() ? clientes.filter(c => coincide([c.nombre, c.documento, c.telefono], busca)).slice(0, 6) : []),
    [clientes, busca])

  const abrirCrear = () => { setNuevo({ nombre: busca.trim(), telefono: '', direccion: '' }); setErrorNuevo(''); setCreando(true) }
  const crearCliente = async () => {
    if (!nuevo.nombre.trim()) return setErrorNuevo('Falta el nombre')
    setGuardando(true); setErrorNuevo('')
    const { data, error: err } = await supabase.from('clientes').insert({
      nombre: nuevo.nombre.trim(),
      telefono: nuevo.telefono.trim() || null,
      direccion: nuevo.direccion.trim() || null,
    }).select().single()
    setGuardando(false)
    if (err) return setErrorNuevo(err.message)
    setCliente({ ...data, saldo: 0 }); setCreando(false); setBusca('')
  }

  const prestar = async () => {
    if (!cliente) return setError('Elige a quién se le presta')
    if (monto <= 0) return setError('Escribe cuánto se le presta')
    setGuardando(true); setError('')
    const args = {
      p_cliente_id: cliente.id, p_monto: monto, p_metodo: metodo,
      p_nota: nota.trim() || null, p_fecha_limite: limite || null,
    }
    const clave = idNuevo(), hora = new Date().toISOString()
    const { error: err } = await registrarAccionSegura('registrar_prestamo_rapido', args, clave, hora)
    let pendiente = false
    if (err && esErrorDeRed(err)) {      // sin internet: queda guardado en este equipo y se sube solo
      await encolarAccion('registrar_prestamo_rapido', args, { clienteId: cliente.id, monto, signo: 1, etiqueta: `Préstamo rápido ${dinero(monto)} a ${cliente.nombre}` }, clave, hora)
      pendiente = true
    } else if (err) { setGuardando(false); return setError(err.message) }
    setGuardando(false)
    borrarBorradores(base)
    onHecho?.(cliente, { pendiente })
  }

  return (
    <Modal titulo="Préstamo rápido" onCerrar={cerrar}>
      <p className="text-xs text-slate-400">Se suma a lo que el cliente debe y queda anotado para qué fue.</p>

      {cliente ? (
        <div className="grid grid-cols-[1fr_auto] gap-2 items-center rounded-xl bg-slate-50 p-3">
          <div className="min-w-0">
            <p className="text-sm font-medium truncate">{cliente.nombre}</p>
            <p className="text-xs text-slate-400">{Number(cliente.saldo) > 0 ? `Ya debe ${dinero(cliente.saldo)}` : 'Sin deuda'}</p>
          </div>
          {!inicial && (
            <button onClick={() => setCliente(null)} aria-label="Cambiar cliente"
              className="h-9 w-9 rounded-full bg-slate-200 text-slate-500">✕</button>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          <input value={busca} onChange={e => setBusca(e.target.value)} autoFocus
                 placeholder="Buscar cliente por nombre" className={claseInput} />
          {coincidencias.length > 0 && (
            <div className="rounded-xl border border-slate-200 divide-y divide-slate-100">
              {coincidencias.map(c => (
                <button key={c.id} onClick={() => { setCliente(c); setBusca('') }}
                  className="w-full min-h-12 px-4 py-2 grid grid-cols-[1fr_auto] gap-3 items-center text-left active:bg-slate-50">
                  <span className="text-sm truncate">{c.nombre}</span>
                  <span className="text-xs text-slate-400">{Number(c.saldo) > 0 ? `debe ${dinero(c.saldo)}` : ''}</span>
                </button>
              ))}
            </div>
          )}
          {!creando && busca.trim() && coincidencias.length === 0 && (
            <button onClick={abrirCrear}
              className="w-full min-h-12 rounded-xl bg-champagne/30 ring-1 ring-oro/40 text-sm font-semibold text-negro active:opacity-80">
              + Crear «{busca.trim()}» como cliente nuevo
            </button>
          )}
          {!creando && !busca.trim() && (
            <button onClick={abrirCrear}
              className="w-full h-11 rounded-xl bg-slate-100 text-sm font-medium text-slate-600 active:bg-slate-200">
              + Cliente nuevo
            </button>
          )}
          {creando && (
            <div className="rounded-2xl bg-slate-50 p-3 space-y-3">
              <p className="text-xs font-medium text-slate-500">Cliente nuevo · solo el nombre es obligatorio</p>
              <Campo etiqueta="Nombre *">
                <input value={nuevo.nombre} onChange={setN('nombre')} autoFocus className={claseInput} />
              </Campo>
              <div className="grid grid-cols-2 gap-3">
                <Campo etiqueta="Celular (opcional)">
                  <input value={nuevo.telefono} onChange={setN('telefono')} inputMode="tel" className={claseInput} />
                </Campo>
                <Campo etiqueta="Dirección (opcional)">
                  <input value={nuevo.direccion} onChange={setN('direccion')} className={claseInput} />
                </Campo>
              </div>
              <p className="text-xs text-slate-400">Queda guardado en Fiados; los demás datos se completan después.</p>
              {errorNuevo && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{errorNuevo}</p>}
              <div className="grid grid-cols-2 gap-3">
                <button onClick={() => setCreando(false)}
                  className="h-11 rounded-xl bg-slate-200 text-slate-600 text-sm font-medium active:bg-slate-300">Volver</button>
                <button onClick={crearCliente} disabled={guardando}
                  className="h-11 rounded-xl bg-negro text-champagne text-sm font-semibold disabled:opacity-40 active:opacity-90">
                  {guardando ? 'Guardando…' : 'Guardar cliente'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="space-y-2">
        <p className="text-xs font-medium text-slate-500">¿Cuánto se le presta?</p>
        <div className="grid grid-cols-3 gap-2">
          {RAPIDOS.map(v => (
            <button key={v} onClick={() => setValor(String(v))}
              className={`h-11 rounded-xl text-sm font-medium ${monto === v ? 'bg-negro text-champagne' : 'bg-slate-100 text-slate-600'}`}>
              {dinero(v)}
            </button>
          ))}
        </div>
        <input value={valor} onChange={e => setValor(e.target.value.replace(/[^\d]/g, ''))}
               inputMode="numeric" placeholder="Otro valor" className={claseInput} />
      </div>

      <Campo etiqueta="¿Para qué es? (nota)">
        <input value={nota} onChange={e => setNota(e.target.value)} maxLength={120}
               placeholder="Ej. pagar la moto" className={claseInput} />
      </Campo>

      <div className="grid grid-cols-2 gap-3">
        <Campo etiqueta="Se le entrega por">
          <select value={metodo} onChange={e => setMetodo(e.target.value)} className={claseInput}>
            {METODOS_ABONO.map(m => <option key={m.id} value={m.id}>{textoMetodo(m.id)}</option>)}
          </select>
        </Campo>
        <Campo etiqueta="Lo paga antes de (opcional)">
          <input type="date" value={limite} onChange={e => setLimite(e.target.value)} className={claseInput} />
        </Campo>
      </div>

      {metodo === 'efectivo' && monto > 0 && (
        <p className="text-xs text-slate-500 bg-slate-50 rounded-lg px-3 py-2">
          Sale {dinero(monto)} de la caja: el cierre de caja lo descuenta.
        </p>
      )}
      {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}

      <div className="grid grid-cols-2 gap-3">
        <button onClick={cerrar}
          className="h-12 rounded-xl bg-slate-100 text-slate-600 font-medium active:bg-slate-200">Volver</button>
        <button onClick={prestar} disabled={guardando || !cliente || monto <= 0}
          className="h-12 rounded-xl bg-marca text-white font-semibold disabled:opacity-40 active:bg-marca-oscuro">
          {guardando ? 'Guardando…' : monto > 0 ? `Prestar ${dinero(monto)}` : 'Prestar'}
        </button>
      </div>
    </Modal>
  )
}
