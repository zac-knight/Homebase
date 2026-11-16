import type { Bookmark, UsageEvent, Variant } from './types'
import { canonicalise, domainOf } from './urls'

const DAY = 86_400_000

/** 95% Wilson score interval for a proportion; behaves sensibly for small samples. */
export function wilson(successes: number, n: number, z = 1.96): [number, number] {
  if (n === 0) return [0, 0]
  const p = successes / n
  const denom = 1 + (z * z) / n
  const centre = (p + (z * z) / (2 * n)) / denom
  const half = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / denom
  return [Math.max(0, centre - half), Math.min(1, centre + half)]
}

export function duplicateGroups(bookmarks: Bookmark[]): Bookmark[][] {
  const groups = new Map<string, Bookmark[]>()
  for (const b of bookmarks) {
    const key = canonicalise(b.url)
    const group = groups.get(key)
    if (group) group.push(b)
    else groups.set(key, [b])
  }
  return [...groups.values()].filter((g) => g.length > 1)
}

export interface AbArm {
  variant: Variant
  impressions: number
  clicks: number
  ctr: number
  ci: [number, number]
}

export interface Insights {
  total: number
  opens: number
  opensByDay: { day: string; label: string; opens: number }[]
  opensByHour: { hour: number; label: string; opens: number }[]
  topDomains: { domain: string; bookmarks: number }[]
  neverOpened: { count: number; share: number; ci: [number, number] }
  duplicates: Bookmark[][]
  archive: Bookmark[]
  revisit: Bookmark[]
  ab: AbArm[]
}

function dayKey(ts: number): string {
  const d = new Date(ts)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function computeInsights(bookmarks: Bookmark[], events: UsageEvent[], now: Date, visited: Set<string> = new Set()): Insights {
  const nowMs = now.getTime()
  const opens = events.filter((e) => e.type === 'open' && e.url)
  const lastOpen = new Map<string, number>()
  for (const e of opens) lastOpen.set(e.url!, Math.max(lastOpen.get(e.url!) ?? 0, e.ts))

  const perDay = new Map<string, number>()
  const perHour = new Array<number>(24).fill(0)
  for (const e of opens) {
    perDay.set(dayKey(e.ts), (perDay.get(dayKey(e.ts)) ?? 0) + 1)
    perHour[e.hour]++
  }
  const opensByDay = Array.from({ length: 30 }, (_, i) => {
    const ts = nowMs - (29 - i) * DAY
    const d = new Date(ts)
    return { day: dayKey(ts), label: d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' }), opens: perDay.get(dayKey(ts)) ?? 0 }
  })
  const opensByHour = perHour.map((count, hour) => ({ hour, label: `${String(hour).padStart(2, '0')}:00`, opens: count }))

  const domains = new Map<string, number>()
  for (const b of bookmarks) {
    const d = domainOf(b.url)
    if (d) domains.set(d, (domains.get(d) ?? 0) + 1)
  }
  const topDomains = [...domains.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 8).map(([domain, count]) => ({ domain, bookmarks: count }))

  const untouched = bookmarks.filter((b) => !lastOpen.has(b.url) && !visited.has(b.url))
  const archive = untouched.filter((b) => b.addedAt && nowMs - b.addedAt > 180 * DAY).sort((a, b) => a.addedAt - b.addedAt).slice(0, 5)
  const revisit = bookmarks
    .filter((b) => lastOpen.has(b.url) && nowMs - lastOpen.get(b.url)! > 14 * DAY)
    .sort((a, b) => lastOpen.get(a.url)! - lastOpen.get(b.url)!)
    .slice(0, 5)

  const ab = (['recommended', 'recent'] as const).map((variant) => {
    const impressions = events.filter((e) => e.type === 'impression' && e.variant === variant).length
    const clicks = Math.min(impressions, opens.filter((e) => e.source === 'rightnow' && e.variant === variant).length)
    return { variant, impressions, clicks, ctr: impressions ? clicks / impressions : 0, ci: wilson(clicks, impressions) }
  })

  return {
    total: bookmarks.length,
    opens: opens.length,
    opensByDay,
    opensByHour,
    topDomains,
    neverOpened: { count: untouched.length, share: bookmarks.length ? untouched.length / bookmarks.length : 0, ci: wilson(untouched.length, bookmarks.length) },
    duplicates: duplicateGroups(bookmarks),
    archive,
    revisit,
    ab,
  }
}
