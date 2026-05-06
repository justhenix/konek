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
})