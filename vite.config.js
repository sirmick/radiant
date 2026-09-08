import { svelte } from '@sveltejs/vite-plugin-svelte'
import { defineConfig } from 'vite'

// BASE_PATH=/radiant/ for GitHub Pages (project site); default '/' for local dev and preview.
export default defineConfig({
  base: process.env.BASE_PATH ?? '/',
  plugins: [svelte()],
  server: { host: '0.0.0.0' },
  preview: { host: '0.0.0.0' },
})
