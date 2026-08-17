# Como funciona o ifbrain-vite (análise de PDF)

Documentação em secções: o que o sistema faz, com que foi feito, como lê PDFs e como fala com a IA.

---

## 1. Visão geral

A aplicação corre **no teu browser** (não há servidor próprio da app para processar PDFs). O utilizador escolhe um ficheiro PDF; o programa:

1. **Extrai texto** do PDF (ou usa **OCR** se não houver texto selecionável).
2. Envia um **recorte do texto** à API **Groq** (modelo de linguagem) para gerar **resumo**, **insights**, **mapa temporal** ou **mapa mental**.
3. Mostra resultados na página: contagem de palavras, Markdown, cartões de insights, diagramas **Mermaid**, chat e comparação com outro PDF.

Tudo isto está implementado em **TypeScript**, empacotado com **Vite**, e a interface principal é um **Web Component** em **Lit**.

---

## 2. Linguagens e ferramentas

| Camada | Tecnologia |
|--------|------------|
| Linguagem | **TypeScript** (tipagem estática, compila para JavaScript) |
| Build / dev server | **Vite** |
| Interface | **Lit** (Web Components: `<pdf-analyzer-app>`) |
| Estilos | CSS no componente + `index.css` global (Font Awesome via pacote npm) |
| PDF (leitura) | **pdfjs-dist** (Mozilla PDF.js) — lê a estrutura do PDF no browser |
| OCR (imagem → texto) | **Tesseract.js** — idiomas `por+eng` |
| IA | **Groq** API compatível com OpenAI (`fetch` para `https://api.groq.com/openai/v1/chat/completions`) |
| Diagramas | **Mermaid** (definições geradas pela IA, renderizadas a SVG) |
| Markdown na UI | **marked** + **DOMPurify** |
| Exportar mapa em PDF | **jsPDF** + rasterização do SVG (canvas) ou **html2canvas** como fallback |

Não há base de dados: nada é guardado no servidor do projeto; o PDF e a chave API ficam no teu ambiente local.

---

## 3. Estrutura dos ficheiros (programação)

- **`index.html`** — página mínima que carrega o Web Component.
- **`src/pdf-analyzer-app.ts`** — componente Lit: ecrãs, botões, estado (ficheiro, resumo, insights, chat, TTS, exportações).
- **`src/pdf-analysis.ts`** — “cérebro” dos dados: extração de texto, OCR, chamadas Groq, tipos (`ExtendedInsights`, mapas, etc.).
- **`src/mermaid-mindmap.ts`** — inicialização do Mermaid e conversão dos resultados da IA em **texto Mermaid** (`mindmap`, `xychart-beta`).
- **`src/render-markdown.ts`** — Markdown → HTML seguro para mostrar na página.
- **`vite.config.ts`** — opções de build e `optimizeDeps` para o Vite.
- **`.env` / `.env.local`** — variável `VITE_GROQ_API_KEY` (não commits com chave real).

Fluxo mental: **UI (Lit)** chama funções de **`pdf-analysis.ts`**; os resultados voltam ao estado do componente e o template **HTML** re-renderiza.

---

## 4. Como o PDF é lido (sem “magia”)

### 4.1 Camada de texto do PDF (normal)

O **PDF.js** (`getDocument`) abre o PDF em memória. O código percorre as páginas e tenta ler **texto embutido** (quando o PDF foi gerado a partir de Word/LibreOffice ou tem texto selecionável). Isto é rápido e não usa OCR.

### 4.2 Quando não há texto (digitalização / só imagem)

Se a extração vier **vazia** (muitos scans são só fotos das páginas), entra o **OCR**:

- Cada página é **desenhada num canvas** (como uma imagem) com uma escala definida (`OCR_SCALE`).
- O **Tesseract.js** analisa essa imagem e devolve texto em **português + inglês** (`por+eng`).
- Por defeito só se processam até **`MAX_OCR_PAGES` (30)** páginas, por desempenho no browser; o utilizador é avisado se o PDF for maior.

### 4.3 Preparação para a IA

O texto completo pode ser enorme. Para o modelo existe um limite aproximado **`MAX_TEXT_FOR_LLM`** (caracteres); o texto é **truncado** com uma nota no fim, e essa amostra (`textSample`) é a que vai para o Groq nos vários pedidos (resumo, insights, mapas, chat).

---

## 5. Como funciona a parte da IA (Groq)

- **Endpoint**: `POST` para a API de chat da Groq, com **Bearer** `VITE_GROQ_API_KEY`.
- **Modelo** (em código): `openai/gpt-oss-20b` por omissão (adequado ao limite gratuito ~8000 TPM). Podes alterar com `VITE_GROQ_MODEL` (ex.: `openai/gpt-oss-120b`, `qwen/qwen3.6-27b`). O texto do PDF é truncado (~5k caracteres) e os pedidos à IA correm em sequência para não estourar o TPM.
- **Resumo**: um pedido com instruções em português para devolver **Markdown** (secções, listas).
- **Insights extra**: outro pedido com `response_format` JSON (estrutura: palavras-chave, entidades, cronologia, etc.).
- **Mapa mensal**: JSON com série por mês; se houver dados, gera-se um diagrama **xychart-beta** Mermaid.
- **Mapa mental em ramos**: só quando **não** há série mensal útil; outro JSON vira diagrama **mindmap** Mermaid.
- **Perguntar ao documento / comparar PDFs**: mensagens de sistema + texto(s) da amostra.

Tudo isto são **HTTP** do browser para os servidores da Groq; a tua chave trata-se como segredo local (`.env`).

---

## 6. Mapas Mermaid na página

A IA devolve **definições em texto** (sintaxe Mermaid). O ficheiro `mermaid-mindmap.ts` chama `mermaid.render(...)`, que devolve **HTML com SVG**. Esse SVG é injetado no DOM (`#mermaid-svg-host`).

O **tema** (claro/escuro) segue `prefers-color-scheme` na inicialização do Mermaid.

---

## 7. Exportar o mapa como PDF

O PDF final **não** é o diagrama vetorial cru via uma biblioteca que falhava com o CSS do Mermaid no texto. Em vez disso:

1. O SVG é **rasterizado** (imagem no canvas) para o texto aparecer igual ao ecrã.
2. Se falhar, usa-se **html2canvas** na zona do mapa.
3. **jsPDF** coloca a imagem numa página A4 horizontal.

---

## 8. Outras funcionalidades na UI

- **Exportar JSON / TXT**: dados e texto extraído no cliente.
- **Voz (TTS)**: API **Web Speech** do browser (`speechSynthesis`), com estimativa de tempo aproximada.
- **Font Awesome**: ícones carregados via pacote npm e CSS global.

---

## 9. Limitações importantes

- PDFs muito longos: texto truncado para a IA; OCR limitado a N páginas.
- A qualidade do OCR depende da qualidade do scan.
- A IA pode **alucinar** detalhes: o resumo é assistido, não substitui a leitura do original para decisões críticas.
- A chave **Groq** tem quotas e custos segundo a conta na Groq.

---

## 10. Como correr o projeto

```bash
npm install
# Cria .env.local com VITE_GROQ_API_KEY=...
npm run dev
```

Para desenvolvimento, se o Vite mostrar erro de cache de dependências: `npm run dev:force` ou apagar `node_modules/.vite` e voltar a arrancar.

---

*Última atualização alinhada com o código em `src/` — ajusta os nomes de constantes (`MAX_OCR_PAGES`, modelo Groq, etc.) diretamente no código-fonte se mudares comportamento.*
