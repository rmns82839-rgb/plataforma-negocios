// Ajustes del dueño sobre los productos agotados: si se bloquea la venta y la clave con la que autoriza el cajero.
import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { claseInput } from '../lib/estilos'
import { confirmar } from '../lib/confirmar'

export default function ClaveAutorizacion() {
  const [bloquear, setBloquear] = useState(true)
  const [hayClave, setHayClave] = useState(null)       // null = cargando / sin la migración 53
  const [nueva, setNueva] = useState('')
  const [aviso, setAviso] = useState(null)
  const [trabajando, setTrabajando] = useState(false)

  const cargar = useCallback(async () => {
    const [a, b] = await Promise.all([
      supabase.from('negocio').select('bloquear_agotados').maybeSingle(),
      supabase.rpc('tiene_pin_autorizacion'),
    ])
    if (a.data && typeof a.data.bloquear_agotados === 'boolean') setBloquear(a.data.bloquear_agotados)
    setHayClave(b.error ? null : Boolean(b.data))
  }, [])
  useEffect(() => { cargar() }, [cargar])

  if (hayClave === null) return null          // sin el SQL 53 no se muestra nada

  const cambiarBloqueo = async (valor) => {
    if (!valor && !(await confirmar({ titulo: '¿Dejar vender agotados sin permiso?', texto: 'Cualquier cajero podrá vender lo que no tiene stock y el inventario quedará en negativo.', si: 'Sí, permitir' }))) return
    setBloquear(valor)
    const { error } = await supabase.from('negocio').update({ bloquear_agotados: valor })
    if (error) { setBloquear(!valor); setAviso({ ok: false, texto: error.message }) }
  }
  const guardar = async () => {
    if (!/^\d{4,8}$/.test(nueva)) return setAviso({ ok: false, texto: 'La clave debe tener de 4 a 8 números' })
    setTrabajando(true); setAviso(null)
    const { error } = await supabase.rpc('definir_pin_autorizacion', { p_pin: nueva })
    setTrabajando(false)
    if (error) return setAviso({ ok: false, texto: error.message })
    setNueva(''); setHayClave(true); setAviso({ ok: true, texto: 'Clave guardada. Dísela solo a quien deba autorizar agotados.' })
  }
  const quitar = async () => {
    if (!(await confirmar({ titulo: '¿Quitar la clave?', texto: 'Los cajeros ya no podrán autorizar agotados; solo tú, desde tu sesión.', si: 'Sí, quitar' }))) return
    const { error } = await supabase.rpc('quitar_pin_autorizacion')
    if (error) return setAviso({ ok: false, texto: error.message })
    setHayClave(false); setAviso({ ok: true, texto: 'Clave quitada.' })
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm p-4 space-y-3">
      <p className="text-xs font-medium text-slate-500">Productos agotados</p>
      <label className="grid grid-cols-[1fr_auto] gap-3 items-center">
        <span>
          <span className="block text-sm font-semibold">No dejar vender agotados</span>
          <span className="block text-xs text-slate-400">Si no hay stock, sale el aviso «Producto agotado» y la venta espera tu autorización (el stock quedaría en negativo).</span>
        </span>
        <input type="checkbox" checked={bloquear} onChange={e => cambiarBloqueo(e.target.checked)} className="h-6 w-6 accent-marca" />
      </label>
      <div className="space-y-2">
        <p className="text-sm font-semibold">Clave para autorizar {hayClave ? <span className="text-xs font-normal text-marca">· creada</span> : <span className="text-xs font-normal text-slate-400">· sin crear</span>}</p>
        <p className="text-xs text-slate-400">Con tu sesión autorizas sin clave. Esta clave (4 a 8 números) es para que un cajero te llame y la escriba él mismo en la caja.</p>
        <div className="grid grid-cols-[1fr_auto] gap-2">
          <input type="password" inputMode="numeric" autoComplete="new-password" maxLength={8} value={nueva}
                 onChange={e => { setNueva(e.target.value.replace(/\D/g, '')); setAviso(null) }}
                 placeholder={hayClave ? 'Nueva clave' : 'Crear clave'} className={claseInput} />
          <button onClick={guardar} disabled={trabajando || !nueva}
                  className="h-12 px-4 rounded-xl bg-negro text-champagne text-sm font-semibold disabled:opacity-40">{trabajando ? '…' : 'Guardar'}</button>
        </div>
        {hayClave && <button onClick={quitar} className="w-full min-h-10 rounded-xl bg-slate-100 text-slate-600 text-xs font-semibold">Quitar la clave</button>}
        {aviso && <p className={`text-sm rounded-lg px-3 py-2 ${aviso.ok ? 'text-marca bg-lima/20' : 'text-red-600 bg-red-50'}`}>{aviso.texto}</p>}
      </div>
    </div>
  )
}
