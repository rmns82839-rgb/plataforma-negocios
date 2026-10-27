// Guía para el dueño: cómo se maneja cada forma en que entra plata al negocio. Es el texto de la pantalla "Guía del dinero"
// y también de docs/GUIA-DUENO.md (se genera con scripts/guia-md.mjs). Es una guía general: no reemplaza al contador.
export const GUIA = [
  {
    id: 'claves',
    titulo: 'Antes de empezar: 3 cosas que NO son lo mismo',
    nota: 'Vender, que entre plata y ganar',
    bloques: [
      { t: 'lista', items: [
        '**Vender**: el cliente se lleva la mercancía. Cuenta como venta aunque todavía no haya pagado (fiado) o aunque ya hubiera pagado antes (saldo prepago).',
        '**Que entre plata**: lo que de verdad llega hoy a la caja, al banco o a Nequi. Puede venir de una venta, de un abono, de una recarga o de plata que tú pones.',
        '**Ganar**: lo que sobra de una venta después de descontar lo que costó la mercancía, la comisión del datáfono y los gastos.',
      ] },
      { t: 'p', texto: '**Regla de oro:** lo que entró a la caja no es lo mismo que lo que vendiste, y mucho menos lo que ganaste.' },
      { t: 'ejemplo', titulo: 'Ejemplo de un día', texto: 'Vendes $500.000: $400.000 los pagan hoy y $100.000 se quedan fiados. Además un cliente recarga $50.000 de saldo.\n\n• Vendido: $500.000\n• Entró plata: $450.000 ($400.000 de ventas + $50.000 de la recarga)\n• Ganancia: solo una parte de los $500.000, nunca los $450.000' },
    ],
  },
  {
    id: 'formas',
    titulo: 'Cada forma en que entra la plata',
    nota: 'Qué es, dónde se registra y dónde se ve',
    bloques: [
      { t: 'tabla', filas: [
        { nombre: 'Efectivo', venta: 'Sí', entra: 'Sí, a la caja', donde: 'Caja → forma de pago "Efectivo"', ver: 'Reportes (cierre de caja)', nota: 'Si el cliente da menos de lo que vale, la caja pregunta con qué paga el resto.' },
        { nombre: 'Transferencia, Nequi o Daviplata', venta: 'Sí', entra: 'Sí, al banco o a la billetera', donde: 'Caja → forma de pago', ver: 'Reportes, tarjeta de esa forma', nota: 'No cuenta en el efectivo de la caja: se cuadra contra el banco.' },
        { nombre: 'Datáfono (tarjeta)', venta: 'Sí', entra: 'Sí, pero menos y días después', donde: 'Caja → "Datáfono"', ver: 'Reportes', nota: 'El banco cobra una comisión (se configura en Datos del negocio) y baja la ganancia.' },
        { nombre: 'Fiado', venta: 'Sí', entra: 'NO', donde: 'Caja → "Fiado" y elegir el cliente', ver: 'Fiados', nota: 'Es plata que te deben (cuenta por cobrar).' },
        { nombre: 'Abono a un fiado', venta: 'NO (la venta ya se contó)', entra: 'Sí', donde: 'Fiados → cliente → Abonar', ver: 'Historial de pagos', nota: 'Es cobrar una deuda. Si el abono es en efectivo, suma al efectivo de la caja.' },
        { nombre: 'Recarga de saldo prepago', venta: 'NO', entra: 'Sí', donde: 'Fiados → Todos → cliente → Saldo prepago → Recargar', ver: 'Reportes: "Recargas de saldo"', nota: 'Es plata del cliente que tú debes en mercancía.' },
        { nombre: 'Compra pagada con saldo prepago', venta: 'Sí', entra: 'NO (ya había entrado)', donde: 'Caja → elegir cliente → "Saldo prepago"', ver: 'Reportes', nota: 'Baja lo que le debes al cliente.' },
        { nombre: 'Pedido en línea o por WhatsApp', venta: 'Sí', entra: 'Según cómo pague', donde: 'Más → Pedidos de la tienda → Cobrar', ver: 'Reportes', nota: 'Se cobra en Caja como cualquier venta.' },
        { nombre: 'Base, cambio o plata que pones tú', venta: 'NO', entra: 'Sí (efectivo)', donde: 'Caja → Retiro/Ingreso de caja', ver: 'Retiros de caja', nota: 'No es venta ni ganancia: la plata solo cambia de lugar.' },
      ] },
    ],
  },
  {
    id: 'prepago',
    titulo: 'Saldo prepago, paso a paso',
    nota: 'El cliente paga adelantado y va gastando',
    bloques: [
      { t: 'pasos', items: [
        '**Recargar:** Fiados → filtro "Todos" → toca al cliente → "Saldo prepago" → Recargar. Escribes el valor, eliges con qué pagó el cliente (efectivo, Nequi…) y confirmas. Solo el dueño puede recargar.',
        '**Bono de regalo (opcional):** al recargar puedes regalar un bono para incentivar al cliente. Tú decides cuánto (5 %, 10 % o el valor que quieras, hasta el 100 % de la recarga) y hasta cuándo puede gastarlo (30, 60, 90 días, otra fecha o sin plazo). El bono no es plata que entró: no suma a la caja.',
        '**Gastar:** en Caja arma la venta, elige el cliente en la sección "Cliente" y aparece la forma de pago "Saldo prepago". La app descuenta sola y muestra cuánto le queda.',
        '**Qué se gasta primero:** el bono (el que vence antes) y después la plata del cliente. Lo que no se gaste del bono hasta su fecha límite se pierde.',
        '**Si el saldo no alcanza:** se usa todo el saldo y la caja pregunta con qué paga lo que falta (efectivo, Nequi, fiado…).',
        '**Si te equivocas:** anula la venta desde el Historial y el saldo vuelve al cliente automáticamente. Una recarga mal digitada se arregla con "Corregir" (pide el motivo y queda anotada).',
        '**Devolver saldo:** si el cliente pide que le devuelvas la plata que no gastó, usa "Devolver", elige con qué se la das y escribe el motivo.',
      ] },
      { t: 'lista', titulo: 'Seguridad', items: [
        'Solo el dueño recarga, devuelve o corrige. El cajero solo puede gastar el saldo.',
        'El bono no se devuelve en plata: solo se puede devolver lo que el cliente pagó. Si anulas una venta pagada con bono, el bono vuelve al cliente solo si aún no venció.',
        'El saldo nunca baja de cero, ni siquiera si dos cajeros cobran al mismo tiempo.',
        'Nada se borra ni se edita: cada recarga, compra y corrección queda en el historial y en la Auditoría.',
        'Gastar saldo necesita internet (así no se puede gastar dos veces). Si no hay conexión, cobra con otra forma de pago.',
        'Cuida la plata de tus clientes: dales siempre un comprobante de la recarga (anótalo o mándalo por WhatsApp).',
      ] },
    ],
  },
  {
    id: 'cierre',
    titulo: 'Cierre de caja del día',
    nota: 'Cuánto efectivo debe haber',
    bloques: [
      { t: 'p', texto: 'En Más → Reportes → "Hoy", la app calcula cuánto efectivo debería haber en la caja:' },
      { t: 'ejemplo', titulo: 'Fórmula', texto: 'Ventas en efectivo\n+ Abonos recibidos en efectivo\n+ Recargas de saldo recibidas en efectivo\n+ Ingresos a la caja (base, cambio)\n− Saldo devuelto en efectivo\n− Gastos pagados de la caja\n− Préstamos rápidos entregados en efectivo\n− Retiros de caja' },
      { t: 'lista', titulo: 'Lo que NO entra a esa cuenta', items: [
        'Ventas fiadas (todavía no entró la plata).',
        'Compras pagadas con saldo prepago (la plata ya había entrado al recargar).',
        'Transferencias, Nequi, Daviplata y datáfono (no son efectivo).',
      ] },
      { t: 'p', texto: 'Cuenta el efectivo que hay, escríbelo en "Lo que hay contado" y la app te dice si cuadra, si sobra o si falta.' },
    ],
  },
  {
    id: 'tablero',
    titulo: 'Tres saldos que no debes mezclar',
    nota: 'Lo que te deben, lo que debes y lo que es tuyo',
    bloques: [
      { t: 'lista', items: [
        '**Lo que te deben los clientes:** fiados y préstamos (pantalla Fiados).',
        '**Lo que tú les debes a los clientes:** saldos prepago (Reportes: "Saldos de clientes por entregar"). Los bonos sin gastar aparecen aparte: son un regalo, no plata del cliente.',
        '**Lo que de verdad es tuyo:** la plata disponible menos lo que debes en saldos prepago.',
      ] },
      { t: 'p', texto: 'Ejemplo: si en la caja y el banco hay $2.000.000 y los clientes tienen $300.000 de saldo prepago, tu plata realmente libre es $1.700.000.' },
    ],
  },
  {
    id: 'errores',
    titulo: 'Errores comunes',
    nota: 'Para no confundirte',
    bloques: [
      { t: 'lista', items: [
        'Creer que una recarga es una venta. No lo es: la venta ocurre cuando el cliente gasta el saldo.',
        'Creer que un abono es una venta nueva. No: la venta ya se contó cuando se fió.',
        'Contar el fiado como plata que ya tienes. Mientras no abonen, no hay plata.',
        'Sumar efectivo + transferencias + datáfono y llamar a eso "la caja". La caja es solo el efectivo.',
        'Gastar la plata de los saldos prepago como si fuera ganancia. Es plata de los clientes.',
      ] },
    ],
  },
  {
    id: 'contador',
    titulo: 'Para hablar con tu contador',
    nota: 'Esto lo define él, no la app',
    bloques: [
      { t: 'p', texto: 'Esta guía es general y no reemplaza a un contador. Pregúntale:' },
      { t: 'lista', items: [
        '¿Cómo registro las recargas de saldo según mi régimen (es un anticipo de clientes, un pasivo)?',
        '¿Entrego un recibo de caja al recargar y facturo cuando el cliente se lleva la mercancía?',
        '¿Cuándo se causa el IVA, si soy responsable de IVA?',
        '¿Me conviene separar en el banco la plata de los saldos prepago?',
        '¿Qué pongo en mi política de devolución de saldos?',
        '¿Cómo se registra el bono de regalo (es un descuento o costo de promoción)?',
      ] },
    ],
  },
]
