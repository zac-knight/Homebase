import { type ReactNode, useId, useState } from 'react'
import { faviconUrl } from '../lib/platform'
import type { Bookmark } from '../lib/types'
import { domainOf } from '../lib/urls'

export type IconName = 'trash' | 'folder' | 'search' | 'star' | 'grip' | 'chart' | 'settings' | 'home' | 'close' | 'spark' | 'code' | 'book' | 'database' | 'wrench' | 'plane' | 'cap' | 'pot' | 'bookmark' | 'check' | 'plus' | 'edit' | 'sun' | 'sunset' | 'moon' | 'cloud' | 'rain' | 'bolt' | 'snow' | 'partly' | 'history' | 'tabs' | 'sort'

const PATHS: Record<IconName, ReactNode> = {
  check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  plus: <path d="M12 5v14M5 12h14" />,
  sun: <path d="M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm0-13v2m0 14v2M3 12h2m14 0h2M5.6 5.6 7 7m10 10 1.4 1.4M5.6 18.4 7 17m10-10 1.4-1.4" />,
  sunset: <path d="M7 17a5 5 0 0 1 10 0M12 6v3M4.2 10.2l1.6 1.6m12.4-1.6-1.6 1.6M2 17h2m16 0h2M4 21h16" />,
  cloud: <path d="M7 18a4 4 0 0 1-.6-7.96A5.5 5.5 0 0 1 17 8.5a4.5 4.5 0 0 1 0 9.5H7Z" />,
  rain: <path d="M7 14.5a4 4 0 0 1-.6-7.96A5.5 5.5 0 0 1 17 5a4.5 4.5 0 0 1 0 9.5H7ZM8 18l-1 2.5m5.5-2.5-1 2.5m5.5-2.5-1 2.5" />,
  bolt: <path d="m13 3-8 10h6l-1 8 8-10h-6l1-8Z" />,
  snow: <path d="M12 3v18M4.2 7.5l15.6 9M4.2 16.5l15.6-9" />,
  partly: <path d="M7 7V5m-4 4H1m2.9-4.1L2.5 3.5m9.4 1.4 1.4-1.4M9.5 9.5A3.5 3.5 0 0 0 4 11.8M9 20a3.5 3.5 0 0 1-.4-7A5 5 0 0 1 18 14.5a2.8 2.8 0 0 1 0 5.5H9Z" />,
  history: <path d="M3 12a9 9 0 1 0 3-6.7L3 8m0-4v4h4m5-1v5l3 2" />,
  tabs: <path d="M4 9h11v11H4V9Zm4-5h12v12" />,
  sort: <path d="M7 4v16m0 0-3-3m3 3 3-3M17 20V4m0 0-3 3m3-3 3 3" />,
  moon: <path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5Z" />,
  edit: <path d="m4 20 4-1 11-11a2.1 2.1 0 0 0-3-3L5 16l-1 4Zm10-13 3 3" />,
  trash: <path d="M4 7h16M10 11v6m4-6v6M6 7l1 12a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-12M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />,
  folder: <path d="M3 7a2 2 0 0 1 2-2h4l2 2.5h8a2 2 0 0 1 2 2V18a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" />,
  search: <path d="m21 21-4.3-4.3M11 18a7 7 0 1 1 0-14 7 7 0 0 1 0 14Z" />,
  star: <path d="m12 3 2.7 5.6 6.1.8-4.5 4.3 1.1 6.1L12 16.9l-5.4 2.9 1.1-6.1-4.5-4.3 6.1-.8L12 3Z" />,
  grip: <path d="M9 6h.01M15 6h.01M9 12h.01M15 12h.01M9 18h.01M15 18h.01" strokeWidth="2.6" />,
  chart: <path d="M4 20V10m6 10V4m6 16v-7m4 7H2" />,
  settings: <path d="M4 7h10m4 0h2M4 17h2m4 0h10M16 4.5v5M8 14.5v5" />,
  home: <path d="m3 11 9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1v-9Z" />,
  close: <path d="M6 6l12 12M18 6 6 18" />,
  code: <path d="m8 8-4 4 4 4m8-8 4 4-4 4M14 5l-4 14" />,
  book: <path d="M4 5a2 2 0 0 1 2-2h13v15H6a2 2 0 0 0-2 2V5Zm0 15a2 2 0 0 0 2 2h13" />,
  database: <path d="M4 6c0-1.7 3.6-3 8-3s8 1.3 8 3-3.6 3-8 3-8-1.3-8-3Zm0 0v6c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6" />,
  wrench: <path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.6 2.6-2.4-.6-.6-2.4 2.6-2.6Z" />,
  plane: <path d="M21 3 3 10.5l7 2.5 2.5 7L21 3Zm-11 10 4-4" />,
  cap: <path d="m2 9 10-5 10 5-10 5L2 9Zm4 2.5V16c0 1.5 2.7 3 6 3s6-1.5 6-3v-4.5M22 9v6" />,
  pot: <path d="M5 10h14v6a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4v-6Zm-2 0h18M9 6c0-1 1-1 1-2m4 2c0-1 1-1 1-2" />,
  bookmark: <path d="M6 4h12v17l-6-4-6 4V4Z" />,
  spark: <path d="M12 3v4m0 10v4M3 12h4m10 0h4M6 6l2.5 2.5m7 7L18 18M6 18l2.5-2.5m7-7L18 6" />,
}

export function Icon({ name, filled = false, className = 'size-4' }: { name: IconName; filled?: boolean; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      {PATHS[name]}
    </svg>
  )
}

export function hue(text: string): number {
  let h = 0
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) % 360
  return h
}

/** Site icon from Chrome's local favicon cache, with a lettered tile when there is none. */
export function Favicon({ url, size = 16 }: { url: string; size?: number }) {
  const src = faviconUrl(url)
  const [failed, setFailed] = useState(false)
  if (src && !failed) {
    return <img src={src} alt="" width={size} height={size} className="shrink-0 rounded-sm" onError={() => setFailed(true)} />
  }
  const domain = domainOf(url) || '?'
  return (
    <span
      aria-hidden="true"
      className="grid shrink-0 place-items-center font-semibold text-white uppercase"
      style={{ width: size, height: size, borderRadius: size * 0.28, fontSize: size * 0.56, lineHeight: 1, background: `hsl(calc(var(--fav-base, 0) + ${hue(domain) % 360} * var(--fav-spread, 1)) 42% 36%)` }}
    >
      {domain[0]}
    </span>
  )
}

export function Toggle({ checked, onChange, label, description, disabled }: { checked: boolean; onChange: (next: boolean) => void; label: string; description?: ReactNode; disabled?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-6 py-3">
      <div className="min-w-0">
        <div className="text-sm font-medium">{label}</div>
        {description && <div className="mt-0.5 text-sm text-muted">{description}</div>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative mt-0.5 h-6 w-11 shrink-0 rounded-full border transition-colors disabled:opacity-50 ${checked ? 'border-accent bg-accent' : 'border-muted bg-card'}`}
      >
        <span className={`knob absolute top-0.5 size-[18px] rounded-full ${checked ? 'left-[22px] bg-accent-ink' : 'left-0.5 bg-muted'}`} />
      </button>
    </div>
  )
}

export function Card({ title, children, aside }: { title: string; children: ReactNode; aside?: ReactNode }) {
  const id = useId()
  return (
    <section aria-labelledby={id} className="surface rise rounded-2xl border border-line bg-card p-5">
      <div className="mb-3 flex items-baseline justify-between gap-4">
        <h2 id={id} className="text-sm font-semibold">{title}</h2>
        {aside && <div className="text-xs text-muted">{aside}</div>}
      </div>
      {children}
    </section>
  )
}

export function BookmarkRow({ bookmark, pinned, onOpen, onTogglePin, onRemove, height = 34, style, newTab = false, animateIn = false, badge }: { bookmark: Bookmark; pinned: boolean; onOpen: (b: Bookmark) => void; onTogglePin: (b: Bookmark) => void; onRemove: (b: Bookmark) => void; height?: number; style?: React.CSSProperties; newTab?: boolean; /** Slide in with the folder's other links, in order. */ animateIn?: boolean; /** A small tag after the title, such as how often it is opened. */ badge?: string }) {
  return (
    <li className={`group flex items-center gap-0.5 ${animateIn ? 'row-in' : ''}`} style={{ height, ...style }}>
      <a
        href={bookmark.url}
        {...(newTab ? { target: '_blank', rel: 'noopener' } : {})}
        title={bookmark.title}
        onClick={() => onOpen(bookmark)}
        onAuxClick={(e) => e.button === 1 && onOpen(bookmark)}
        className="row-link flex h-full min-w-0 flex-1 items-center gap-2.5 rounded-md px-2 text-sm hover:bg-hover"
      >
        <Favicon url={bookmark.url} />
        <span className="min-w-0 flex-1 truncate">{bookmark.title}</span>
      </a>
      {badge && <span className="mr-1 shrink-0 rounded-full bg-accent-soft px-2 py-0.5 text-[11px] text-ink tabular-nums">{badge}</span>}
      <button
        type="button"
        aria-pressed={pinned}
        aria-label={`${pinned ? 'Unpin' : 'Pin'} ${bookmark.title}`}
        onClick={() => onTogglePin(bookmark)}
        className={`size-7 shrink-0 place-items-center rounded-md hover:bg-hover ${pinned ? 'star-on grid text-accent' : 'hidden text-muted group-focus-within:grid group-hover:grid'}`}
      >
        <Icon name="star" filled={pinned} className="size-3.5" />
      </button>
      <button
        type="button"
        aria-label={`Remove ${bookmark.title}`}
        onClick={() => onRemove(bookmark)}
        className="hidden size-7 shrink-0 place-items-center rounded-md text-muted group-focus-within:grid group-hover:grid hover:bg-hover hover:text-danger"
      >
        <Icon name="trash" className="size-3.5" />
      </button>
    </li>
  )
}

/** Brief confirmation with an undo, shown after a bookmark is removed. */
export function Toast({ message, actionLabel, onAction, onDismiss }: { message: string; actionLabel: string; onAction: () => void; onDismiss: () => void }) {
  return (
    <div role="status" className="toast fixed bottom-24 left-1/2 lg:bottom-6 z-40 flex max-w-[92vw] -translate-x-1/2 items-center gap-3 rounded-xl border border-line bg-card py-2 pr-2 pl-4 text-sm shadow-2xl">
      <span className="truncate">{message}</span>
      <button type="button" onClick={onAction} className="h-8 shrink-0 rounded-lg bg-accent px-3 font-medium text-accent-ink">
        {actionLabel}
      </button>
      <button type="button" aria-label="Dismiss" onClick={onDismiss} className="grid size-8 shrink-0 place-items-center rounded-lg text-muted hover:bg-hover">
        <Icon name="close" className="size-3.5" />
      </button>
    </div>
  )
}
