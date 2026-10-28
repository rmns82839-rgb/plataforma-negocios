import colors from 'tailwindcss/colors'

/** @type {import('tailwindcss').Config} */
// Los colores de la marca salen de variables CSS que se llenan al cargar cada negocio (src/lib/marca.js).
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      // Corte "lg" (menú lateral / diseño de PC) a 960 px: el "sitio de computadora" del celular mide ~980 px y debe verse como PC
      screens: { lg: '960px' },
      colors: {
        principal: 'rgb(var(--c-principal) / <alpha-value>)',
        secundario: 'rgb(var(--c-secundario) / <alpha-value>)',
        acento: 'rgb(var(--c-acento) / <alpha-value>)',
        papel: '#F7F4EC',
        tinta: '#1B1B1F',
        // Paleta del panel (la misma de Cibus): negro, oro champagne, oro hondo, esmeralda y hueso
        slate: colors.stone,
        negro: '#0B0B0C',
        champagne: { DEFAULT: '#D8B978', claro: '#E8D3A2' },
        oro: { DEFAULT: '#A8803A', oscuro: '#8A6A2E' },
        esmeralda: '#0B6B4A',
        // Catálogo público (aspecto Cibus): el color de CADA tienda, en tres tonos que salen de su color principal (src/lib/marca.js)
        cibus: { DEFAULT: 'rgb(var(--c-cibus, 30 58 95) / <alpha-value>)', oscuro: 'rgb(var(--c-cibus-oscuro, 18 35 57) / <alpha-value>)', profundo: 'rgb(var(--c-cibus-profundo, 10 19 31) / <alpha-value>)' },
        hueso: '#F7F4EC',
        marca: { DEFAULT: '#0B0B0C', oscuro: '#000000', claro: '#3A3A3D' },
        lima: { DEFAULT: '#D8B978', oscuro: '#A8803A' },
        naranja: { DEFAULT: '#C2631F', oscuro: '#9A4A12' },
        fondo: '#F7F4EC',
      },
      fontFamily: {
        sans: ['Jost', 'ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
        display: ['"Cormorant Garamond"', 'Georgia', 'serif'],
        serif: ['"Cormorant Garamond"', 'Georgia', 'serif'],
      },
    },
  },
  plugins: [],
}
