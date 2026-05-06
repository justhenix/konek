import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
// Local dev: run `npm run dev` which uses `vercel dev`.
// This serves both the frontend and the API routes on the same port.
// In production on Vercel, routing is handled automatically.
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  server: {
    proxy: {
      // Proxy API requests to vercel dev when running `npm run dev` (plain Vite).
      // When running `npm run dev:vercel`, vercel dev handles routing natively
      // and this proxy is not used.
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
})