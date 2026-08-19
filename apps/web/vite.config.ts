import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import { nitroV2Plugin } from '@tanstack/nitro-v2-vite-plugin'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const src = fileURLToPath(new URL('./src', import.meta.url))
const domain = fileURLToPath(new URL('../../packages/domain/src/index.ts', import.meta.url))

export default defineConfig({
  resolve: {
    alias: [
      { find: '@ausfall/domain', replacement: domain },
      { find: /^@\//, replacement: `${src}/` },
    ],
  },
  plugins: [tailwindcss(), tanstackStart(), nitroV2Plugin({ preset: 'node-server' }), viteReact()],
})
