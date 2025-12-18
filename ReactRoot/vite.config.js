import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { copyFileSync } from 'fs'
import { join } from 'path'

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // For GitHub Pages, always use the repository name as base path
  // Change '/ManeuverPrototype/' to match your actual repository name
  const base = process.env.GITHUB_PAGES === 'true' || mode === 'production' ? '/ManeuverPrototype/' : '/'
  
  return {
    plugins: [
      react(),
      {
        name: 'copy-404',
        closeBundle() {
          if (process.env.GITHUB_PAGES === 'true' || mode === 'production') {
            const distPath = join(process.cwd(), 'dist')
            const indexPath = join(distPath, 'index.html')
            const notFoundPath = join(distPath, '404.html')
            try {
              copyFileSync(indexPath, notFoundPath)
              console.log('✓ Created 404.html for GitHub Pages SPA routing')
            } catch (error) {
              console.error('Failed to create 404.html:', error)
            }
          }
        }
      }
    ],
    base: base,
    server: {
      port: 3000,
      open: true
    }
  }
})


