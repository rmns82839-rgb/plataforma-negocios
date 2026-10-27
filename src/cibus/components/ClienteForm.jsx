import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { aNumero } from '../lib/formato'
import { claseInput } from '../lib/estilos'
import { useDueno } from '../context/rol'
import { TIPOS_DOCUMENTO } from '../lib/documentos'
import Modal, { Campo } from './Modal'
import { useBorradorForm } from '../lib/useBorradorForm'
import AvisoBorrador from './AvisoBorrador'

const NOMBRES = {
  nombre: 'el nombre', documento: 'el número de documento', telefono: 'el teléfono',
  direccion: 'la dirección', email: 'el correo',
}

// Crea o edita un cliente. `cliente` con id = edición.
// `exigir`: campos obligatorios, por ejemplo ['documento', 'telefono', 'direccion'] para préstamos.
export default function ClienteForm({ cliente, exigir = [], onGuardado, onCerrar }) {
  const dueno = useDueno()
  const editando = Boolean(cliente?.id)
  const [f, setF, bor] = useBorradorForm(`borrador-cliente${editando ? '-' + cliente.id : ''}`, {
    nombre: cliente?.nombre ?? '',
    tipo_documento: cliente?.tipo_documento ?? 'CC',
    documento: cliente?.documento ?? '',
    telefono: cliente?.telefono ?? '',
    contacto2: cliente?.contacto2 ?? '',
    telefono2: cliente?.telefono2 ?? '',
    email: cliente?.email ?? '',
    direccion: cliente?.direccion ?? '',
    dias: cliente?.dias_credito ? String(cliente.dias_credito) : '',
    cupo: cliente?.cupo_credito ? String(Number(cliente.cupo_credito)) : '',
    tipo: cliente?.tipo_cliente ?? 'normal',
  }, exigir.length === 0)
  const [error, setError] = useState('')
  const [guardando, setGuardando] = useState(false)
  const set = (k) => (e) => setF(prev => ({ ...prev, [k]: e.target.value }))
  const pide = (k) => k === 'nombre' || exigir.includes(k)
  const marca = (k) => (pide(k) ? ' *' : '')

  const guardar = async () => {
    for (const k of ['nombre', ...exigir]) {
      if (!String(f[k] ?? '').trim()) return setError(`Falta ${NOMBRES[k] ?? k}`)
    }
    setGuardando(true); setError('')
    const doc = f.documento.trim()
    const fila = {
      nombre: f.nombre.trim(),
      tipo_documento: doc ? f.tipo_documento : null,
      documento: doc || null,
      telefono: f.telefono.trim() || null,
      email: f.email.trim() || null,
      direccion: f.direccion.trim() || null,
    }
    // Segundo contacto (v30): solo se manda si se llenó o si la columna ya existe (para poder borrarlo)
    if (f.telefono2.trim() || f.contacto2.trim() || (editando && 'telefono2' in cliente)) {
      fila.contacto2 = f.contacto2.trim() || null
      fila.telefono2 = f.telefono2.trim() || null
    }
    // El cupo y el plazo solo los define el dueño
    if (dueno !== false) {
      fila.dias_credito = Math.max(0, Math.round(aNumero(f.dias)))
      fila.cupo_credito = Math.max(0, aNumero(f.cupo))
      if (f.tipo !== 'normal' || cliente?.tipo_cliente) fila.tipo_cliente = f.tipo     // (v9)
    }
    const q = editando
      ? supabase.from('clientes').update(fila).eq('id', cliente.id).select().single()
      : supabase.from('clientes').insert(fila).select().single()
    const { data, error: err } = await q
    setGuardando(false)
    if (err) {
      return setError(err.code === '23505' ? 'Ya existe un cliente con ese documento' : err.message)
    }
    bor.limpiar()
    onGuardado?.(data)
  }

  return (
    <Modal titulo={editando ? 'Editar cliente' : 'Nuevo cliente'} onCerrar={() => { bor.limpiar(); onCerrar?.() }}>
      {bor.recuperado && <AvisoBorrador onNuevo={bor.empezarDeNuevo} />}
      <Campo etiqueta={`Nombre completo${marca('nombre')}`}>
        <input value={f.nombre} onChange={set('nombre')} className={claseInput} />
      </Campo>

      <div className="grid grid-cols-2 gap-3">
        <Campo etiqueta="Tipo de documento">
          <select value={f.tipo_documento} onChange={set('tipo_documento')} className={claseInput}>
            {TIPOS_DOCUMENTO.map(t => <option key={t.id} value={t.id}>{t.texto}</option>)}
          </select>
        </Campo>
        <Campo etiqueta={`Documento${marca('documento')}`}>
          <input value={f.documento} onChange={set('documento')} inputMode="numeric"
                 placeholder="Sin puntos" className={claseInput} />
        </Campo>
        <Campo etiqueta={`Teléfono${marca('telefono')}`}>
          <input value={f.telefono} onChange={set('telefono')} inputMode="tel" className={claseInput} />
        </Campo>
        <Campo etiqueta={`Correo${marca('email')}`}>
          <input value={f.email} onChange={set('email')} type="email" inputMode="email"
                 autoCapitalize="none" className={claseInput} />
        </Campo>
      </div>

      <Campo etiqueta={`Dirección${marca('direccion')}`}>
        <input value={f.direccion} onChange={set('direccion')} className={claseInput} />
      </Campo>

      <div className="rounded-2xl bg-slate-50 p-3 space-y-3">
        <p className="text-xs font-medium text-slate-500">Segundo contacto (opcional) · esposo/a o familiar</p>
        <div className="grid grid-cols-2 gap-3">
          <Campo etiqueta="Nombre">
            <input value={f.contacto2} onChange={set('contacto2')} maxLength={80} className={claseInput} />
          </Campo>
          <Campo etiqueta="Celular">
            <input value={f.telefono2} onChange={set('telefono2')} inputMode="tel" maxLength={30} className={claseInput} />
          </Campo>
        </div>
        <p className="text-xs text-slate-400">El recordatorio de cobro por WhatsApp sale a los dos números.</p>
      </div>

      <div className="rounded-2xl bg-slate-50 p-3 space-y-3">
        <p className="text-xs font-medium text-slate-500">
          Crédito (fiado) · lo define el dueño
        </p>
        <div className="grid grid-cols-2 gap-3">
          <Campo etiqueta="Cupo de crédito">
            <input value={f.cupo} onChange={set('cupo')} inputMode="numeric" disabled={dueno === false}
                   placeholder="0 = sin límite" className={claseInput + ' disabled:bg-slate-100 disabled:text-slate-400'} />
          </Campo>
          <Campo etiqueta="Plazo en días">
            <input value={f.dias} onChange={set('dias')} inputMode="numeric" disabled={dueno === false}
                   placeholder="0 = sin plazo" className={claseInput + ' disabled:bg-slate-100 disabled:text-slate-400'} />
          </Campo>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {[15, 30].map(n => (
            <button key={n} type="button" disabled={dueno === false} onClick={() => setF(p => ({ ...p, dias: String(n) }))}
              className={`h-10 rounded-lg text-xs font-medium disabled:opacity-40 ${f.dias === String(n) ? 'bg-negro text-champagne' : 'bg-white text-slate-600 ring-1 ring-slate-200'}`}>
              {n} días
            </button>
          ))}
          <button type="button" disabled={dueno === false} onClick={() => setF(p => ({ ...p, dias: '' }))}
            className={`h-10 rounded-lg text-xs font-medium disabled:opacity-40 ${f.dias === '' ? 'bg-negro text-champagne' : 'bg-white text-slate-600 ring-1 ring-slate-200'}`}>
            Sin plazo
          </button>
        </div>
        <Campo etiqueta="Tipo de cliente">
          <select value={f.tipo} onChange={set('tipo')} disabled={dueno === false}
                  className={claseInput + ' disabled:bg-slate-100 disabled:text-slate-400'}>
            <option value="normal">Normal</option>
            <option value="mayorista">Mayorista (precios al por mayor)</option>
          </select>
        </Campo>
        <p className="text-xs text-slate-400">
          {dueno === false
            ? 'Solo el dueño puede cambiar el cupo y el plazo.'
            : 'El cupo es lo máximo que puede deber. El plazo se usa para proponer la fecha límite de cada fiado.'}
        </p>
      </div>

      {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
      <button onClick={guardar} disabled={guardando}
        className="w-full h-12 rounded-xl bg-marca text-white font-semibold disabled:opacity-40 active:bg-marca-oscuro">
        {guardando ? 'Guardando…' : 'Guardar'}
      </button>
    </Modal>
  )
}
