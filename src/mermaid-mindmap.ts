import mermaid from 'mermaid'
import { formatMonthShort } from './pdf-analysis.js'
import type { MindMapResult, MonthlyMapResult } from './pdf-analysis.js'

let mermaidReady = false

function initMermaid(): void {
  if (mermaidReady) return
  mermaidReady = true
  const dark = typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: 'loose',
    theme: dark ? 'dark' : 'default',
    mindmap: { useMaxWidth: true },
    fontFamily: 'system-ui, Segoe UI, Roboto, sans-serif',
  })
}

/** Texto seguro para nós Mermaid (mindmap / eixos). */
export function sanitizeMermaidLabel(s: string, max = 72): string {
  return s
    .replace(/[\n\r\t]/g, ' ')
    .replace(/["`]/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max)
}

/**
 * Mapa mental em ramos (diagrama `mindmap` do Mermaid).
 */
export function mindMapToMermaidDefinition(mm: MindMapResult): string {
  const center = sanitizeMermaidLabel(mm.center, 64) || 'Documento'
  const lines: string[] = ['mindmap', `  root((${center}))`]
  for (const b of mm.branches) {
    const lab = sanitizeMermaidLabel(b.label, 64)
    if (!lab) continue
    lines.push(`    ${lab}`)
    if (b.sub) {
      for (const s of b.sub) {
        const t = sanitizeMermaidLabel(s, 80)
        if (t) lines.push(`      ${t}`)
      }
    }
  }
  return lines.join('\n')
}

/**
 * Evolução temporal com barras (`xychart-beta` do Mermaid).
 */
export function monthlyMapToMermaidDefinition(mm: MonthlyMapResult): string {
  const labels = mm.entries.map((e) =>
    sanitizeMermaidLabel(formatMonthShort(e.month).replace(/\//g, '-'), 16),
  )
  const values = mm.entries.map((e) => Math.abs(e.value))
  const maxV = Math.max(...values, 1)
  const minV = Math.min(0, ...mm.entries.map((e) => e.value))
  const top = maxV === 0 ? 1 : maxV * 1.08
  const title = sanitizeMermaidLabel(
    mm.unit ? `Mapa mental temporal (${mm.unit})` : 'Mapa mental temporal',
    80,
  )
  const xList = labels.map((l) => `"${l}"`).join(', ')
  const vList = values.join(', ')
  return `xychart-beta
    title "${title}"
    x-axis [${xList}]
    y-axis " " ${minV} --> ${top}
    bar [${vList}]`
}

let renderId = 0

/**
 * Renderiza definição Mermaid a SVG (para inserir no DOM).
 */
export async function renderMermaidToSvg(definition: string): Promise<string> {
  initMermaid()
  const id = `ifbrain-mmd-${++renderId}-${Date.now()}`
  const { svg } = await mermaid.render(id, definition)
  return svg
}
