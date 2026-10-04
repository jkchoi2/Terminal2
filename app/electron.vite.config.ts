import { resolve } from 'path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'
import pkg from './package.json'

export default defineConfig({
  main: {},
  preload: {},
  renderer: {
    resolve: { alias: { '@': resolve('src/renderer/src') } },
    plugins: [react()],
    // 도움말 등에 표시할 버전 (package.json)
    define: { __APP_VERSION__: JSON.stringify(pkg.version) },
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
