import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

export default defineConfig({
  plugins: [react()],
  server: {
    fs: {
      // Allow serving files from one level up the project root
      allow: ['..']
    }
  },
  resolve: {
    alias: {
      '@wasm': resolve(__dirname, '../pkg')
    }
  }
})