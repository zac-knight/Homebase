import { useEffect, useMemo, useRef, useState } from 'react'
import { asUrl, webSearch } from '../lib/platform'
import { type AskResponse, type ServerResult, askServer, searchServer } from '../lib/api'
import { type IndexedBookmark, searchLocal } from '../lib/search'
import { logEvent } from '../lib/store'
import { Favicon, Icon } from './ui'

type Item = { kind: 'local' | 'server'; url: string; title: string; folder: string } | { kind: 'ask' } | { kind: 'web'; query: string } | { kind: 'go'; url: string }

interface Props {
  index: IndexedBookmark[]
  openCounts: Map<string, number>
  /** True when sync is on and signed in: adds meaning-based results and the ask action. */
  serverEnabled: boolean
  /** Text already typed into the page's search bar. */
  initialQuery?: string
  onClose: () => void
}

export function SearchPalette({ index, openCounts, serverEnabled, initialQuery = '', onClose }: Props) {
  const [query, setQuery] = useState(initialQuery)
  const [active, setActive] = useState(0)
  const [server, setServer] = useState<{ query: string; results: ServerResult[] }>({ query: '', results: [] })
  const [answer, setAnswer] = useState<AskResponse | 'loading' | null>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const trimmed = query.trim()

  const local = useMemo(() => searchLocal(index, query, openCounts), [index, query, openCounts])

  useEffect(() => {
    if (!serverEnabled || trimmed.length < 3) return
    const controller = new AbortController()
    const timer = setTimeout(() => {
      searchServer(trimmed, controller.signal)
        .then((r) => setServer({ query: trimmed, results: r.results }))
        .catch(() => {}) // offline or signed out: local results still work
    }, 250)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [trimmed, serverEnabled])

  const items = useMemo<Item[]>(() => {
    const seen = new Set(local.map((b) => b.url))
    const out: Item[] = local.map((b) => ({ kind: 'local', url: b.url, title: b.title, folder: b.folderName }))
    if (server.query === trimmed) {
      for (const r of server.results) if (!seen.has(r.url)) out.push({ kind: 'server', url: r.url, title: r.title || r.url, folder: r.folder })
    }
    if (serverEnabled && trimmed.split(/\s+/).length >= 3) out.push({ kind: 'ask' })
    // Like the address bar: a typed address goes first, a web search always closes the list, and
    // it is the only choice when no bookmark matches.
    const address = asUrl(trimmed)
    if (address) out.unshift({ kind: 'go', url: address })
    if (trimmed) out.push({ kind: 'web', query: trimmed })
    return out
  }, [local, server, trimmed, serverEnabled])

  const current = Math.min(active, Math.max(0, items.length - 1))

  useEffect(() => {
    listRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' })
  }, [current])

  function close() {
    if (trimmed) void logEvent({ type: 'search', query: trimmed })
    onClose()
  }

  function choose(item: Item | undefined, newTab: boolean) {
    if (!item) return
    if (item.kind === 'web' || item.kind === 'go') {
      void logEvent({ type: 'search', query: trimmed })
      if (item.kind === 'web') webSearch(item.query, newTab)
      else if (newTab) window.open(item.url, '_blank', 'noopener')
      else window.location.assign(item.url)
      if (newTab) onClose()
      return
    }
    if (item.kind === 'ask') {
      setAnswer('loading')
      askServer(trimmed)
        .then(setAnswer)
        .catch(() => setAnswer({ grounded: false, answer: null, sources: [], message: 'Could not reach the server.' }))
      return
    }
    void logEvent({ type: 'search', query: trimmed })
    void logEvent({ type: 'open', url: item.url, source: 'search' }).finally(() => {
      if (newTab) window.open(item.url, '_blank', 'noopener')
      else window.location.assign(item.url)
    })
    if (newTab) onClose()
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      if (items.length) setActive((current + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      // Shift Enter always searches the web, whatever is highlighted.
      const target = e.shiftKey ? items.find((i) => i.kind === 'web') : items[current]
      choose(target, e.metaKey || e.ctrlKey)
    }
  }

  const firstServer = items.findIndex((i) => i.kind === 'server')

  return (
    <div className="fade fixed inset-0 z-50 flex items-start justify-center bg-black/40 px-4 pt-[12vh] backdrop-blur-md" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Search bookmarks or the web"
        // Clicking a result must not take focus away from the input, or the keyboard stops working.
        onMouseDown={(e) => e.target instanceof HTMLElement && !e.target.closest('input, a') && e.preventDefault()}
        onKeyDown={(e) => {
          if (e.key === 'Escape') close()
          // The input is the only tab stop inside the dialog, so Tab stays put.
          if (e.key === 'Escape' || e.key === 'Tab') e.preventDefault()
        }}
        className="pop glow-ring w-full max-w-xl rounded-2xl border border-line bg-card shadow-2xl">
        <div className="flex items-center gap-3 border-b border-line px-4">
          <Icon name="search" className="size-4 text-muted" />
          <input
            autoFocus
            role="combobox"
            aria-expanded={items.length > 0}
            aria-controls="palette-results"
            aria-activedescendant={items.length ? `palette-option-${current}` : undefined}
            aria-autocomplete="list"
            aria-label="Search bookmarks or the web"
            placeholder={serverEnabled ? 'Search by title, describe the page, or search the web' : 'Search bookmarks or the web'}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setActive(0)
              setAnswer(null)
            }}
            onKeyDown={onKeyDown}
            className="h-12 min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-muted"
          />
          <kbd className="rounded border border-line px-1.5 py-0.5 text-[11px] text-muted">Esc</kbd>
        </div>

        {answer && (
          <div className="border-b border-line bg-accent-soft px-4 py-3 text-sm" aria-live="polite">
            {answer === 'loading' ? (
              'Looking through your bookmarks…'
            ) : answer.grounded ? (
              <>
                <p className="mb-2 text-xs font-semibold tracking-wide uppercase">From your bookmarks</p>
                <ol className="space-y-2">
                  {answer.sources.map((s) => (
                    <li key={s.n}>
                      {s.excerpt && `${s.excerpt} `}
                      <a href={s.url} className="font-medium text-accent underline" onClick={() => void logEvent({ type: 'open', url: s.url, source: 'ask' })}>
                        [{s.n}] {s.title || s.url}
                      </a>
                    </li>
                  ))}
                </ol>
              </>
            ) : (
              answer.message
            )}
          </div>
        )}

        <ul ref={listRef} id="palette-results" role="listbox" aria-label="Results" className="max-h-[52vh] overflow-y-auto p-2">
          {items.map((item, i) => (
            <li key={item.kind === 'ask' || item.kind === 'web' ? item.kind : item.kind === 'go' ? `go:${item.url}` : `${item.kind}:${item.url}`} role="presentation">
              {i === firstServer && <div className="px-2 pt-2 pb-1 text-[11px] font-semibold tracking-wide text-muted uppercase">Found by meaning</div>}
              <div
                id={`palette-option-${i}`}
                role="option"
                aria-selected={i === current}
                onMouseMove={() => setActive(i)}
                onClick={(e) => choose(item, e.metaKey || e.ctrlKey)}
                className={`row-link flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2 text-sm transition-colors duration-150 ${i === current ? 'bg-accent-soft' : ''}`}
              >
                {item.kind === 'ask' ? (
                  <>
                    <Icon name="spark" className="size-4 text-accent" />
                    <span className="truncate">
                      Ask your bookmarks: <span className="font-medium">{trimmed}</span>
                    </span>
                  </>
                ) : item.kind === 'web' ? (
                  <>
                    <Icon name="search" className="size-4 text-accent" />
                    <span className="truncate">
                      Search the web for <span className="font-medium">{item.query}</span>
                    </span>
                  </>
                ) : item.kind === 'go' ? (
                  <>
                    <Icon name="home" className="size-4 text-accent" />
                    <span className="truncate">
                      Go to <span className="font-medium">{item.url}</span>
                    </span>
                  </>
                ) : (
                  <>
                    <Favicon url={item.url} />
                    <span className="min-w-0 flex-1 truncate">{item.title}</span>
                    <span className="max-w-[35%] shrink-0 truncate text-xs text-muted">{item.folder}</span>
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
                {!trimmed && <p className="px-4 pb-4 text-sm text-muted">Type to search. ↑ ↓ to move, Enter to open, {navigator.platform.includes('Mac') ? '⌘' : 'Ctrl'} Enter for a new tab, Shift Enter to search the web.</p>}
      </div>
    </div>
  )
}
