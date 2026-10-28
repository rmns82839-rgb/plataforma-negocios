import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { ir } from '../lib/ruta'
import { Btn, Aviso, PiePlataforma } from '../tienda/ui'
import MarcaMatriz from '../tienda/MarcaMatriz'

const ROL = { dueno: 'Dueño', cajero: 'Cajero', soporte: 'Soporte (solo lectura)' }

export default function Inicio() {
  const [negocios, setNegocios] = useState(null)
  const [error, setError] = useState('')
  const [admin, setAdmin] = useState(false)
  const [pendientes, setPendientes] = useState(0)

  useEffect(() => {
    supabase.rpc('mis_negocios').then(({ data, error }) => {
      if (error) setError('No se pudieron cargar tus negocios'); else setNegocios(data)
    })
    supabase.rpc('soy_administrador_plataforma').then(({ data }) => {
      if (data !== true) return
      setAdmin(true)
      supabase.rpc('listar_solicitudes_negocio', { p_estado: 'pendiente' }).then(({ data: l }) => setPendientes(Array.isArray(l) ? l.length : 0))
    })
  }, [])

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8 text-lg">
      <div className="mb-8"><MarcaMatriz tamano={56} /></div>
      <div className="mb-6 flex items-center justify-between gap-3">
        <h1 className="text-3xl font-bold">Mis tiendas</h1>
        <div className="w-32"><Btn variante="suave" onClick={() => supabase.auth.signOut()}>Salir</Btn></div>
      </div>
      {admin && (
        <div className="mb-6">
          <Btn onClick={() => ir('/solicitudes')}>Solicitudes de negocios{pendientes > 0 ? ` (${pendientes} por revisar)` : ''}</Btn>
        </div>
      )}
      {error && <Aviso tipo="error">{error}</Aviso>}
      {!negocios && !error && <p className="py-10 text-center text-xl text-tinta/60">Cargando…</p>}
      {negocios?.length === 0 && !admin && <Aviso>Tu usuario todavía no está asociado a ninguna tienda. Pídele al administrador que te agregue.</Aviso>}
      <div className="grid gap-4 sm:grid-cols-2">
        {negocios?.map((n) => (
          <section key={n.negocio_id} className="flex flex-col justify-between gap-4 rounded-2xl border-2 border-black/5 bg-white p-5 shadow-sm">
            <div>
              <h2 className="break-words text-2xl font-bold leading-tight">{n.nombre_comercial}</h2>
              <p className="text-lg text-tinta/60">{ROL[n.rol] || n.rol}</p>
            </div>
            <Btn onClick={() => ir(`/t/${n.slug}/panel`)}>Abrir mi panel</Btn>
          </section>
        ))}
      </div>
      <PiePlataforma />
    </main>
  )
}
