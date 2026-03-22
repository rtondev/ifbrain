import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'

const __dirname = fileURLToPath(new URL('.', import.meta.url))

export default defineConfig({
  /** Reduz pedidos 504 "Outdated Optimize Dep" após mudanças de dependências. */
  optimizeDeps: {
    include: [
      'lit',
      'lit/decorators.js',
      'lit/directives/unsafe-html.js',
      '@lit/reactive-element',
      'mermaid',
      'jspdf',
      'html2canvas',
      'dompurify',
      'marked',
    ],
  },
  build: {
    rollupOptions: {
      input: resolve(__dirname, 'index.html'),
    },
  },
})
