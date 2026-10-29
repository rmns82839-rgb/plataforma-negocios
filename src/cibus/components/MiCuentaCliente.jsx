// «Mi cuenta» del cliente: su avatar y datos, su dirección guardada (con el punto del mapa), cómo prefiere recibir,
// sus últimas 5 compras con «Pedir otra vez» y lo que más pide. Todo se guarda al instante.
import { useEffect, useState } from 'react'
import Modal, { Campo } from './Modal'
import AvatarCliente from './AvatarCliente'
import UbicacionCliente from './UbicacionCliente'
import Icono from './Iconos'
import { claseInput } from '../lib/estilos'
import { dinero, numero } from '../lib/formato'
import { etapaDe } from '../lib/etapaPedido'
import { slugActual } from '../lib/enlaces'
import { telefono10 } from '../lib/datosCliente'
import { fotoDeGoogle, tieneUbicacion, payloadPerfil, fechaCorta, fechaLarga, resumenItems } from '../lib/cuentaVista'

const Titulo = ({ icono, children }) => (
  <h3 className="grid grid-cols-[auto_1fr] gap-2 items-center text-lg font-bold text-slate-800"><Icono nombre={icono} className="h-5 w-5 text-oro-oscuro" />{children}</h3>
)

export default function MiCuentaCliente({ cuenta, productos, onRepetir, onAgregar, onCerrar }) {
  const { sesion, perfil, resumen, guardar, cargarResumen, salir, borrar } = cuenta
  const [vista, setVista] = useState('inicio')          // inicio · direccion · datos
  const [guardando, setGuardando] = useState(false)
  const [form, setForm] = useState({ nombre: perfil.nombre, telefono: perfil.telefono, referencia: perfil.referencia ?? '' })
  const [errorForm, setErrorForm] = useState('')
  const [seguro, setSeguro] = useState(false)
  const [borrando, setBorrando] = useState(false)
  const [agregados, setAgregados] = useState(() => new Set())
  useEffect(() => { cargarResumen() }, [cargarResumen])

  const cambiar = async (cambios) => { setGuardando(true); const r = await guardar(payloadPerfil(perfil, cambios)); setGuardando(false); return r }
  const prod = (it) => productos.find(x => x.id === it.producto_id) ?? productos.find(x => x.nombre?.trim().toLowerCase() === String(it.nombre).trim().toLowerCase())

  const repetir = (p) => {
    const lineas = [], faltan = []
    for (const it of p.items ?? []) {
      const x = prod(it)
      if (x && x.disponible) lineas.push({ producto: x, cantidad: Number(it.cantidad) }); else faltan.push(it.nombre)
    }
    onRepetir(lineas, faltan.length)
  }

  if (vista === 'direccion') {
    return (
      <Modal titulo="Mi dirección" onCerrar={onCerrar}>
        <UbicacionCliente slug={slugActual()} inicial={{ direccion: perfil.direccion }} etiquetaBoton="Guardar esta ubicación" ocupadoFuera={guardando}
          onConfirmar={async (u) => { const r = await cambiar({ direccion: u.direccion, lat: u.lat, lng: u.lng, entrega_preferida: 'domicilio' }); if (r) setVista('inicio') }} />
        {cuenta.error && <p role="alert" className="text-base text-red-600 bg-red-50 rounded-lg px-3 py-2 break-words">{cuenta.error}</p>}
        <button type="button" onClick={() => setVista('inicio')} className="w-full h-14 rounded-xl bg-slate-100 text-slate-600 text-base font-medium active:bg-slate-200">← Volver a mi cuenta</button>
      </Modal>
    )
  }

  if (vista === 'datos') {
    const guardarDatos = async () => {
      if (form.nombre.trim().length < 3) return setErrorForm('Escribe tu nombre completo')
      if (!telefono10(form.telefono)) return setErrorForm('Escribe tu celular de 10 dígitos')
      setErrorForm('')
      const r = await cambiar({ nombre: form.nombre.trim(), telefono: telefono10(form.telefono), referencia: form.referencia.trim() })
      if (r) setVista('inicio')
    }
    return (
      <Modal titulo="Mis datos" onCerrar={onCerrar}>
        <Campo etiqueta="Nombre completo *"><input value={form.nombre} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} maxLength={80} autoComplete="name" className={claseInput} /></Campo>
        <Campo etiqueta="Celular / WhatsApp *"><input value={form.telefono} onChange={e => setForm(f => ({ ...f, telefono: e.target.value }))} maxLength={20} inputMode="tel" autoComplete="tel" className={claseInput} /></Campo>
        <Campo etiqueta="Referencia para el domicilio (opcional)"><input value={form.referencia} onChange={e => setForm(f => ({ ...f, referencia: e.target.value }))} maxLength={120} placeholder="Torre 2, apto 301 · timbre · portón verde" className={claseInput} /></Campo>
        {errorForm && <p role="alert" className="text-base text-red-600 bg-red-50 rounded-lg px-3 py-2">{errorForm}</p>}
        {cuenta.error && <p role="alert" className="text-base text-red-600 bg-red-50 rounded-lg px-3 py-2 break-words">{cuenta.error}</p>}
        <div className="grid grid-cols-[auto_1fr] gap-3">
          <button type="button" onClick={() => setVista('inicio')} className="h-14 px-5 rounded-xl bg-slate-100 text-slate-600 font-medium active:bg-slate-200">← Volver</button>
          <button type="button" onClick={guardarDatos} disabled={guardando} className="h-14 rounded-xl bg-negro text-champagne text-lg font-semibold disabled:opacity-40 active:opacity-90">{guardando ? 'Guardando…' : 'Guardar'}</button>
        </div>
      </Modal>
    )
  }

  const ultimos = resumen?.ultimos ?? []
  const favoritos = resumen?.favoritos ?? []
  const recoge = perfil.entrega_preferida === 'recoger'
  return (
    <Modal titulo="Mi cuenta" onCerrar={onCerrar}>
      <section className="grid grid-cols-[auto_1fr] gap-4 items-center rounded-2xl bg-cibus-profundo p-4">
        <AvatarCliente nombre={perfil.nombre} foto={fotoDeGoogle(sesion)} tam={64} />
        <span className="min-w-0">
          <span className="block font-display text-2xl font-semibold text-champagne leading-tight break-words">{perfil.nombre}</span>
          <span className="block text-sm text-hueso/80 break-words">{sesion?.user?.email}</span>
          <span className="block text-sm text-hueso/80">{perfil.telefono}</span>
          {perfil.creado_en && <span className="block text-xs text-champagne/70 pt-1">Cliente desde {fechaLarga(perfil.creado_en)}</span>}
        </span>
      </section>

      <section className="grid grid-cols-3 gap-2 text-center" aria-label="Mis números">
        {[['Pedidos', resumen ? numero(resumen.pedidos) : '·'], ['Comprado', resumen ? dinero(resumen.gastado) : '·'], ['Última compra', resumen?.ultima ? fechaCorta(resumen.ultima) : '—']].map(([t, v]) => (
          <div key={t} className="rounded-xl bg-slate-50 p-2 space-y-0.5"><p className="text-base font-bold text-slate-800 break-words">{v}</p><p className="text-xs text-slate-500">{t}</p></div>
        ))}
      </section>

      <section className="space-y-3">
        <Titulo icono="pin">Mi dirección</Titulo>
        <div className="rounded-2xl ring-1 ring-slate-200 p-3 space-y-2">
          {recoge ? <p className="text-base text-slate-700">Recoges en la tienda.</p> : (
            <>
              <p className="text-base text-slate-800 break-words">{perfil.direccion || 'Aún no tienes una dirección guardada.'}</p>
              {perfil.referencia && <p className="text-sm text-slate-500 break-words">{perfil.referencia}</p>}
              {perfil.direccion && (tieneUbicacion(perfil)
                ? <p className="grid grid-cols-[auto_1fr] gap-1.5 items-center text-sm font-semibold text-emerald-700"><Icono nombre="check" className="h-4 w-4" />Ubicación guardada: el domicilio se calcula solo</p>
                : <p className="text-sm font-semibold text-amber-800">Falta marcar tu puerta en el mapa para calcular el domicilio solo.</p>)}
            </>
          )}
          <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Cómo prefiero recibir">
            {[['domicilio', 'moto', 'A domicilio'], ['recoger', 'negocio', 'Recojo en la tienda']].map(([v, ic, t]) => (
              <button key={v} type="button" role="radio" aria-checked={perfil.entrega_preferida === v} disabled={guardando || (v === 'domicilio' && !perfil.direccion)}
                onClick={() => perfil.entrega_preferida !== v && cambiar({ entrega_preferida: v })}
                className={`min-h-12 rounded-xl px-2 grid grid-cols-[auto_1fr] gap-2 items-center justify-items-center text-base font-semibold leading-tight ring-2 disabled:opacity-50 ${perfil.entrega_preferida === v ? 'bg-cibus-profundo text-champagne ring-oro' : 'bg-white text-slate-700 ring-slate-200'}`}>
                <Icono nombre={ic} className="h-5 w-5" /><span>{t}</span>
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => setVista('direccion')} className="min-h-12 rounded-xl bg-negro text-champagne text-base font-semibold px-2 leading-tight active:opacity-90">{perfil.direccion ? 'Cambiar mi dirección' : 'Agregar mi dirección'}</button>
            <button type="button" onClick={() => setVista('datos')} className="min-h-12 rounded-xl bg-white ring-1 ring-slate-300 text-slate-700 text-base font-semibold px-2 leading-tight active:bg-slate-100">Editar mis datos</button>
          </div>
        </div>
      </section>

      <section className="space-y-3">
        <Titulo icono="ventas">Mis últimas compras</Titulo>
        {ultimos.length === 0 ? (
          <p className="text-base text-slate-500 rounded-2xl bg-slate-50 p-4">Cuando hagas tu primer pedido, tus últimas 5 compras aparecen aquí para repetirlas con un toque.</p>
        ) : (
          <ul className="space-y-2">
            {ultimos.map(p => (
              <li key={p.numero} className="rounded-2xl ring-1 ring-slate-200 p-3 space-y-2">
                <div className="grid grid-cols-[1fr_auto] gap-2 items-baseline"><span className="text-base font-bold text-slate-800">Pedido N.º {p.numero}</span><span className="text-sm text-slate-500">{fechaCorta(p.creado_en)}</span></div>
                <p className="text-base text-slate-700 break-words">{resumenItems(p.items)}</p>
                <div className="grid grid-cols-[1fr_auto] gap-2 items-center"><span className="text-sm font-semibold text-slate-600">{etapaDe(p).texto}</span><span className="text-base font-bold text-slate-800">{dinero(Number(p.total) + Number(p.domicilio || 0))}</span></div>
                <button type="button" onClick={() => repetir(p)} className="w-full min-h-12 rounded-xl bg-negro text-champagne text-base font-semibold active:opacity-90">Pedir otra vez</button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {favoritos.length > 0 && (
        <section className="space-y-3">
          <Titulo icono="favorito">Lo que más pides</Titulo>
          <ul className="space-y-2">
            {favoritos.map(f => {
              const x = prod(f)
              return (
                <li key={`${f.producto_id}-${f.nombre}`} className="rounded-2xl ring-1 ring-slate-200 p-3 grid grid-cols-[1fr_auto] gap-3 items-center">
                  <span className="min-w-0"><span className="block text-base font-semibold break-words">{f.nombre}</span><span className="block text-sm text-slate-500">{f.veces === 1 ? 'Lo pediste 1 vez' : `Lo has pedido ${f.veces} veces`}{x ? ` · ${dinero(x.precio_venta)}` : ''}</span></span>
                  <button type="button" disabled={!x || !x.disponible || agregados.has(x.id)} onClick={() => { onAgregar(x); setAgregados(a => new Set(a).add(x.id)) }} className="min-h-11 px-4 rounded-xl bg-cibus text-white text-sm font-semibold disabled:opacity-40 active:opacity-80">{!x || !x.disponible ? 'No disponible' : agregados.has(x.id) ? 'En tu pedido' : 'Agregar'}</button>
                </li>
              )
            })}
          </ul>
        </section>
      )}

      <section className="space-y-3">
        <label className="grid grid-cols-[1.5rem_1fr] gap-3 items-start text-base text-slate-700 leading-snug">
          <input type="checkbox" checked={Boolean(perfil.acepta_promos)} disabled={guardando} onChange={e => cambiar({ acepta_promos: e.target.checked })} className="h-6 w-6 mt-0.5 accent-[#0b0b0b]" />
          <span>Quiero recibir promociones y novedades de la tienda (puedes retirarte cuando quieras).</span>
        </label>
        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={async () => { await salir(); onCerrar() }} className="min-h-12 rounded-xl bg-white ring-1 ring-slate-300 text-slate-700 text-base font-semibold active:bg-slate-100">Cerrar sesión</button>
          <button type="button" onClick={() => setSeguro(true)} className="min-h-12 rounded-xl bg-white ring-1 ring-slate-200 text-slate-500 text-base font-medium active:bg-slate-100">Borrar mis datos</button>
        </div>
        {seguro && (
          <div className="rounded-xl bg-red-50 p-3 space-y-2">
            <p className="text-base text-red-700 break-words">Se borra tu perfil y tu dirección guardada. Tus pedidos anteriores no se tocan. ¿Seguro?</p>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setSeguro(false)} className="min-h-12 rounded-xl bg-white ring-1 ring-slate-200 text-slate-600 text-base font-medium">← Volver</button>
              <button type="button" disabled={borrando} onClick={async () => { setBorrando(true); const ok = await borrar(); setBorrando(false); if (ok) onCerrar() }} className="min-h-12 rounded-xl bg-red-600 text-white text-base font-semibold disabled:opacity-40">{borrando ? 'Borrando…' : 'Sí, borrar'}</button>
            </div>
          </div>
        )}
      </section>
      <button type="button" onClick={onCerrar} className="w-full h-14 rounded-xl bg-slate-100 text-slate-600 text-base font-medium active:bg-slate-200">← Volver a la tienda</button>
    </Modal>
  )
}
