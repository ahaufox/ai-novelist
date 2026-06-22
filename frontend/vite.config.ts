import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// 后端端口由启动器通过环境变量传入
const backendPort = process.env.AI_NOVELIST_BACKEND_PORT || '8000'

export default defineConfig({
  plugins: [react()],
  base: './',
  server: {
    port: parseInt(process.env.AI_NOVELIST_FRONTEND_PORT || '3000'),
    proxy: {
      '/api': {
        target: `http://localhost:${backendPort}`,
        changeOrigin: true
      }
    },
    headers: {
      'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0',
    }
  },
  build: {
    outDir: '../dist/frontend'
  }
})
