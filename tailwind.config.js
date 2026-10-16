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
        papel: '#FAF8F4',
        tinta: '#1B1B1F',
      },
      fontFamily: { sans: ['ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'] },
    },
  },
  plugins: [],
}
