// Piezas de interfaz compartidas: claras, ordenadas, sin fondos oscuros.
export function Pagina({ children, ancho = 'max-w-3xl' }) {
  return <main className={`mx-auto w-full ${ancho} px-4 py-8 sm:py-12`}>{children}</main>
}

export function Tarjeta({ children, className = '' }) {
  return <section className={`rounded-2xl border border-black/5 bg-white p-5 shadow-sm sm:p-6 ${className}`}>{children}</section>
}

export function Boton({ children, variante = 'principal', className = '', ...p }) {
  const base = 'inline-flex min-h-[44px] items-center justify-center rounded-xl px-5 text-sm font-semibold transition disabled:opacity-50'
  const v = variante === 'principal'
    ? 'bg-principal text-white hover:opacity-90'
    : 'border border-black/10 bg-white text-tinta hover:bg-black/[0.03]'
  return <button className={`${base} ${v} ${className}`} {...p}>{children}</button>
}

export function Volver({ onClick, texto = 'Volver' }) {
  return <button onClick={onClick} className="mb-4 text-sm font-medium text-principal hover:underline">← {texto}</button>
}

export function Mensaje({ tipo = 'info', children }) {
  const c = tipo === 'error' ? 'border-red-200 bg-red-50 text-red-800' : 'border-black/5 bg-white text-tinta/80'
  return <p className={`rounded-xl border px-4 py-3 text-sm ${c}`}>{children}</p>
}

export function Cargando({ texto = 'Cargando…' }) {
  return <p className="py-16 text-center text-sm text-tinta/60">{texto}</p>
}
