import './polyfills.js'
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist/legacy/build/pdf.mjs'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import { createWorker } from 'tesseract.js'

/** Worker clássico em /public — mais fiável no Safari do que worker de módulo do Vite. */
GlobalWorkerOptions.workerSrc = `${import.meta.env.BASE_URL}pdf.worker.min.mjs`

const GROQ_CHAT_URL = 'https://api.groq.com/openai/v1/chat/completions'
const GROQ_MODEL = 'llama-3.3-70b-versatile'
/** Limite aproximado de caracteres enviados ao modelo (PDFs grandes). */
const MAX_TEXT_FOR_LLM = 48_000
/** Máximo de páginas processadas por OCR (desempenho no browser). */
export const MAX_OCR_PAGES = 30
/** Escala de renderização para OCR (maior = mais lento, melhor leitura). */
const OCR_SCALE = 2.25

export type PdfAnalysisResult = {
  wordCount: number
  textSample: string
}

export type AnalyzeProgress = (info: {
  phase: 'extract' | 'ocr' | 'groq'
  message?: string
}) => void

/** Um ponto no tempo (mês) com valor numérico para o gráfico. */
export type MonthlyMapEntry = {
  month: string
  value: number
  label?: string
}

/** Resposta estruturada do mapa mensal (JSON da IA). */
export type MonthlyMapResult = {
  title: string
  unit?: string
  entries: MonthlyMapEntry[]
  /** Quando não há série mensal, explicação curta. */
  noDataMessage?: string
}

const MONTH_LABELS_PT = [
  'Jan',
  'Fev',
  'Mar',
  'Abr',
  'Mai',
  'Jun',
  'Jul',
  'Ago',
  'Set',
  'Out',
  'Nov',
  'Dez',
]

export function formatMonthShort(isoMonth: string): string {
  const m = isoMonth.trim().match(/^(\d{4})-(\d{2})/)
  if (!m) return isoMonth
  const mi = Number.parseInt(m[2]!, 10)
  if (mi < 1 || mi > 12) return isoMonth
  return `${MONTH_LABELS_PT[mi - 1]}/${m[1]}`
}

function parseGroqJsonText(raw: string): unknown {
  let t = raw.trim()
  if (t.startsWith('```')) {
    t = t.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '')
  }
  return JSON.parse(t) as unknown
}

function normalizeMonthlyMap(data: unknown): MonthlyMapResult {
  const fallback: MonthlyMapResult = {
    title: 'Mapa mensal',
    entries: [],
    noDataMessage: 'Não foi possível interpretar o mapa a partir da resposta da IA.',
  }
  if (!data || typeof data !== 'object') return fallback
  const o = data as Record<string, unknown>
  const title = typeof o.title === 'string' && o.title.trim() ? o.title.trim() : 'Mapa mensal'
  const unit = typeof o.unit === 'string' ? o.unit.trim() : undefined
  const noDataMessage =
    typeof o.noDataMessage === 'string' ? o.noDataMessage.trim() : undefined

  if (!Array.isArray(o.entries)) {
    return { title, unit, entries: [], noDataMessage: noDataMessage ?? fallback.noDataMessage }
  }

  const entries: MonthlyMapEntry[] = []
  for (const item of o.entries) {
    if (!item || typeof item !== 'object') continue
    const e = item as Record<string, unknown>
    const month = typeof e.month === 'string' ? e.month.trim() : ''
    const value = typeof e.value === 'number' && Number.isFinite(e.value) ? e.value : Number.NaN
    if (!month || Number.isNaN(value)) continue
    const label = typeof e.label === 'string' ? e.label.trim() : undefined
    entries.push({ month, value, label })
  }

  entries.sort((a, b) => a.month.localeCompare(b.month))

  const emptyMsg =
    entries.length === 0
      ? noDataMessage ||
        'Não foram encontrados dados claros por mês neste documento (valores, totais ou datas mensais).'
      : undefined

  return {
    title,
    unit,
    entries,
    noDataMessage: emptyMsg,
  }
}

/**
 * Identifica dados com referência mensal no texto e devolve série para gráfico.
 */
export async function extractMonthlyMapWithGroq(
  textSample: string,
  apiKey: string,
): Promise<MonthlyMapResult> {
  const res = await fetch(GROQ_CHAT_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content:
            'Analisa documentos e extrai séries temporais mensais. Responde só com JSON válido, sem markdown. ' +
            'Se não houver dados por mês (valores, quantidades, totais, eventos datados por mês), devolve entries vazio e noDataMessage em português.',
        },
        {
          role: 'user',
          content: `Do texto abaixo (PDF extraído), identifica informação que possa ser organizada **por mês** (ex.: valores financeiros, consumos, consultas, doses, metas, horas, ocorrências com mês explícito ou inferível com baixa ambiguidade).

Texto:
---
${textSample}
---

Devolve JSON com este formato exato:
{
  "title": "nome curto da métrica (ex.: Gastos por mês) — nunca uses frases genéricas como 'Acesso a dados'",
  "unit": "opcional, ex: €, kWh, unidades",
  "entries": [ { "month": "YYYY-MM", "value": número, "label": "opcional, detalhe desse mês" } ],
  "noDataMessage": "só se entries estiver vazio: uma frase em português a explicar"
}

Regras:
- month em formato YYYY-MM; ordena mentalmente do mais antigo ao mais recente.
- value: número (usa ponto decimal se necessário; converte vírgulas PT para número).
- Não inventes meses sem suporte no texto. Se o documento não tiver dados mensais, entries: [] e noDataMessage preenchido.`,
        },
      ],
      temperature: 0.2,
      max_tokens: 2_048,
    }),
  })

  if (!res.ok) {
    const errBody = await res.text()
    throw new Error(`Groq mapa mensal (${res.status}): ${errBody}`)
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>
  }
  const content = data.choices?.[0]?.message?.content?.trim()
  if (!content) {
    return {
      title: 'Mapa mensal',
      entries: [],
      noDataMessage: 'Resposta vazia da API ao pedir o mapa mensal.',
    }
  }

  try {
    const parsed = parseGroqJsonText(content)
    return normalizeMonthlyMap(parsed)
  } catch {
    return {
      title: 'Mapa mensal',
      entries: [],
      noDataMessage: 'Não foi possível ler o JSON do mapa mensal.',
    }
  }
}

/** Ramo do mapa mental. */
export type MindMapBranch = {
  label: string
  sub?: string[]
}

/** Mapa mental do conteúdo (quando não há série mensal). */
export type MindMapResult = {
  center: string
  branches: MindMapBranch[]
}

export type TimelineEntry = {
  when?: string
  event: string
}

export type SensitiveHint = {
  type: string
  note: string
}

/** Insights extra: palavras-chave, entidades, cronologia, tradução, etc. */
export type ExtendedInsights = {
  keywords: string[]
  mainPoints: string[]
  suggestedQuestions: string[]
  timeline: TimelineEntry[]
  entities: {
    people: string[]
    organizations: string[]
    places: string[]
    amounts: string[]
  }
  translation: { summaryEn: string }
  tone: {
    formality: string
    documentTypeGuess: string
    audience: string
  }
  readingLevel: string
  sensitiveHints: SensitiveHint[]
  /** Descrição de tabelas ou dados em grelha detetados no texto. */
  tablesDescription: string
}

function strArr(v: unknown, max = 30): string[] {
  if (!Array.isArray(v)) return []
  const out: string[] = []
  for (const x of v) {
    if (typeof x === 'string' && x.trim()) out.push(x.trim())
    if (out.length >= max) break
  }
  return out
}

function normalizeExtendedInsights(data: unknown): ExtendedInsights {
  const empty: ExtendedInsights = {
    keywords: [],
    mainPoints: [],
    suggestedQuestions: [],
    timeline: [],
    entities: { people: [], organizations: [], places: [], amounts: [] },
    translation: { summaryEn: '' },
    tone: { formality: '', documentTypeGuess: '', audience: '' },
    readingLevel: '',
    sensitiveHints: [],
    tablesDescription: '',
  }
  if (!data || typeof data !== 'object') return empty
  const o = data as Record<string, unknown>

  const timeline: TimelineEntry[] = []
  if (Array.isArray(o.timeline)) {
    for (const item of o.timeline) {
      if (!item || typeof item !== 'object') continue
      const t = item as Record<string, unknown>
      const event = typeof t.event === 'string' ? t.event.trim() : ''
      if (!event) continue
      const when = typeof t.when === 'string' ? t.when.trim() : undefined
      timeline.push({ when, event })
    }
  }

  const entities = o.entities && typeof o.entities === 'object' ? (o.entities as Record<string, unknown>) : {}
  const sens: SensitiveHint[] = []
  if (Array.isArray(o.sensitiveHints)) {
    for (const item of o.sensitiveHints) {
      if (!item || typeof item !== 'object') continue
      const s = item as Record<string, unknown>
      const type = typeof s.type === 'string' ? s.type.trim() : 'outro'
      const note = typeof s.note === 'string' ? s.note.trim() : ''
      if (note) sens.push({ type, note })
    }
  }

  const translation = o.translation && typeof o.translation === 'object' ? (o.translation as Record<string, unknown>) : {}
  const tone = o.tone && typeof o.tone === 'object' ? (o.tone as Record<string, unknown>) : {}

  return {
    keywords: strArr(o.keywords, 20),
    mainPoints: strArr(o.mainPoints, 12),
    suggestedQuestions: strArr(o.suggestedQuestions, 8),
    timeline: timeline.slice(0, 25),
    entities: {
      people: strArr(entities.people, 15),
      organizations: strArr(entities.organizations, 15),
      places: strArr(entities.places, 15),
      amounts: strArr(entities.amounts, 20),
    },
    translation: {
      summaryEn:
        typeof translation.summaryEn === 'string' ? translation.summaryEn.trim() : '',
    },
    tone: {
      formality: typeof tone.formality === 'string' ? tone.formality.trim() : '',
      documentTypeGuess:
        typeof tone.documentTypeGuess === 'string' ? tone.documentTypeGuess.trim() : '',
      audience: typeof tone.audience === 'string' ? tone.audience.trim() : '',
    },
    readingLevel: typeof o.readingLevel === 'string' ? o.readingLevel.trim() : '',
    sensitiveHints: sens.slice(0, 15),
    tablesDescription:
      typeof o.tablesDescription === 'string' ? o.tablesDescription.trim() : '',
  }
}

/**
 * Um único JSON com palavras-chave, pontos principais, entidades, etc.
 */
export async function extractExtendedInsightsWithGroq(
  textSample: string,
  apiKey: string,
): Promise<ExtendedInsights> {
  const res = await fetch(GROQ_CHAT_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content:
            'Extrai metadados e estruturas a partir de documentos. Responde só JSON válido, em português exceto summaryEn em inglês.',
        },
        {
          role: 'user',
          content: `Analisa o texto abaixo (PDF extraído) e devolve JSON com este formato exato (usa arrays vazios [] ou strings vazias "" quando não houver dados; não inventes factos sem suporte no texto):

{
  "keywords": ["5 a 15 termos ou expressões-chave"],
  "mainPoints": ["5 a 7 frases curtas: o essencial do documento"],
  "suggestedQuestions": ["3 a 5 perguntas que um leitor faria ao documento"],
  "timeline": [ { "when": "data ou período se existir", "event": "descrição breve" } ],
  "entities": {
    "people": ["nomes de pessoas mencionadas"],
    "organizations": ["empresas, serviços, instituições"],
    "places": ["locais ou moradas relevantes"],
    "amounts": ["valores monetários, doses, quantidades importantes como texto"]
  },
  "translation": { "summaryEn": "parágrafo curto em inglês que resuma o documento (80-180 palavras)" },
  "tone": {
    "formality": "Formal / Informal / Misto — uma palavra ou frase curta",
    "documentTypeGuess": "tipo inferido (ex.: receita, fatura, relatório)",
    "audience": "para quem parece destinado (ex.: paciente, cliente, tribunal)"
  },
  "readingLevel": "estimativa simples (ex.: leigo, técnico, académico, infantil)",
  "sensitiveHints": [ { "type": "email | telefone | NIF | IBAN | outro", "note": "aviso sem copiar o dado completo se possível" } ],
  "tablesDescription": "se existirem tabelas ou dados em grelha no texto, descreve em 1-3 frases; senão string vazia"
}

Texto:
---
${textSample}
---`,
        },
      ],
      temperature: 0.25,
      max_tokens: 3_000,
    }),
  })

  if (!res.ok) {
    const errBody = await res.text()
    throw new Error(`Groq insights (${res.status}): ${errBody}`)
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>
  }
  const content = data.choices?.[0]?.message?.content?.trim()
  if (!content) return normalizeExtendedInsights(null)

  try {
    const parsed = parseGroqJsonText(content)
    return normalizeExtendedInsights(parsed)
  } catch {
    return normalizeExtendedInsights(null)
  }
}

/** Resposta a uma pergunta sobre o documento. */
export async function answerQuestionWithGroq(
  textSample: string,
  question: string,
  apiKey: string,
): Promise<string> {
  const q = question.trim()
  if (!q) throw new Error('Escreve uma pergunta.')

  const res = await fetch(GROQ_CHAT_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages: [
        {
          role: 'system',
          content:
            'Respondes em português com base apenas no texto fornecido. Se não houver informação, diz claramente que não consta no documento.',
        },
        {
          role: 'user',
          content: `Texto do documento:
---
${textSample}
---

Pergunta do utilizador: ${q}

Resposta direta e objetiva (Markdown simples permitido).`,
        },
      ],
      temperature: 0.3,
      max_tokens: 1_024,
    }),
  })

  if (!res.ok) {
    const errBody = await res.text()
    throw new Error(`Groq chat (${res.status}): ${errBody}`)
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>
  }
  const content = data.choices?.[0]?.message?.content?.trim()
  if (!content) throw new Error('Resposta vazia.')
  return content
}

/** Compara dois textos extraídos (resumo das diferenças e semelhanças). */
export async function compareDocumentsWithGroq(
  textA: string,
  textB: string,
  apiKey: string,
): Promise<string> {
  const res = await fetch(GROQ_CHAT_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages: [
        {
          role: 'system',
          content:
            'Comparas dois documentos em português. Usa Markdown: ## secções, listas, **negrito**. Sê factual.',
        },
        {
          role: 'user',
          content: `Documento A:
---
${textA.slice(0, 24_000)}
---

Documento B:
---
${textB.slice(0, 24_000)}
---

Compara: (1) propósito/tipo de cada um, (2) pontos em comum, (3) diferenças principais, (4) se um complementa ou contradiz o outro. Se um texto for muito curto, indica-o.`,
        },
      ],
      temperature: 0.35,
      max_tokens: 1_800,
    }),
  })

  if (!res.ok) {
    const errBody = await res.text()
    throw new Error(`Groq comparar (${res.status}): ${errBody}`)
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>
  }
  const content = data.choices?.[0]?.message?.content?.trim()
  if (!content) throw new Error('Resposta vazia na comparação.')
  return content
}

function normalizeMindMap(data: unknown): MindMapResult {
  const empty: MindMapResult = {
    center: 'Documento',
    branches: [],
  }
  if (!data || typeof data !== 'object') return empty
  const o = data as Record<string, unknown>
  const center =
    typeof o.center === 'string' && o.center.trim() ? o.center.trim() : empty.center

  const branches: MindMapBranch[] = []
  if (Array.isArray(o.branches)) {
    for (const item of o.branches) {
      if (!item || typeof item !== 'object') continue
      const b = item as Record<string, unknown>
      const label = typeof b.label === 'string' ? b.label.trim() : ''
      if (!label) continue
      const sub: string[] = []
      if (Array.isArray(b.sub)) {
        for (const s of b.sub) {
          if (typeof s === 'string' && s.trim()) sub.push(s.trim())
        }
      }
      branches.push({ label, sub: sub.length ? sub : undefined })
    }
  }

  return { center, branches: branches.slice(0, 12) }
}

/**
 * Mapa mental do conteúdo (tema central + ramos) em JSON.
 */
export async function extractMindMapWithGroq(
  textSample: string,
  apiKey: string,
): Promise<MindMapResult> {
  const res = await fetch(GROQ_CHAT_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content:
            'Crias mapas mentais em JSON, em português. Só JSON válido, sem markdown. ' +
            'Sintetiza ideias; não copies parágrafos inteiros.',
        },
        {
          role: 'user',
          content: `Com base no texto abaixo (documento extraído), cria um **mapa mental** do conteúdo:
- **center**: uma frase curta com o tema central (o que o documento é / sobre o quê é).
- **branches**: 5 a 8 ramos principais; cada um com **label** curto e opcionalmente **sub** (2 a 5 subtópicos por ramo).

Texto:
---
${textSample}
---

JSON exato:
{
  "center": "…",
  "branches": [
    { "label": "…", "sub": ["…", "…"] }
  ]
}`,
        },
      ],
      temperature: 0.35,
      max_tokens: 1_536,
    }),
  })

  if (!res.ok) {
    const errBody = await res.text()
    throw new Error(`Groq mapa mental (${res.status}): ${errBody}`)
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>
  }
  const content = data.choices?.[0]?.message?.content?.trim()
  if (!content) {
    return { center: 'Conteúdo do documento', branches: [] }
  }

  try {
    const parsed = parseGroqJsonText(content)
    return normalizeMindMap(parsed)
  } catch {
    return { center: 'Conteúdo do documento', branches: [] }
  }
}

/**
 * Extrai texto de todas as páginas (camada de texto do PDF).
 */
async function extractTextFromPdfDocument(pdf: PDFDocumentProxy): Promise<string> {
  const parts: string[] = []

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)
    const content = await page.getTextContent()
    const items = Array.isArray(content.items) ? content.items : []
    const line = items
      .map((item) => {
        if (!item || typeof item !== 'object') return ''
        const str = (item as { str?: unknown }).str
        return typeof str === 'string' ? str : ''
      })
      .filter(Boolean)
      .join(' ')
    parts.push(line)
  }

  return parts.join('\n\n').trim()
}

/**
 * Renderiza cada página a canvas e corre OCR (português + inglês).
 */
export async function ocrPdfToText(
  pdf: PDFDocumentProxy,
  onProgress?: (page: number, total: number) => void,
): Promise<string> {
  const worker = await createWorker('por+eng')
  const parts: string[] = []
  const totalPages = Math.min(pdf.numPages, MAX_OCR_PAGES)

  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    await worker.terminate()
    throw new Error('Contexto 2D do canvas indisponível.')
  }

  try {
    for (let i = 1; i <= totalPages; i++) {
      onProgress?.(i, totalPages)
      const page = await pdf.getPage(i)
      const viewport = page.getViewport({ scale: OCR_SCALE })
      canvas.width = Math.floor(viewport.width)
      canvas.height = Math.floor(viewport.height)
      const renderTask = page.render({ canvasContext: ctx, viewport })
      await renderTask.promise

      const {
        data: { text },
      } = await worker.recognize(canvas)
      parts.push(text)
    }
  } finally {
    await worker.terminate()
  }

  if (pdf.numPages > MAX_OCR_PAGES) {
    parts.push(
      `\n\n[Nota: apenas as primeiras ${MAX_OCR_PAGES} páginas foram lidas por OCR (limite de desempenho). O PDF tem ${pdf.numPages} páginas.]`,
    )
  }

  return parts.join('\n\n').trim()
}

/**
 * Extrai texto completo de um PDF (camada de texto ou OCR).
 */
export async function extractDocumentTextFromPdf(
  file: File,
  onProgress?: AnalyzeProgress,
): Promise<{ text: string; textSource: 'pdf-text' | 'ocr' }> {
  onProgress?.({ phase: 'extract', message: 'A extrair texto do PDF…' })

  let pdf: PDFDocumentProxy
  try {
    const buf = await file.arrayBuffer()
    // Cópia independente: evita ArrayBuffer “detached” ao enviar ao worker.
    const data = new Uint8Array(buf.slice(0))
    const task = getDocument({
      data,
      useSystemFonts: true,
      isEvalSupported: false,
      useWorkerFetch: false,
      verbosity: 0,
    })
    pdf = await task.promise
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    throw new Error(
      `Não foi possível abrir o PDF neste browser (${msg}). Tenta noutro ficheiro ou atualiza o Safari/Chrome.`,
    )
  }

  let raw = await extractTextFromPdfDocument(pdf)
  let textSource: 'pdf-text' | 'ocr' = 'pdf-text'

  if (!raw.trim()) {
    onProgress?.({
      phase: 'ocr',
      message: 'Sem texto selecionável. A carregar OCR (primeira vez pode demorar)…',
    })
    try {
      raw = await ocrPdfToText(pdf, (page, total) => {
        onProgress?.({ phase: 'ocr', message: `OCR: página ${page} de ${total}…` })
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      throw new Error(
        `O OCR não conseguiu processar o PDF (${msg}). Tenta um ficheiro mais pequeno ou outro leitor de PDF.`,
      )
    }
    textSource = 'ocr'
  }

  if (!raw.trim()) {
    throw new Error(
      'Não foi possível obter texto nem pela camada do PDF nem por OCR. Verifica se o PDF é legível ou tenta noutro dispositivo.',
    )
  }

  return { text: raw, textSource }
}

/**
 * Conta palavras (separação por espaços, após trim).
 */
export function countWords(text: string): number {
  const t = text.trim()
  if (!t) return 0
  return t.split(/\s+/).length
}

/**
 * Prepara texto para envio ao modelo e devolve contagem de palavras.
 */
export function analyzeExtractedText(fullText: string): PdfAnalysisResult {
  const wordCount = countWords(fullText)
  const truncated = fullText.length > MAX_TEXT_FOR_LLM
  const textSample = truncated
    ? `${fullText.slice(0, MAX_TEXT_FOR_LLM)}\n\n[... texto truncado (${fullText.length} caracteres no total) ...]`
    : fullText

  return { wordCount, textSample }
}

/**
 * Gera resumo via API Groq (OpenAI-compatible).
 */
export async function summarizeWithGroq(
  textSample: string,
  wordCount: number,
  apiKey: string,
): Promise<string> {
  const res = await fetch(GROQ_CHAT_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages: [
        {
          role: 'system',
          content:
            'És um assistente útil. Responde em português (PT/BR neutro), claro e objetivo. ' +
            'A resposta deve ser só em Markdown (GFM): usa ## para secções, listas com - ou *, **negrito** quando ajude. ' +
            'O número de palavras que te passamos no pedido é oficial e único — não inventes outro número nem percentagens de diferença para outros valores.',
        },
        {
          role: 'user',
          content: `Texto extraído do PDF. **Contagem oficial de palavras (definitiva): ${wordCount}** — usa só este valor.

Conteúdo:
---
${textSample}
---

Responde em Markdown, nesta ordem:
1) \`## Que documento é este\` — identifica **que tipo de documento** é (ex.: receita médica, fatura, contrato, relatório, atestado, formulário) e **sobre o quê / de quem / de quando** se isso estiver no texto (2 a 5 frases). Se o tipo não for explícito, infere pelo conteúdo.
2) \`## Contagem de palavras\` — uma linha: o documento tem **${wordCount}** palavras (repete exatamente este número).
3) \`## Resumo\` — resumo estruturado do conteúdo principal (listas quando fizer sentido).`,
        },
      ],
      temperature: 0.35,
      max_tokens: 1_400,
    }),
  })

  if (!res.ok) {
    const errBody = await res.text()
    throw new Error(`Groq (${res.status}): ${errBody}`)
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>
  }
  const content = data.choices?.[0]?.message?.content?.trim()
  if (!content) throw new Error('Resposta vazia da API Groq.')
  return content
}

/**
 * Pipeline: texto do PDF; se vazio → OCR automático; resumo, insights, mapas.
 */
export async function analyzePdfAndSummarize(
  file: File,
  apiKey: string,
  onProgress?: AnalyzeProgress,
): Promise<{
  wordCount: number
  summary: string
  textSource: 'pdf-text' | 'ocr'
  monthlyMap: MonthlyMapResult
  mindMap: MindMapResult | null
  extendedInsights: ExtendedInsights
  fullText: string
  textSample: string
}> {
  const { text: raw, textSource } = await extractDocumentTextFromPdf(file, onProgress)
  const { wordCount, textSample } = analyzeExtractedText(raw)

  onProgress?.({ phase: 'groq', message: 'A pedir resumo à IA…' })
  const summary = await summarizeWithGroq(textSample, wordCount, apiKey)

  onProgress?.({ phase: 'groq', message: 'A gerar insights e mapa temporal (paralelo)…' })
  const [extendedInsights, monthlyMap] = await Promise.all([
    extractExtendedInsightsWithGroq(textSample, apiKey),
    extractMonthlyMapWithGroq(textSample, apiKey),
  ])

  let mindMap: MindMapResult | null = null
  if (monthlyMap.entries.length === 0) {
    onProgress?.({ phase: 'groq', message: 'A gerar mapa mental em ramos (Mermaid)…' })
    mindMap = await extractMindMapWithGroq(textSample, apiKey)
  }

  return {
    wordCount,
    summary,
    textSource,
    monthlyMap,
    mindMap,
    extendedInsights,
    fullText: raw,
    textSample,
  }
}
