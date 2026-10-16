import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// La PWA (vite-plugin-pwa) se agrega en la etapa 3, cuando el manifest y los íconos salgan de la marca de cada negocio.
export default defineConfig({ plugins: [react()] })
