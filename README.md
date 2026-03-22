# ifbrain-vite — Análise de PDF no browser

Aplicação **Vite + TypeScript + Lit** que extrai texto de PDFs (com **OCR** quando necessário), pede resumos e insights à **Groq**, e mostra **mapas Mermaid**, chat e exportações.

## Início rápido

```bash
npm install
```

Cria `.env.local` na raiz (copia de `.env.example`) com:

```env
VITE_GROQ_API_KEY=a_tua_chave
```

```bash
npm run dev
```

Abre o URL que o Vite indicar (geralmente `http://localhost:5173`).

Se aparecer erro **504 Outdated Optimize Dep** no dev: `npm run dev:force` ou apaga `node_modules/.vite` e reinicia o `dev`.

## Documentação detalhada

- **[Como funciona o sistema (secções completas)](docs/COMO-FUNCIONA.md)** — arquitetura, leitura de PDF, IA, limitações e ficheiros principais.

## Scripts

| Comando | Descrição |
|---------|-----------|
| `npm run dev` | Servidor de desenvolvimento |
| `npm run dev:force` | Igual, mas força re-otimização de dependências (Vite) |
| `npm run build` | TypeScript + build de produção |
| `npm run preview` | Pré-visualização do build |

## Chave API

A chave **não** deve ser commitada. Obtém uma em [console.groq.com](https://console.groq.com/keys).
