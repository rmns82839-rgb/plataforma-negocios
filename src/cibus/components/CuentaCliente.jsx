// Cuenta del cliente dentro del pedido: entrar con Google, confirmar los datos guardados o cambiarlos.
import { useState } from 'react'

export default function CuentaCliente({ cuenta, recoge, editando, onEditar, onUsar }) {
  const { sesion, perfil, cargando, error, googleActivo, entrarConGoogle, salir, borrar } = cuenta
  const [borrando, setBorrando] = useState(false)
  const [seguro, setSeguro] = useState(false)
  if (cargando) return null

  if (!sesion && googleActivo !== true) return null     // sin Google activo no se ofrece nada: se compra normal

  if (!sesion) return (
    <div className="rounded-2xl bg-slate-50 p-3 space-y-2">
      <p className="text-base font-semibold break-words">¿Quieres comprar más rápido?</p>
      <p className="text-sm text-slate-600">Entra una sola vez con Google y guardamos tu nombre, celular y dirección. En tus próximos pedidos solo confirmas y el domicilio se calcula solo. No es obligatorio.</p>
      <button onClick={entrarConGoogle}
        className="w-full min-h-12 rounded-xl bg-white ring-1 ring-slate-300 text-slate-700 text-base font-semibold px-2 leading-tight active:bg-slate-100">
        Entrar con Google
      </button>
      {error && <p className="text-sm text-red-600 break-words">{error}</p>}
    </div>
  )

  const quitar = async () => {
    setBorrando(true); await borrar(); setBorrando(false); setSeguro(false); onEditar(false)
  }

  if (perfil && !editando) return (
    <div className="rounded-2xl bg-slate-50 p-3 space-y-3">
      <p className="text-sm font-semibold break-words">Confirma tus datos</p>
      <div className="rounded-xl bg-white ring-1 ring-slate-200 p-3 space-y-1 text-sm break-words">
        <p className="font-semibold">{perfil.nombre}</p>
        <p className="text-slate-600">{perfil.telefono}</p>
        {!recoge && <p className="text-slate-600">{perfil.direccion || <span className="text-red-600">Falta tu dirección: toca Cambiar</span>}</p>}
        {perfil.referencia && <p className="text-sm text-slate-500">{perfil.referencia}</p>}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <button onClick={() => onEditar(true)} className="min-h-11 rounded-xl bg-white ring-1 ring-slate-200 text-slate-700 text-sm font-semibold active:bg-slate-100">Cambiar</button>
        <button onClick={salir} className="min-h-11 rounded-xl bg-white ring-1 ring-slate-200 text-slate-500 text-sm font-medium active:bg-slate-100">Cerrar sesión</button>
      </div>
      {!seguro ? (
        <button onClick={() => setSeguro(true)} className="w-full text-sm text-slate-500 underline">Borrar mis datos guardados</button>
      ) : (
        <div className="rounded-xl bg-red-50 p-3 space-y-2">
          <p className="text-sm text-red-700 break-words">Se borra tu perfil de esta tienda. Tus pedidos anteriores no se tocan. ¿Seguro?</p>
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => setSeguro(false)} className="min-h-11 rounded-xl bg-white ring-1 ring-slate-200 text-slate-600 text-sm font-medium">← Volver</button>
            <button onClick={quitar} disabled={borrando} className="min-h-11 rounded-xl bg-red-600 text-white text-sm font-semibold disabled:opacity-40">{borrando ? 'Borrando…' : 'Sí, borrar'}</button>
          </div>
        </div>
      )}
    </div>
  )

  return (
    <div className="rounded-2xl bg-slate-50 p-3 space-y-2">
      <p className="text-sm text-slate-600 break-words">Sesión iniciada{sesion.user?.email ? ` con ${sesion.user.email}` : ''}. {perfil ? 'Cambia tus datos abajo: se guardan al enviar el pedido.' : 'Llena tus datos una vez: se guardan al enviar el pedido y la próxima vez solo confirmas.'}</p>
      <div className="grid grid-cols-2 gap-2">
        {perfil ? <button onClick={() => onUsar()} className="min-h-11 rounded-xl bg-white ring-1 ring-slate-200 text-slate-700 text-sm font-semibold active:bg-slate-100">Usar los guardados</button> : <span />}
        <button onClick={salir} className="min-h-11 rounded-xl bg-white ring-1 ring-slate-200 text-slate-500 text-sm font-medium active:bg-slate-100">Cerrar sesión</button>
      </div>
    </div>
  )
}
