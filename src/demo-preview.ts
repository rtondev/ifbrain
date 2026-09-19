import type { ExtendedInsights, MindMapResult, MonthlyMapResult } from './pdf-analysis.js'

export const DEMO_PDF_URL = `${import.meta.env.BASE_URL}demo/tcc-evelyn.pdf`
export const DEMO_PDF_NAME =
  'TCC EVELYN DE FRANÇA FAGUNDES Versão final repositorio.pdf'

const DEMO_FULL_TEXT = `INSTITUTO FEDERAL DE EDUCAÇÃO, CIÊNCIA E TECNOLOGIA DO RIO GRANDE DO NORTE
CURSO SUPERIOR DE LICENCIATURA EM INFORMÁTICA — CAMPUS NATAL ZONA NORTE

Evelyn de França Fagundes
As contribuições do professor de informática do IFRN Natal Zona Norte para a formação digital dos estudantes

Trabalho de Conclusão de Curso. Orientadora: Dra. Keila Cruz Moreira. Natal, 2023–2025.

Este trabalho analisa o papel do professor de Informática na formação digital dos estudantes do IFRN. Discute cultura digital, práticas de ensino e o impacto das aulas de informática no uso consciente da tecnologia.`

export const DEMO_SUMMARY = `## Sobre o PDF

Trabalho de conclusão de curso de **Evelyn de França Fagundes**, da Licenciatura em Informática do **IFRN Natal — Zona Norte**.

O tema é: **como o professor de informática ajuda os alunos a usar o digital no dia a dia**.

A orientadora é a **Dra. Keila Cruz Moreira**.

## O que o texto diz

- O professor de informática não ensina só a “mexer no computador”.
- Ajuda os alunos a viver na **cultura digital** (internet, apps, informação).
- O estudo foi feito no campus Natal Zona Norte.
- É um TCC de graduação (cerca de 73 páginas).

## Nota

Isto é um **exemplo fixo** para ver o ecrã. Não passou pela IA.`

export const DEMO_INSIGHTS: ExtendedInsights = {
  keywords: [
    'formação digital',
    'professor de informática',
    'IFRN',
    'cultura digital',
    'Licenciatura em Informática',
    'Natal Zona Norte',
  ],
  mainPoints: [
    'O TCC fala do professor de informática no IFRN Natal Zona Norte.',
    'O foco é a formação digital dos estudantes.',
    'A cultura digital entra nas aulas, não só a técnica.',
    'A autora é Evelyn de França Fagundes. A orientadora é Keila Cruz Moreira.',
  ],
  suggestedQuestions: [
    'O que é formação digital neste trabalho?',
    'Qual o papel do professor de informática?',
    'Onde o estudo foi feito?',
  ],
  timeline: [
    { when: '2023', event: 'Início do trabalho no IFRN Natal Zona Norte.' },
    { when: '2025', event: 'Versão final no repositório (73 folhas).' },
  ],
  entities: {
    people: ['Evelyn de França Fagundes', 'Keila Cruz Moreira'],
    organizations: ['IFRN', 'Campus Natal Zona Norte', 'Biblioteca José de Arimatéia Pereira'],
    places: ['Natal', 'Rio Grande do Norte', 'Zona Norte'],
    amounts: ['73 folhas', 'curso de graduação'],
  },
  translation: {
    summaryEn:
      'Undergraduate thesis on how computer-science teachers at IFRN Natal Zona Norte support students’ digital literacy and digital culture.',
  },
  tone: {
    formality: 'Formal, de escola / faculdade',
    documentTypeGuess: 'Trabalho de conclusão de curso (TCC)',
    audience: 'Banca, professores e quem estuda educação e informática',
  },
  readingLevel: 'Texto de faculdade. Dá para seguir se leres com calma.',
  sensitiveHints: [],
  tablesDescription: 'Há ficha catalográfica e dados do trabalho (folhas, campus, ano).',
}

export const DEMO_MONTHLY: MonthlyMapResult = {
  title: 'Páginas do trabalho (exemplo)',
  unit: 'folhas',
  entries: [
    { month: '2023-03', value: 8, label: 'plano' },
    { month: '2023-08', value: 18, label: 'revisão' },
    { month: '2024-03', value: 32, label: 'escrita' },
    { month: '2024-11', value: 55, label: 'ajustes' },
    { month: '2025-03', value: 73, label: 'versão final' },
  ],
}

export const DEMO_MIND: MindMapResult = {
  center: 'Formação digital no IFRN',
  branches: [
    { label: 'Professor de informática', sub: ['Aulas', 'Apoio aos alunos'] },
    { label: 'Estudantes', sub: ['Uso do computador', 'Internet com sentido'] },
    { label: 'Campus Zona Norte', sub: ['Licenciatura', 'Natal'] },
  ],
}

export const DEMO_WORD_COUNT = 18_420
export const DEMO_TEXT_SAMPLE = DEMO_FULL_TEXT
export const DEMO_FULL = DEMO_FULL_TEXT
