// Botón "Instalar app" + modal de instalación.
// Solo existen mientras la app NO esté instalada: al instalarla desaparecen.
//  - Android / Chrome / Edge: usa el diálogo nativo de instalación.
//  - iPhone / iPad: no hay diálogo nativo, se muestran los pasos manuales.
import { useState, useSyncExternalStore } from 'react'
import Modal from './Modal'
import Icono from './Iconos'
import { suscribir, obtenerEstado, instalar, esIOS } from '../lib/instalar'

const NOMBRE = import.meta.env.VITE_NOMBRE_TIENDA || 'Matriz'
const CLAVE = 'instalar-descartado'
const TRES_DIAS = 3 * 24 * 60 * 60 * 1000

const recienDescartado = () => {
  try { return Date.now() - Number(localStorage.getItem(CLAVE) || 0) < TRES_DIAS } catch { return false }
}
const recordarDescarte = () => {
  try { localStorage.setItem(CLAVE, String(Date.now())) } catch { /* modo privado */ }
}

export default function InstalarApp({ boton = true, auto = true, texto = 'Instalar app', clase = 'h-9 px-3 rounded-full', icono = false }) {
  const { evento, instalada } = useSyncExternalStore(suscribir, obtenerEstado)
  const ios = esIOS()
  const disponible = !instalada && (Boolean(evento) || ios)
  // El modal sale solo, salvo que lo hayan cerrado hace menos de 3 días
  const [abierto, setAbierto] = useState(() => auto && !recienDescartado())

  if (!disponible) return null

  const cerrar = () => { recordarDescarte(); setAbierto(false) }
  const alInstalar = async () => { await instalar(); setAbierto(false) }

  return (
    <>
      {boton && (
        <button onClick={() => setAbierto(true)}
          className={`${clase} bg-champagne text-negro text-xs font-semibold active:bg-champagne-claro inline-flex items-center justify-center gap-2`}>
          {icono && <Icono nombre="instalar" className="h-4 w-4" />}{texto}
        </button>
      )}

      {abierto && (
        <Modal titulo={`Instala ${NOMBRE}`} onCerrar={cerrar}>
          <div className="flex items-center gap-4">
            <img src="/icon-192.png" alt="" className="h-16 w-16 rounded-2xl shadow shrink-0" />
            <p className="text-sm text-slate-500">
              Ábrela como una app desde tu pantalla de inicio: más rápida, a pantalla
              completa y sin la barra del navegador.
            </p>
          </div>

          {evento ? (
            <div className="grid grid-cols-2 gap-3">
              <button onClick={cerrar}
                className="h-12 rounded-xl bg-slate-100 text-slate-600 font-medium">
                Ahora no
              </button>
              <button onClick={alInstalar}
                className="h-12 rounded-xl bg-marca text-white font-semibold active:bg-marca-oscuro">
                Instalar
              </button>
            </div>
          ) : (
            <>
              <ol className="space-y-2 text-sm text-slate-600 list-decimal pl-5">
                <li>Toca el botón <b>Compartir</b> (el cuadro con la flecha hacia arriba) en la barra de Safari.</li>
                <li>Elige <b>Añadir a pantalla de inicio</b>.</li>
                <li>Toca <b>Añadir</b>. El ícono queda en tu pantalla.</li>
              </ol>
              <button onClick={cerrar}
                className="w-full h-12 rounded-xl bg-marca text-white font-semibold active:bg-marca-oscuro">
                Entendido
              </button>
            </>
          )}
        </Modal>
      )}
    </>
  )
}
