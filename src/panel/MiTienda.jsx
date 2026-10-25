import { useEffect, useState } from 'react'
import { supabase, urlImagen } from '../lib/supabase'
import { reducirImagen, nombreArchivo } from '../lib/imagen'
import { mensajeError } from '../lib/errores'
import { Btn, Volver, Aviso, Campo, Logo, clsInput } from '../tienda/ui'
import { Titulo, Seccion, Insignia, SoloLectura } from './piezas'

const num = (t) => (String(t).trim() === '' ? null : Number(String(t).replace(/[$.\s]/g, '').replace(',', '.')))

export default function MiTienda({ ctx, volver }) {
  const nid = ctx.neg.negocio_id
  const [c, setC] = useState(null)
  const [r, setR] = useState(null)
  const [pub, setPub] = useState(null)
  const [msg, setMsg] = useState({})        // por sección: { tipo, texto }
  const [guardando, setGuardando] = useState('')
  const [subiendo, setSubiendo] = useState(false)
  const lectura = ctx.soloLectura

  async function cargar() {
    const [a, b, p] = await Promise.all([
      supabase.from('negocio_config').select('nombre_comercial,eslogan,whatsapp,telefono,horario,direccion,ciudad,instagram,facebook,maps_url,logo_path,color_principal,color_secundario,color_acento').eq('negocio_id', nid).single(),
      supabase.from('negocio_reglas').select('domicilio_costo,envio_gratis_desde,zona_domicilio,formas_pago_tienda').eq('negocio_id', nid).single(),
      supabase.rpc('estado_publicacion', { p_negocio_id: nid }),
    ])
    if (a.error) return setMsg({ _: { tipo: 'error', texto: mensajeError(a.error) } })
    setC({ ...a.data, ...Object.fromEntries(Object.entries(a.data).map(([k, v]) => [k, v ?? ''])), logo_path: a.data.logo_path })
    setR({ domicilio_costo: b.data?.domicilio_costo ?? '', envio_gratis_desde: b.data?.envio_gratis_desde ?? '', zona_domicilio: b.data?.zona_domicilio ?? '', formas_pago_tienda: b.data?.formas_pago_tienda ?? '' })
    setPub(p.data)
  }
  useEffect(() => { cargar() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function guardarSeccion(clave, tabla, cambio) {
    setGuardando(clave); setMsg({})
    const { data, error } = await supabase.from(tabla).update(cambio).eq('negocio_id', nid).select('negocio_id')
    setGuardando('')
    if (error) return setMsg({ [clave]: { tipo: 'error', texto: mensajeError(error) } })
    if (!data?.length) return setMsg({ [clave]: { tipo: 'error', texto: 'No tienes permiso para cambiar esto.' } })
    setMsg({ [clave]: { tipo: 'ok', texto: 'Guardado.' } })
    const p = await supabase.rpc('estado_publicacion', { p_negocio_id: nid }); setPub(p.data)
  }

  const nulo = (t) => (String(t).trim() === '' ? null : String(t).trim())
  const datos = () => guardarSeccion('datos', 'negocio_config', {
    nombre_comercial: c.nombre_comercial.trim(), eslogan: nulo(c.eslogan), whatsapp: nulo(c.whatsapp), telefono: nulo(c.telefono), horario: nulo(c.horario),
    direccion: nulo(c.direccion), ciudad: nulo(c.ciudad), instagram: nulo(c.instagram), facebook: nulo(c.facebook), maps_url: nulo(c.maps_url),
  })
  const colores = () => guardarSeccion('colores', 'negocio_config', { color_principal: c.color_principal, color_secundario: c.color_secundario, color_acento: c.color_acento })
  const domicilio = () => guardarSeccion('domicilio', 'negocio_reglas', {
    domicilio_costo: num(r.domicilio_costo), envio_gratis_desde: num(r.envio_gratis_desde), zona_domicilio: nulo(r.zona_domicilio), formas_pago_tienda: nulo(r.formas_pago_tienda),
  })

  async function subirLogo(e) {
    const a = e.target.files?.[0]; e.target.value = ''
    if (!a) return
    setSubiendo(true); setMsg({})
    try {
      const blob = await reducirImagen(a, 600)
      const ruta = `${nid}/marca/logo-${nombreArchivo()}`
      const { error } = await supabase.storage.from('negocios').upload(ruta, blob, { contentType: 'image/webp' })
      if (error) throw error
      const { error: e2 } = await supabase.from('negocio_config').update({ logo_path: ruta, icono_path: ruta }).eq('negocio_id', nid)
      if (e2) throw e2
      setC({ ...c, logo_path: ruta }); setMsg({ logo: { tipo: 'ok', texto: 'Logo guardado.' } })
    } catch (x) { setMsg({ logo: { tipo: 'error', texto: mensajeError(x) } }) }
    setSubiendo(false)
  }
  async function quitarLogo() {
    const { error } = await supabase.from('negocio_config').update({ logo_path: null, icono_path: null }).eq('negocio_id', nid)
    if (error) return setMsg({ logo: { tipo: 'error', texto: mensajeError(error) } })
    setC({ ...c, logo_path: null }); setMsg({ logo: { tipo: 'ok', texto: 'Ahora tu tienda usa la inicial de tu nombre como logo.' } })
  }

  async function pedir() {
    setGuardando('pub'); setMsg({})
    const { data, error } = await supabase.rpc('pedir_publicacion', { p_negocio_id: nid })
    setGuardando('')
    if (error) return setMsg({ pub: { tipo: 'error', texto: mensajeError(error) } })
    setPub(data); setMsg({ pub: { tipo: 'ok', texto: 'Listo. Pedimos publicar tu tienda; te avisamos cuando esté abierta.' } })
  }

  const M = ({ k }) => (msg[k] ? <div className="mt-3"><Aviso tipo={msg[k].tipo}>{msg[k].texto}</Aviso></div> : null)
  const set = (k) => (e) => setC({ ...c, [k]: e.target.value })
  const setR2 = (k) => (e) => setR({ ...r, [k]: e.target.value })
  const logoVista = { nombre: c?.nombre_comercial, logo: c?.logo_path, logo_auto: { inicial: (c?.nombre_comercial || '?').trim().charAt(0).toUpperCase(), color: c?.color_principal } }

  if (!c || !r) return <div><Volver onClick={volver} texto="Volver al panel" />{msg._ ? <Aviso tipo="error">{msg._.texto}</Aviso> : <p className="py-8 text-center text-xl text-tinta/60">Cargando…</p>}</div>

  return (
    <div className="pb-6">
      <Volver onClick={volver} texto="Volver al panel" />
      <Titulo>Mi tienda</Titulo>
      {lectura && <SoloLectura />}

      <Seccion titulo="Publicar mi tienda">
        {pub?.publicada
          ? <><Insignia tono="verde">Tu tienda está publicada</Insignia><p className="mt-3 break-all text-lg">Dirección para tus clientes: <b>{window.location.origin}/t/{ctx.neg.slug}</b></p></>
          : <>
              {pub?.solicitada_en ? <Aviso tipo="ok">Ya pedimos publicar tu tienda. Te avisamos cuando esté abierta.</Aviso> : (
                <>
                  <p className="mb-3 text-lg">Mientras no esté publicada, solo tú y el soporte la ven.</p>
                  {pub?.faltantes?.length > 0 && <ul className="mb-3 list-disc space-y-1 pl-6 text-lg">{pub.faltantes.map((f) => <li key={f}>{f}</li>)}</ul>}
                  {!lectura && <Btn disabled={guardando === 'pub' || !pub?.lista} onClick={pedir}>Pedir que publiquen mi tienda</Btn>}
                </>
              )}
            </>}
        <M k="pub" />
        <div className="mt-3"><a href={`/t/${ctx.neg.slug}`} target="_blank" rel="noopener noreferrer" className="flex min-h-[56px] items-center justify-center rounded-2xl border-2 border-principal/30 text-lg font-semibold text-principal">Ver mi tienda como la ve el cliente</a></div>
      </Seccion>

      <fieldset disabled={lectura} className="contents">
        <Seccion titulo="Logo">
          <div className="mb-3 flex justify-center"><Logo n={logoVista} tamano={96} /></div>
          <p className="mb-3 text-center text-lg text-tinta/70">{c.logo_path ? 'Este es tu logo.' : 'Sin logo, usamos la inicial de tu nombre sobre el color de tu tienda.'}</p>
          {!lectura && <div className="grid gap-3">
            <label className="flex min-h-[56px] w-full cursor-pointer items-center justify-center rounded-2xl border-2 border-dashed border-principal/40 text-lg font-semibold text-principal">
              {subiendo ? 'Subiendo…' : c.logo_path ? 'Cambiar el logo' : 'Subir mi logo'}
              <input type="file" accept="image/*" className="hidden" onChange={subirLogo} disabled={subiendo} />
            </label>
            {c.logo_path && <Btn variante="suave" onClick={quitarLogo}>Quitar el logo</Btn>}
          </div>}
          <M k="logo" />
        </Seccion>

        <Seccion titulo="Datos de la tienda">
          <div className="space-y-5">
            <Campo etiqueta="Nombre de la tienda"><input className={clsInput} value={c.nombre_comercial} onChange={set('nombre_comercial')} maxLength={120} /></Campo>
            <Campo etiqueta="Frase corta (opcional)"><input className={clsInput} value={c.eslogan} onChange={set('eslogan')} maxLength={120} /></Campo>
            <Campo etiqueta="WhatsApp de la tienda" ayuda="10 dígitos. Aquí llegan los pedidos."><input className={clsInput} inputMode="tel" value={c.whatsapp} onChange={set('whatsapp')} /></Campo>
            <Campo etiqueta="Otro teléfono (opcional)"><input className={clsInput} inputMode="tel" value={c.telefono} onChange={set('telefono')} /></Campo>
            <Campo etiqueta="Horario"><input className={clsInput} value={c.horario} onChange={set('horario')} maxLength={200} placeholder="Lun a sáb 7am–8pm" /></Campo>
            <Campo etiqueta="Dirección"><input className={clsInput} value={c.direccion} onChange={set('direccion')} /></Campo>
            <Campo etiqueta="Ciudad"><input className={clsInput} value={c.ciudad} onChange={set('ciudad')} /></Campo>
            <Campo etiqueta="Instagram (opcional)"><input className={clsInput} value={c.instagram} onChange={set('instagram')} /></Campo>
            <Campo etiqueta="Facebook (opcional)"><input className={clsInput} value={c.facebook} onChange={set('facebook')} /></Campo>
            <Campo etiqueta="Enlace de Google Maps (opcional)"><input className={clsInput} value={c.maps_url} onChange={set('maps_url')} /></Campo>
          </div>
          {!lectura && <div className="mt-4"><Btn disabled={guardando === 'datos' || c.nombre_comercial.trim().length < 2} onClick={datos}>{guardando === 'datos' ? 'Guardando…' : 'Guardar datos'}</Btn></div>}
          <M k="datos" />
        </Seccion>

        <Seccion titulo="Colores">
          <div className="space-y-4">
            {[['color_principal', 'Color principal (botones y títulos)'], ['color_acento', 'Color de acento'], ['color_secundario', 'Color de detalles']].map(([k, t]) => (
              <Campo key={k} etiqueta={t}>
                <div className="grid grid-cols-[72px_1fr] gap-3">
                  <input type="color" value={c[k]} onChange={set(k)} className="h-14 w-full rounded-2xl border-2 border-black/15 bg-white p-1" aria-label={t} />
                  <input className={clsInput} value={c[k]} onChange={set(k)} maxLength={7} />
                </div>
              </Campo>
            ))}
          </div>
          <p className="mt-3 text-lg text-tinta/70">Elige colores oscuros para el principal y el acento: así las letras blancas se leen bien.</p>
          {!lectura && <div className="mt-4"><Btn disabled={guardando === 'colores'} onClick={colores}>{guardando === 'colores' ? 'Guardando…' : 'Guardar colores'}</Btn></div>}
          <M k="colores" />
        </Seccion>

        <Seccion titulo="Domicilio y pagos">
          <div className="space-y-5">
            <Campo etiqueta="Costo del domicilio ($)" ayuda="Déjalo vacío si no cobras domicilio."><input className={clsInput} inputMode="numeric" value={r.domicilio_costo} onChange={setR2('domicilio_costo')} /></Campo>
            <Campo etiqueta="Domicilio sin costo desde ($)" ayuda="Compras iguales o mayores a este valor no pagan domicilio. Vacío = siempre se cobra."><input className={clsInput} inputMode="numeric" value={r.envio_gratis_desde} onChange={setR2('envio_gratis_desde')} /></Campo>
            <Campo etiqueta="Zona donde entregas"><input className={clsInput} value={r.zona_domicilio} onChange={setR2('zona_domicilio')} maxLength={160} placeholder="Todo Puerto Colombia" /></Campo>
            <Campo etiqueta="Formas de pago que aceptas"><input className={clsInput} value={r.formas_pago_tienda} onChange={setR2('formas_pago_tienda')} maxLength={160} placeholder="Efectivo, Nequi, transferencia" /></Campo>
          </div>
          {!lectura && <div className="mt-4"><Btn disabled={guardando === 'domicilio'} onClick={domicilio}>{guardando === 'domicilio' ? 'Guardando…' : 'Guardar domicilio y pagos'}</Btn></div>}
          <M k="domicilio" />
        </Seccion>
      </fieldset>
    </div>
  )
}
