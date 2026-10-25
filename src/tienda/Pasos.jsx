import { useState } from 'react'
import { cop, validarDatos, costoDomicilioCalculado } from '../lib/pedido'
import { Btn, Volver, Aviso, Campo, Cantidad, BarraFija, clsInput } from './ui'
import CalculoDomicilio from './CalculoDomicilio'

const Titulo = ({ paso, children }) => (
  <>
    <p className="text-base font-semibold text-tinta/60">Paso {paso} de 3</p>
    <h2 className="mb-4 break-words text-3xl font-bold leading-tight">{children}</h2>
  </>
)

const Fila = ({ k, v, fuerte }) => (
  <div className={`flex items-baseline justify-between gap-4 ${fuerte ? 'text-2xl font-bold' : 'text-lg'}`}><span>{k}</span><span className="text-right">{v}</span></div>
)

// ---------- Paso 1: el carrito ----------
export function Carrito({ tot, cambiar, volver, seguir }) {
  return (
    <div className="pb-40">
      <Volver onClick={volver} texto="Volver a la tienda" />
      <Titulo paso={1}>Tu pedido</Titulo>
      <div className="space-y-3">
        {tot.lineas.map(({ producto: p, cantidad, descuento, promo, total }) => (
          <div key={p.id} className="rounded-2xl border-2 border-black/5 bg-white p-4">
            <p className="break-words text-xl font-bold leading-snug">{p.nombre}</p>
            <p className="text-lg text-tinta/70">{cop(p.precio_venta)} c/u</p>
            <div className="my-3"><Cantidad valor={cantidad} onMenos={() => cambiar(p.id, cantidad - 1)} onMas={() => cambiar(p.id, cantidad + 1)} /></div>
            <div className="flex items-baseline justify-between gap-3">
              <button onClick={() => cambiar(p.id, 0)} className="min-h-[48px] text-lg font-semibold text-red-700 underline">Quitar</button>
              <p className="text-2xl font-bold">{cop(total)}</p>
            </div>
            {descuento > 0 && <p className="mt-1 text-lg font-semibold text-[#0d6b38]">Oferta «{promo}»: ahorras {cop(descuento)}</p>}
          </div>
        ))}
      </div>
      <BarraFija>
        <Fila k="Subtotal" v={cop(tot.subtotal)} fuerte />
        <Btn className="mt-2" onClick={seguir} disabled={tot.lineas.length === 0}>Continuar</Btn>
      </BarraFija>
    </div>
  )
}

// ---------- Paso 2: entrega y datos ----------
export function Datos({ invitarGoogle, entrarGoogle, n, slug, tot, datos, setDatos, calculo, setCalculo, volver, seguir, soloLectura }) {
  const [errores, setErrores] = useState({})
  const km = n.domicilio_modo === 'km' && (n.modulos || []).includes('domicilio_km')
  const set = (k) => (e) => setDatos({ ...datos, [k]: e.target.value })
  const dom = datos.entrega === 'domicilio'

  function continuar() {
    const e = validarDatos(datos, n, calculo)
    setErrores(e)
    if (Object.keys(e).length === 0) seguir()
    else document.getElementById('errores-datos')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  const estimado = dom ? costoDomicilioCalculado(n, tot.subtotal, calculo) : 0
  const cambiarDireccion = (e) => { setDatos({ ...datos, direccion: e.target.value }); if (calculo) setCalculo(null) }
  const gratis = Number(n.envio_gratis_desde) > 0

  return (
    <div className="pb-44">
      <Volver onClick={volver} texto="Volver a mi pedido" />
      <Titulo paso={2}>¿Cómo lo recibes?</Titulo>

      <div className="mb-6 grid grid-cols-2 gap-3" role="group" aria-label="Forma de entrega">
        {[['domicilio', 'A domicilio'], ['recoger', 'Lo recojo en la tienda']].map(([v, t]) => (
          <button key={v} aria-pressed={datos.entrega === v} onClick={() => setDatos({ ...datos, entrega: v })}
            className={`min-h-[72px] rounded-2xl border-2 px-3 text-lg font-bold leading-tight ${datos.entrega === v ? 'border-principal bg-principal text-white' : 'border-black/10 bg-white'}`}>{t}</button>
        ))}
      </div>

      {invitarGoogle && (
        <div className="mb-5 space-y-3 rounded-2xl border-2 border-black/5 bg-white p-4">
          <p className="text-lg font-semibold leading-snug">¿Quieres ver el estado de tu pedido y guardar tus datos?</p>
          <Btn variante="suave" type="button" onClick={entrarGoogle}>Entrar con Google (opcional)</Btn>
          <p className="text-base text-tinta/60">Si no, sigue aquí: puedes pedir sin cuenta.</p>
        </div>
      )}

      {Object.keys(errores).length > 0 && <div id="errores-datos" className="mb-4"><Aviso tipo="error">Revisa los datos marcados en rojo para poder continuar.</Aviso></div>}

      <div className="space-y-5">
        <Campo etiqueta="Tu nombre completo" error={errores.nombre}>
          <input className={clsInput} autoComplete="name" value={datos.nombre} onChange={set('nombre')} />
        </Campo>
        <Campo etiqueta="Tu celular" error={errores.telefono} ayuda="10 dígitos. La tienda te escribe por aquí si hay algún cambio.">
          <input className={clsInput} inputMode="tel" autoComplete="tel" value={datos.telefono} onChange={set('telefono')} />
        </Campo>
        {dom && (
          <Campo etiqueta="Dirección de entrega" error={errores.direccion} ayuda="Calle o carrera, número, barrio y alguna seña.">
            <input className={clsInput} autoComplete="street-address" value={datos.direccion} onChange={cambiarDireccion} />
          </Campo>
        )}
        {dom && km && (
          <div id="calculo-domicilio">
            <p className="mb-2 text-lg font-semibold">Confirma tu dirección en el mapa</p>
            {errores.calculo && <p className="mb-2 text-base font-semibold text-red-700">{errores.calculo}</p>}
            <CalculoDomicilio n={n} slug={slug} subtotal={tot.subtotal} direccion={datos.direccion} calculo={calculo} setCalculo={setCalculo}
              soloLectura={soloLectura} recoger={() => { setCalculo(null); setDatos({ ...datos, entrega: 'recoger' }) }} />
          </div>
        )}
        <Campo etiqueta="Algo que quieras avisarnos (opcional)">
          <textarea className={`${clsInput} min-h-[96px] py-3`} maxLength={200} value={datos.nota} onChange={set('nota')} />
        </Campo>
      </div>

      <BarraFija>
        <Fila k="Productos" v={cop(tot.subtotal)} />
        {dom && <Fila k="Domicilio" v={estimado === null ? 'Falta confirmar tu dirección' : estimado === undefined ? 'Fuera de la zona' : estimado === 0 ? 'Sin costo' : cop(estimado)} />}
        {dom && gratis && estimado > 0 && <p className="text-base text-tinta/60">Domicilio sin costo desde {cop(n.envio_gratis_desde)}</p>}
        <Btn className="mt-2" onClick={continuar}>Revisar mi pedido</Btn>
      </BarraFija>
    </div>
  )
}

// ---------- Paso 3: revisar y confirmar ----------
export function Revisar({ n, tot, datos, calculo, volver, confirmar, enviando, error, personal, simulado, practica, setPractica, acepta, setAcepta, promos, setPromos }) {
  const km = n.domicilio_modo === 'km' && (n.modulos || []).includes('domicilio_km')
  const dom = datos.entrega === 'domicilio'
  const est = dom ? costoDomicilioCalculado(n, tot.subtotal, calculo) : 0
  const domOk = typeof est === 'number'
  const total = tot.subtotal + (domOk ? est : 0)

  return (
    <div className="pb-44">
      <Volver onClick={volver} texto="Volver a mis datos" />
      <Titulo paso={3}>Revisa tu pedido</Titulo>

      <div className="mb-5 rounded-2xl border-2 border-black/5 bg-white p-4">
        <ul className="space-y-2">
          {tot.lineas.map(({ producto: p, cantidad, total: t }) => (
            <li key={p.id} className="flex items-baseline justify-between gap-3 text-lg"><span className="break-words">{cantidad} × {p.nombre}</span><span className="font-semibold">{cop(t)}</span></li>
          ))}
        </ul>
      </div>

      <div className="mb-5 rounded-2xl border-2 border-black/5 bg-white p-4 text-lg leading-snug">
        <p className="font-bold">{dom ? 'Entrega a domicilio' : 'Lo recoges en la tienda'}</p>
        <p>{datos.nombre} · {datos.telefono}</p>
        {dom && <p>{datos.direccion}</p>}
        {dom && km && calculo?.estado === 'ok' && <p>Distancia: {String(calculo.km).replace('.', ',')} km</p>}
        {dom && km && calculo?.respaldo && <p>Domicilio con tarifa fija</p>}
        {datos.nota && <p className="text-tinta/70">Nota: {datos.nota}</p>}
      </div>

      {!domOk && dom && <div className="mb-4"><Aviso tipo="error">{est === undefined ? 'Tu dirección queda fuera de la zona de entrega de esta tienda.' : 'Falta confirmar tu dirección para calcular el domicilio.'}</Aviso></div>}
      {tot.descuento > 0 && <p className="mb-4 text-lg font-semibold text-[#0d6b38]">Ya incluye tus ofertas: ahorras {cop(tot.descuento)}</p>}

      <div className="mb-5 space-y-4 rounded-2xl border-2 border-black/5 bg-white p-4">
        <label className="flex cursor-pointer items-start gap-4 text-lg leading-snug">
          <input type="checkbox" checked={acepta} onChange={(e) => setAcepta(e.target.checked)} className="mt-1 h-8 w-8 shrink-0 accent-[rgb(var(--c-principal))]" />
          <span>Autorizo a <b>{n.nombre}</b> a usar mis datos (nombre, celular y dirección) solo para atender este pedido, según la Ley 1581 de 2012.</span>
        </label>
        <label className="flex cursor-pointer items-start gap-4 text-lg leading-snug">
          <input type="checkbox" checked={promos} onChange={(e) => setPromos(e.target.checked)} className="mt-1 h-8 w-8 shrink-0 accent-[rgb(var(--c-principal))]" />
          <span>Quiero que me avisen de ofertas (opcional).</span>
        </label>
        {personal && !simulado && (
          <label className="flex cursor-pointer items-start gap-4 text-lg leading-snug">
            <input type="checkbox" checked={practica} onChange={(e) => setPractica(e.target.checked)} className="mt-1 h-8 w-8 shrink-0 accent-[rgb(var(--c-principal))]" />
            <span><b>Es una prueba</b>: no cuenta en las estadísticas ni cambia nada.</span>
          </label>
        )}
      </div>

      {simulado && <div className="mb-4"><Aviso tipo="previa">Estás con la cuenta de soporte: el pedido se <b>simula</b> y no se guarda.</Aviso></div>}
      {error && <div className="mb-4"><Aviso tipo="error">{error}</Aviso></div>}

      <BarraFija>
        <Fila k="Total a pagar" v={cop(total)} fuerte />
        {dom && domOk && <p className="text-base text-tinta/60">Incluye domicilio: {est === 0 ? 'sin costo' : cop(est)}</p>}
        <Btn className="mt-2" onClick={confirmar} disabled={!acepta || enviando || !domOk}>{enviando ? 'Enviando…' : 'Hacer mi pedido'}</Btn>
        {!acepta && <p className="mt-1 text-center text-base text-tinta/60">Marca la autorización de datos para continuar.</p>}
      </BarraFija>
    </div>
  )
}
