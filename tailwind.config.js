/** @type {import('tailwindcss').Config} */
// Los colores de la marca salen de variables CSS que se llenan al cargar cada negocio (src/lib/marca.js).
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        principal: 'rgb(var(--c-principal) / <alpha-value>)',
        secundario: 'rgb(var(--c-secundario) / <alpha-value>)',
        acento: 'rgb(var(--c-acento) / <alpha-value>)',
        papel: '#F7F4EC',
        tinta: '#1B1B1F',
        oro: '#A8803A',
        champagne: '#D8B978',
      },
      fontFamily: {
        sans: ['Jost', 'ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
        serif: ['"Cormorant Garamond"', 'Georgia', 'serif'],
      },
    },
  },
  plugins: [],
}
