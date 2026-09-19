import { svg } from 'lit'
import type { SVGTemplateResult } from 'lit'
import {
  BookOpen,
  Bot,
  Braces,
  ChartColumn,
  Drama,
  Eye,
  FileDown,
  FileText,
  FileType,
  FolderOpen,
  GitBranch,
  GitCompare,
  Hash,
  Info,
  KeyRound,
  Languages,
  Layers,
  Lightbulb,
  ListChecks,
  LoaderCircle,
  MessageCircle,
  RotateCcw,
  ScanLine,
  Scale,
  Search,
  Send,
  Shield,
  Square,
  Table2,
  Timer,
  Upload,
  Users,
  Volume2,
  Workflow,
} from 'lucide'

type IconNode = ReadonlyArray<readonly [string, Record<string, string>]>

function svgChild(tag: string, a: Record<string, string>): SVGTemplateResult {
  switch (tag) {
    case 'path':
      return svg`<path d=${a.d ?? ''} fill=${a.fill ?? 'none'} />`
    case 'circle':
      return svg`<circle cx=${a.cx ?? '0'} cy=${a.cy ?? '0'} r=${a.r ?? '0'} />`
    case 'rect':
      return svg`<rect x=${a.x ?? '0'} y=${a.y ?? '0'} width=${a.width ?? '0'} height=${a.height ?? '0'} rx=${a.rx ?? '0'} ry=${a.ry ?? '0'} />`
    case 'line':
      return svg`<line x1=${a.x1 ?? '0'} y1=${a.y1 ?? '0'} x2=${a.x2 ?? '0'} y2=${a.y2 ?? '0'} />`
    case 'polyline':
      return svg`<polyline points=${a.points ?? ''} />`
    case 'polygon':
      return svg`<polygon points=${a.points ?? ''} />`
    case 'ellipse':
      return svg`<ellipse cx=${a.cx ?? '0'} cy=${a.cy ?? '0'} rx=${a.rx ?? '0'} ry=${a.ry ?? '0'} />`
    default:
      return svg``
  }
}

/** Ícone Lucide (traço fino, alinhado ao texto). */
export function icon(node: IconNode, cls = ''): SVGTemplateResult {
  return svg`<svg class="ui-icon ${cls}" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${node.map(
    ([tag, attrs]) => svgChild(tag, attrs as Record<string, string>),
  )}</svg>`
}

export const ic = {
  book: (c?: string) => icon(BookOpen as unknown as IconNode, c),
  bot: (c?: string) => icon(Bot as unknown as IconNode, c),
  chart: (c?: string) => icon(ChartColumn as unknown as IconNode, c),
  help: (c?: string) => icon(Info as unknown as IconNode, c),
  drama: (c?: string) => icon(Drama as unknown as IconNode, c),
  eye: (c?: string) => icon(Eye as unknown as IconNode, c),
  fileDown: (c?: string) => icon(FileDown as unknown as IconNode, c),
  fileJson: (c?: string) => icon(Braces as unknown as IconNode, c),
  fileText: (c?: string) => icon(FileText as unknown as IconNode, c),
  fileType: (c?: string) => icon(FileType as unknown as IconNode, c),
  folder: (c?: string) => icon(FolderOpen as unknown as IconNode, c),
  gitBranch: (c?: string) => icon(GitBranch as unknown as IconNode, c),
  compare: (c?: string) => icon(GitCompare as unknown as IconNode, c),
  hash: (c?: string) => icon(Hash as unknown as IconNode, c),
  history: (c?: string) => icon(RotateCcw as unknown as IconNode, c),
  key: (c?: string) => icon(KeyRound as unknown as IconNode, c),
  lang: (c?: string) => icon(Languages as unknown as IconNode, c),
  layers: (c?: string) => icon(Layers as unknown as IconNode, c),
  bulb: (c?: string) => icon(Lightbulb as unknown as IconNode, c),
  checks: (c?: string) => icon(ListChecks as unknown as IconNode, c),
  spin: () => icon(LoaderCircle as unknown as IconNode, 'ui-icon--spin'),
  chat: (c?: string) => icon(MessageCircle as unknown as IconNode, c),
  scan: (c?: string) => icon(ScanLine as unknown as IconNode, c),
  scale: (c?: string) => icon(Scale as unknown as IconNode, c),
  search: (c?: string) => icon(Search as unknown as IconNode, c),
  send: (c?: string) => icon(Send as unknown as IconNode, c),
  shield: (c?: string) => icon(Shield as unknown as IconNode, c),
  stop: (c?: string) => icon(Square as unknown as IconNode, c),
  table: (c?: string) => icon(Table2 as unknown as IconNode, c),
  timer: (c?: string) => icon(Timer as unknown as IconNode, c),
  upload: (c?: string) => icon(Upload as unknown as IconNode, c),
  users: (c?: string) => icon(Users as unknown as IconNode, c),
  volume: (c?: string) => icon(Volume2 as unknown as IconNode, c),
  map: (c?: string) => icon(Workflow as unknown as IconNode, c),
}
