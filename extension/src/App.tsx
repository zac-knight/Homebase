import { Suspense, lazy, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { type Folder, FavouritesRow, FolderBrowser } from './components/Home'
import { SearchPalette } from './components/SearchPalette'
import { Icon, type IconName, Toast } from './components/ui'
import { Waves } from './components/Waves'
import { getAuth } from './lib/api'
import { withTransition } from './lib/effects'
import { loadBookmarks, onBookmarksChanged, removeBookmark } from './lib/platform'
import { buildIndex } from './lib/search'
import { getEvents, getFavourites, getFolderOrder, getSettings, getTasks, logEvent, saveSettings, setFavourites, setFolderOrder, setTasks } from './lib/store'
import { applyAppearance } from './lib/theme'
import { DEFAULT_SETTINGS, type Bookmark, type Settings as SettingsType, type Task, type UsageEvent } from './lib/types'

// Charts and settings are loaded on demand so the new tab page itself stays small and opens fast.
const Insights = lazy(() => import('./components/Insights').then((m) => ({ default: m.Insights })))
const Tasks = lazy(() => import('./components/Tasks').then((m) => ({ default: m.Tasks })))
const Settings = lazy(() => import('./components/Settings').then((m) => ({ default: m.Settings })))

type View = 'home' | 'tasks' | 'insights' | 'settings'
const VIEWS: { id: View; label: string; icon: IconName }[] = [
  { id: 'home', label: 'Home', icon: 'home' },
  { id: 'tasks', label: 'Tasks', icon: 'check' },
  { id: 'insights', label: 'Insights', icon: 'chart' },
  { id: 'settings', label: 'Settings', icon: 'settings' },
]

interface Data {
  bookmarks: Bookmark[]
  events: UsageEvent[]
  settings: SettingsType
  favourites: string[]
  folderOrder: string[]
  tasks: Task[]
  signedIn: boolean
}

const viewFromHash = (): View => (VIEWS.find((v) => `#${v.id}` === location.hash)?.id ?? 'home')

function greeting(hour: number): string {
  return hour < 5 ? 'Still up' : hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'
}

function PageHeader({ title, note }: { title: string; note: string }) {
  return (
    <div className="mb-7 border-b border-line pt-2 pb-6">
      <h1 className="title-gradient title-in pb-1 font-display text-5xl tracking-tight">{title}</h1>
      <p className="rise mt-1 text-[15px] text-muted">{note}</p>
    </div>
  )
}

/** The section tabs, with a highlight that slides to whichever one is current. */
function Nav({ view, onNavigate }: { view: View; onNavigate: (v: View) => void }) {
  const nav = useRef<HTMLElement>(null)
  const [pill, setPill] = useState<{ left: number; top: number; width: number; height: number } | null>(null)
  useLayoutEffect(() => {
    const el = nav.current
    if (!el) return
    const measure = () => {
      const current = el.querySelector<HTMLElement>('[aria-current="page"]')
      const next = current && { left: current.offsetLeft, top: current.offsetTop, width: current.offsetWidth, height: current.offsetHeight }
      if (next) setPill((p) => (p && p.left === next.left && p.top === next.top && p.width === next.width && p.height === next.height ? p : next))
    }
    measure()
    // The bar is a row on small screens and a column on wide ones, and typefaces change its size.
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [view])
  return (
    <nav ref={nav} aria-label="Sections" className="relative flex gap-1 lg:flex-col">
      {pill && <span aria-hidden="true" className="nav-pill absolute top-0 left-0 rounded-xl bg-accent" style={{ width: pill.width, height: pill.height, transform: `translate(${pill.left}px, ${pill.top}px)` }} />}
      {VIEWS.map((v) => (
        <button key={v.id} type="button" aria-current={view === v.id ? 'page' : undefined} onClick={() => onNavigate(v.id)} className={`relative flex h-10 items-center gap-1.5 rounded-xl px-3 text-sm lg:h-[60px] lg:w-[60px] lg:flex-col lg:justify-center lg:gap-1 lg:px-0 lg:text-[10.5px] ${view === v.id ? 'font-medium text-accent-ink' : 'text-muted hover:bg-hover hover:text-ink'}`}>
          <Icon name={v.icon} className="size-4 lg:size-5" />
          {v.label}
        </button>
      ))}
    </nav>
  )
}

async function loadAll(): Promise<Data> {
  const [bookmarks, events, settings, favourites, folderOrder, tasks, auth] = await Promise.all([loadBookmarks(), getEvents(), getSettings(), getFavourites(), getFolderOrder(), getTasks(), getAuth()])
  return { bookmarks, events, settings, favourites, folderOrder, tasks, signedIn: settings.syncEnabled && !!auth }
}

export default function App() {
  const [data, setData] = useState<Data | null>(null)
  const [view, setView] = useState<View>(viewFromHash)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [now] = useState(() => new Date())
  const [clock, setClock] = useState(() => new Date())
  const [removed, setRemoved] = useState<{ title: string; wasPinned: string | null; undo: () => Promise<string> } | null>(null)
  const [openFolderId, setOpenFolderId] = useState<string | null>(null)
  const searchButton = useRef<HTMLButtonElement>(null)

  const reload = useCallback(
    () =>
      void loadAll().then((loaded) => {
        applyAppearance(loaded.settings)
        setData(loaded)
      }),
    [],
  )

  useEffect(() => {
    reload()
    return onBookmarksChanged(() => void loadBookmarks().then((bookmarks) => setData((d) => d && { ...d, bookmarks })))
  }, [reload])

  useEffect(() => {
    const onHash = () => setView(viewFromHash())
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLElement && (e.target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName))
      if ((e.key.toLowerCase() === 'k' && (e.metaKey || e.ctrlKey)) || (e.key === '/' && !typing)) {
        e.preventDefault()
        setPaletteOpen(true)
      }
    }
    window.addEventListener('hashchange', onHash)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('hashchange', onHash)
      window.removeEventListener('keydown', onKey)
    }
  }, [])

  const bookmarks = data?.bookmarks
  const index = useMemo(() => buildIndex(bookmarks ?? []), [bookmarks])
  const openCounts = useMemo(() => {
    const counts = new Map<string, number>()
    for (const e of data?.events ?? []) if (e.type === 'open' && e.url) counts.set(e.url, (counts.get(e.url) ?? 0) + 1)
    return counts
  }, [data?.events])

  const folders = useMemo<Folder[]>(() => {
    // Folders sharing a name are one card: Chrome can hold several (an imported "Bookmarks bar",
    // say), and cards show only the name, so the copies would look identical.
    const map = new Map<string, Folder>()
    for (const b of bookmarks ?? []) {
      const key = b.folderName.trim().toLowerCase()
      const folder = map.get(key)
      if (folder) folder.bookmarks.push(b)
      else map.set(key, { id: b.folderId, name: b.folderName, bookmarks: [b] })
    }
    const order = new Map((data?.folderOrder ?? []).map((id, i) => [id, i]))
    return [...map.values()].sort((a, b) => (order.get(a.id) ?? 1e9) - (order.get(b.id) ?? 1e9) || a.name.localeCompare(b.name))
  }, [bookmarks, data?.folderOrder])

  const favourites = useMemo(() => {
    const byId = new Map((bookmarks ?? []).map((b) => [b.id, b]))
    return (data?.favourites ?? []).flatMap((id) => byId.get(id) ?? [])
  }, [bookmarks, data?.favourites])
  const pinned = useMemo(() => new Set(data?.favourites ?? []), [data?.favourites])

  const showClock = data?.settings.showClock ?? false
  useEffect(() => {
    if (!showClock) return
    const timer = setInterval(() => setClock(new Date()), 5000)
    return () => clearInterval(timer)
  }, [showClock])

  // The undo offer goes away by itself after a few seconds.
  useEffect(() => {
    if (!removed) return
    const timer = setTimeout(() => setRemoved(null), 8000)
    return () => clearTimeout(timer)
  }, [removed])

  if (!data) return <div className="min-h-screen" aria-busy="true" />

  const open = (source: string) => (b: Bookmark) => void logEvent({ type: 'open', url: b.url, source })

  function togglePin(b: Bookmark) {
    const next = pinned.has(b.id) ? data!.favourites.filter((id) => id !== b.id) : [...data!.favourites, b.id]
    setData({ ...data!, favourites: next })
    void setFavourites(next)
  }

  async function remove(b: Bookmark) {
    const undo = await removeBookmark(b)
    setRemoved({ title: b.title, wasPinned: pinned.has(b.id) ? b.id : null, undo })
    setData((d) => d && { ...d, bookmarks: d.bookmarks.filter((x) => x.id !== b.id) })
  }

  async function undoRemove() {
    if (!removed) return
    const { undo, wasPinned } = removed
    setRemoved(null)
    const newId = await undo()
    // Chrome gives the restored bookmark a new id, so a pin has to follow it.
    const favourites = wasPinned ? data!.favourites.map((id) => (id === wasPinned ? newId : id)) : data!.favourites
    if (wasPinned) await setFavourites(favourites)
    const bookmarks = await loadBookmarks()
    setData((d) => d && { ...d, bookmarks, favourites })
  }

  function changeSettings(patch: Partial<SettingsType>) {
    const apply = () => {
      applyAppearance({ ...data!.settings, ...patch })
      setData((d) => d && { ...d, settings: { ...d.settings, ...patch } })
    }
    // A new theme wipes in from the control that chose it; other changes to the look cross-fade.
    if ('theme' in patch || 'palette' in patch) withTransition('theme', apply)
    else if ('background' in patch || 'cardStyle' in patch || 'radius' in patch || 'font' in patch) withTransition('fade', apply)
    else apply()
    void saveSettings(patch).then(reload)
  }

  function navigate(next: View) {
    if (next === view) return
    history.replaceState(null, '', next === 'home' ? location.pathname + location.search : `#${next}`)
    withTransition('nav', () => {
      setView(next)
      window.scrollTo(0, 0)
    })
  }

  const newTab = data.settings.openInNewTab
  const rowHeight = data.settings.density === 'compact' ? 28 : 34
  const listProps = { pinned, onOpen: open('folder'), onTogglePin: togglePin, onRemove: (b: Bookmark) => void remove(b), rowHeight, newTab }
  const bookmarkFolders = folders.length ? (
    <FolderBrowser folders={folders} {...listProps} selectedId={openFolderId ?? folders[0].id} onSelect={setOpenFolderId} onReorder={(ids) => { setData({ ...data, folderOrder: ids }); void setFolderOrder(ids) }} />
  ) : (
    <p className="text-center text-muted">No bookmarks yet. Save a page in Chrome and it will show up here.</p>
  )

  return (
    <div className="min-h-screen lg:pl-[104px]">
      {data.settings.waves && <Waves />}
      {/* A rail down the left edge on wide screens; a floating dock along the bottom on small ones. */}
      <header className="surface fixed bottom-4 left-1/2 z-30 flex -translate-x-1/2 items-center gap-3 rounded-2xl border border-line bg-card p-1.5 shadow-soft lg:top-4 lg:bottom-4 lg:left-4 lg:translate-x-0 lg:flex-col lg:p-2">
        <span aria-hidden="true" className="logo-mark hidden size-11 place-items-center rounded-xl bg-accent font-display text-xl text-accent-ink lg:grid">H</span>
        <span className="sr-only">Homebase</span>
        <span aria-hidden="true" className="hidden h-px w-8 bg-line lg:block" />
        <Nav view={view} onNavigate={navigate} />
      </header>

      {/* The home view is exactly one screen tall on wide windows; the folder panel scrolls inside itself if it must. */}
      <main className={`mx-auto max-w-[1400px] px-5 pt-6 pb-28 sm:px-8 lg:pt-8 ${view === 'home' ? 'lg:flex lg:h-dvh lg:flex-col lg:pb-8' : 'lg:pb-16'}`}>
        {view === 'home' && (
          <div className="mx-auto flex w-full max-w-5xl flex-col gap-7 lg:min-h-0 lg:flex-1">
            <div className="flex flex-col items-center gap-2 pt-2 text-center">
              <div className="flex items-center gap-3">
                <p className="rise rounded-full border border-line px-3 py-1 text-xs font-medium tracking-wide text-muted uppercase">{now.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}</p>
                {data.settings.showClock && <p className="rise text-sm text-muted tabular-nums">{clock.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}</p>}
              </div>
              {/* The page always has one h1; it is visually hidden when the greeting is switched off. */}
              <h1 className={data.settings.showGreeting ? 'title-gradient title-in pb-1 font-display text-5xl tracking-tight sm:text-6xl' : 'sr-only'}>
                {data.settings.showGreeting ? `${greeting(now.getHours())}${data.settings.name.trim() ? `, ${data.settings.name.trim()}` : ''}` : 'Homebase'}
              </h1>
              <p className="rise text-[15px] text-muted" style={{ '--i': 1 } as React.CSSProperties}>
                {data.bookmarks.length.toLocaleString()} saved links in {folders.length} {folders.length === 1 ? 'folder' : 'folders'}
                {favourites.length > 0 && `, ${favourites.length} pinned`}
              </p>
            </div>
            <button ref={searchButton} type="button" onClick={() => setPaletteOpen(true)} style={{ '--i': 2 } as React.CSSProperties} className="surface glow-ring glow-hover rise mx-auto flex h-14 w-full max-w-2xl shrink-0 items-center gap-3 rounded-2xl border border-line bg-card px-5 text-left text-muted shadow-soft">
              <Icon name="search" />
              <span className="flex-1 text-[15px]">Search {data.bookmarks.length.toLocaleString()} bookmarks</span>
              <kbd className="rounded border border-line px-1.5 py-0.5 text-[11px]">{navigator.platform.includes('Mac') ? '⌘K' : 'Ctrl K'}</kbd>
            </button>
            {data.settings.showFavourites && <FavouritesRow favourites={favourites} onOpen={open('favourites')} onUnpin={togglePin} onReorder={(ids) => { setData({ ...data, favourites: ids }); void setFavourites(ids) }} newTab={newTab} />}
            {bookmarkFolders}
          </div>
        )}
        <Suspense fallback={null}>
        {view === 'tasks' && (
          <>
            <PageHeader title="Tasks" note="What needs doing, soonest first. Kept on this device." />
            <Tasks tasks={data.tasks} onChange={(tasks) => { setData({ ...data, tasks }); void setTasks(tasks) }} />
          </>
        )}
        {view === 'insights' && (
          <>
            <PageHeader title="Insights" note="How you use what you have saved." />
            <Insights bookmarks={data.bookmarks} events={data.events} settings={data.settings} signedIn={data.signedIn} onOpen={(b, source) => open(source)(b)} />
          </>
        )}
        {view === 'settings' && (
          <>
            <PageHeader title="Settings" note="Make it yours. Everything here is kept on this device unless you turn sync on." />
            <Settings settings={data.settings} onChange={changeSettings} onDataDeleted={() => { applyAppearance(DEFAULT_SETTINGS); reload() }} />
          </>
        )}
        </Suspense>
      </main>

      {removed && <Toast message={`Removed “${removed.title}”`} actionLabel="Undo" onAction={() => void undoRemove()} onDismiss={() => setRemoved(null)} />}
      {paletteOpen && <SearchPalette index={index} openCounts={openCounts} serverEnabled={data.signedIn} onClose={() => { setPaletteOpen(false); setTimeout(() => searchButton.current?.focus()) }} />}
    </div>
  )
}
