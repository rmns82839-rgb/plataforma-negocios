// Datos del negocio: salen en la factura impresa (nombre, NIT, dirección, logo, nota al pie).
import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { claseInput } from '../lib/estilos'
import { Campo } from './Modal'
import { useDueno } from '../context/rol'
import { logoADataUrl } from '../lib/imagen'
import { cargarConfig } from '../lib/config'
import { confirmar } from '../lib/confirmar'
import { leerBorrador, guardarBorrador, DOCE_HORAS } from '../lib/borrador'
import AvisoBorrador from './AvisoBorrador'
import DomicilioKmConfig from './DomicilioKmConfig'
import { validarDomicilioKm } from '../lib/domicilioKm'

const CLAVE_BORRADOR = 'bd:negocio:cambios'      // lo editado y sin guardar sobrevive a recargar la página

const VACIO = {
  nombre: '', nit: '', direccion: '', ciudad: '', telefono: '', email: '', web: '',
  titulo_factura: 'Comprobante de venta', nota_pie: '', logo: null, ver_logo: false,
  prefijo_factura: '', comision_datafono: '', margen_minimo: '',
  mora_mensual: '', descuento_mayorista: '', bloquear_credito_mora: true,
  instagram: '', facebook: '', tiktok: '', whatsapp: '', horario: '', maps_url: '', razon_social: '', correo_datos: '',
  domicilio_costo: '', envio_gratis_desde: '', zona_domicilio: '', formas_pago_tienda: '',
  domicilio_costo_ropa: '', envio_gratis_desde_ropa: '',
  dom_modo: 'fijo', dom_base: '', dom_por_km: '', dom_max_km: '', dom_redondeo: '0', dom_origen: '', dom_km_incluidos: '0',
}

const porcentaje = (t) => {
  const n = Number(String(t ?? '').replace(',', '.'))
  return String(t ?? '').trim() === '' || !Number.isFinite(n) ? null : n
}

// Pesos enteros; vacío = no se usa
const pesos = (t) => { const d = String(t ?? '').replace(/\D/g, ''); return d === '' ? null : Number(d) }

export default function Negocio() {
  const dueno = useDueno()
  const [f, setF] = useState(VACIO)
  const [cargando, setCargando] = useState(true)
  const [guardando, setGuardando] = useState(false)
  const [aviso, setAviso] = useState(null)
  const guardado = useRef(null)                  // los datos tal como están en la base (para saber si hay cambios sin guardar)
  const [recuperado, setRecuperado] = useState(false)
  const archivo = useRef(null)
  const [hayV9, setHayV9] = useState(false)       // ya se ejecutó migracion-v9.sql
  const [hayV12, setHayV12] = useState(false)     // ya se ejecutó migracion-v12.sql
  const [hayV20, setHayV20] = useState(false)     // ya se ejecutó migracion-v20.sql
  const [hayV26, setHayV26] = useState(false)     // ya se ejecutó migracion-v26.sql (domicilio propio para ropa)
  const [hayV42, setHayV42] = useState(false)     // ya se ejecutó migracion-v42.sql (kilómetros incluidos en la tarifa base)
  const [hayV37, setHayV37] = useState(false)     // ya se ejecutó migracion-v37.sql (domicilio por distancia)

  useEffect(() => {
    supabase.from('negocio').select('*').eq('id', 1).maybeSingle().then(({ data, error }) => {
      if (error) setAviso({ tipo: 'error', texto: error.message })
      setHayV9(Boolean(data) && 'mora_mensual' in data)
      setHayV12(Boolean(data) && 'instagram' in data)
      setHayV20(Boolean(data) && 'domicilio_costo' in data)
      setHayV26(Boolean(data) && 'domicilio_costo_ropa' in data)
      setHayV37(Boolean(data) && 'dom_modo' in data)
      setHayV42(Boolean(data) && 'dom_km_incluidos' in data)
      const base = data ? { ...VACIO, ...Object.fromEntries(Object.entries(data).map(([k, v]) => [k, v ?? VACIO[k] ?? ''])) } : VACIO
      guardado.current = JSON.stringify(base)
      const borr = leerBorrador(CLAVE_BORRADOR, DOCE_HORAS)
      if (borr && JSON.stringify({ ...base, ...borr }) !== guardado.current) { setF({ ...base, ...borr }); setRecuperado(true) }
      else setF(base)
      setCargando(false)
    })
  }, [])

  // cada cambio sin guardar se anota; al guardar (o al deshacerlo) el borrador se borra solo
  useEffect(() => {
    if (cargando || guardado.current === null) return
    guardarBorrador(CLAVE_BORRADOR, JSON.stringify(f) === guardado.current ? null : f)
  }, [f, cargando])

  const poner = (k) => (e) => { setF(p => ({ ...p, [k]: e.target.value })); setAviso(null) }

  const elegirLogo = async (e) => {
    const img = e.target.files?.[0]
    e.target.value = ''
    if (!img) return
    if (!/^image\/(png|jpe?g|webp)$/.test(img.type)) {
      return setAviso({ tipo: 'error', texto: 'El logo debe ser una imagen PNG o JPG' })
    }
    try {
      const url = await logoADataUrl(img)
      setF(p => ({ ...p, logo: url, ver_logo: true })); setAviso(null)
    } catch (err) {
      setAviso({ tipo: 'error', texto: err.message })
    }
  }

  const guardar = async () => {
    const malKm = hayV37 ? validarDomicilioKm(f) : ''
    if (malKm) return setAviso({ tipo: 'error', texto: malKm })
    setGuardando(true); setAviso(null)
    const limpio = (t) => (String(t ?? '').trim() || null)
    const { error } = await supabase.from('negocio').update({
      nombre: limpio(f.nombre), nit: limpio(f.nit), direccion: limpio(f.direccion),
      ciudad: limpio(f.ciudad), telefono: limpio(f.telefono), email: limpio(f.email), web: limpio(f.web),
      titulo_factura: limpio(f.titulo_factura) ?? 'Comprobante de venta',
      nota_pie: limpio(f.nota_pie), logo: f.logo, ver_logo: Boolean(f.logo) && f.ver_logo,
      prefijo_factura: String(f.prefijo_factura ?? '').trim(),
      comision_datafono: porcentaje(f.comision_datafono),
      margen_minimo: porcentaje(f.margen_minimo),
      ...(hayV9 ? { mora_mensual: porcentaje(f.mora_mensual) ?? 0, descuento_mayorista: porcentaje(f.descuento_mayorista) ?? 0, bloquear_credito_mora: Boolean(f.bloquear_credito_mora) } : {}),
      ...(hayV12 ? {
        instagram: limpio(f.instagram), facebook: limpio(f.facebook), tiktok: limpio(f.tiktok),
        whatsapp: limpio(String(f.whatsapp ?? '').replace(/\D/g, '')), horario: limpio(f.horario), maps_url: limpio(f.maps_url),
        razon_social: limpio(f.razon_social), correo_datos: limpio(f.correo_datos),
      } : {}),
      ...(hayV20 ? {
        domicilio_costo: pesos(f.domicilio_costo), envio_gratis_desde: pesos(f.envio_gratis_desde),
        zona_domicilio: limpio(f.zona_domicilio), formas_pago_tienda: limpio(f.formas_pago_tienda),
      } : {}),
      ...(hayV26 ? { domicilio_costo_ropa: pesos(f.domicilio_costo_ropa), envio_gratis_desde_ropa: pesos(f.envio_gratis_desde_ropa) } : {}),
      ...(hayV37 ? {
        dom_modo: f.dom_modo === 'km' ? 'km' : 'fijo', dom_base: pesos(f.dom_base), dom_por_km: pesos(f.dom_por_km),
        dom_max_km: porcentaje(f.dom_max_km), dom_redondeo: [500, 1000].includes(Number(f.dom_redondeo)) ? Number(f.dom_redondeo) : 0,
        dom_origen: limpio(f.dom_origen),
        ...(hayV42 ? { dom_km_incluidos: porcentaje(f.dom_km_incluidos) ?? 0 } : {}),
      } : {}),
      actualizado_en: new Date().toISOString(),
    }).eq('id', 1)
    setGuardando(false)
    if (!error) { cargarConfig(); guardado.current = JSON.stringify(f); setRecuperado(false); guardarBorrador(CLAVE_BORRADOR, null) }
    setAviso(error
      ? { tipo: 'error', texto: /prefijo|comision|margen|column/i.test(error.message) ? 'Falta ejecutar migracion-v8.sql en Supabase. ' + error.message : error.message }
      : { tipo: 'ok', texto: 'Datos guardados. Ya salen en las facturas.' })
  }

  if (cargando) return <p className="text-center text-sm text-slate-400 py-8">Cargando…</p>
  if (dueno !== true) {
    return <p className="text-sm text-slate-500 bg-white rounded-2xl shadow-sm p-4">Solo el dueño puede cambiar los datos del negocio.</p>
  }

  return (
    <div className="space-y-4">
      {recuperado && (
        <AvisoBorrador texto="Recuperamos los cambios que no alcanzaste a guardar."
          onNuevo={() => { setF(JSON.parse(guardado.current)); setRecuperado(false); guardarBorrador(CLAVE_BORRADOR, null) }} />
      )}
      <p className="text-sm text-slate-500">
        Estos datos salen en la parte de arriba de cada factura que imprimas.
      </p>

      <div className="bg-white rounded-2xl shadow-sm p-4 space-y-4">
        <Campo etiqueta="Nombre del negocio">
          <input value={f.nombre} onChange={poner('nombre')} maxLength={120} className={claseInput} />
        </Campo>
        <div className="grid grid-cols-2 gap-3">
          <Campo etiqueta="NIT o cédula">
            <input value={f.nit} onChange={poner('nit')} maxLength={40} className={claseInput} />
          </Campo>
          <Campo etiqueta="Teléfonos">
            <input value={f.telefono} onChange={poner('telefono')} maxLength={60} inputMode="tel" className={claseInput} />
          </Campo>
        </div>
        <Campo etiqueta="Dirección">
          <input value={f.direccion} onChange={poner('direccion')} maxLength={200} className={claseInput} />
        </Campo>
        <div className="grid grid-cols-2 gap-3">
          <Campo etiqueta="Ciudad">
            <input value={f.ciudad} onChange={poner('ciudad')} maxLength={80} className={claseInput} />
          </Campo>
          <Campo etiqueta="Correo (opcional)">
            <input value={f.email} onChange={poner('email')} maxLength={120} inputMode="email" className={claseInput} />
          </Campo>
        </div>
        <Campo etiqueta="Página web o red social (opcional)">
          <input value={f.web} onChange={poner('web')} maxLength={120} className={claseInput} />
        </Campo>
      </div>

      {hayV12 && (
        <div className="bg-white rounded-2xl shadow-sm p-4 space-y-4">
          <div>
            <p className="text-sm font-semibold">Catálogos en línea y datos legales</p>
            <p className="text-xs text-slate-400">Salen en el pie de página de /ropa y /tienda y en la política de datos y los términos.</p>
          </div>
          <Campo etiqueta="Razón social o nombre del titular (para lo legal)">
            <input value={f.razon_social} onChange={poner('razon_social')} maxLength={120} placeholder="Ej. Nelson Zabaleta" className={claseInput} />
          </Campo>
          <Campo etiqueta="Correo para solicitudes de datos (opcional)">
            <input value={f.correo_datos} onChange={poner('correo_datos')} maxLength={120} inputMode="email" placeholder="Si lo dejas vacío, se usa el correo del negocio" className={claseInput} />
          </Campo>
          <Campo etiqueta="WhatsApp del negocio (con 57, solo números)">
            <input value={f.whatsapp} onChange={poner('whatsapp')} maxLength={30} inputMode="tel" placeholder="573001234567" className={claseInput} />
          </Campo>
          <Campo etiqueta="Horario de atención">
            <textarea value={f.horario} onChange={poner('horario')} maxLength={200} rows={2} placeholder={'Lunes a sábado 8 am – 8 pm\nDomingos 9 am – 2 pm'}
              className="w-full px-4 py-3 rounded-xl border border-slate-300 bg-white focus:border-marca focus:ring-2 focus:ring-marca/20 outline-none resize-none" />
          </Campo>
          <Campo etiqueta="Enlace de Google Maps (opcional)">
            <input value={f.maps_url} onChange={poner('maps_url')} maxLength={300} inputMode="url" placeholder="https://maps.app.goo.gl/…" className={claseInput} />
          </Campo>
          <div className="grid grid-cols-3 gap-3">
            <Campo etiqueta="Instagram">
              <input value={f.instagram} onChange={poner('instagram')} maxLength={120} placeholder="@tienda" className={claseInput} />
            </Campo>
            <Campo etiqueta="Facebook">
              <input value={f.facebook} onChange={poner('facebook')} maxLength={120} placeholder="tienda" className={claseInput} />
            </Campo>
            <Campo etiqueta="TikTok">
              <input value={f.tiktok} onChange={poner('tiktok')} maxLength={120} placeholder="@tienda" className={claseInput} />
            </Campo>
          </div>
        </div>
      )}

      <div className="bg-white rounded-2xl shadow-sm p-4 space-y-4">
        <Campo etiqueta="Título del documento">
          <input value={f.titulo_factura} onChange={poner('titulo_factura')} maxLength={40} className={claseInput} />
        </Campo>
        <p className="text-xs text-slate-400 -mt-2">
          Si el negocio no factura electrónicamente ante la DIAN, deja "Comprobante de venta".
        </p>
        <Campo etiqueta={`Nota al pie de la factura (opcional) · ${f.nota_pie.length}/250`}>
          <textarea value={f.nota_pie} onChange={poner('nota_pie')} maxLength={250} rows={3}
            placeholder="Gracias por su compra. Horario: lunes a sábado 7 am – 9 pm"
            className="w-full px-4 py-3 rounded-xl border border-slate-300 bg-white focus:border-marca focus:ring-2 focus:ring-marca/20 outline-none resize-none" />
        </Campo>
      </div>

      <div className="bg-white rounded-2xl shadow-sm p-4 space-y-4">
        <p className="text-xs font-medium text-slate-500">Ventas y cobro</p>
        <div className="grid grid-cols-2 gap-3">
          <Campo etiqueta="Prefijo de factura">
            <input value={f.prefijo_factura} onChange={poner('prefijo_factura')} maxLength={10} placeholder="Ej. FV-" className={claseInput} />
          </Campo>
          <Campo etiqueta="Comisión del datáfono (%)">
            <input value={f.comision_datafono} onChange={poner('comision_datafono')} inputMode="decimal" placeholder="Ej. 2.5" className={claseInput} />
          </Campo>
        </div>
        <Campo etiqueta="Margen mínimo sobre el costo (%)">
          <input value={f.margen_minimo} onChange={poner('margen_minimo')} inputMode="decimal" placeholder="Ej. 10" className={claseInput} />
        </Campo>
        {hayV9 && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <Campo etiqueta="Recargo por mora (% mensual)">
                <input value={f.mora_mensual} onChange={poner('mora_mensual')} inputMode="decimal" placeholder="Ej. 2" className={claseInput} />
              </Campo>
              <Campo etiqueta="Descuento a mayoristas (%)">
                <input value={f.descuento_mayorista} onChange={poner('descuento_mayorista')} inputMode="decimal" placeholder="Ej. 10" className={claseInput} />
              </Campo>
            </div>
            <label className="grid grid-cols-[1fr_auto] gap-3 items-center">
              <span>
                <span className="block text-sm font-semibold">No fiar a quien está en mora</span>
                <span className="block text-xs text-slate-400">El cajero no puede venderle a crédito a un cliente con deuda vencida; el dueño sí.</span>
              </span>
              <input type="checkbox" checked={Boolean(f.bloquear_credito_mora)}
                     onChange={e => setF(p => ({ ...p, bloquear_credito_mora: e.target.checked }))} className="h-6 w-6 accent-marca" />
            </label>
          </>
        )}
        <p className="text-xs text-slate-400 -mt-2">
          La numeración empieza en 00001 (con el prefijo si lo pones). El cajero no puede vender por debajo del costo más este margen,
          ni por debajo del precio mínimo de cada producto; tú sí. La comisión del datáfono se descuenta de la ganancia.
        </p>
      </div>

      <div className="bg-white rounded-2xl shadow-sm p-4 space-y-3">
        <p className="text-xs font-medium text-slate-500">Logo (opcional)</p>
        <div className="grid grid-cols-[6rem_1fr] gap-3 items-center">
          <div className="h-24 w-24 rounded-xl bg-slate-50 border border-slate-200 grid place-items-center overflow-hidden">
            {f.logo
              ? <img src={f.logo} alt="Logo del negocio" className="max-h-full max-w-full object-contain" />
              : <span className="text-[11px] text-slate-400 text-center px-2">Sin logo</span>}
          </div>
          <div className="grid gap-2">
            <button onClick={() => archivo.current?.click()}
              className="h-11 rounded-xl bg-lima/20 text-marca text-sm font-semibold active:bg-lima/30">
              {f.logo ? 'Cambiar logo' : 'Subir logo'}
            </button>
            <button onClick={async () => { if (await confirmar({ titulo: '¿Quitar el logo?', texto: 'Las facturas saldrán sin logo.' })) setF(p => ({ ...p, logo: null, ver_logo: false })) }} disabled={!f.logo}
              className="h-11 rounded-xl bg-slate-100 text-slate-600 text-sm font-medium disabled:opacity-40">
              Quitar logo
            </button>
          </div>
        </div>
        <input ref={archivo} type="file" accept="image/png,image/jpeg,image/webp" onChange={elegirLogo} className="hidden" />
        <label className={`flex items-center gap-3 text-sm ${f.logo ? '' : 'opacity-40'}`}>
          <input type="checkbox" checked={Boolean(f.ver_logo && f.logo)} disabled={!f.logo}
                 onChange={e => setF(p => ({ ...p, ver_logo: e.target.checked }))}
                 className="h-5 w-5 accent-marca" />
          Mostrar el logo en la factura
        </label>
      </div>

      {aviso && (
        <p className={`text-sm rounded-lg px-3 py-2 ${aviso.tipo === 'ok' ? 'text-marca bg-lima/20' : 'text-red-600 bg-red-50'}`}>
          {aviso.texto}
        </p>
      )}

      {hayV20 && (
        <div className="bg-white rounded-2xl shadow-sm p-4 space-y-4">
          <div>
            <p className="text-sm font-semibold">Domicilio y pagos de los catálogos</p>
            <p className="text-xs text-slate-400">Todo es opcional: lo que dejes vacío no se muestra en el catálogo.</p>
          </div>
          {hayV26 && <p className="text-xs font-semibold text-slate-500">Tienda (/tienda)</p>}
          <div className="grid grid-cols-2 gap-3">
            <Campo etiqueta="Costo del domicilio ($)">
              <input value={f.domicilio_costo} onChange={poner('domicilio_costo')} inputMode="numeric" placeholder="Ej. 3000" className={claseInput} />
            </Campo>
            <Campo etiqueta="Envío gratis desde ($)">
              <input value={f.envio_gratis_desde} onChange={poner('envio_gratis_desde')} inputMode="numeric" placeholder="Ej. 40000" className={claseInput} />
            </Campo>
          </div>
          {hayV26 && (
            <>
              <p className="text-xs font-semibold text-slate-500">Ropa (/ropa)</p>
              <div className="grid grid-cols-2 gap-3">
                <Campo etiqueta="Costo del domicilio ($)">
                  <input value={f.domicilio_costo_ropa} onChange={poner('domicilio_costo_ropa')} inputMode="numeric" placeholder="Ej. 6000" className={claseInput} />
                </Campo>
                <Campo etiqueta="Envío gratis desde ($)">
                  <input value={f.envio_gratis_desde_ropa} onChange={poner('envio_gratis_desde_ropa')} inputMode="numeric" placeholder="Ej. 100000" className={claseInput} />
                </Campo>
              </div>
            </>
          )}
          <Campo etiqueta="Zona de domicilio (para los dos catálogos)">
            <input value={f.zona_domicilio} onChange={poner('zona_domicilio')} maxLength={160} placeholder="Ej. Puerto Colombia y barrios cercanos" className={claseInput} />
          </Campo>
          <Campo etiqueta="Formas de pago que aceptan">
            <input value={f.formas_pago_tienda} onChange={poner('formas_pago_tienda')} maxLength={160} placeholder="Ej. Efectivo, Nequi, pago contra entrega" className={claseInput} />
          </Campo>
        </div>
      )}

      {hayV20 && hayV37 && <DomicilioKmConfig f={f} setF={setF} poner={poner} conIncluidos={hayV42} guardadoKm={guardado.current !== null && JSON.parse(guardado.current).dom_modo === 'km'} />}

      <button onClick={guardar} disabled={guardando}
        className="w-full h-14 rounded-xl bg-marca text-white text-lg font-semibold disabled:opacity-40 active:bg-marca-oscuro">
        {guardando ? 'Guardando…' : 'Guardar datos'}
      </button>
    </div>
  )
}
