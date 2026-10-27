// Formulario de datos del cliente para finalizar un pedido (ropa y tienda).
// Pide nombre, celular, dirección (obligatorios), correo y nota (opcionales)
// y el consentimiento: obligatorio para el tratamiento de datos, opcional para promociones.
import { claseInput } from '../lib/estilos'
import { Campo } from './Modal'

export default function DatosPedido({ datos, onCambio, recoge = false, direccionTienda = '' }) {
  const poner = (k) => (e) => onCambio({ ...datos, [k]: e.target.value })
  const marcar = (k) => (e) => onCambio({ ...datos, [k]: e.target.checked })
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <Campo etiqueta="Nombre completo *">
          <input value={datos.nombre} onChange={poner('nombre')} maxLength={80} autoComplete="name" placeholder="Ana Pérez" className={claseInput} />
        </Campo>
        <Campo etiqueta="Celular / WhatsApp *">
          <input value={datos.telefono} onChange={poner('telefono')} maxLength={20} inputMode="tel" autoComplete="tel" placeholder="300 123 4567" className={claseInput} />
        </Campo>
      </div>
      {recoge ? (
        <div className="rounded-xl bg-champagne/20 px-4 py-3 text-sm text-slate-600">
          <b className="text-negro">Recoges en la tienda.</b> No necesitamos tu dirección.{direccionTienda ? <> Te esperamos en <b>{direccionTienda}</b>.</> : null}
        </div>
      ) : (
        <Campo etiqueta="Dirección de entrega *">
          <input value={datos.direccion} onChange={poner('direccion')} maxLength={160} autoComplete="street-address" placeholder="Calle 10 # 5-20, barrio, ciudad" className={claseInput} />
        </Campo>
      )}
      <div className="grid grid-cols-2 gap-3">
        <Campo etiqueta="Correo (opcional)">
          <input value={datos.email} onChange={poner('email')} maxLength={120} type="email" inputMode="email" autoComplete="email" placeholder="tucorreo@mail.com" className={claseInput} />
        </Campo>
        <Campo etiqueta="Nota (opcional)">
          <input value={datos.nota} onChange={poner('nota')} maxLength={200} placeholder="Timbre, torre, referencia…" className={claseInput} />
        </Campo>
      </div>

      <label className="grid grid-cols-[1.5rem_1fr] gap-3 items-start text-sm text-slate-700 leading-snug">
        <input type="checkbox" checked={datos.acepta_datos} onChange={marcar('acepta_datos')} className="h-5 w-5 mt-0.5 accent-[#0b0b0b]" />
        <span>
          Autorizo el tratamiento de mis datos personales para gestionar este pedido, según la{' '}
          <a href="/privacidad" target="_blank" rel="noopener noreferrer" className="underline font-medium text-oro-oscuro">política de tratamiento de datos</a>
          {' '}y los{' '}
          <a href="/terminos" target="_blank" rel="noopener noreferrer" className="underline font-medium text-oro-oscuro">términos</a>. *
        </span>
      </label>
      <label className="grid grid-cols-[1.5rem_1fr] gap-3 items-start text-sm text-slate-700 leading-snug">
        <input type="checkbox" checked={datos.acepta_promos} onChange={marcar('acepta_promos')} className="h-5 w-5 mt-0.5 accent-[#0b0b0b]" />
        <span>Quiero recibir promociones y novedades por WhatsApp o correo (opcional; puedes retirarte cuando quieras).</span>
      </label>
    </div>
  )
}
