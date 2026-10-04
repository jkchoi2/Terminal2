import { resolve } from 'path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: {},
  preload: {},
  renderer: {
    resolve: { alias: { '@': resolve('src/renderer/src') } },
    plugins: [react()],
    build: {
      rollupOptions: {
        // Main window + real-time chart window
        input: {
          index: resolve('src/renderer/index.html'),
          chart: resolve('src/renderer/chart.html')
        }
      }
    }
  }
})
