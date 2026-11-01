import type { SymptomCategory } from './contracts'

/**
 * Deterministic symptom routing shared by the renderer and main process.
 * It is deliberately small: fixed keywords, fixed priority, no model call and
 * no free-form command or path input.
 */
export const SYMPTOM_CATEGORY_KEYWORDS: Record<SymptomCategory, readonly string[]> = {
  performance: ['slow', 'lag', 'laggy', 'freeze', 'freezing', 'hang', 'memory', 'cpu', 'boot', 'startup', 'performance', 'stutter', 'disk', 'storage', 'space', 'service'],
  connectivity: ['network', 'internet', 'dns', 'proxy', 'connection', 'connect', 'offline', 'unreachable', 'website', 'browser', 'wifi', 'vpn', 'download'],
  updates: ['update', 'updates', 'patch', 'patching', 'reboot', 'restart', 'servicing', 'windows update', 'install'],
  app: ['firefox', 'steam', 'obsidian', 'app', 'application', 'profile', 'vault', 'game', 'launcher'],
}

export const SYMPTOM_CATEGORY_PRIORITY: readonly SymptomCategory[] = ['connectivity', 'performance', 'updates', 'app']

function keywordMatches(text: string, keyword: string): number {
  if (keyword.includes(' ')) return text.includes(keyword) ? 2 : 0
  const matches = text.match(new RegExp('\\b' + keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'g'))
  return matches ? matches.length : 0
}

/** Keyword routing. Ties use a fixed priority; an app target is the final fallback. */
export function classifySymptomCategory(symptom: string, appId?: string): SymptomCategory {
  const text = typeof symptom === 'string' ? symptom.toLowerCase() : ''
  const scores = new Map<SymptomCategory, number>()
  for (const category of SYMPTOM_CATEGORY_PRIORITY) {
    let score = 0
    for (const keyword of SYMPTOM_CATEGORY_KEYWORDS[category]) score += keywordMatches(text, keyword)
    scores.set(category, score)
  }
  const max = Math.max(...scores.values())
  if (max === 0) return appId ? 'app' : 'connectivity'
  return SYMPTOM_CATEGORY_PRIORITY.find(category => scores.get(category) === max) ?? 'connectivity'
}

/**
 * Maps scan evidence to a structured local investigation category without
 * guessing when the evidence does not describe one of the supported areas.
 */
export function categoryFromEvidence(category: string, area?: 'windows' | 'app'): SymptomCategory | undefined {
  const value = typeof category === 'string' ? category.toLowerCase() : ''
  if (/network|dns|proxy|connect/.test(value)) return 'connectivity'
  if (/update|servicing/.test(value)) return 'updates'
  if (/memory|cpu|perform|startup|storage|disk|service/.test(value)) return 'performance'
  if (area === 'app') return 'app'
  return undefined
}
