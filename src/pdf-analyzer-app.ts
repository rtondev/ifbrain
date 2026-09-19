import './polyfills.js'
import type { PropertyValues } from '@lit/reactive-element'
import { LitElement, css, html, unsafeCSS } from 'lit'
import { unsafeHTML } from 'lit/directives/unsafe-html.js'
import { customElement, state } from 'lit/decorators.js'
import fontAwesomeCss from '@fortawesome/fontawesome-free/css/all.min.css?inline'
import {
  analyzePdfAndSummarize,
  answerQuestionWithGroq,
  compareDocumentsWithGroq,
  extractDocumentTextFromPdf,
  MAX_OCR_PAGES,
} from './pdf-analysis.js'
import type {
  ExtendedInsights,
  MindMapResult,
  MonthlyMapResult,
} from './pdf-analysis.js'
import {
  mindMapToMermaidDefinition,
  monthlyMapToMermaidDefinition,
  renderMermaidToSvg,
} from './mermaid-mindmap.js'
import { markdownToSafeHtml } from './render-markdown.js'
import html2canvas from 'html2canvas'
import { jsPDF } from 'jspdf'

/** Frases retro / humor para acompanhar a contagem de palavras. */
const WORDS_RETRO_PHRASES = [
  'Cheiro a papel térmico e café frio.',
  'Um oceano modesto de tipografia.',
  'Palavras que não pediram licença ao silêncio.',
  'Texto com sabor a máquina de escrever barulhenta.',
  'Onde cada vírgula conta uma pequena novela.',
  'Um bando de letras a fazer de conta que são civilizadas.',
  'Nem sempre breve, mas sempre com atitude.',
  'Da era em que “scroll” era barra lateral.',
  'Se fosse fita cassete, já tinha mudado de lado.',
  'Documento que merecia uma moldura barata.',
  'Entre parágrafos, a vida acontece aos saltos.',
  'Resumo possível: muita coisa para pouca margem.',
]

function pickRetroPhrase(wordCount: number): string {
  return WORDS_RETRO_PHRASES[wordCount % WORDS_RETRO_PHRASES.length]
}

function readingTimeHint(wordCount: number): string {
  const min = Math.max(1, Math.round(wordCount / 200))
  return `Leitura aprox.: ~${min} min (a ~200 pal./min).`
}

function wordsCuriosityLine(wordCount: number): string {
  const lines = [
    `Em média, ${wordCount} palavras ≈ ${Math.max(1, Math.round(wordCount / 130))} min de fala contínua.`,
    `Dá para ${Math.max(1, Math.floor(wordCount / 15))} tweets antigos (140 caracteres cada, em ideia).`,
    `Se cada palavra fosse 1 passo, seriam ~${(wordCount * 0.65).toFixed(0)} m de caminhada simbólica.`,
  ]
  return lines[wordCount % lines.length]
}

@customElement('pdf-analyzer-app')
export class PdfAnalyzerApp extends LitElement {
  private _lastMermaidDef = ''
  @state()
  private file: File | null = null

  @state()
  private wordCount: number | null = null

  @state()
  private summary = ''

  @state()
  private textSource: 'pdf-text' | 'ocr' | null = null

  @state()
  private monthlyMap: MonthlyMapResult | null = null

  @state()
  private mindMap: MindMapResult | null = null

  @state()
  private extendedInsights: ExtendedInsights | null = null

  @state()
  private fullText = ''

  @state()
  private textSample = ''

  @state()
  private compareFile: File | null = null

  @state()
  private compareResult = ''

  @state()
  private compareLoading = false

  @state()
  private chatQuestion = ''

  @state()
  private chatAnswer = ''

  @state()
  private chatLoading = false

  @state()
  private ttsActive = false

  @state()
  private ttsEstimateSec = 0

  @state()
  private ttsElapsedSec = 0

  @state()
  private ttsProgressPct = 0

  @state()
  private mapExportError = ''

  private _ttsTimer: ReturnType<typeof setInterval> | null = null

  private _ttsResetTimeout: ReturnType<typeof setTimeout> | null = null

  @state()
  private loading = false

  @state()
  private error = ''

  @state()
  private statusHint = ''

  render() {
    const apiKey = import.meta.env.VITE_GROQ_API_KEY?.trim() ?? ''

    return html`
      <section id="center">
        <h1>
          <i class="fa-solid fa-file-pdf fa-icon-title" aria-hidden="true"></i>
          Análise de PDF
        </h1>
        <p class="lead">
          <i class="fa-solid fa-wand-magic-sparkles icon-gap" aria-hidden="true"></i>
          Carrega um PDF: <strong>resumo</strong>, <strong>insights</strong> (palavras-chave,
          pontos, perguntas, cronologia, entidades, tradução EN, tom, nível de leitura, dados
          sensíveis, tabelas), <strong>mapa mental</strong> (Mermaid), <strong>chat</strong> com o
          documento, <strong>comparar</strong> com outro PDF, <strong>exportar</strong> e
          <strong>ouvir</strong> o resumo (Groq).
        </p>
        <p class="note-scan">
          <i class="fa-solid fa-eye icon-gap" aria-hidden="true"></i>
          <strong>Digitalizações:</strong> primeiro tentamos ler o <em>texto do PDF</em>. Se não
          houver texto (só imagem/scan), corre-se <strong>OCR automático</strong> no teu
          dispositivo — a primeira vez pode demorar a descarregar os idiomas. PDFs muito longos
          usam OCR só até ${MAX_OCR_PAGES} páginas por desempenho.
        </p>

        ${!import.meta.env.VITE_GROQ_API_KEY
          ? html`
              <div class="warn" role="status">
                <i class="fa-solid fa-key icon-gap" aria-hidden="true"></i>
                <strong>Chave API em falta.</strong> Cria
                <code>.env.local</code> na raiz com
                <code>VITE_GROQ_API_KEY=…</code>
                (<a href="https://console.groq.com/keys" target="_blank" rel="noreferrer"
                  >console.groq.com</a
                >). Reinicia o <code>dev</code> depois de guardar.
              </div>
            `
          : null}

        <div class="file-panel" @dragover=${this._onDragOver} @drop=${this._onDrop}>
          <div class="file-panel__head">
            <span class="file-panel__title"
              ><i class="fa-solid fa-folder-open icon-gap" aria-hidden="true"></i>Ficheiro PDF</span
            >
            <span class="file-panel__hint"
              >Arrasta para aqui ou escolhe um ficheiro · digitalizações usam OCR se não houver
              texto</span
            >
          </div>
          <div class="file-panel__body">
            <input
              id="pdf-file"
              class="file-input-hidden"
              type="file"
              accept="application/pdf,.pdf"
              @change=${this._onFile}
              ?disabled=${this.loading}
            />
            <label for="pdf-file" class="pick-file" ?data-has-file=${!!this.file}>
              ${this.file
                ? html`<span class="pick-file__name" title=${this.file.name}>${this.file.name}</span>`
                : html`<span class="pick-file__cta"
                  ><i class="fa-solid fa-file-arrow-up icon-gap" aria-hidden="true"></i>Escolher
                  PDF…</span
                >`}
            </label>
            ${this.file
              ? html`
                  <button
                    type="button"
                    class="clear-file"
                    @click=${this._clearFile}
                    ?disabled=${this.loading}
                    aria-label="Remover ficheiro"
                  >
                    Remover
                  </button>
                `
              : null}
          </div>
          <div class="file-panel__foot">
            <button
              type="button"
              class="counter counter--primary"
              @click=${() => this._analyze(apiKey)}
              ?disabled=${this.loading || !this.file || !apiKey}
            >
              ${this.loading
                ? html`<i class="fa-solid fa-spinner fa-spin icon-gap" aria-hidden="true"></i>A
                    analisar…`
                : html`<i class="fa-solid fa-magnifying-glass-chart icon-gap" aria-hidden="true"></i
                    >Analisar PDF`}
            </button>
          </div>
        </div>

        ${this.loading && this.statusHint
          ? html`<p class="status-hint" role="status">${this.statusHint}</p>`
          : null}

        ${this.error ? html`<p class="err" role="alert">${this.error}</p>` : null}
      </section>

      ${this.wordCount !== null
        ? html`
            <div class="ticks"></div>
            <section id="results-wrap">
              <p
                class="source-badge ${this.textSource === 'ocr'
                  ? 'source-badge--ocr'
                  : 'source-badge--layer'}"
              >
                ${this.textSource === 'ocr'
                  ? html`<i class="fa-solid fa-camera-retro icon-gap" aria-hidden="true"></i>Texto
                      obtido por OCR automático (digitalização).`
                  : html`<i class="fa-solid fa-layer-group icon-gap" aria-hidden="true"></i>Texto
                      lido da camada do PDF (selecionável).`}
              </p>
              <div class="results-cols">
                <div class="result-col result-col--words">
                  <h2>
                    <i class="fa-solid fa-hashtag icon-gap" aria-hidden="true"></i>
                    Palavras
                  </h2>
                  <p class="stat">${this.wordCount}</p>
                  <p class="retro-line">${pickRetroPhrase(this.wordCount!)}</p>
                  <p class="words-meta">${readingTimeHint(this.wordCount!)}</p>
                  <p class="words-meta words-meta--soft">
                    ${wordsCuriosityLine(this.wordCount!)}
                  </p>
                </div>
                <div class="result-col result-col--summary">
                  <h2>
                    <i class="fa-solid fa-robot icon-gap" aria-hidden="true"></i>
                    Análise (IA)
                  </h2>
                  <div class="summary markdown-body">
                    ${unsafeHTML(markdownToSafeHtml(this.summary))}
                  </div>
                </div>
              </div>
              <div class="action-toolbar">
                <button
                  type="button"
                  class="toolbar-btn"
                  @click=${this._exportJson}
                  ?disabled=${!this.extendedInsights}
                >
                  <i class="fa-solid fa-file-code" aria-hidden="true"></i>
                  Exportar JSON
                </button>
                <button
                  type="button"
                  class="toolbar-btn"
                  @click=${this._exportTxt}
                  ?disabled=${!this.fullText}
                >
                  <i class="fa-solid fa-file-lines" aria-hidden="true"></i>
                  Exportar texto (.txt)
                </button>
                <button
                  type="button"
                  class="toolbar-btn"
                  @click=${this._toggleTts}
                  ?disabled=${!this.summary}
                >
                  ${this.ttsActive
                    ? html`<i class="fa-solid fa-stop" aria-hidden="true"></i> Parar voz`
                    : html`<i class="fa-solid fa-volume-high" aria-hidden="true"></i> Ouvir resumo
                        (voz)`}
                </button>
              </div>
              ${this.summary && (this.ttsActive || this.ttsProgressPct > 0)
                ? html`
                    <div class="tts-panel" role="region" aria-label="Progresso da leitura em voz">
                      <div
                        class="tts-bar-wrap"
                        role="progressbar"
                        aria-valuemin="0"
                        aria-valuemax="100"
                        aria-valuenow=${Math.round(this.ttsProgressPct)}
                        aria-label="Progresso estimado da leitura"
                      >
                        <div class="tts-bar-fill" style="width: ${this.ttsProgressPct}%"></div>
                      </div>
                      <p class="tts-meta">
                        <i class="fa-solid fa-stopwatch icon-gap" aria-hidden="true"></i>
                        Estimativa total: ~${this._fmtTts(this.ttsEstimateSec)} · Decorrido:
                        ${this._fmtTts(this.ttsElapsedSec)} · Faltam ~${this._fmtTts(
                          Math.max(0, this.ttsEstimateSec - this.ttsElapsedSec),
                        )}
                      </p>
                    </div>
                  `
                : null}
              ${this._renderInsightsDeck()}
              <div class="extras-grid">
                <div class="extra-card">
                  <h3 class="extra-title">
                    <i class="fa-solid fa-comments icon-gap" aria-hidden="true"></i>
                    Perguntar ao documento
                  </h3>
                  <div class="chat-composer">
                    <textarea
                      class="chat-input"
                      rows="3"
                      placeholder="Escreve uma pergunta sobre o conteúdo…"
                      .value=${this.chatQuestion}
                      @input=${(e: Event) => {
                        this.chatQuestion = (e.target as HTMLTextAreaElement).value
                      }}
                      @keydown=${(e: KeyboardEvent) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault()
                          void this._askChat(apiKey)
                        }
                      }}
                      ?disabled=${this.chatLoading}
                    ></textarea>
                    <button
                      type="button"
                      class="send-btn"
                      @click=${() => this._askChat(apiKey)}
                      ?disabled=${this.chatLoading || !this.textSample || !this.chatQuestion.trim() || !apiKey}
                      aria-label=${this.chatLoading ? 'A pensar' : 'Enviar pergunta'}
                      title=${this.chatLoading ? 'A pensar…' : 'Enviar pergunta'}
                    >
                      ${this.chatLoading
                        ? html`<i class="fa-solid fa-spinner fa-spin" aria-hidden="true"></i>`
                        : html`<i class="fa-solid fa-paper-plane" aria-hidden="true"></i>`}
                      <span class="send-btn__label">${this.chatLoading ? 'A pensar…' : 'Enviar'}</span>
                    </button>
                  </div>
                  ${this.chatAnswer
                    ? html`<div class="chat-answer markdown-body">
                        ${unsafeHTML(markdownToSafeHtml(this.chatAnswer))}
                      </div>`
                    : null}
                </div>
                <div class="extra-card">
                  <h3 class="extra-title">
                    <i class="fa-solid fa-code-compare icon-gap" aria-hidden="true"></i>
                    Comparar com outro PDF
                  </h3>
                  <input
                    id="compare-pdf"
                    type="file"
                    accept="application/pdf,.pdf"
                    class="compare-input"
                    @change=${this._onCompareFile}
                    ?disabled=${this.compareLoading}
                  />
                  ${this.compareFile
                    ? html`<p class="compare-name">${this.compareFile.name}</p>`
                    : null}
                  <button
                    type="button"
                    class="counter counter--small"
                    @click=${() => this._compareDocs(apiKey)}
                    ?disabled=${this.compareLoading ||
                    !this.compareFile ||
                    !this.textSample ||
                    !apiKey}
                  >
                    ${this.compareLoading
                      ? html`<i class="fa-solid fa-spinner fa-spin icon-gap" aria-hidden="true"></i
                          >A comparar…`
                      : html`<i class="fa-solid fa-scale-balanced icon-gap" aria-hidden="true"></i
                          >Comparar documentos`}
                  </button>
                  ${this.compareResult
                    ? html`<div class="compare-out markdown-body">
                        ${unsafeHTML(markdownToSafeHtml(this.compareResult))}
                      </div>`
                    : null}
                </div>
              </div>
              ${this._renderMapaMentalSection()}
            </section>
          `
        : null}

      <div class="ticks"></div>
      <section id="spacer"></section>
    `
  }

  private _onDragOver(e: DragEvent) {
    e.preventDefault()
    e.stopPropagation()
  }

  private _onDrop(e: DragEvent) {
    e.preventDefault()
    const f = e.dataTransfer?.files?.[0]
    if (!f) return
    const ok =
      f.type === 'application/pdf' ||
      f.name.toLowerCase().endsWith('.pdf')
    if (!ok) {
      this.error = 'Larga um ficheiro PDF (.pdf).'
      return
    }
    this._setFile(f)
  }

  private _setFile(f: File | null) {
    this._stopTtsPlayback()
    this.mapExportError = ''
    this.file = f
    this.error = ''
    this.wordCount = null
    this.summary = ''
    this.textSource = null
    this.monthlyMap = null
    this.mindMap = null
    this.extendedInsights = null
    this.fullText = ''
    this.textSample = ''
    this.compareFile = null
    this.compareResult = ''
    this.chatQuestion = ''
    this.chatAnswer = ''
    this._lastMermaidDef = ''
    this.statusHint = ''
  }

  private _onFile(e: Event) {
    const input = e.target as HTMLInputElement
    const f = input.files?.[0] ?? null
    this._setFile(f)
  }

  private _clearFile() {
    this._setFile(null)
    const el = this.renderRoot.querySelector<HTMLInputElement>('#pdf-file')
    if (el) el.value = ''
  }

  private async _analyze(apiKey: string) {
    if (!this.file || !apiKey) return
    this._stopTtsPlayback()
    this.mapExportError = ''
    this.loading = true
    this.error = ''
    this.wordCount = null
    this.summary = ''
    this.textSource = null
    this.monthlyMap = null
    this.mindMap = null
    this.extendedInsights = null
    this.fullText = ''
    this.textSample = ''
    this.compareResult = ''
    this.chatAnswer = ''
    this._lastMermaidDef = ''
    this.statusHint = 'A preparar…'

    try {
      const {
        wordCount,
        summary,
        textSource,
        monthlyMap,
        mindMap,
        extendedInsights,
        fullText,
        textSample,
      } = await analyzePdfAndSummarize(this.file, apiKey, (info) => {
        if (info.message) this.statusHint = info.message
      })
      this.wordCount = wordCount
      this.summary = summary
      this.textSource = textSource
      this.monthlyMap = monthlyMap
      this.mindMap = mindMap
      this.extendedInsights = extendedInsights
      this.fullText = fullText
      this.textSample = textSample
    } catch (err) {
      this.error = err instanceof Error ? err.message : String(err)
    } finally {
      this.loading = false
      this.statusHint = ''
    }
  }

  protected updated(changed: PropertyValues) {
    super.updated(changed)
    if (changed.has('mindMap') || changed.has('monthlyMap')) {
      void this._syncMermaid()
    }
  }

  private _badMapTitle(t: string): boolean {
    const s = t.trim()
    if (!s) return true
    if (/^acesso\s+a\s+dados/i.test(s)) return true
    return false
  }

  private async _syncMermaid() {
    const host = this.renderRoot.querySelector('#mermaid-svg-host') as HTMLElement | null
    if (!host) return

    const hasMonthly = this.monthlyMap && this.monthlyMap.entries.length > 0
    const mmMind = this.mindMap

    if (!hasMonthly && !mmMind) {
      host.innerHTML = ''
      this._lastMermaidDef = ''
      return
    }

    const def = hasMonthly
      ? monthlyMapToMermaidDefinition(this.monthlyMap!)
      : mindMapToMermaidDefinition(mmMind!)

    if (def === this._lastMermaidDef) return
    this._lastMermaidDef = def

    try {
      host.innerHTML = await renderMermaidToSvg(def)
    } catch (err) {
      console.error(err)
      host.innerHTML =
        '<p class="mapa-mental-fail">Não foi possível desenhar o diagrama Mermaid. Recarrega e tenta outra vez.</p>'
    }
  }

  private _renderInsightsDeck() {
    const ex = this.extendedInsights
    if (!ex) return null
    const li = (items: string[]) =>
      items.length
        ? html`<ul class="insight-ul">
            ${items.map((i) => html`<li>${i}</li>`)}
          </ul>`
        : html`<p class="empty-hint">—</p>`

    return html`
      <div class="insights-deck">
        <h2 class="section-title">
          <i class="fa-solid fa-lightbulb icon-gap" aria-hidden="true"></i>
          Insights extra
        </h2>
        <div class="insights-grid">
          <details class="insight-block" open>
            <summary
              ><i class="fa-solid fa-key icon-summary" aria-hidden="true"></i>Palavras-chave</summary
            >
            ${li(ex.keywords)}
          </details>
          <details class="insight-block" open>
            <summary
              ><i class="fa-solid fa-list-check icon-summary" aria-hidden="true"></i>Pontos
              principais</summary
            >
            ${li(ex.mainPoints)}
          </details>
          <details class="insight-block">
            <summary
              ><i class="fa-solid fa-circle-question icon-summary" aria-hidden="true"></i>Perguntas
              sugeridas</summary
            >
            ${li(ex.suggestedQuestions)}
          </details>
          <details class="insight-block">
            <summary
              ><i class="fa-solid fa-clock-rotate-left icon-summary" aria-hidden="true"></i
              >Cronologia</summary
            >
            ${ex.timeline.length
              ? html`<ul class="insight-ul">
                  ${ex.timeline.map(
                    (t) =>
                      html`<li>${t.when ? html`<strong>${t.when}</strong> — ` : ''}${t.event}</li>`,
                  )}
                </ul>`
              : html`<p class="empty-hint">—</p>`}
          </details>
          <details class="insight-block">
            <summary
              ><i class="fa-solid fa-users icon-summary" aria-hidden="true"></i>Entidades</summary
            >
            <div class="entity-cols">
              <div>
                <span class="entity-label">Pessoas</span>
                ${li(ex.entities.people)}
              </div>
              <div>
                <span class="entity-label">Organizações</span>
                ${li(ex.entities.organizations)}
              </div>
              <div>
                <span class="entity-label">Locais</span>
                ${li(ex.entities.places)}
              </div>
              <div>
                <span class="entity-label">Valores / quantidades</span>
                ${li(ex.entities.amounts)}
              </div>
            </div>
          </details>
          <details class="insight-block">
            <summary
              ><i class="fa-solid fa-language icon-summary" aria-hidden="true"></i>Tradução
              (EN)</summary
            >
            ${ex.translation.summaryEn
              ? html`<p class="trans-en">${ex.translation.summaryEn}</p>`
              : html`<p class="empty-hint">—</p>`}
          </details>
          <details class="insight-block">
            <summary
              ><i class="fa-solid fa-masks-theater icon-summary" aria-hidden="true"></i>Tom e
              tipo</summary
            >
            <p><strong>Formalidade:</strong> ${ex.tone.formality || '—'}</p>
            <p><strong>Tipo de documento:</strong> ${ex.tone.documentTypeGuess || '—'}</p>
            <p><strong>Público:</strong> ${ex.tone.audience || '—'}</p>
          </details>
          <details class="insight-block">
            <summary
              ><i class="fa-solid fa-book-open icon-summary" aria-hidden="true"></i>Nível de
              leitura</summary
            >
            <p>${ex.readingLevel || '—'}</p>
          </details>
          <details class="insight-block">
            <summary
              ><i class="fa-solid fa-shield-halved icon-summary" aria-hidden="true"></i>Dados
              sensíveis (aviso)</summary
            >
            ${ex.sensitiveHints.length
              ? html`<ul class="insight-ul warn-list">
                  ${ex.sensitiveHints.map(
                    (h) => html`<li><strong>${h.type}</strong>: ${h.note}</li>`,
                  )}
                </ul>`
              : html`<p class="empty-hint">Nada assinalado pela IA.</p>`}
          </details>
          <details class="insight-block">
            <summary
              ><i class="fa-solid fa-table icon-summary" aria-hidden="true"></i>Tabelas /
              grelhas</summary
            >
            <p>${ex.tablesDescription || '—'}</p>
          </details>
        </div>
      </div>
    `
  }

  private _exportJson() {
    if (!this.extendedInsights) return
    const data = {
      exportedAt: new Date().toISOString(),
      wordCount: this.wordCount,
      textSource: this.textSource,
      summary: this.summary,
      extendedInsights: this.extendedInsights,
      monthlyMap: this.monthlyMap,
      mindMap: this.mindMap,
      ...(this.fullText ? { fullText: this.fullText } : {}),
    }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'analise-pdf.json'
    a.click()
    URL.revokeObjectURL(a.href)
  }

  private _exportTxt() {
    if (!this.fullText) return
    const blob = new Blob([this.fullText], { type: 'text/plain;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'texto-extraido-pdf.txt'
    a.click()
    URL.revokeObjectURL(a.href)
  }

  private _cleanSummaryForTts(raw: string): string {
    return raw
      .replace(/#{1,6}\s/g, '')
      .replace(/\*\*/g, '')
      .replace(/`/g, '')
      .replace(/^\s*[-*]\s/gm, '')
      .slice(0, 8000)
  }

  private _fmtTts(sec: number): string {
    if (!Number.isFinite(sec) || sec < 0) return '0s'
    const s = Math.floor(sec)
    const m = Math.floor(s / 60)
    const r = s % 60
    if (m <= 0) return `${r}s`
    return `${m}m ${r}s`
  }

  private _stopTtsPlayback() {
    if (this._ttsResetTimeout) {
      clearTimeout(this._ttsResetTimeout)
      this._ttsResetTimeout = null
    }
    if (this._ttsTimer) {
      clearInterval(this._ttsTimer)
      this._ttsTimer = null
    }
    if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel()
    this.ttsActive = false
    this.ttsElapsedSec = 0
    this.ttsProgressPct = 0
    this.ttsEstimateSec = 0
  }

  private _onTtsPlaybackEnd() {
    if (this._ttsTimer) {
      clearInterval(this._ttsTimer)
      this._ttsTimer = null
    }
    this.ttsElapsedSec = this.ttsEstimateSec
    this.ttsProgressPct = 100
    this.ttsActive = false
    if (this._ttsResetTimeout) {
      clearTimeout(this._ttsResetTimeout)
      this._ttsResetTimeout = null
    }
    this._ttsResetTimeout = window.setTimeout(() => {
      this.ttsProgressPct = 0
      this.ttsElapsedSec = 0
      this.ttsEstimateSec = 0
      this._ttsResetTimeout = null
    }, 1400)
  }

  private _toggleTts() {
    if (this.ttsActive) {
      this._stopTtsPlayback()
      return
    }
    this._startTtsPlayback()
  }

  private _startTtsPlayback() {
    if (!this.summary || typeof speechSynthesis === 'undefined') return
    if (this._ttsResetTimeout) {
      clearTimeout(this._ttsResetTimeout)
      this._ttsResetTimeout = null
    }
    const t = this._cleanSummaryForTts(this.summary)
    const words = t.split(/\s+/).filter(Boolean).length
    const estimateSec = Math.max(8, Math.ceil(words / 2.35))

    this._stopTtsPlayback()
    this.ttsEstimateSec = estimateSec
    this.ttsElapsedSec = 0
    this.ttsProgressPct = 0
    this.ttsActive = true

    const u = new SpeechSynthesisUtterance(t)
    u.lang = 'pt-PT'
    u.onend = () => this._onTtsPlaybackEnd()
    u.onerror = () => this._onTtsPlaybackEnd()

    this._ttsTimer = window.setInterval(() => {
      this.ttsElapsedSec = Math.min(estimateSec, this.ttsElapsedSec + 0.1)
      this.ttsProgressPct = Math.min(99, (this.ttsElapsedSec / estimateSec) * 100)
    }, 100)

    speechSynthesis.speak(u)
  }

  /**
   * svg2pdf não aplica o CSS do Mermaid (`.section-N text { fill }`), pelo que o texto saía em branco.
   * Rasterizamos com o motor do browser e inserimos PNG no PDF; html2canvas é fallback (ex.: SVG complexo).
   */
  private async _mindMapSvgToPngDataUrl(svg: SVGSVGElement): Promise<string> {
    const rect = svg.getBoundingClientRect()
    const vb = svg.viewBox?.baseVal
    const w = Math.ceil(Math.max(rect.width, vb?.width ?? 0, 120))
    const h = Math.ceil(Math.max(rect.height, vb?.height ?? 0, 120))

    const clone = svg.cloneNode(true) as SVGSVGElement
    clone.setAttribute('width', String(w))
    clone.setAttribute('height', String(h))
    if (!clone.getAttribute('xmlns')) {
      clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
    }

    const source = new XMLSerializer().serializeToString(clone)
    const dataUrlSvg = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(source)}`

    return new Promise((resolve, reject) => {
      const img = new Image()
      img.onload = () => {
        const iw = img.naturalWidth || w
        const ih = img.naturalHeight || h
        if (iw < 2 || ih < 2) {
          reject(new Error('Dimensões SVG inválidas'))
          return
        }
        const scale = 2
        const canvas = document.createElement('canvas')
        canvas.width = iw * scale
        canvas.height = ih * scale
        const ctx = canvas.getContext('2d')
        if (!ctx) {
          reject(new Error('Canvas indisponível'))
          return
        }
        const dark = window.matchMedia('(prefers-color-scheme: dark)').matches
        ctx.fillStyle = dark ? '#0f1612' : '#f7fbf8'
        ctx.fillRect(0, 0, canvas.width, canvas.height)
        ctx.setTransform(scale, 0, 0, scale, 0, 0)
        ctx.drawImage(img, 0, 0)
        resolve(canvas.toDataURL('image/png'))
      }
      img.onerror = () => reject(new Error('Falha ao carregar SVG como imagem'))
      img.src = dataUrlSvg
    })
  }

  private async _exportMindMapPdf() {
    this.mapExportError = ''
    const host = this.renderRoot.querySelector('#mermaid-svg-host') as HTMLElement | null
    if (!host) {
      this.mapExportError = 'Área do mapa não encontrada.'
      return
    }
    const svg = host.querySelector('svg')
    if (!svg) {
      this.mapExportError = 'Ainda não há diagrama. Espera um instante e tenta outra vez.'
      return
    }
    try {
      let dataUrl: string
      try {
        dataUrl = await this._mindMapSvgToPngDataUrl(svg as SVGSVGElement)
      } catch (e1) {
        console.warn('Raster SVG → PNG falhou; a usar html2canvas', e1)
        const canvas = await html2canvas(host, {
          scale: 2,
          backgroundColor: null,
          useCORS: true,
          logging: false,
        })
        dataUrl = canvas.toDataURL('image/png', 0.92)
      }

      const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
      const pageW = pdf.internal.pageSize.getWidth()
      const pageH = pdf.internal.pageSize.getHeight()
      const margin = 12
      const maxW = pageW - 2 * margin
      const maxH = pageH - 2 * margin

      const img = new Image()
      await new Promise<void>((res, rej) => {
        img.onload = () => res()
        img.onerror = () => rej(new Error('Imagem intermédia inválida'))
        img.src = dataUrl
      })

      const iw = img.naturalWidth || 1
      const ih = img.naturalHeight || 1
      const ratio = iw / ih
      let drawW = maxW
      let drawH = drawW / ratio
      if (drawH > maxH) {
        drawH = maxH
        drawW = drawH * ratio
      }
      const x = margin + (maxW - drawW) / 2
      const y = margin + (maxH - drawH) / 2

      pdf.addImage(dataUrl, 'PNG', x, y, drawW, drawH)
      pdf.save('mapa-mental.pdf')
    } catch (err) {
      console.error(err)
      this.mapExportError =
        err instanceof Error ? err.message : 'Não foi possível gerar o PDF do mapa.'
    }
  }

  private _onCompareFile(e: Event) {
    const input = e.target as HTMLInputElement
    this.compareFile = input.files?.[0] ?? null
    this.compareResult = ''
  }

  private async _compareDocs(apiKey: string) {
    if (!this.compareFile || !this.textSample || !apiKey) return
    this.compareLoading = true
    this.compareResult = ''
    try {
      const { text: textB } = await extractDocumentTextFromPdf(this.compareFile)
      const out = await compareDocumentsWithGroq(this.textSample, textB, apiKey)
      this.compareResult = out
    } catch (err) {
      this.compareResult = `Erro: ${err instanceof Error ? err.message : String(err)}`
    } finally {
      this.compareLoading = false
    }
  }

  private async _askChat(apiKey: string) {
    const q = this.chatQuestion.trim()
    if (!q || !this.textSample || !apiKey) return
    this.chatLoading = true
    this.chatAnswer = ''
    try {
      this.chatAnswer = await answerQuestionWithGroq(this.textSample, q, apiKey)
    } catch (err) {
      this.chatAnswer = `**Erro:** ${err instanceof Error ? err.message : String(err)}`
    } finally {
      this.chatLoading = false
    }
  }

  private _renderMapaMentalSection() {
    const hasMonthly = this.monthlyMap && this.monthlyMap.entries.length > 0
    const hasMind = !!this.mindMap
    if (!hasMonthly && !hasMind) return null

    const mm = this.monthlyMap
    return html`
      <div class="mapa-mental-section">
        <div class="mapa-mental-head">
          <h2 class="mapa-mental-h2">
            <i class="fa-solid fa-diagram-project icon-gap" aria-hidden="true"></i>
            Mapa mental
          </h2>
          <button
            type="button"
            class="toolbar-btn mapa-export-btn"
            @click=${this._exportMindMapPdf}
          >
            <i class="fa-solid fa-file-pdf" aria-hidden="true"></i>
            Exportar PDF
          </button>
        </div>
        ${hasMonthly
          ? html`
              <p class="mapa-mental-lead">
                <i class="fa-solid fa-chart-column icon-gap" aria-hidden="true"></i>
                Evolução temporal dos dados encontrados no documento (gráfico de barras Mermaid).
              </p>
              ${!this._badMapTitle(mm!.title)
                ? html`<p class="mapa-mental-sub">${mm!.title}</p>`
                : null}
              ${mm!.unit
                ? html`<p class="mapa-mental-unit">
                    Unidade: <strong>${mm!.unit}</strong>
                  </p>`
                : null}
            `
          : html`
              <p class="mapa-mental-lead">
                <i class="fa-solid fa-code-branch icon-gap" aria-hidden="true"></i>
                Estrutura em ramos do conteúdo (diagrama Mermaid). Sem série mensal clara no texto.
              </p>
            `}
        <div id="mermaid-svg-host" class="mermaid-svg-host"></div>
        ${this.mapExportError
          ? html`<p class="mapa-export-err" role="alert">${this.mapExportError}</p>`
          : null}
      </div>
    `
  }

  disconnectedCallback(): void {
    super.disconnectedCallback()
    this._stopTtsPlayback()
  }

  static styles = [
    unsafeCSS(fontAwesomeCss),
    css`
    :host {
      --text: #1c1c1e;
      --text-h: #000000;
      --bg: #ffffff;
      --border: rgba(60, 60, 67, 0.12);
      --code-bg: #f2f2f7;
      --accent: #007aff;
      --accent-bg: rgba(0, 122, 255, 0.1);
      --accent-border: rgba(0, 122, 255, 0.35);
      --accent-alt: #ff3b30;
      --accent-alt-bg: rgba(255, 59, 48, 0.1);
      --accent-alt-border: rgba(255, 59, 48, 0.35);
      --social-bg: #f2f2f7;
      --shadow: 0 8px 28px rgba(0, 0, 0, 0.06);
      --link: #007aff;
      --muted: #8e8e93;

      --sans: -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', system-ui, sans-serif;
      --heading: -apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Segoe UI', system-ui, sans-serif;
      --mono: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;

      font: 17px/1.47 var(--sans);
      letter-spacing: -0.22px;

      width: 1126px;
      max-width: calc(100% - 24px);
      margin: 12px auto 24px;
      text-align: center;
      min-height: calc(100svh - 3.5rem);
      display: flex;
      flex-direction: column;
      box-sizing: border-box;
      color: var(--text);
    }

    @media (prefers-color-scheme: dark) {
      :host {
        --text: #f5f5f7;
        --text-h: #ffffff;
        --bg: #1c1c1e;
        --border: rgba(84, 84, 88, 0.45);
        --code-bg: #2c2c2e;
        --accent: #0a84ff;
        --accent-bg: rgba(10, 132, 255, 0.16);
        --accent-border: rgba(10, 132, 255, 0.45);
        --accent-alt: #ff453a;
        --accent-alt-bg: rgba(255, 69, 58, 0.16);
        --accent-alt-border: rgba(255, 69, 58, 0.45);
        --social-bg: #2c2c2e;
        --shadow: 0 8px 28px rgba(0, 0, 0, 0.4);
        --link: #0a84ff;
        --muted: #8e8e93;
      }
    }

    a {
      color: var(--link);
      text-underline-offset: 3px;
    }

    h1,
    h2 {
      font-family: var(--heading);
      font-weight: 700;
      color: var(--text-h);
    }

    h1 {
      font-size: 40px;
      line-height: 1.05;
      letter-spacing: -1.2px;
      margin: 0 0 12px;
      text-align: left;
    }

    h2 {
      font-size: 24px;
      line-height: 118%;
      letter-spacing: -0.24px;
      margin: 0 0 8px;
    }

    p {
      margin: 0;
    }

    .lead {
      max-width: 40rem;
      margin: 0 0 8px;
      text-align: left;
      font-size: 17px;
      line-height: 1.47;
      font-weight: 400;
    }

    .note-scan {
      max-width: 40rem;
      margin: 0 0 8px;
      padding: 0;
      text-align: left;
      font-size: 17px;
      line-height: 1.47;
      border-radius: 0;
      border: none;
      background: transparent;
      color: var(--text);
    }

    .note-scan strong {
      color: var(--text-h);
    }

    code {
      font-family: var(--mono);
      font-size: 15px;
      line-height: 135%;
      display: inline-flex;
      padding: 4px 8px;
      border-radius: 4px;
      color: var(--text-h);
      background: var(--code-bg);
    }

    .warn {
      max-width: 40rem;
      margin: 0 0 12px;
      padding: 14px 16px;
      text-align: left;
      border-radius: 16px;
      border: 1px solid var(--accent-alt-border);
      background: var(--accent-alt-bg);
      font-size: 15px;
    }

    .warn a {
      color: var(--accent-alt);
    }

    #center {
      display: flex;
      flex-direction: column;
      gap: 16px;
      align-items: stretch;
      flex-grow: 1;
      padding: 40px 44px 36px;
      margin: 0;
      background: var(--bg);
      border-radius: 40px;
      box-shadow: var(--shadow);
      text-align: left;
      box-sizing: border-box;
    }

    .file-input-hidden {
      position: absolute;
      width: 1px;
      height: 1px;
      padding: 0;
      margin: -1px;
      overflow: hidden;
      clip: rect(0, 0, 0, 0);
      white-space: nowrap;
      border: 0;
    }

    .file-panel {
      width: 100%;
      max-width: min(40rem, 100%);
      border-radius: 22px;
      border: 1px solid var(--border);
      background: var(--bg);
      overflow: hidden;
      box-sizing: border-box;
    }

    .file-panel__head {
      display: flex;
      flex-direction: column;
      gap: 6px;
      align-items: flex-start;
      text-align: left;
      padding: 16px 18px 14px;
      border-bottom: 1px solid var(--border);
      background: var(--social-bg);
    }

    .file-panel__title {
      font-size: 18px;
      font-weight: 600;
      color: var(--text-h);
      letter-spacing: -0.02em;
    }

    .file-panel__hint {
      font-size: 14px;
      line-height: 145%;
      color: var(--text);
    }

    .file-panel__body {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: center;
      gap: 12px;
      padding: 20px 18px;
      position: relative;
      min-height: 4.5rem;
      box-sizing: border-box;
    }

    .pick-file {
      flex: 1 1 12rem;
      min-width: 0;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 12px 16px;
      border-radius: 14px;
      border: 1.5px dashed var(--accent-border);
      background: var(--accent-bg);
      color: var(--text-h);
      cursor: pointer;
      font-size: 15px;
      font-weight: 500;
      transition:
        border-color 0.25s,
        background 0.25s,
        box-shadow 0.25s;
    }

    .pick-file:hover {
      border-color: var(--accent);
      box-shadow: var(--shadow);
    }

    .pick-file:focus-visible {
      outline: 2px solid var(--accent);
      outline-offset: 2px;
    }

    .pick-file[data-has-file] {
      border-style: solid;
      justify-content: flex-start;
    }

    .pick-file__cta {
      color: var(--accent);
    }

    .pick-file__name {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      width: 100%;
      text-align: left;
      font-family: var(--mono);
      font-size: 14px;
      font-weight: 500;
    }

    .clear-file {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      font-family: var(--sans);
      font-size: 15px;
      font-weight: 500;
      padding: 10px 16px;
      border-radius: 8px;
      border: 1px solid var(--border);
      color: var(--text-h);
      background: var(--social-bg);
      cursor: pointer;
      transition: box-shadow 0.3s, border-color 0.3s;
    }

    .clear-file:hover:not(:disabled) {
      box-shadow: var(--shadow);
      border-color: var(--accent-border);
    }

    .clear-file:focus-visible {
      outline: 2px solid var(--accent);
      outline-offset: 2px;
    }

    .clear-file:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .file-panel__foot {
      padding: 0 18px 18px;
      display: flex;
      justify-content: stretch;
    }

    .counter.counter--primary {
      width: 100%;
      max-width: none;
      flex: 1 1 auto;
      box-sizing: border-box;
      justify-content: center;
      padding: 12px 16px;
      margin-bottom: 0;
      border-radius: 14px;
      font-family: var(--sans);
      font-size: 15px;
      font-weight: 600;
    }

    .status-hint {
      margin: 0;
      max-width: 40rem;
      font-size: 15px;
      line-height: 145%;
      color: var(--accent);
      text-align: left;
    }

    .counter {
      font-family: var(--mono);
      font-size: 16px;
      display: inline-flex;
      padding: 5px 10px;
      border-radius: 5px;
      color: var(--accent);
      background: var(--accent-bg);
      border: 2px solid transparent;
      transition: border-color 0.3s;
      margin-bottom: 8px;
      cursor: pointer;
    }

    .counter:hover:not(:disabled) {
      border-color: var(--accent-border);
    }

    .counter:focus-visible {
      outline: 2px solid var(--accent);
      outline-offset: 2px;
    }

    .counter:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .err {
      color: var(--accent-alt);
      max-width: 40rem;
      font-size: 16px;
      text-align: left;
    }

    #results-wrap {
      width: 100%;
      border-top: 1px solid var(--border);
      text-align: left;
    }

    .source-badge {
      margin: 0;
      padding: 12px 20px;
      font-size: 15px;
      line-height: 145%;
      border-bottom: 1px solid var(--border);
      background: var(--accent-bg);
      color: var(--text-h);
    }

    .source-badge--ocr {
      border-left: 3px solid var(--accent);
      padding-left: 17px;
    }

    .source-badge--layer {
      border-left: 3px solid var(--border);
      padding-left: 17px;
    }

    .results-cols {
      display: flex;
      width: 100%;
    }

    .results-cols > .result-col {
      flex: 1 1 0;
      padding: 32px;
      min-width: 0;
    }

    .results-cols > .result-col:first-child {
      border-right: 1px solid var(--border);
    }

    .action-toolbar {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      padding: 16px 32px 8px;
      border-top: 1px solid var(--border);
      background: var(--bg);
    }

    .toolbar-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 10px 16px;
      font-family: var(--sans);
      font-size: 15px;
      font-weight: 500;
      border-radius: 980px;
      border: 1px solid var(--border);
      color: var(--text-h);
      background: var(--social-bg);
      cursor: pointer;
      transition: box-shadow 0.3s, border-color 0.3s;
    }

    .toolbar-btn:hover:not(:disabled) {
      box-shadow: var(--shadow);
      border-color: var(--accent-border);
    }

    .toolbar-btn:focus-visible {
      outline: 2px solid var(--accent);
      outline-offset: 2px;
    }

    .toolbar-btn:disabled {
      opacity: 0.45;
      cursor: not-allowed;
    }

    .toolbar-btn i,
    .counter--small i,
    .counter.counter--primary i {
      margin-right: 0.4em;
    }

    .fa-icon-title {
      margin-right: 0.35em;
      color: var(--accent-alt);
      font-size: 0.82em;
      vertical-align: 0.06em;
    }

    .icon-gap {
      margin-right: 0.45em;
      color: var(--accent);
      opacity: 0.95;
    }

    .fa-file-pdf.icon-gap,
    .pick-file .fa-file-arrow-up {
      color: var(--accent-alt);
    }

    .result-col--words {
      text-align: left;
    }

    .retro-line {
      margin: 14px 0 10px;
      font-size: 15px;
      font-style: italic;
      color: var(--text-h);
      line-height: 145%;
      max-width: 24rem;
    }

    .words-meta {
      margin: 0 0 6px;
      font-size: 14px;
      line-height: 142%;
      color: var(--text);
      text-align: left;
    }

    .words-meta--soft {
      font-size: 13px;
      opacity: 0.88;
    }

    .tts-panel {
      padding: 4px 32px 18px;
      background: var(--bg);
      text-align: left;
    }

    .tts-bar-wrap {
      height: 9px;
      border-radius: 999px;
      background: var(--social-bg);
      border: 1px solid var(--border);
      overflow: hidden;
      margin-bottom: 10px;
      max-width: 100%;
    }

    .tts-bar-fill {
      height: 100%;
      border-radius: inherit;
      background: linear-gradient(90deg, var(--accent), var(--accent-alt));
      transition: width 0.09s linear;
    }

    .tts-meta {
      margin: 0;
      font-size: 14px;
      line-height: 145%;
      color: var(--text);
    }

    .tts-meta .icon-gap {
      vertical-align: -0.06em;
    }

    .insights-deck {
      margin-top: 6px;
      padding: 28px 32px 14px;
      border-top: 1px solid var(--border);
      background: var(--bg);
    }

    .section-title {
      margin: 0 0 18px;
      padding-top: 2px;
      font-size: 22px;
      font-family: var(--heading);
      font-weight: 500;
      color: var(--text-h);
      letter-spacing: -0.2px;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-wrap: wrap;
      gap: 0.35em;
    }

    .icon-summary {
      margin-right: 0.45em;
      color: var(--accent);
      font-size: 0.95em;
    }

    .insights-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
      gap: 12px;
    }

    .insight-block {
      margin: 0;
      padding: 12px 14px;
      border: 1px solid var(--border);
      border-radius: 10px;
      background: var(--social-bg);
    }

    .insight-block summary {
      font-weight: 600;
      font-size: 15px;
      color: var(--text-h);
      cursor: pointer;
    }

    .insight-ul {
      margin: 10px 0 0;
      padding-left: 1.25rem;
      font-size: 15px;
      line-height: 145%;
      color: var(--text);
    }

    .insight-block p {
      margin: 0.5em 0 0;
      font-size: 15px;
      line-height: 145%;
      color: var(--text);
    }

    .entity-cols {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
      gap: 14px;
      margin-top: 10px;
    }

    .entity-label {
      display: block;
      font-size: 12px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: var(--text-h);
      margin-bottom: 6px;
      opacity: 0.85;
    }

    .trans-en {
      margin: 10px 0 0;
      font-size: 15px;
      line-height: 155%;
      color: var(--text);
    }

    .warn-list li {
      color: var(--text-h);
    }

    .empty-hint {
      margin: 10px 0 0;
      font-size: 14px;
      color: var(--text);
      opacity: 0.75;
      font-style: italic;
    }

    .extras-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
      gap: 16px;
      padding: 20px 32px 28px;
      border-top: 1px solid var(--border);
      background: var(--bg);
    }

    .extra-card {
      padding: 1rem 1.1rem;
      border: 1px solid var(--border);
      border-radius: 10px;
      background: var(--social-bg);
    }

    .extra-title {
      margin: 0 0 12px;
      font-size: 17px;
      font-weight: 600;
      font-family: var(--heading);
      color: var(--text-h);
    }

    .chat-composer {
      display: flex;
      align-items: flex-end;
      gap: 10px;
    }

    .chat-input {
      width: 100%;
      flex: 1 1 auto;
      box-sizing: border-box;
      min-height: 4.5rem;
      padding: 10px 12px;
      margin-bottom: 0;
      font-family: var(--sans);
      font-size: 15px;
      line-height: 145%;
      border-radius: 8px;
      border: 1px solid var(--border);
      background: var(--bg);
      color: var(--text-h);
      resize: vertical;
    }

    .chat-input:focus {
      outline: 2px solid var(--accent);
      outline-offset: 0;
      border-color: var(--accent-border);
    }

    .chat-input:disabled {
      opacity: 0.6;
    }

    .send-btn {
      flex-shrink: 0;
      position: relative;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 0.45rem;
      min-height: 48px;
      padding: 12px 16px;
      border: 0;
      border-radius: 10px;
      background: var(--accent);
      color: #fff;
      font-family: var(--sans);
      font-size: 15px;
      font-weight: 600;
      cursor: pointer;
      transition: filter 0.2s, box-shadow 0.2s, transform 0.15s;
    }

    .send-btn i {
      font-size: 1.05em;
      color: inherit;
    }

    .send-btn:hover:not(:disabled) {
      filter: brightness(1.08);
      box-shadow: var(--shadow);
    }

    .send-btn:focus-visible {
      outline: 2px solid var(--accent-alt);
      outline-offset: 2px;
    }

    .send-btn:disabled {
      opacity: 0.45;
      cursor: not-allowed;
    }

    @media (max-width: 640px) {
      .send-btn__label {
        position: absolute;
        width: 1px;
        height: 1px;
        overflow: hidden;
        clip: rect(0, 0, 0, 0);
      }

      .send-btn {
        width: 48px;
        padding: 0;
        border-radius: 50%;
      }
    }

    .compare-input {
      width: 100%;
      margin-bottom: 8px;
      font-size: 14px;
    }

    .compare-name {
      margin: 0 0 10px;
      font-size: 14px;
      font-family: var(--mono);
      color: var(--text-h);
      word-break: break-all;
    }

    .chat-answer,
    .compare-out {
      margin-top: 1rem;
      padding-top: 1rem;
      border-top: 1px solid var(--border);
    }

    .counter--small {
      width: auto;
      max-width: 100%;
      margin-bottom: 0;
      font-family: var(--sans);
      font-size: 15px;
      font-weight: 500;
      padding: 10px 18px;
    }

    .mapa-mental-section {
      border-top: 1px solid var(--border);
      padding: 28px 32px 36px;
      background: var(--social-bg);
      text-align: left;
    }

    .mapa-mental-head {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      margin-bottom: 14px;
    }

    .mapa-export-btn {
      flex-shrink: 0;
    }

    .mapa-export-err {
      margin: 12px 0 0;
      font-size: 14px;
      color: var(--accent-alt);
      text-align: left;
    }

    .mapa-mental-h2 {
      margin: 0;
      font-size: 24px;
      line-height: 118%;
      letter-spacing: -0.24px;
      font-family: var(--heading);
      font-weight: 500;
      color: var(--text-h);
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 0.35em;
      flex: 1 1 auto;
      min-width: 0;
    }

    .mapa-mental-lead {
      margin: 0 0 16px;
      font-size: 15px;
      line-height: 145%;
      color: var(--text);
    }

    .mapa-mental-sub {
      margin: 0 0 10px;
      font-size: 15px;
      line-height: 145%;
      color: var(--text);
      font-weight: 500;
    }

    .mapa-mental-unit {
      margin: 0 0 18px;
      font-size: 15px;
      color: var(--text);
    }

    .mermaid-svg-host {
      width: 100%;
      overflow: auto;
      border-radius: 10px;
      border: 1px solid var(--border);
      background: var(--bg);
      padding: 12px;
      box-sizing: border-box;
    }

    .mermaid-svg-host svg {
      display: block;
      max-width: 100%;
      height: auto;
      margin: 0 auto;
    }

    .mapa-mental-fail {
      margin: 0;
      padding: 12px;
      font-size: 15px;
      color: var(--accent-alt);
    }

    .markdown-body {
      font-size: 16px;
      line-height: 155%;
      word-break: break-word;
    }

    .markdown-body :first-child {
      margin-top: 0;
    }

    .markdown-body :last-child {
      margin-bottom: 0;
    }

    .markdown-body h1,
    .markdown-body h2,
    .markdown-body h3 {
      font-family: var(--heading);
      font-weight: 600;
      color: var(--text-h);
      margin: 1.1em 0 0.5em;
      line-height: 125%;
    }

    .markdown-body h1 {
      font-size: 1.35rem;
    }

    .markdown-body h2 {
      font-size: 1.2rem;
      border-bottom: 1px solid var(--border);
      padding-bottom: 0.35em;
    }

    .markdown-body h3 {
      font-size: 1.05rem;
    }

    .markdown-body p {
      margin: 0.65em 0;
    }

    .markdown-body ul,
    .markdown-body ol {
      margin: 0.5em 0 0.75em;
      padding-left: 1.35rem;
    }

    .markdown-body li {
      margin: 0.35em 0;
    }

    .markdown-body li::marker {
      color: var(--accent);
    }

    .markdown-body strong {
      color: var(--text-h);
      font-weight: 600;
    }

    .markdown-body hr {
      border: none;
      border-top: 1px solid var(--border);
      margin: 1rem 0;
    }

    .markdown-body blockquote {
      margin: 0.75em 0;
      padding: 0.5em 0 0.5em 1em;
      border-left: 3px solid var(--accent-border);
      color: var(--text);
      background: var(--social-bg);
      border-radius: 0 6px 6px 0;
    }

    .markdown-body code {
      font-size: 0.88em;
    }

    .markdown-body pre {
      margin: 0.75em 0;
      padding: 12px 14px;
      overflow: auto;
      border-radius: 8px;
      background: var(--code-bg);
      border: 1px solid var(--border);
      font-family: var(--mono);
      font-size: 14px;
      line-height: 140%;
    }

    .stat {
      margin: 8px 0 0;
      font-size: 48px;
      font-weight: 600;
      letter-spacing: -1px;
      color: var(--accent);
      font-family: var(--mono);
    }

    #spacer {
      height: 88px;
      border-top: 1px solid var(--border);
    }

    .ticks {
      position: relative;
      width: 100%;
    }

    .ticks::before,
    .ticks::after {
      content: '';
      position: absolute;
      top: -4.5px;
      border: 5px solid transparent;
    }

    .ticks::before {
      left: 0;
      border-left-color: var(--border);
    }

    .ticks::after {
      right: 0;
      border-right-color: var(--border);
    }

    @media (max-width: 1024px) {
      :host {
        font-size: 16px;
        width: 100%;
        max-width: 100%;
      }

      h1 {
        font-size: 36px;
        margin: 20px 0;
      }

      h2 {
        font-size: 20px;
      }

      #center {
        padding: 24px 20px 20px;
        gap: 18px;
      }

      .file-panel__body {
        flex-direction: column;
        align-items: stretch;
      }

      .pick-file {
        flex: 1 1 auto;
      }

      .clear-file {
        width: 100%;
      }

      .results-cols {
        flex-direction: column;
      }

      .results-cols > .result-col:first-child {
        border-right: none;
        border-bottom: 1px solid var(--border);
      }

      .action-toolbar,
      .tts-panel,
      .insights-deck,
      .extras-grid {
        padding-left: 20px;
        padding-right: 20px;
      }

      .insights-grid {
        grid-template-columns: 1fr;
      }

      .extras-grid {
        grid-template-columns: 1fr;
      }

      .stat {
        font-size: 36px;
      }

      .mapa-mental-section {
        padding: 22px 20px 28px;
      }

      #spacer {
        height: 48px;
      }
    }
  `,
  ]
}

declare global {
  interface HTMLElementTagNameMap {
    'pdf-analyzer-app': PdfAnalyzerApp
  }
}
