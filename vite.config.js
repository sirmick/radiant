import { svelte } from '@sveltejs/vite-plugin-svelte'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [svelte()],
  server: { host: '0.0.0.0' },
  preview: { host: '0.0.0.0' },
})
