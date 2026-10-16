import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  clearScreen: false,
  // Must match build.devUrl in src-tauri/tauri.conf.json.
  server: { port: 1420, strictPort: true },
})
