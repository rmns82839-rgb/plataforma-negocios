// Piezas de la cuenta del cliente que se ven en el catálogo:
//  · BarraCuenta: arriba del catálogo. Sin cuenta invita a registrarse; con cuenta muestra su avatar, su nombre y su dirección debajo.
//  · InvitacionRegistro: la misma invitación, en pequeño, dentro del pedido.
//  · EntregaGuardada: en el pedido, sus datos ya guardados (sin escribir nada) y cómo recibe.
import CarritoCorriendo from './CarritoCorriendo'
import AvatarCliente from './AvatarCliente'
import Icono from './Iconos'
import { primerNombre, fotoDeGoogle, textoEntrega, tieneUbicacion } from '../lib/cuentaVista'

const Linea = ({ children, clase = 'text-hueso/85' }) => (
  <span className={`grid grid-cols-[auto_1fr] gap-1.5 items-start text-sm pt-0.5 ${clase}`}>
    <Icono nombre="pin" className="h-4 w-4 mt-0.5" /><span className="break-words">{children}</span>
  </span>
)

export function BarraCuenta({ cuenta, onRegistrar, onAbrir, onTerminar }) {
  const { sesion, perfil, cargando, googleActivo } = cuenta
  if (cargando) return null

  if (!sesion) {
    if (googleActivo !== true) return null
    return (
      <section aria-label="Registro de cliente" className="max-w-2xl mx-auto w-full rounded-2xl bg-gradient-to-b from-cibus-profundo to-cibus-oscuro ring-1 ring-oro/40 overflow-hidden">
        <CarritoCorriendo alto={58} />
        <div className="px-4 pb-4 space-y-3 text-center">
          <p className="font-display text-2xl font-semibold text-champagne leading-tight">Compra más rápido</p>
          <p className="text-sm text-hueso/80">Regístrate una sola vez: tu dirección y tu ubicación quedan guardadas y no vuelves a escribir nada.</p>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={onRegistrar} className="min-h-12 rounded-xl bg-champagne text-negro text-base font-semibold active:opacity-90">Registrarme</button>
            <button type="button" onClick={() => cuenta.entrarConGoogle({ registro: true, alPedido: false })}
              className="min-h-12 rounded-xl ring-1 ring-champagne/60 text-champagne text-base font-semibold active:bg-white/10">Ya tengo cuenta</button>
          </div>
        </div>
      </section>
    )
  }

  if (!perfil) {
    return (
      <section aria-label="Termina tu registro" className="max-w-2xl mx-auto w-full rounded-2xl bg-cibus-profundo ring-1 ring-oro/40 p-3 grid grid-cols-[auto_1fr] gap-3 items-center">
        <AvatarCliente nombre={sesion.user?.user_metadata?.full_name || sesion.user?.email} foto={fotoDeGoogle(sesion)} tam={48} />
        <span className="min-w-0 space-y-2">
          <span className="block text-base font-semibold text-champagne leading-tight">Ya casi: termina tu registro</span>
          <button type="button" onClick={onTerminar} className="w-full min-h-11 rounded-xl bg-champagne text-negro text-base font-semibold active:opacity-90">Completar mis datos</button>
        </span>
      </section>
    )
  }

  return (
    <button type="button" onClick={onAbrir} aria-label="Abrir mi cuenta"
      className="max-w-2xl mx-auto w-full rounded-2xl bg-cibus-profundo ring-1 ring-oro/40 p-3 grid grid-cols-[auto_1fr_auto] gap-3 items-center text-left active:opacity-90">
      <AvatarCliente nombre={perfil.nombre} foto={fotoDeGoogle(sesion)} tam={52} />
      <span className="min-w-0">
        <span className="block text-lg font-semibold text-champagne leading-tight">Hola, {primerNombre(perfil.nombre)}</span>
        <Linea>{textoEntrega(perfil)}</Linea>
        {perfil.entrega_preferida !== 'recoger' && !tieneUbicacion(perfil) && (
          <span className="block text-xs font-semibold text-champagne pt-1">Marca tu puerta en el mapa y el domicilio se calcula solo</span>
        )}
      </span>
      <span className="text-sm font-semibold text-champagne">Mi cuenta ›</span>
    </button>
  )
}

export function InvitacionRegistro({ cuenta, onRegistrar }) {
  if (cuenta.cargando || cuenta.googleActivo !== true) return null
  if (cuenta.sesion) {
    return (
      <div className="rounded-2xl bg-slate-50 p-3 space-y-2">
        <p className="text-base font-semibold break-words">Termina tu registro</p>
        <p className="text-sm text-slate-600">Guarda tus datos y tu ubicación una vez y tus próximos pedidos se hacen en un toque.</p>
        <button type="button" onClick={onRegistrar} className="w-full min-h-12 rounded-xl bg-negro text-champagne text-base font-semibold active:opacity-90">Completar mis datos</button>
      </div>
    )
  }
  return (
    <div className="rounded-2xl bg-slate-50 p-3 space-y-2">
      <p className="text-base font-semibold break-words">¿Quieres comprar más rápido?</p>
      <p className="text-sm text-slate-600">Regístrate una sola vez: guardamos tu dirección y tu ubicación, y el domicilio se calcula solo. No es obligatorio.</p>
      <div className="grid grid-cols-2 gap-2">
        <button type="button" onClick={onRegistrar} className="min-h-12 rounded-xl bg-negro text-champagne text-base font-semibold active:opacity-90">Registrarme</button>
        <button type="button" onClick={() => cuenta.entrarConGoogle({ registro: true })}
          className="min-h-12 rounded-xl bg-white ring-1 ring-slate-300 text-slate-700 text-base font-semibold active:bg-slate-100">Ya tengo cuenta</button>
      </div>
    </div>
  )
}

export function EntregaGuardada({ cuenta, recoge, onEntrega, onAbrirCuenta, direccionTienda = '' }) {
  const { sesion, perfil } = cuenta
  return (
    <div className="rounded-2xl bg-slate-50 p-3 space-y-3">
      <div className="grid grid-cols-[auto_1fr] gap-3 items-center">
        <AvatarCliente nombre={perfil.nombre} foto={fotoDeGoogle(sesion)} tam={44} />
        <span className="min-w-0"><span className="block text-base font-semibold break-words">{perfil.nombre}</span><span className="block text-sm text-slate-500">{perfil.telefono}</span></span>
      </div>
      <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Cómo recibes este pedido">
        {[[false, 'moto', 'A domicilio'], [true, 'negocio', 'Recojo en la tienda']].map(([v, ic, t]) => (
          <button key={t} type="button" role="radio" aria-checked={recoge === v} onClick={() => onEntrega(v)}
            className={`min-h-14 rounded-xl px-2 grid grid-cols-[auto_1fr] gap-2 items-center justify-items-center text-base font-semibold leading-tight ring-2 ${recoge === v ? 'bg-cibus-profundo text-champagne ring-oro' : 'bg-white text-slate-700 ring-slate-200'}`}>
            <Icono nombre={ic} className="h-5 w-5" /><span>{t}</span>
          </button>
        ))}
      </div>
      {recoge ? (
        <p className="text-base text-slate-700">Te esperamos{direccionTienda ? <> en <b>{direccionTienda}</b></> : ' en la tienda'}.</p>
      ) : (
        <div className="space-y-0.5">
          <Linea clase="text-slate-700 text-base">{perfil.direccion}</Linea>
          {perfil.referencia && <p className="text-sm text-slate-500 pl-[1.375rem] break-words">{perfil.referencia}</p>}
        </div>
      )}
      <button type="button" onClick={onAbrirCuenta} className="w-full min-h-11 rounded-xl bg-white ring-1 ring-slate-200 text-slate-700 text-sm font-semibold active:bg-slate-100">Cambiar mis datos o mi dirección</button>
    </div>
  )
}
