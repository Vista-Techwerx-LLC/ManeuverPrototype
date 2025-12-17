import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // For GitHub Pages, always use the repository name as base path
  // Change '/ManeuverPrototype/' to match your actual repository name
  const base = process.env.GITHUB_PAGES === 'true' || mode === 'production' ? '/ManeuverPrototype/' : '/'
  
  return {
    plugins: [react()],
    base: base,
    server: {
      port: 3000,
      open: true
    }
  }
})


