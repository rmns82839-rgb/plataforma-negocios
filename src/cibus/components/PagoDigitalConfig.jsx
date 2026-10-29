// Negocio → Pagos digitales: el dueño pone el número y marca qué medios acepta (Nequi, Llave, Daviplata).
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { claseInput } from '../lib/estilos'
import { Campo } from './Modal'
import { MEDIOS_DIGITALES } from '../lib/pagoDigital'

export default function PagoDigitalConfig() {
  const [numero, setNumero] = useState('')
  const [titular, setTitular] = useState('')
  const [medios, setMedios] = useState([])
  const [cargado, setCargado] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [msg, setMsg] = useState(null)

  useEffect(() => {
    supabase.from('negocio').select('pago_digital_numero,pago_digital_medios,pago_digital_titular').eq('id', 1).maybeSingle().then(({ data, error }) => {
      if (error) { setMsg({ tipo: 'error', texto: /pago_digital|column/i.test(error.message) ? 'Falta ejecutar 31-pago-digital.sql en Supabase.' : error.message }); return }
      setNumero(data?.pago_digital_numero ?? ''); setTitular(data?.pago_digital_titular ?? ''); setMedios(data?.pago_digital_medios ?? []); setCargado(true)
    })
  }, [])

  const alternar = (id) => setMedios(m => (m.includes(id) ? m.filter(x => x !== id) : [...m, id]))
  const guardar = async () => {
    setGuardando(true); setMsg(null)
    const { error } = await supabase.rpc('guardar_pago_digital', { p_numero: numero, p_medios: medios, p_titular: titular })
    setGuardando(false)
    setMsg(error ? { tipo: 'error', texto: error.message } : { tipo: 'ok', texto: medios.length ? 'Listo: los clientes ya pueden pagar así.' : 'Pagos digitales apagados.' })
  }
  if (!cargado && !msg) return null

  return (
    <div className="bg-white rounded-2xl shadow-sm p-4 space-y-4">
      <div>
        <h3 className="text-base font-semibold break-words">Pagos digitales (Nequi, Llave, Daviplata)</h3>
        <p className="text-sm text-slate-500 break-words">El cliente ve este número al pedir, paga en su app y toca «Ya pagué». Tú confirmas en Pedidos que te llegó.</p>
      </div>
      <div className="grid grid-cols-3 gap-2" role="group" aria-label="Medios que aceptas">
        {MEDIOS_DIGITALES.map(m => (
          <button key={m.id} type="button" onClick={() => alternar(m.id)} aria-pressed={medios.includes(m.id)}
            className={`min-h-12 rounded-xl text-sm font-semibold break-words ${medios.includes(m.id) ? 'bg-marca text-white' : 'bg-slate-100 text-slate-600'}`}>
            {medios.includes(m.id) ? '✓ ' : ''}{m.texto}
          </button>
        ))}
      </div>
      <Campo etiqueta="Número de celular que recibe el dinero (10 dígitos)">
        <input value={numero} onChange={e => setNumero(e.target.value.replace(/[^\d ]/g, ''))} inputMode="numeric" maxLength={14} placeholder="3001234567" className={claseInput} />
      </Campo>
      <Campo etiqueta="A nombre de (opcional, para que el cliente verifique)">
        <input value={titular} onChange={e => setTitular(e.target.value)} maxLength={80} placeholder="Ej. Tienda Don Pepe" className={claseInput} />
      </Campo>
      {msg && <p className={`text-sm rounded-lg px-3 py-2 break-words ${msg.tipo === 'ok' ? 'text-green-800 bg-green-50' : 'text-red-600 bg-red-50'}`}>{msg.texto}</p>}
      <button onClick={guardar} disabled={guardando} className="w-full h-12 rounded-xl bg-marca text-white text-base font-semibold disabled:opacity-40">
        {guardando ? 'Guardando…' : 'Guardar pagos digitales'}
      </button>
    </div>
  )
}
