// Logo de Matriz: isotipo + logotipo (Cormorant Garamond Light, tracking 340) + eslogan (Jost Light).
// fondo="oscuro": isotipo dorado y letras en degradado champagne. fondo="claro": una tinta, oro hondo
// (la guía de marca prohíbe el degradado dorado sobre fondos claros).
const TAM = {
  sm: { iso: 'h-9 w-9',   nombre: 'text-xl',  eslogan: 'text-[9px]',  gap: 'gap-1' },
  md: { iso: 'h-14 w-14', nombre: 'text-3xl', eslogan: 'text-[10px]', gap: 'gap-1.5' },
  lg: { iso: 'h-24 w-24', nombre: 'text-5xl', eslogan: 'text-[11px]', gap: 'gap-2' },
}

export default function Marca({ tam = 'md', fondo = 'oscuro', eslogan = true }) {
  const t = TAM[tam]
  const oscuro = fondo === 'oscuro'
  return (
    <div className={`grid justify-items-center ${t.gap}`}>
      <img src={oscuro ? '/isotipo.png' : '/isotipo-oro.png'} alt="" className={`${t.iso} object-contain`} />
      <p className={`font-display font-light uppercase tracking-[0.34em] pl-[0.34em] leading-none ${t.nombre} ${
        oscuro ? 'bg-gradient-to-b from-champagne-claro via-champagne to-oro bg-clip-text text-transparent' : 'text-oro-oscuro'}`}>
        Matriz
      </p>
      {eslogan && (
        <p className={`font-light uppercase tracking-[0.3em] pl-[0.3em] ${t.eslogan} ${oscuro ? 'text-champagne/70' : 'text-oro'}`}>
          El origen de lo bueno
        </p>
      )}
    </div>
  )
}
