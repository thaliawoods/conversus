import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'
import { pluginIA } from './ia/serveur.ts'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // Prefix '': also reads OPENAI_API_KEY, which stays on the server (never exposed to the browser).
  const env = loadEnv(mode, process.cwd(), '')
  return {
    plugins: [react(), pluginIA(env)],
  }
})
