import { useCallback, useEffect, useState } from 'react'
import { isExtension } from '../lib/platform'
import { type RecentItem, demoRecent, hasRecentAccess, loadRecent, reopen, requestRecentAccess } from '../lib/recent'
import { Favicon, Icon } from './ui'

function ago(ts: number): string {
  const minutes = Math.max(0, Math.round((Date.now() - ts) / 60_000))
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours} h ago`
  return `${Math.round(hours / 24)} d ago`
}

/** Recently closed tabs and recent history. Asks for permission first, with a button, and says why. */
export function Recent({ newTab, index = 0 }: { newTab: boolean; index?: number }) {
  const [access, setAccess] = useState<boolean | null>(isExtension ? null : true)
  const [items, setItems] = useState<RecentItem[]>([])

  const refresh = useCallback(async () => {
    setItems(isExtension ? await loadRecent(3) : demoRecent().slice(0, 3))
  }, [])

  useEffect(() => {
    if (!isExtension) return void refresh()
    void hasRecentAccess().then(async (ok) => {
      setAccess(ok)
      if (ok) await refresh()
    })
  }, [refresh])

  async function allow() {
    const ok = await requestRecentAccess()
    setAccess(ok)
    if (ok) await refresh()
  }

  return (
    <section aria-labelledby="recent-heading" style={{ '--i': index } as React.CSSProperties} className="enter surface rounded-2xl border border-line bg-card p-3.5">
      <h2 id="recent-heading" className="mb-1.5 flex items-center gap-2 text-xs font-semibold tracking-wide text-muted uppercase">
        <Icon name="history" className="size-3.5" />
        Pick up where you left off
      </h2>
      {access === false ? (
        <div className="text-sm">
          <p className="text-muted">See the tabs you closed and pages you visited lately, and reopen them in one click. Read on this device only.</p>
          <button type="button" onClick={() => void allow()} className="mt-3 h-9 rounded-lg bg-accent px-3.5 text-sm font-medium text-accent-ink">
            Show recent tabs
          </button>
        </div>
      ) : items.length === 0 ? (
        <p className="text-sm text-muted">{access === null ? '' : 'Nothing recent yet.'}</p>
      ) : (
        <ul className="-mx-2">
          {items.map((item) => (
            <li key={item.id}>
              <a
                href={item.url}
                onClick={(e) => {
                  e.preventDefault()
                  void reopen(item, newTab)
                }}
                title={item.title}
                className="flex items-center gap-2.5 rounded-md px-2 py-1 text-sm hover:bg-hover"
              >
                <Favicon url={item.url} />
                <span className="min-w-0 flex-1 truncate">{item.title}</span>
                <span className="shrink-0 text-xs text-muted">
                  {item.kind === 'closed' ? 'Closed ' : ''}
                  {ago(item.ts)}
                </span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
