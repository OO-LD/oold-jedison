import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'

export default defineConfig({
  plugins: [vue()],
  base: '/oold-jedison/',
  build: {
    outDir: resolve(__dirname, 'docs')
  }
})
