// Datos de contacto de la plataforma (un solo lugar para cambiarlos).
export const WHATSAPP = '573005008432'
export const WHATSAPP_BONITO = '300 500 8432'
export const enlaceWhatsApp = (texto = 'Hola, quiero información sobre Matriz') => `https://wa.me/${WHATSAPP}?text=${encodeURIComponent(texto)}`
