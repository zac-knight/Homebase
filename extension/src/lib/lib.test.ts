import { describe, expect, it } from 'vitest'
import { asUrl } from './platform'
import { type RecentItem, mergeRecent } from './recent'
import { weatherKind } from './weather'
import { sortLinks } from '../components/Home'
import { assignSlots, moveToSlot, slotCount } from './slots'
import { PALETTES } from './themes'
import { recentList, recommend, rightNow, variantFor } from './recommend'
import { buildIndex, searchLocal } from './search'
import { computeInsights, duplicateGroups, folderUsage, leastUsed, usageRanking, wilson } from './stats'
import { diffSnapshot, unsentEvents } from './sync'
import type { Bookmark, UsageEvent } from './types'
import { canonicalise, domainOf, isWebUrl } from './urls'

const DAY = 86_400_000
const NOW = new Date(2026, 10, 15, 9, 0, 0)

function bm(id: string, title: string, url: string, folder = 'Dev', ageDays = 100): Bookmark {
  return { id, title, url, folder, folderId: folder || 'root', folderName: folder || 'Bookmarks bar', addedAt: NOW.getTime() - ageDays * DAY }
}

function open(url: string, daysAgo: number, hour: number, extra: Partial<UsageEvent> = {}): UsageEvent {
  const ts = NOW.getTime() - daysAgo * DAY
  return { id: `${url}-${daysAgo}-${hour}`, type: 'open', url, source: 'folder', ts, hour, dow: new Date(ts).getDay(), ...extra }
}

const library = [
  bm('1', 'TypeScript Handbook', 'https://www.typescriptlang.org/docs/'),
  bm('2', 'Pro Git book', 'https://git-scm.com/book/en/v2'),
  bm('3', 'Sourdough for beginners', 'https://www.theperfectloaf.com/sourdough/', 'Cooking'),
  bm('4', 'PostgreSQL: Indexes', 'https://www.postgresql.org/docs/current/indexes.html', 'Databases'),
  bm('5', 'Brand new link', 'https://example.com/new', '', 1),
]

describe('canonicalise', () => {
  it.each([
    ['http://www.Example.com/post/', 'https://example.com/post'],
    ['https://example.com/a?utm_source=x&utm_medium=y&id=3', 'https://example.com/a?id=3'],
    ['https://example.com/a?b=2&a=1&fbclid=zzz', 'https://example.com/a?a=1&b=2'],
    ['https://example.com:443/a#section-2', 'https://example.com/a'],
    ['https://example.com//a///b', 'https://example.com/a/b'],
  ])('%s matches %s', (a, b) => expect(canonicalise(a)).toBe(canonicalise(b)))

  it('keeps meaningful differences and leaves non-web URLs alone', () => {
    expect(canonicalise('https://example.com/a?id=1')).not.toBe(canonicalise('https://example.com/a?id=2'))
    expect(canonicalise('https://app.example.com/#/inbox')).not.toBe(canonicalise('https://app.example.com/#/sent'))
    expect(canonicalise('https://example.com:8443/a')).not.toBe(canonicalise('https://example.com/a'))
    expect(canonicalise('chrome://settings')).toBe('chrome://settings')
    expect(canonicalise('not a url')).toBe('not a url')
    expect(canonicalise(canonicalise('http://www.a.com/x/?b=1&a=2'))).toBe(canonicalise('http://www.a.com/x/?b=1&a=2'))
    expect(domainOf('https://www.Example.com/a')).toBe('example.com')
    expect(isWebUrl('javascript:alert(1)')).toBe(false)
  })
})

describe('searchLocal', () => {
  const index = buildIndex(library)
  const none = new Map<string, number>()

  it('requires every word and ranks title matches first', () => {
    expect(searchLocal(index, 'git', none).map((b) => b.id)).toEqual(['2'])
    expect(searchLocal(index, 'postgres index', none)[0].id).toBe('4')
    expect(searchLocal(index, 'git sourdough', none)).toEqual([])
    expect(searchLocal(index, '   ', none)).toEqual([])
  })

  it('matches folders and domains, and tolerates missing letters', () => {
    expect(searchLocal(index, 'cooking', none).map((b) => b.id)).toEqual(['3'])
    expect(searchLocal(index, 'theperfectloaf', none).map((b) => b.id)).toEqual(['3'])
    expect(searchLocal(index, 'typscrpt', none).map((b) => b.id)).toEqual(['1'])
  })

  it('boosts links that are opened often', () => {
    const two = buildIndex([bm('a', 'Docs one', 'https://a.com'), bm('b', 'Docs two', 'https://b.com')])
    expect(searchLocal(two, 'docs', new Map([['https://b.com', 20]]))[0].id).toBe('b')
  })

  it('stays fast with 5000 bookmarks', () => {
    const big = buildIndex(Array.from({ length: 5000 }, (_, i) => bm(`${i}`, `Article number ${i} about topic ${i % 97}`, `https://site${i % 300}.example.com/p/${i}`)))
    const start = performance.now()
    for (const q of ['topic 42', 'article', 'site12', 'zzz', 'number 4999']) searchLocal(big, q, none)
    expect((performance.now() - start) / 5).toBeLessThan(100)
  })
})

describe('recommendations', () => {
  const events = [
    ...[1, 2, 3, 4, 5].map((d) => open(library[0].url, d, 9)),
    ...[1, 2, 3, 4, 5].map((d) => open(library[2].url, d + 0.4, 19)),
  ].sort((a, b) => a.ts - b.ts)

  it('prefers what is usually opened at this hour', () => {
    expect(recommend(library, events, NOW)[0].bookmark.id).toBe('1')
    const evening = new Date(NOW.getTime() + 10 * 3_600_000)
    expect(recommend(library, events, evening)[0].bookmark.id).toBe('3')
  })

  it('surfaces new bookmarks with no history and hides what was just opened', () => {
    expect(recommend(library, events, NOW).map((r) => r.bookmark.id)).toContain('5')
    const justOpened = [...events, { ...open(library[0].url, 0, 9), ts: NOW.getTime() - 60_000 }]
    expect(recommend(library, justOpened, NOW).map((r) => r.bookmark.id)).not.toContain('1')
  })

  it('baseline lists most recently opened first and always fills the row', () => {
    expect(recentList(library, events, 2).map((r) => r.bookmark.id)).toEqual(['1', '3'])
    expect(rightNow(library, [], NOW, 'recommended')).toHaveLength(5)
    expect(rightNow(library, [], NOW, 'recent')).toHaveLength(5)
  })

  it('alternates experiment arms by day', () => {
    expect(variantFor(NOW)).not.toBe(variantFor(new Date(NOW.getTime() + DAY)))
    expect(variantFor(NOW)).toBe(variantFor(new Date(NOW.getTime() + 2 * DAY)))
  })
})

describe('insights', () => {
  it('computes a Wilson interval that brackets the estimate', () => {
    const [lo, hi] = wilson(8, 20)
    expect(lo).toBeLessThan(0.4)
    expect(hi).toBeGreaterThan(0.4)
    expect(wilson(0, 0)).toEqual([0, 0])
  })

  it('finds exact duplicates through canonical URLs', () => {
    const dupes = duplicateGroups([...library, bm('9', 'Git again', 'http://git-scm.com/book/en/v2/?utm_source=x')])
    expect(dupes.map((g) => g.map((b) => b.id))).toEqual([['2', '9']])
  })

  it('summarises usage, the digest and the experiment', () => {
    const events: UsageEvent[] = [
      open(library[0].url, 1, 9),
      open(library[0].url, 2, 9),
      open(library[1].url, 20, 14),
      { id: 'i1', type: 'impression', variant: 'recommended', ts: NOW.getTime() - DAY, hour: 9, dow: 1 },
      { id: 'i2', type: 'impression', variant: 'recommended', ts: NOW.getTime() - DAY, hour: 9, dow: 1 },
      open(library[3].url, 1, 9, { source: 'rightnow', variant: 'recommended' }),
    ]
    const old = bm('6', 'Forgotten', 'https://old.example.com', 'Dev', 400)
    const s = computeInsights([...library, old], events, NOW)
    expect(s.opens).toBe(4)
    expect(s.opensByHour[9].opens).toBe(3)
    expect(s.opensByDay).toHaveLength(30)
    expect(s.opensByDay.reduce((n, d) => n + d.opens, 0)).toBe(4)
    expect(s.neverOpened.count).toBe(3)
    expect(s.archive.map((b) => b.id)).toEqual(['6'])
    expect(s.revisit.map((b) => b.id)).toEqual(['2'])
    expect(s.ab[0]).toMatchObject({ variant: 'recommended', impressions: 2, clicks: 1, ctr: 0.5 })
    expect(computeInsights([...library, old], events, NOW, new Set([old.url])).archive).toEqual([])
  })
})

describe('sync diff', () => {
  it('sends everything first, then only what changed', () => {
    const first = diffSnapshot({}, library, {}, 1)
    expect(first.upserts).toHaveLength(5)
    expect(first.deletes).toEqual([])
    expect(diffSnapshot(first.next, library, {}, 2)).toMatchObject({ upserts: [], deletes: [] })

    const edited = [{ ...library[0], title: 'Renamed' }, ...library.slice(2)]
    const second = diffSnapshot(first.next, edited, {}, 3)
    expect(second.upserts.map((u) => u.title)).toEqual(['Renamed'])
    expect(second.deletes).toEqual([canonicalise(library[1].url)])
  })

  it('skips non-web URLs and local duplicates, and attaches page text only when given', () => {
    const extra = [...library, bm('7', 'Bookmarklet', 'javascript:void(0)'), bm('8', 'Dup', 'https://git-scm.com/book/en/v2/')]
    const key = canonicalise(library[0].url)
    const { upserts, next } = diffSnapshot({}, extra, { [key]: { description: 'd', text: 'body' } }, 1)
    expect(upserts).toHaveLength(5)
    expect(upserts[0]).toMatchObject({ description: 'd', text: 'body' })
    expect(upserts[1]).not.toHaveProperty('text')
    expect(diffSnapshot(next, extra, {}, 2).upserts).toHaveLength(1)
  })

  it('only sends events newer than the watermark', () => {
    const events = [open('https://a.com', 3, 9), open('https://a.com', 1, 9)]
    expect(unsentEvents(events, events[0].ts)).toEqual([events[1]])
  })
})

describe('folder grid slots', () => {
  it('keeps saved slots and fills the gaps in order', () => {
    expect(assignSlots(['a', 'b', 'c'], { b: 0 })).toEqual({ b: 0, a: 1, c: 2 })
  })
  it('ignores duplicate or invalid saved slots', () => {
    expect(assignSlots(['a', 'b'], { a: 2, b: 2 })).toEqual({ a: 2, b: 0 })
    expect(assignSlots(['a'], { a: -1 })).toEqual({ a: 0 })
  })
  it('moves to an empty slot and swaps with an occupied one', () => {
    expect(moveToSlot({ a: 0, b: 1 }, 'a', 5)).toEqual({ a: 5, b: 1 })
    expect(moveToSlot({ a: 0, b: 1 }, 'a', 1)).toEqual({ a: 1, b: 0 })
  })
  it('counts whole rows with spare room', () => {
    expect(slotCount({ a: 0 }, 4)).toBe(8)
    expect(slotCount({ a: 6 }, 4)).toBe(8)
    expect(slotCount({ a: 7 }, 4)).toBe(12)
  })
})

describe('typed address detection', () => {
  it('treats addresses as addresses and words as searches', () => {
    expect(asUrl('github.com/foo')).toBe('https://github.com/foo')
    expect(asUrl('https://example.com/a?b=1')).toBe('https://example.com/a?b=1')
    expect(asUrl('localhost:3000')).toBe('https://localhost:3000')
    expect(asUrl('best pizza near me')).toBeNull()
    expect(asUrl('node.js tutorial')).toBeNull()
  })
})

describe('palette contrast', () => {
  const lum = (hex: string) => {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
    return 0.2126 * r + 0.7152 * g + 0.0722 * b
  }
  const ratio = (a: string, b: string) => (Math.max(lum(a), lum(b)) + 0.05) / (Math.min(lum(a), lum(b)) + 0.05)
  for (const palette of PALETTES) {
    for (const mode of ['light', 'dark'] as const) {
      it(`${palette.name} ${mode} stays readable`, () => {
        const c = palette[mode]
        const pairs: [string, string, string][] = [
          ['ink on page', c.ink, c.bg], ['ink on card', c.ink, c.card], ['muted on page', c.muted, c.bg], ['muted on card', c.muted, c.card],
          ['muted on hover', c.muted, c.hover], ['accent text on card', c.accent, c.card], ['label on accent', c.accentInk, c.accent],
        ]
        const low = pairs.filter(([, a, b]) => ratio(a, b) < 4.5).map(([name, a, b]) => `${name} ${ratio(a, b).toFixed(2)}`)
        expect(low).toEqual([])
      })
    }
  }
})

describe('usage ranking', () => {
  const day = 86_400_000
  const now = new Date(2026, 10, 21, 12)
  const a = bm('a', 'Alpha', 'https://a.example/', 'Dev', 400)
  const b = bm('b', 'Beta', 'https://b.example/', 'Dev', 100)
  const c = bm('c', 'Gamma', 'https://c.example/', 'Read', 300)
  const open = (url: string, daysAgo: number): UsageEvent => ({ id: `${url}${daysAgo}`, type: 'open', url, ts: now.getTime() - daysAgo * day, hour: 9, dow: 1 })
  const events = [open(a.url, 1), open(a.url, 2), open(b.url, 3), open(b.url, 40), open(b.url, 41), open(b.url, 42)]

  it('ranks by opens inside the window and keeps all-time separate', () => {
    expect(usageRanking([a, b, c], events, now, 7).map((u) => [u.bookmark.id, u.opens])).toEqual([['a', 2], ['b', 1], ['c', 0]])
    expect(usageRanking([a, b, c], events, now, null).map((u) => [u.bookmark.id, u.opens])).toEqual([['b', 4], ['a', 2], ['c', 0]])
  })
  it('lists never-opened bookmarks, longest saved first', () => {
    expect(leastUsed([a, b, c], events).map((x) => x.id)).toEqual(['c'])
    expect(leastUsed([a, b, c], []).map((x) => x.id)).toEqual(['a', 'c', 'b'])
  })
  it('totals use per folder', () => {
    expect(folderUsage([a, b, c], events)).toEqual([
      { name: 'Dev', bookmarks: 2, opens: 6, used: 2 },
      { name: 'Read', bookmarks: 1, opens: 0, used: 0 },
    ])
  })
})

describe('recent tabs', () => {
  const item = (id: string, url: string, ts: number, kind: RecentItem['kind']): RecentItem => ({ id, title: id, url, ts, kind })
  it('merges newest first, once per page, preferring the closed tab', () => {
    const closed = [item('c1', 'https://a.example/', 1000, 'closed')]
    const visited = [item('v1', 'https://a.example/', 1000, 'visited'), item('v2', 'https://b.example/', 3000, 'visited'), item('v3', 'chrome://settings', 5000, 'visited')]
    expect(mergeRecent(closed, visited, 5).map((r) => r.id)).toEqual(['v2', 'c1'])
  })
  it('stops at the limit', () => {
    const many = Array.from({ length: 9 }, (_, i) => item(`v${i}`, `https://${i}.example/`, i, 'visited'))
    expect(mergeRecent([], many, 3)).toHaveLength(3)
  })
})

describe('weather codes', () => {
  it('groups codes into the looks the page can draw', () => {
    expect(weatherKind(0).kind).toBe('clear')
    expect(weatherKind(2).kind).toBe('partly')
    expect(weatherKind(63).kind).toBe('rain')
    expect(weatherKind(81).label).toBe('Showers')
    expect(weatherKind(96).kind).toBe('storm')
  })
})

describe('link sorting', () => {
  const links = [bm('1', 'Zed', 'https://z.example/'), bm('2', 'apple', 'https://a.example/'), bm('3', 'Mid', 'https://m.example/')]
  const counts = new Map([['https://m.example/', 5], ['https://z.example/', 1]])
  it('keeps saved order, sorts A to Z ignoring case, or by opens with ties in saved order', () => {
    expect(sortLinks(links, 'saved', counts).map((b) => b.id)).toEqual(['1', '2', '3'])
    expect(sortLinks(links, 'az', counts).map((b) => b.id)).toEqual(['2', '3', '1'])
    expect(sortLinks(links, 'used', counts).map((b) => b.id)).toEqual(['3', '1', '2'])
  })
})
