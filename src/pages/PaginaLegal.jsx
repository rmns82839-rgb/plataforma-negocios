// Páginas legales de la PLATAFORMA (no de cada tienda): /privacidad (tratamiento de datos, Ley 1581 de 2012) y /terminos.
// Texto base: debe revisarlo un abogado antes de darlo por definitivo.
import { useEffect } from 'react'
import { ir } from '../lib/ruta'
import { WHATSAPP_BONITO, enlaceWhatsApp } from '../lib/contacto'
import MarcaMatriz from '../tienda/MarcaMatriz'
import PieMatriz from '../tienda/PieMatriz'
import BarraInferior from '../tienda/BarraInferior'
import BotonWhatsApp from '../tienda/BotonWhatsApp'

const Sec = ({ t, children }) => (
  <section className="space-y-2">
    <h2 className="text-2xl font-bold leading-tight">{t}</h2>
    <div className="space-y-2 text-lg leading-relaxed text-tinta/80">{children}</div>
  </section>
)
const Lista = ({ items }) => <ul className="list-disc space-y-1 pl-6">{items.map((i) => <li key={i}>{i}</li>)}</ul>
const Contacto = () => <a href={enlaceWhatsApp('Hola, tengo una consulta sobre mis datos personales en Matriz')} className="font-semibold text-principal underline">WhatsApp {WHATSAPP_BONITO}</a>

function Privacidad() {
  return (
    <>
      <Sec t="1. Quién es el responsable">
        <p>Matriz es una plataforma que permite a negocios de barrio tener su tienda en línea, y a las personas comprar en ellas. Para los datos de quienes usan la plataforma (dueños de negocio y visitantes), el responsable del tratamiento es el equipo de Matriz. Para los datos de un pedido, la tienda a la que le compras es también responsable de atenderlo y entregarlo.</p>
        <p>Canal de contacto para temas de datos: <Contacto />.</p>
      </Sec>
      <Sec t="2. Qué datos recolectamos">
        <Lista items={[
          'Si registras un negocio: nombre del negocio, ciudad, tu nombre, celular, correo y lo que quieras contarnos.',
          'Si compras en una tienda: nombre, celular, dirección de entrega y correo (opcional), y el contenido de tu pedido.',
          'Si inicias sesión con Google: tu nombre y correo, que Google nos comparte con tu autorización.',
          'Si permites tu ubicación: tu posición aproximada, solo para mostrarte las tiendas más cercanas. No la guardamos.',
          'Datos técnicos básicos para que la plataforma funcione y para evitar abusos.',
        ]} />
        <p>No pedimos datos sensibles ni datos de menores de edad. Si eres menor de 18 años, usa la plataforma con ayuda de tu representante legal.</p>
      </Sec>
      <Sec t="3. Para qué los usamos">
        <Lista items={[
          'Revisar y atender la solicitud de tu negocio y ayudarte a dejarlo funcionando.',
          'Procesar y entregar tus pedidos, y contactarte si hay novedades.',
          'Mostrar las tiendas cercanas, calcular domicilios y ubicar direcciones con mapas.',
          'Confirmar pagos hechos por Nequi, Llave o Daviplata directamente a la tienda.',
          'Mantener la seguridad de la plataforma y cumplir obligaciones legales.',
        ]} />
        <p>No vendemos tus datos. No los usamos para publicidad de terceros sin tu autorización.</p>
      </Sec>
      <Sec t="4. Con quién los compartimos">
        <p>Solo con quienes hacen posible el servicio: la tienda a la que le compras, y proveedores técnicos como Supabase (base de datos), Vercel (alojamiento) y Google (inicio de sesión y mapas). Estos proveedores tratan los datos por encargo nuestro y bajo medidas de seguridad.</p>
      </Sec>
      <Sec t="5. Tus derechos">
        <p>Conforme a la Ley 1581 de 2012 y sus normas reglamentarias (Habeas Data), tienes derecho a:</p>
        <Lista items={[
          'Conocer, actualizar y rectificar tus datos.',
          'Pedir prueba de la autorización que nos diste.',
          'Ser informado del uso que se les ha dado.',
          'Revocar la autorización y pedir que se eliminen tus datos, cuando no haya un deber legal de conservarlos.',
          'Presentar quejas ante la Superintendencia de Industria y Comercio.',
        ]} />
        <p>Para ejercer estos derechos escríbenos por <Contacto />. Respondemos las consultas en un máximo de 10 días hábiles y los reclamos en un máximo de 15 días hábiles.</p>
      </Sec>
      <Sec t="6. Seguridad y conservación">
        <p>Protegemos los datos con acceso restringido por negocio, conexiones cifradas y copias de respaldo. Conservamos los datos mientras tengas una cuenta o un pedido en curso, y por el tiempo que la ley exija.</p>
      </Sec>
      <Sec t="7. Cambios a esta política">
        <p>Si esta política cambia de forma importante, lo avisaremos en la plataforma. La versión vigente siempre estará en esta página.</p>
      </Sec>
    </>
  )
}

function Terminos() {
  return (
    <>
      <Sec t="1. Qué es Matriz">
        <p>Matriz es una plataforma que le da a cada negocio su propia tienda en línea, con catálogo, pedidos, domicilios, pagos por transferencia y herramientas de control (caja e inventario). Al usarla aceptas estos términos.</p>
      </Sec>
      <Sec t="2. Para quienes compran">
        <Lista items={[
          'Cada tienda es responsable de sus productos, precios, existencias, tiempos de entrega y garantías. Matriz no vende los productos.',
          'Los precios y la disponibilidad los define cada tienda y pueden cambiar sin aviso.',
          'Los pagos por Nequi, Llave o Daviplata se hacen directamente a la tienda. Matriz no recibe ni administra ese dinero. La tienda confirma que lo recibió.',
          'El costo del domicilio se calcula según la distancia y las reglas de cada tienda.',
        ]} />
      </Sec>
      <Sec t="3. Para quienes tienen un negocio">
        <Lista items={[
          'Registras tu negocio con información verdadera. Revisamos cada solicitud antes de aprobarla.',
          'Eres responsable de lo que publicas: productos, fotos, precios, ofertas y su cumplimiento de la ley.',
          'Eres responsable de la atención, la entrega y la facturación a tus clientes.',
          'Los planes tienen un precio mensual y un límite de productos, que se muestran al registrarte. Los precios de lanzamiento son por tiempo limitado y se informan antes de cambiar.',
          'Puedes cancelar cuando quieras. Podemos suspender un negocio que incumpla estos términos o la ley.',
        ]} />
      </Sec>
      <Sec t="4. Uso adecuado">
        <p>No se permite usar la plataforma para actividades ilegales, vender productos prohibidos, engañar a otras personas, ni intentar acceder a datos de otros negocios o dañar el servicio.</p>
      </Sec>
      <Sec t="5. Disponibilidad y responsabilidad">
        <p>Hacemos lo posible por mantener el servicio disponible, pero puede haber interrupciones por mantenimiento o por causas fuera de nuestro control. Matriz no responde por las decisiones de compra ni por los incumplimientos de las tiendas entre ellas y sus clientes.</p>
      </Sec>
      <Sec t="6. Propiedad intelectual">
        <p>La marca Matriz, su diseño y su software son de sus titulares. Cada negocio conserva los derechos sobre sus propias marcas, fotos y contenido, y nos autoriza a mostrarlos dentro de la plataforma.</p>
      </Sec>
      <Sec t="7. Ley aplicable y contacto">
        <p>Estos términos se rigen por las leyes de Colombia. Para cualquier duda escríbenos por <Contacto />.</p>
      </Sec>
    </>
  )
}

export default function PaginaLegal({ tipo }) {
  useEffect(() => { window.scrollTo(0, 0) }, [tipo])
  const esPriv = tipo === 'privacidad'
  return (
    <div className="bg-papel text-tinta">
      <main className="mx-auto w-full max-w-3xl space-y-8 px-4 py-8 text-lg">
        <div className="flex justify-center"><MarcaMatriz tamano={56} /></div>
        <header className="space-y-2 text-center">
          <h1 className="text-[clamp(1.8rem,6vw,2.5rem)] font-bold leading-tight">{esPriv ? 'Política de tratamiento de datos personales' : 'Términos y condiciones'}</h1>
          <p className="text-base text-tinta/60">Última actualización: octubre de 2026</p>
        </header>
        {esPriv ? <Privacidad /> : <Terminos />}
        <div className="grid grid-cols-2 gap-3 pt-4">
          <button onClick={() => ir(esPriv ? '/terminos' : '/privacidad')} className="min-h-[56px] rounded-2xl border-2 border-principal/30 bg-white px-3 text-base font-semibold text-principal">{esPriv ? 'Ver términos' : 'Ver política de datos'}</button>
          <button onClick={() => ir('/')} className="min-h-[56px] rounded-2xl bg-negro px-3 text-base font-semibold text-white">← Volver al inicio</button>
        </div>
      </main>
      <PieMatriz />
      <BotonWhatsApp />
      <BarraInferior />
    </div>
  )
}
