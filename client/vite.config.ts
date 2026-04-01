import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@shared': path.resolve(__dirname, '../src/shared')
    }
  },
  server: {
    port: 5173,
    open: true,
    fs: {
      // Cho phép Vite đọc file ngoài thư mục client/
      allow: ['..']
    }
  }
})
