import type { Bookmark } from './types'
import { domainOf } from './urls'

export interface IndexedBookmark {
  bookmark: Bookmark
  title: string
  folder: string
  domain: string
  haystack: string
}

/** Lower-cased fields prepared once, so each keystroke is a single pass over plain strings. */
export function buildIndex(bookmarks: Bookmark[]): IndexedBookmark[] {
  return bookmarks.map((bookmark) => {
    const title = bookmark.title.toLowerCase()
    const folder = bookmark.folder.toLowerCase()
    const domain = domainOf(bookmark.url)
    return { bookmark, title, folder, domain, haystack: `${title} ${folder} ${bookmark.url.toLowerCase()}` }
  })
}

function isSubsequence(needle: string, hay: string): boolean {
  let i = 0
  for (let j = 0; j < hay.length && i < needle.length; j++) if (hay[j] === needle[i]) i++
  return i === needle.length
}

/**
 * Instant, offline keyword search. Every query word must appear somewhere (title, folder or URL);
 * matches in the title count most, and links you open often get a small boost. If nothing
 * matches, falls back to a typo-tolerant subsequence match on titles.
 */
export function searchLocal(index: IndexedBookmark[], query: string, openCounts: Map<string, number>, limit = 30): Bookmark[] {
  const tokens = query.toLowerCase().split(/\s+/).filter(Boolean)
  if (!tokens.length) return []
  const scored: [number, Bookmark][] = []
  for (const item of index) {
    let score = 0
    for (const token of tokens) {
      if (!item.haystack.includes(token)) {
        score = -1
        break
      }
      const at = item.title.indexOf(token)
      if (at === 0) score += 6
      else if (at > 0) score += /[a-z0-9]/.test(item.title[at - 1]) ? 3 : 4.5
      else if (item.domain.includes(token)) score += 2
      else if (item.folder.includes(token)) score += 1.5
      else score += 1
    }
    if (score > 0) scored.push([score + 0.5 * Math.log1p(openCounts.get(item.bookmark.url) ?? 0), item.bookmark])
  }
  if (!scored.length && query.trim().length >= 3) {
    const needle = tokens.join('')
    for (const item of index) if (isSubsequence(needle, item.title)) scored.push([1 / (1 + item.title.length), item.bookmark])
  }
  return scored.sort((a, b) => b[0] - a[0]).slice(0, limit).map(([, b]) => b)
}
