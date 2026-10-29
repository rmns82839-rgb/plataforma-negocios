// Carrito de la app (el mismo dibujo del ícono de pedido) que cruza la pantalla de un lado a otro:
// las ruedas giran, los productos saltan adentro y la ruta se desliza. Con "llega" el carrito entra y se queda al centro.
// Si el celular pide menos movimiento, queda quieto (los estilos están en index.css).
export default function CarritoCorriendo({ modo = 'corre', alto = 72, className = '', etiqueta = 'Tu carrito va en camino' }) {
  const lado = alto - 14
  return (
    <div className={`carro-pista text-champagne ${className}`} style={{ height: alto }} role="img" aria-label={etiqueta}>
      <div className="carro-ruta" aria-hidden="true" />
      <div className={`carro ${modo === 'llega' ? 'carro-llega' : 'carro-corre'}`} style={{ width: lado, height: lado, marginLeft: -lado / 2 }} aria-hidden="true">
        <svg viewBox="0 0 24 24" width={lado} height={lado} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ overflow: 'visible' }}>
          <g className="carro-cuerpo">
            <g className="carro-viento" style={{ animationDelay: '0s' }}><path d="M-5 11h3.5" strokeWidth="1.2" /></g>
            <g className="carro-viento" style={{ animationDelay: '.3s' }}><path d="M-3 14.2h3" strokeWidth="1.2" /></g>
            <g className="carro-viento" style={{ animationDelay: '.6s' }}><path d="M-5 17.4h3.5" strokeWidth="1.2" /></g>
            <rect className="carro-prod" style={{ animationDelay: '0s' }} x="8" y="3.6" width="3.4" height="4" rx=".7" fill="#E8D3A2" stroke="none" />
            <circle className="carro-prod" style={{ animationDelay: '.35s' }} cx="13.6" cy="5.6" r="1.9" fill="#D8B978" stroke="none" />
            <rect className="carro-prod" style={{ animationDelay: '.7s' }} x="16" y="2.8" width="2.6" height="5" rx="1" fill="#F7F4EC" stroke="none" />
            <path d="M3 4h2l2.4 10.2a2 2 0 0 0 2 1.5h7.7a2 2 0 0 0 2-1.5L21 8H6" />
            <g className="carro-rueda"><circle cx="9.5" cy="20" r="1.7" /><path d="M8.3 20h2.4M9.5 18.8v2.4" strokeWidth="1" /></g>
            <g className="carro-rueda"><circle cx="17.5" cy="20" r="1.7" /><path d="M16.3 20h2.4M17.5 18.8v2.4" strokeWidth="1" /></g>
          </g>
        </svg>
      </div>
    </div>
  )
}
