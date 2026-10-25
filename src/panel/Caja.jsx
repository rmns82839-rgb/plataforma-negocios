import { useState } from 'react'
import { Volver } from '../tienda/ui'
import { Titulo, Opciones, SoloLectura } from './piezas'
import CajaVender from './CajaVender'
import CajaDia from './CajaDia'

export default function Caja({ ctx, volver }) {
  const [vista, setVista] = useState('vender')
  const [refresco, setRefresco] = useState(0)
  const ir = (v) => { if (v === 'dia') setRefresco((n) => n + 1); setVista(v) }
  return (
    <div>
      <Volver onClick={volver} texto="Volver al panel" />
      <Titulo>Caja</Titulo>
      {ctx.soloLectura && <SoloLectura />}
      <div className="mb-5"><Opciones valor={vista} opciones={[['vender', 'Vender'], ['dia', 'Resumen del día']]} onChange={ir} /></div>
      {/* La venta en curso se conserva al mirar el resumen: por eso las dos pantallas siguen montadas */}
      <div hidden={vista !== 'vender'}><CajaVender ctx={ctx} irAlDia={() => ir('dia')} /></div>
      {vista === 'dia' && <CajaDia key={refresco} ctx={ctx} />}
    </div>
  )
}
