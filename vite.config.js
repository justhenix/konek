import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(), // 2. Tambahkan di sini
  ],
  server: {
    proxy: {
      // For local dev: run `vercel dev` separately, or deploy to Vercel
      // In production on Vercel, this proxy is unused — routing is automatic
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
})