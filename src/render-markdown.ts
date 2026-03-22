import DOMPurify from 'dompurify'
import { marked } from 'marked'

marked.setOptions({
  gfm: true,
  breaks: true,
})

/**
 * Converte Markdown (resposta da IA) em HTML seguro para inserção no DOM.
 */
export function markdownToSafeHtml(markdown: string): string {
  const raw = marked.parse(markdown.trim(), { async: false }) as string
  return DOMPurify.sanitize(raw, {
    USE_PROFILES: { html: true },
    ADD_ATTR: ['target'],
  })
}
