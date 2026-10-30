import { isIP } from 'node:net'
import type { RepairPlan, RepairStep, SourceAssessment } from '../shared/contracts'

export function publicSource(value: string): URL {
  const url=new URL(value)
  if (url.protocol!=='https:' || url.username || url.password || isIP(url.hostname) || !url.hostname.includes('.') || /(?:^|\.)(localhost|local|internal|invalid|test)$/.test(url.hostname)) throw new Error('Source must be a public HTTPS URL')
  url.hash='';return url
}
export function sourceKind(value: string, targetName: string): SourceAssessment['kind'] {
  const url=publicSource(value);const host=url.hostname.toLowerCase()
  if (['support.microsoft.com','learn.microsoft.com','www.microsoft.com','devblogs.microsoft.com'].includes(host)) return /\/(?:answers|community)\//i.test(url.pathname)?'community':'official'
  const target=targetName.toLowerCase()
  if (target.includes('firefox') && ['support.mozilla.org','www.mozilla.org','firefox-source-docs.mozilla.org'].includes(host)) return /\/questions\//.test(url.pathname)?'community':'official'
  if (target.includes('steam') && ['help.steampowered.com','store.steampowered.com'].includes(host)) return 'official'
  if (target.includes('obsidian') && ['help.obsidian.md','obsidian.md','www.obsidian.md'].includes(host)) return 'official'
  return 'community'
}
export function assessSources(candidates: SourceAssessment[], citations: {url:string;title:string}[], targetName: string): SourceAssessment[] {
  const actual=new Map<string,string>()
  for (const citation of citations) {try{actual.set(publicSource(citation.url).href,citation.title)}catch{}}
  const sources:SourceAssessment[]=[]
  for (const candidate of candidates) {
    let url:string;try{url=publicSource(candidate.url).href}catch{continue}
    if (!actual.has(url) || sources.some(s=>s.url===url)) continue
    sources.push({...candidate,url,title:actual.get(url) || candidate.title,kind:sourceKind(url,targetName),corroboratedBy:candidate.corroboratedBy.filter(other=>{try{return actual.has(publicSource(other).href) && publicSource(other).href!==url}catch{return false}})})
  }
  return sources
}
function publisher(url: string): string {
  const host=publicSource(url).hostname.toLowerCase().replace(/^www\./,'')
  // Conservative grouping: sibling subdomains never count as independent publishers.
  return host.split('.').slice(-2).join('.')
}
export function sourceGate(steps: RepairStep[], sources: SourceAssessment[]): string[] {
  const reasons:string[]=[]
  for (const step of steps) {
    const applicable=sources.filter(s=>s.applicable && !s.concerns.length && s.supports.includes(step.operation))
    if (applicable.some(s=>s.kind==='official')) continue
    const independent=applicable.filter(s=>s.kind==='community' && s.corroboratedBy.some(other=>applicable.some(s2=>s2.url===other && publisher(s2.url)!==publisher(s.url))))
    if (new Set(independent.map(s=>publisher(s.url))).size < 2) reasons.push(`${step.title}: requires an applicable official source or two corroborating independent community publishers.`)
  }
  return reasons
}
export function dangerousPlan(plan: Pick<RepairPlan,'steps'>): string | null {
  const text=JSON.stringify(plan.steps)
  if (/(?:disable|turn.?off|bypass|remove).{0,50}(?:defender|antivirus|anti-malware|firewall|secure.?boot|\buac\b|security.?protection)/i.test(text)) return 'This repair would weaken a Windows security control.'
  if (/(?:format[- ]?volume|diskpart|remove-item|rm\s+-rf|invoke-expression|encodedcommand|downloadstring|iex\b)/i.test(text)) return 'The plan contains an unsupported command or destructive instruction.'
  return null
}
