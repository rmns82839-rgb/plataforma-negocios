import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { aplicarMarca, quitarMarca } from '../lib/marca'
import { ir } from '../lib/ruta'
import { Pagina, Tarjeta, Boton, Volver, Mensaje, Cargando } from './Piezas'
import Login from './Login'
import { useSesion } from '../lib/sesion'

const ROL = { dueno: 'Dueño', cajero: 'Cajero', soporte: 'Soporte · solo lectura' }
const MODULO = {
  caja: 'Caja y ventas', productos: 'Productos e inventario', ropa: 'Ropa: prendas y tallas', fiados: 'Fiados y mora',
  compras: 'Compras y gastos', reportes: 'Reportes y tablero', domicilios: 'Domicilios', catalogo_publico: 'Catálogo público',
  pedidos_en_linea: 'Pedidos en línea', publicidad: 'Anuncios, ofertas y promociones', escaner: 'Escáner por celular',
  prestamos: 'Préstamos con interés', repuestos: 'Repuestos: referencias y compatibilidad',
}

export default function Panel({ slug }) {
  const sesion = useSesion()
  const [datos, setDatos] = useState(undefined)   // { negocio, rol, modulos }
  const [avisos, setAvisos] = useState([])

  useEffect(() => {
    if (!sesion) return
    let vivo = true
    ;(async () => {
      const { data: mios } = await supabase.rpc('mis_negocios')
      const m = (mios || []).find((x) => x.slug === slug)
      if (!m) { if (vivo) setDatos(null); return }
      const { data: pub } = await supabase.rpc('negocio_publico', { p_slug: slug })
      if (!vivo) return
      if (pub) aplicarMarca(pub)
      setDatos({ negocio: m, rol: m.rol, modulos: pub?.modulos || [], marca: pub })
      supabase.rpc('registrar_acceso', { p_negocio_id: m.negocio_id, p_detalle: 'Panel' })
      if (m.rol === 'dueno') {
        const { data: av } = await supabase.rpc('accesos_pendientes', { p_negocio_id: m.negocio_id })
        if (vivo) setAvisos(av || [])
      }
    })()
    return () => { vivo = false; quitarMarca() }
  }, [sesion, slug])

  if (sesion === undefined) return <Cargando />
  if (!sesion) return <Login titulo="Acceso del personal" />
  if (datos === undefined) return <Cargando />
  if (datos === null) {
    return (
      <Pagina>
        <Volver onClick={() => ir('/')} texto="Mis negocios" />
        <Mensaje>No tienes acceso a este negocio.</Mensaje>
      </Pagina>
    )
  }

  async function entendido() {
    await supabase.rpc('marcar_accesos_vistos', { p_negocio_id: datos.negocio.negocio_id })
    setAvisos([])
  }

  return (
    <Pagina>
      <Volver onClick={() => ir('/')} texto="Mis negocios" />
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-principal">{datos.negocio.nombre_comercial}</h1>
          <p className="text-sm text-tinta/60">{ROL[datos.rol]}</p>
        </div>
        <Boton variante="suave" onClick={() => supabase.auth.signOut()}>Salir</Boton>
      </header>

      {avisos.length > 0 && (
        <Tarjeta className="mb-4 border-secundario/40">
          <p className="mb-3 text-sm">
            El soporte de la plataforma entró a consultar tu negocio ({avisos.length} {avisos.length === 1 ? 'vez' : 'veces'}).
            Solo puede ver, no modificar.
          </p>
          <Boton variante="suave" onClick={entendido}>Entendido</Boton>
        </Tarjeta>
      )}

      <Tarjeta>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-tinta/50">Módulos activos</h2>
        <ul className="grid gap-2 sm:grid-cols-2">
          {datos.modulos.map((k) => (
            <li key={k} className="rounded-xl border border-black/5 bg-papel px-4 py-3 text-sm">{MODULO[k] || k}</li>
          ))}
        </ul>
        <p className="mt-4 text-xs text-tinta/50">
          Esta es la base de la plataforma (etapa 2). Las pantallas de cada módulo se traen de Matriz en los siguientes pasos.
        </p>
      </Tarjeta>
    </Pagina>
  )
}
