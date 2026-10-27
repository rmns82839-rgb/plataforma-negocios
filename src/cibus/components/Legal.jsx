// Páginas legales públicas: /privacidad (tratamiento de datos, Ley 1581 de 2012) y /terminos.
// Texto base armado con los datos de "Mi negocio". Debe revisarlo un abogado antes de darlo por definitivo.
import Marca from './Marca'
import { useNegocioPublico } from '../lib/useNegocioPublico'

const Sec = ({ t, children }) => (
  <section className="space-y-2">
    <h2 className="font-display text-xl font-semibold text-negro">{t}</h2>
    <div className="text-sm text-slate-600 leading-relaxed space-y-2">{children}</div>
  </section>
)

function Privacidad({ n }) {
  const resp = n.razon_social || n.nombre || 'el titular de la tienda'
  const canal = n.correo_datos || n.email
  return (
    <>
      <Sec t="1. Responsable del tratamiento">
        <p><b>{resp}</b>{n.nit ? `, NIT ${n.nit}` : ''}{n.direccion ? `, ubicada en ${n.direccion}${n.ciudad ? ', ' + n.ciudad : ''}` : ''}, es la responsable del tratamiento de tus datos personales (en adelante, “la Tienda”, que opera bajo las marcas Matriz y Tienda Cibus).</p>
        {(canal || n.telefono) && <p>Contacto para temas de datos: {[canal, n.telefono].filter(Boolean).join(' · ')}.</p>}
      </Sec>
      <Sec t="2. Datos que recolectamos">
        <p>Cuando haces un pedido te pedimos: nombre, número de celular, dirección de entrega, correo electrónico (opcional) y una nota (opcional). Además guardamos el contenido del pedido y su fecha.</p>
        <p>No recolectamos datos sensibles ni de menores de edad. Si eres menor, no uses este servicio sin tu representante legal.</p>
      </Sec>
      <Sec t="3. Para qué usamos tus datos">
        <ul className="list-disc pl-5 space-y-1">
          <li>Gestionar, confirmar, alistar y entregar tu pedido, y contactarte por WhatsApp o llamada si hay novedades.</li>
          <li>Llevar el registro de nuestros clientes y la facturación o garantías que correspondan.</li>
          <li>Solo si lo autorizaste de forma expresa: enviarte promociones, ofertas y novedades por WhatsApp o correo.</li>
        </ul>
      </Sec>
      <Sec t="4. Tus derechos">
        <p>Como titular puedes conocer, actualizar y rectificar tus datos; pedir prueba de la autorización; ser informado del uso que se les da; presentar quejas ante la Superintendencia de Industria y Comercio (SIC); revocar la autorización o solicitar la supresión de tus datos cuando no exista un deber legal de conservarlos; y acceder gratuitamente a ellos (Ley 1581 de 2012 y Decreto 1377 de 2013).</p>
        <p>Para ejercerlos escríbenos{canal ? ` a ${canal}` : ' por nuestros canales de contacto'}. Atenderemos consultas en máximo 10 días hábiles y reclamos en máximo 15 días hábiles.</p>
      </Sec>
      <Sec t="5. Promociones">
        <p>La autorización para promociones es opcional y no afecta tu pedido. Puedes retirarla en cualquier momento respondiendo “BAJA” al mensaje recibido o escribiéndonos.</p>
      </Sec>
      <Sec t="6. Seguridad y terceros">
        <p>Tus datos se almacenan en servidores seguros con acceso restringido al personal autorizado. No los vendemos. Solo los compartimos con proveedores tecnológicos necesarios para operar el servicio (alojamiento y mensajería) o cuando una autoridad lo exija.</p>
      </Sec>
      <Sec t="7. Vigencia">
        <p>Conservamos tus datos mientras mantengamos relación comercial contigo o mientras la ley lo exija. Esta política puede actualizarse; la versión vigente es la publicada en esta página (versión v1).</p>
      </Sec>
    </>
  )
}

function Terminos({ n }) {
  const resp = n.razon_social || n.nombre || 'la Tienda'
  return (
    <>
      <Sec t="1. Quiénes somos">
        <p>Este catálogo es operado por <b>{resp}</b>{n.nit ? ` (NIT ${n.nit})` : ''}. Al enviar un pedido aceptas estos términos.</p>
      </Sec>
      <Sec t="2. Pedidos">
        <p>Un pedido enviado por el catálogo es una solicitud de compra. Se confirma cuando la Tienda te contacta por WhatsApp o llamada. Los productos están sujetos a disponibilidad de inventario.</p>
      </Sec>
      <Sec t="3. Precios y promociones">
        <p>Los precios están en pesos colombianos (COP). Las promociones aplican mientras estén vigentes y hasta agotar existencias; no son acumulables salvo que se indique. El total final es el calculado al enviar el pedido y puede incluir el costo del domicilio, que se informa antes de pagar.</p>
      </Sec>
      <Sec t="4. Pago y entrega">
        <p>Las formas de pago y los tiempos de entrega se acuerdan al confirmar el pedido. Debes dar una dirección y un número de contacto correctos; la Tienda no responde por demoras causadas por datos errados.</p>
      </Sec>
      <Sec t="5. Cambios y devoluciones">
        <p>En ropa, aceptamos cambios por talla o defecto de fábrica dentro del plazo que te informemos al momento de la compra, con la prenda sin uso y con sus etiquetas. Por su naturaleza, los productos perecederos solo se cambian si llegan en mal estado. Tus derechos como consumidor (Ley 1480 de 2011) se mantienen en todo caso.</p>
      </Sec>
      <Sec t="6. Datos personales">
        <p>El tratamiento de tus datos se rige por nuestra <a href="/privacidad" className="underline text-oro-oscuro">política de tratamiento de datos</a>.</p>
      </Sec>
      <Sec t="7. Contacto">
        <p>{[n.telefono, n.email].filter(Boolean).join(' · ') || 'Escríbenos por WhatsApp.'}</p>
      </Sec>
    </>
  )
}

export default function Legal({ tipo }) {
  const n = useNegocioPublico() ?? {}
  const privacidad = tipo === 'privacidad'
  return (
    <>
      <header className="bg-negro px-4 pt-[calc(1.25rem+env(safe-area-inset-top))] pb-5 text-center">
        <Marca tam="sm" />
      </header>
      <main className="max-w-2xl mx-auto p-5 lg:py-10 space-y-6">
        <button onClick={() => (window.history.length > 1 ? window.history.back() : (window.location.href = '/tienda'))}
          className="h-10 px-4 rounded-xl bg-slate-100 text-sm text-slate-600 active:bg-slate-200">← Volver</button>
        <h1 className="font-display text-3xl font-semibold text-negro">
          {privacidad ? 'Política de tratamiento de datos personales' : 'Términos y condiciones'}
        </h1>
        {privacidad ? <Privacidad n={n} /> : <Terminos n={n} />}
        <p className="text-xs text-slate-400 pt-4">Última actualización: {new Date().toLocaleDateString('es-CO', { month: 'long', year: 'numeric' })}.</p>
      </main>
    </>
  )
}
