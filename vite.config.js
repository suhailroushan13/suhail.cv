import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'fs'
import { resolve } from 'path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    // Copy index.html to 404.html for SPA fallback (GitHub Pages, etc.)
    {
      name: 'copy-404',
      closeBundle() {
        const indexPath = resolve(__dirname, 'dist/index.html')
        const notFoundPath = resolve(__dirname, 'dist/404.html')
        if (existsSync(indexPath)) {
          let html = readFileSync(indexPath, 'utf-8')
          html = html.replace(/<title>.*?<\/title>/, '<title>404 - Page Not Found | Suhail Roushan</title>')
          html = html.replace(/<meta name="robots" content="[^"]*"[^>]*>/, '<meta name="robots" content="noindex, follow" />')
          writeFileSync(notFoundPath, html)
        }
      },
    },
  ],
})
