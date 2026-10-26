// Crear o corregir los datos de un cliente. Sirve en Clientes, en Fiados y dentro del cobro (para completar lo que falta para fiar).
import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { mensajeError } from '../lib/errores'
import { TIPOS_DOC, POLITICA_VERSION, filaCliente, datosFaltantes } from '../lib/clientes'
import { Btn, Volver, Aviso, Campo, clsInput } from '../tienda/ui'
import { Titulo, Seccion, Opciones, Interruptor } from './piezas'
import { fechaHora } from './piezas'

export default function ClienteForm({ ctx, cliente = null, onGuardado, onVolver, textoVolver = 'Volver', sinVolver = false, resaltarFaltantes = false }) {
  const nid = ctx.neg.negocio_id
  const editando = !!cliente?.id
  const [f, setF] = useState({
    nombre: cliente?.nombre || '', tipo_documento: cliente?.tipo_documento || (cliente?.documento ? 'CC' : ''), documento: cliente?.documento || '',
    telefono: cliente?.telefono || '', direccion: cliente?.direccion || '', email: cliente?.email || '',
    contacto2_nombre: cliente?.contacto2_nombre || '', contacto2_telefono: cliente?.contacto2_telefono || '',
    tipo_cliente: cliente?.tipo_cliente || 'normal', cupo_credito: cliente?.cupo_credito ? String(Number(cliente.cupo_credito)) : '', dias_credito: cliente?.dias_credito ? String(cliente.dias_credito) : '',
  })
  const [acepta, setAcepta] = useState(!!cliente?.acepta_datos_en)
  const [error, setError] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })
  const faltan = resaltarFaltantes ? datosFaltantes(f) : []
  const marca = (k) => faltan.includes(k) ? ' ring-2 ring-amber-400' : ''

  async function guardar() {
    setError('')
    const r = filaCliente(f, { esDueno: ctx.esDueno, acepta })
    if (r.error) return setError(r.error)
    const fila = { ...r.fila }
    if (acepta && !cliente?.acepta_datos_en) { fila.acepta_datos_en = new Date().toISOString(); fila.politica_version = POLITICA_VERSION; if (!editando) fila.origen = 'mostrador' }
    setOcupado(true)
    const q = editando
      ? supabase.from('clientes').update(fila).eq('negocio_id', nid).eq('id', cliente.id).select('*').single()
      : supabase.from('clientes').insert({ negocio_id: nid, ...fila }).select('*').single()
    const { data, error: e } = await q
    setOcupado(false)
    if (e) return setError(mensajeError(e))
    onGuardado(data)
  }

  return (
    <div className="pb-6">
      {!sinVolver && <Volver onClick={onVolver} texto={textoVolver} />}
      {!sinVolver && <Titulo>{editando ? 'Datos del cliente' : 'Nuevo cliente'}</Titulo>}
      {ctx.soloLectura && <p className="mb-4 rounded-2xl border-2 border-amber-300 bg-amber-50 px-4 py-3 text-lg">Estás en solo lectura: puedes mirar, pero no guardar.</p>}
      {faltan.length > 0 && !sinVolver && <div className="mb-4"><Aviso tipo="previa">Para poder fiarle falta: <b>{faltan.join(', ')}</b>.</Aviso></div>}
      {error && <div className="mb-4"><Aviso tipo="error">{error}</Aviso></div>}
      <div className="space-y-5">
        <Campo etiqueta="Nombre completo"><input className={clsInput} maxLength={80} value={f.nombre} onChange={set('nombre')} /></Campo>

        <div>
          <p className="mb-2 text-lg font-semibold">Tipo de documento</p>
          <Opciones valor={f.tipo_documento} opciones={TIPOS_DOC.map(([k, t]) => [k, t])} onChange={(v) => setF({ ...f, tipo_documento: f.tipo_documento === v ? '' : v })} />
        </div>
        <Campo etiqueta="Número de documento" ayuda="Sin puntos ni espacios. No se puede repetir en tu tienda.">
          <input className={clsInput + marca('documento')} inputMode={f.tipo_documento === 'PP' || f.tipo_documento === 'OTRO' ? 'text' : 'numeric'} maxLength={20} value={f.documento} onChange={set('documento')} />
        </Campo>
        <Campo etiqueta="Celular" ayuda="10 números. Sirve para recordarle su cuenta por WhatsApp."><input className={clsInput + marca('teléfono')} inputMode="tel" value={f.telefono} onChange={set('telefono')} /></Campo>
        <Campo etiqueta="Dirección" ayuda="Calle, número y barrio."><input className={clsInput + marca('dirección')} maxLength={160} value={f.direccion} onChange={set('direccion')} /></Campo>
        <Campo etiqueta="Correo (opcional)"><input className={clsInput} type="email" inputMode="email" value={f.email} onChange={set('email')} /></Campo>

        <Seccion titulo="Segundo contacto (opcional)">
          <p className="mb-3 text-base text-tinta/70">Un familiar o conocido. Si el cliente se atrasa, el recordatorio también le llega a esta persona.</p>
          <div className="space-y-4">
            <Campo etiqueta="Nombre"><input className={clsInput} maxLength={60} value={f.contacto2_nombre} onChange={set('contacto2_nombre')} /></Campo>
            <Campo etiqueta="Celular"><input className={clsInput} inputMode="tel" value={f.contacto2_telefono} onChange={set('contacto2_telefono')} /></Campo>
          </div>
        </Seccion>

        {ctx.esDueno && (
          <Seccion titulo="Crédito y precios">
            <div className="space-y-4">
              <Campo etiqueta="Hasta cuánto le fías" ayuda="0 = sin tope."><input className={clsInput} inputMode="numeric" placeholder="$ 0" value={f.cupo_credito} onChange={set('cupo_credito')} /></Campo>
              <Campo etiqueta="Días para pagar" ayuda="0 = sin plazo."><input className={clsInput} inputMode="numeric" placeholder="0" value={f.dias_credito} onChange={set('dias_credito')} /></Campo>
              <Opciones valor={f.tipo_cliente} opciones={[['normal', 'Cliente normal'], ['mayorista', 'Cliente mayorista']]} onChange={(v) => setF({ ...f, tipo_cliente: v })} />
            </div>
          </Seccion>
        )}

        <Interruptor valor={acepta} onChange={setAcepta} deshabilitado={!!cliente?.acepta_datos_en}
          texto="El cliente autorizó el uso de sus datos"
          ayuda={cliente?.acepta_datos_en ? `Autorizado el ${fechaHora(cliente.acepta_datos_en)}` : 'Para guardar su documento, celular o dirección (Ley 1581 de protección de datos).'} />
        <Btn disabled={ocupado || ctx.soloLectura} onClick={guardar}>{ocupado ? 'Guardando…' : 'Guardar cliente'}</Btn>
      </div>
    </div>
  )
}
