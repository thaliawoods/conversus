import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'
import { pluginIA } from './ia/serveur.ts'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // Préfixe '' : on lit aussi OPENAI_API_KEY, qui reste côté serveur (jamais exposée au navigateur).
  const env = loadEnv(mode, process.cwd(), '')
  return {
    plugins: [react(), pluginIA(env)],
    server: {
      host: true,
      port: 8080,
    },
  }
})
