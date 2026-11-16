// Local "Right now" recommender. Runs entirely in the page from the local event log, so it
// works offline and nothing leaves the device. The server has an embedding-based version.

import type { Bookmark, UsageEvent, Variant } from './types'

const DAY = 86_400_000
const WEIGHTS = { timeOfDay: 0.35, frequency: 0.2, related: 0.15, neglected: 0.15, fresh: 0.15 }
const REASONS: Record<keyof typeof WEIGHTS, string> = {
  timeOfDay: 'Often opened around now',
  frequency: 'One of your regulars',
  related: 'Related to what you just opened',
  neglected: 'Not opened in a while',
  fresh: 'Recently saved',
}

export interface Recommendation {
  bookmark: Bookmark
  reason: string
}

function hourDistance(a: number, b: number): number {
  const d = Math.abs(a - b) % 24
  return Math.min(d, 24 - d)
}

function opensByUrl(events: UsageEvent[]): Map<string, UsageEvent[]> {
  const map = new Map<string, UsageEvent[]>()
  for (const e of events) {
    if (e.type !== 'open' || !e.url) continue
    const list = map.get(e.url)
    if (list) list.push(e)
    else map.set(e.url, [e])
  }
  return map
}

export function recommend(bookmarks: Bookmark[], events: UsageEvent[], now: Date, limit = 5): Recommendation[] {
  const opens = opensByUrl(events)
  const nowMs = now.getTime()
  const hour = now.getHours()
  const byUrl = new Map(bookmarks.map((b) => [b.url, b]))
  const recentFolders = new Set<string>()
  const recentUrls = new Set<string>()
  for (let i = events.length - 1; i >= 0 && recentUrls.size < 3; i--) {
    const e = events[i]
    const b = e.type === 'open' && e.url ? byUrl.get(e.url) : undefined
    if (b && nowMs - e.ts < DAY) {
      recentUrls.add(b.url)
      if (b.folder) recentFolders.add(b.folderId)
    }
  }
  let maxOpens = 0
  for (const list of opens.values()) maxOpens = Math.max(maxOpens, list.length)

  const scored: { score: number; rec: Recommendation }[] = []
  const seen = new Set<string>()
  for (const b of bookmarks) {
    if (seen.has(b.url)) continue
    seen.add(b.url)
    const evs = opens.get(b.url) ?? []
    const last = evs.length ? evs[evs.length - 1].ts : 0
    if (last && nowMs - last < 30 * 60_000) continue // just opened; showing it again is noise
    const parts = {
      timeOfDay: evs.filter((e) => hourDistance(e.hour, hour) <= 1).length / (evs.length + 2),
      frequency: maxOpens ? Math.log1p(evs.length) / Math.log1p(maxOpens) : 0,
      related: recentFolders.has(b.folderId) && !recentUrls.has(b.url) ? 1 : 0,
      neglected: last ? Math.min(1, (nowMs - last) / (30 * DAY)) : 0,
      fresh: !evs.length && b.addedAt && nowMs - b.addedAt < 14 * DAY ? 1 : 0,
    }
    let score = 0
    let best: keyof typeof WEIGHTS = 'frequency'
    for (const key of Object.keys(WEIGHTS) as (keyof typeof WEIGHTS)[]) {
      score += WEIGHTS[key] * parts[key]
      if (WEIGHTS[key] * parts[key] > WEIGHTS[best] * parts[best]) best = key
    }
    if (score > 0) scored.push({ score, rec: { bookmark: b, reason: REASONS[best] } })
  }
  return scored.sort((a, b) => b.score - a.score).slice(0, limit).map((s) => s.rec)
}

/** The baseline the recommender is tested against: most recently opened, then most recently added. */
export function recentList(bookmarks: Bookmark[], events: UsageEvent[], limit = 5): Recommendation[] {
  const byUrl = new Map(bookmarks.map((b) => [b.url, b]))
  const out: Recommendation[] = []
  const seen = new Set<string>()
  for (let i = events.length - 1; i >= 0 && out.length < limit; i--) {
    const e = events[i]
    const b = e.type === 'open' && e.url ? byUrl.get(e.url) : undefined
    if (b && !seen.has(b.url)) {
      seen.add(b.url)
      out.push({ bookmark: b, reason: 'Recently opened' })
    }
  }
  for (const b of [...bookmarks].sort((a, b) => b.addedAt - a.addedAt)) {
    if (out.length >= limit) break
    if (!seen.has(b.url)) {
      seen.add(b.url)
      out.push({ bookmark: b, reason: 'Recently saved' })
    }
  }
  return out
}

/** Which arm of the self-experiment is shown today. Alternates by calendar day. */
export function variantFor(date: Date): Variant {
  const dayNumber = Math.floor((date.getTime() - date.getTimezoneOffset() * 60_000) / DAY)
  return dayNumber % 2 === 0 ? 'recommended' : 'recent'
}

export function rightNow(bookmarks: Bookmark[], events: UsageEvent[], now: Date, variant: Variant, limit = 5): Recommendation[] {
  if (variant === 'recent') return recentList(bookmarks, events, limit)
  const recs = recommend(bookmarks, events, now, limit)
  if (recs.length >= limit) return recs
  const have = new Set(recs.map((r) => r.bookmark.url))
  return [...recs, ...recentList(bookmarks, events, limit * 2).filter((r) => !have.has(r.bookmark.url))].slice(0, limit)
}
