import { DndContext, DragOverlay, type DragEndEvent, KeyboardSensor, type KeyboardCoordinateGetter, PointerSensor, closestCenter, useDraggable, useDroppable, useSensor, useSensors } from '@dnd-kit/core'
import { SortableContext, arrayMove, rectSortingStrategy, sortableKeyboardCoordinates, useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useVirtualizer } from '@tanstack/react-virtual'
import { useEffect, useRef, useState } from 'react'
import { type Slots, slotCount } from '../lib/slots'
import type { Bookmark, Settings } from '../lib/types'
import { BookmarkRow, Favicon, Icon, type IconName, hue } from './ui'

export interface Folder {
  id: string
  /** Every folder that shares this name; they show as one card and change together. */
  ids: string[]
  name: string
  bookmarks: Bookmark[]
  /** Chrome's own containers (Bookmarks bar and so on) cannot be renamed or deleted. */
  locked: boolean
}

const VIRTUALISE_ABOVE = 12

function useDragSensors() {
  return useSensors(
    // A few pixels of travel before a drag starts, so plain clicks on links still navigate.
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    // Space picks up and drops; Enter is left alone so it still follows the link.
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates, keyboardCodes: { start: ['Space'], cancel: ['Escape'], end: ['Space'] } }),
  )
}

function reorder(ids: string[], event: DragEndEvent): string[] | null {
  const { active, over } = event
  if (!over || active.id === over.id) return null
  return arrayMove(ids, ids.indexOf(String(active.id)), ids.indexOf(String(over.id)))
}

// ---- favourites --------------------------------------------------------------------------

/** True from the width where the two-column layout starts. */
function useWide(): boolean {
  const [wide, setWide] = useState(() => window.matchMedia('(min-width: 1024px)').matches)
  useEffect(() => {
    const list = window.matchMedia('(min-width: 1024px)')
    const on = () => setWide(list.matches)
    list.addEventListener('change', on)
    return () => list.removeEventListener('change', on)
  }, [])
  return wide
}

function FavouriteTile({ bookmark, index, onOpen, onUnpin, newTab }: { bookmark: Bookmark; index: number; onOpen: (b: Bookmark) => void; onUnpin: (b: Bookmark) => void; newTab: boolean }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: bookmark.id, attributes: { role: 'link', roleDescription: 'sortable link' } })
  const dragged = useRef(false)
  const wide = useWide()
  if (isDragging) dragged.current = true
  return (
    <li ref={setNodeRef} style={{ transform: CSS.Translate.toString(transform), transition, '--i': index + 4 } as React.CSSProperties} className={`enter group relative ${isDragging ? 'z-10 opacity-80' : ''}`}>
      <a
        {...attributes}
        {...listeners}
        href={bookmark.url}
        {...(newTab ? { target: '_blank', rel: 'noopener' } : {})}
        draggable={false}
        title={bookmark.title}
        onClick={(e) => {
          // The click that ends a drag must not navigate.
          if (dragged.current) e.preventDefault()
          else onOpen(bookmark)
          dragged.current = false
        }}
        className="surface glow-hover flex h-11 items-center gap-2.5 rounded-full border border-line bg-card pr-5 pl-3 text-sm hover:-translate-y-0.5 lg:h-14 lg:gap-3 lg:pr-6 lg:pl-3.5 lg:font-medium"
      >
        <Favicon url={bookmark.url} size={wide ? 28 : 22} />
        <span className="max-w-[11rem] truncate lg:max-w-[18rem]">{bookmark.title}</span>
      </a>
      <button
        type="button"
        aria-label={`Unpin ${bookmark.title}`}
        onClick={() => onUnpin(bookmark)}
        className="absolute -top-1.5 -right-1.5 grid size-5 place-items-center rounded-full border border-line bg-card text-muted opacity-0 hover:text-ink group-hover:opacity-100 focus-visible:opacity-100"
      >
        <Icon name="close" className="size-3" />
      </button>
    </li>
  )
}

export function FavouritesRow({ favourites, onOpen, onUnpin, onReorder, newTab }: { favourites: Bookmark[]; onOpen: (b: Bookmark) => void; onUnpin: (b: Bookmark) => void; onReorder: (ids: string[]) => void; newTab: boolean }) {
  const sensors = useDragSensors()
  const ids = favourites.map((b) => b.id)
  return (
    <section aria-labelledby="favourites-heading">
      <h2 id="favourites-heading" className="sr-only lg:not-sr-only lg:mb-2.5 lg:text-xs lg:font-semibold lg:tracking-wide lg:text-muted lg:uppercase">
        Favourites
      </h2>
      {favourites.length === 0 ? (
        <p style={{ '--i': 4 } as React.CSSProperties} className="enter text-center text-sm text-muted lg:text-left">Pin a bookmark with its star and it will stay here.</p>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={(e) => { const next = reorder(ids, e); if (next) onReorder(next) }}>
          <SortableContext items={ids} strategy={rectSortingStrategy}>
            <ul className="flex flex-wrap justify-center gap-3 lg:justify-start">
              {favourites.map((b, i) => (
                <FavouriteTile key={b.id} bookmark={b} index={i} onOpen={onOpen} onUnpin={onUnpin} newTab={newTab} />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
      )}
    </section>
  )
}

interface ListProps {
  bookmarks: Bookmark[]
  pinned: Set<string>
  onOpen: (b: Bookmark) => void
  onTogglePin: (b: Bookmark) => void
  onRemove: (b: Bookmark) => void
  rowHeight: number
  newTab: boolean
  /** Small tags by link id, e.g. how often the busiest ones are opened. */
  badges: Map<string, string>
}

/** Only the rows in view are in the DOM, so a folder with thousands of links costs the same as one with twelve. */
function VirtualList({ bookmarks, pinned, onOpen, onTogglePin, onRemove, rowHeight, newTab, badges }: ListProps) {
  const scroller = useRef<HTMLDivElement>(null)
  const virtual = useVirtualizer({ count: bookmarks.length, getScrollElement: () => scroller.current, estimateSize: () => rowHeight, overscan: 8 })
  return (
    <div ref={scroller} className="overflow-y-auto" style={{ maxHeight: rowHeight * VIRTUALISE_ABOVE }}>
      <ul className="relative" style={{ height: virtual.getTotalSize() }}>
        {virtual.getVirtualItems().map((item) => {
          const b = bookmarks[item.index]
          return <BookmarkRow key={b.id} bookmark={b} pinned={pinned.has(b.id)} badge={badges.get(b.id)} onOpen={onOpen} onTogglePin={onTogglePin} onRemove={onRemove} newTab={newTab} height={rowHeight} style={{ position: 'absolute', top: 0, left: 0, right: 0, transform: `translateY(${item.start}px)` }} />
        })}
      </ul>
    </div>
  )
}

const VIRTUALISE_ABOVE_COLUMNS = 300

function Links({ bookmarks, ...list }: ListProps) {
  // Only a folder with hundreds of links needs virtualising; the rest are plain rows.
  if (bookmarks.length > VIRTUALISE_ABOVE_COLUMNS) return <VirtualList bookmarks={bookmarks} {...list} />
  return (
    // One link per line, each sliding in just after the one above it.
    <ul>
      {bookmarks.map((b, i) => (
        <BookmarkRow key={b.id} bookmark={b} pinned={list.pinned.has(b.id)} badge={list.badges.get(b.id)} onOpen={list.onOpen} onTogglePin={list.onTogglePin} onRemove={list.onRemove} newTab={list.newTab} height={list.rowHeight} animateIn style={{ '--r': i } as React.CSSProperties} />
      ))}
    </ul>
  )
}

/** A glyph that suits the folder's name, falling back to a plain folder. */
const FOLDER_ICONS: [RegExp, IconName][] = [
  // Most specific first: "Machine learning" should not match "learn", nor "Bookmarks bar" match "book".
  [/bookmarks? bar|favou?rites|saved/i, 'bookmark'],
  [/machine|\bml\b|\bai\b|model/i, 'spark'],
  [/dev|code|program|engineer|software|web/i, 'code'],
  [/read|book|article|blog|news/i, 'book'],
  [/data|sql|postgres/i, 'database'],
  [/tool|util|work/i, 'wrench'],
  [/travel|trip|holiday|flight/i, 'plane'],
  [/uni|school|study|course|learn|research/i, 'cap'],
  [/cook|recipe|food|kitchen/i, 'pot'],
]
const folderIcon = (name: string): IconName => FOLDER_ICONS.find(([pattern]) => pattern.test(name))?.[1] ?? 'folder'


// ---- folder grid -------------------------------------------------------------------------

const GRID_ROWS_VISIBLE = 3

function useColumns(): number {
  const query = (n: number) => window.matchMedia(`(min-width: ${n}px)`)
  // The folders sit in the narrower right-hand column on wide screens, so they get two columns there.
  const read = () => (query(1024).matches ? 2 : query(640).matches ? 3 : 2)
  const [columns, setColumns] = useState(read)
  useEffect(() => {
    const lists = [query(640), query(1024)]
    const on = () => setColumns(read())
    lists.forEach((l) => l.addEventListener('change', on))
    return () => lists.forEach((l) => l.removeEventListener('change', on))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return columns
}

/** Arrow keys carry a picked-up folder to the neighbouring slot in that direction. */
const slotKeyboard: KeyboardCoordinateGetter = (event, { context: { droppableRects, droppableContainers, collisionRect }, currentCoordinates }) => {
  const dir = ({ ArrowRight: [1, 0], ArrowLeft: [-1, 0], ArrowDown: [0, 1], ArrowUp: [0, -1] } as Record<string, [number, number]>)[event.code]
  if (!dir || !collisionRect) return undefined
  event.preventDefault()
  const cx = collisionRect.left + collisionRect.width / 2
  const cy = collisionRect.top + collisionRect.height / 2
  let best: { dx: number; dy: number; score: number } | null = null
  for (const container of droppableContainers.getEnabled()) {
    const r = droppableRects.get(container.id)
    if (!r) continue
    const dx = r.left + r.width / 2 - cx
    const dy = r.top + r.height / 2 - cy
    const along = dx * dir[0] + dy * dir[1]
    if (along <= 1) continue
    const score = along + (Math.abs(dx * dir[1]) + Math.abs(dy * dir[0])) * 2
    if (!best || score < best.score) best = { dx, dy, score }
  }
  return best ? { x: currentCoordinates.x + best.dx, y: currentCoordinates.y + best.dy } : undefined
}

function FolderFace({ folder, selected, lifted }: { folder: Folder; selected?: boolean; lifted?: boolean }) {
  return (
    <div
      // Each folder gets its own colour: the theme's accent, turned around the colour wheel by a
      // step picked from the folder's name, so it stays the same from one visit to the next.
      style={{ '--fh': (hue(folder.name) % 8) * 45 } as React.CSSProperties}
      className={`folder-hue surface flex h-12 w-full items-center gap-2.5 rounded-xl border pr-3 pl-2 ${selected ? 'border-accent bg-hover' : 'border-line bg-card'} ${lifted ? 'shadow-soft' : ''}`}
    >
      <span className="folder-tile grid size-8 shrink-0 place-items-center rounded-lg text-accent-ink">
        <Icon name={folderIcon(folder.name)} className="size-4" />
      </span>
      <span data-folder-name className="min-w-0 flex-1 truncate text-left text-sm font-medium">
        {folder.name}
      </span>
      <span className="text-xs text-muted tabular-nums">{folder.bookmarks.length}</span>
    </div>
  )
}

function FolderCard({ folder, selected, onSelect }: { folder: Folder; selected: boolean; onSelect: (id: string) => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: folder.id, attributes: { roleDescription: 'movable folder' } })
  const dragged = useRef(false)
  if (isDragging) dragged.current = true
  return (
    <button
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      type="button"
      aria-current={selected ? 'true' : undefined}
      onClick={() => {
        // The click that ends a drag must not change the folder.
        if (!dragged.current) onSelect(folder.id)
        dragged.current = false
      }}
      className={`block w-full rounded-xl text-left transition-transform duration-200 hover:-translate-y-0.5 active:scale-[0.98] hover:[&>div]:bg-hover ${isDragging ? 'opacity-35' : ''}`}
    >
      <FolderFace folder={folder} selected={selected} />
    </button>
  )
}

function SlotCell({ slot, folder, selected, creating, onSelect, onStartCreate, onCreate, onCancelCreate }: { slot: number; folder?: Folder; selected: boolean; creating: boolean; onSelect: (id: string) => void; onStartCreate: (slot: number) => void; onCreate: (name: string, slot: number) => void; onCancelCreate: () => void }) {
  const { setNodeRef, isOver, active } = useDroppable({ id: `slot-${slot}` })
  // The cell the folder would land in lights up, so it is clear where it will snap to.
  const target = isOver && active && active.id !== folder?.id
  return (
    <li ref={setNodeRef} style={{ '--i': 5 + slot } as React.CSSProperties} className={`enter slot relative h-12 rounded-xl transition-[background-color,box-shadow] duration-150 ${target ? 'bg-accent-soft ring-2 ring-accent' : folder ? '' : 'border border-dashed border-line/70'}`}>
      {folder ? (
        <FolderCard folder={folder} selected={selected} onSelect={onSelect} />
      ) : creating ? (
        <NameInput initial="" label="Name for the new folder" onSubmit={(name) => onCreate(name, slot)} onCancel={onCancelCreate} className="h-12 w-full rounded-xl px-3" />
      ) : (
        <button type="button" tabIndex={-1} aria-label="New folder here" onClick={() => onStartCreate(slot)} className="grid h-full w-full place-items-center rounded-xl text-muted opacity-0 transition-opacity hover:bg-hover hover:opacity-100 focus-visible:opacity-100">
          <Icon name="plus" className="size-4" />
        </button>
      )}
    </li>
  )
}

function NameInput({ initial, label, onSubmit, onCancel, className = '' }: { initial: string; label: string; onSubmit: (name: string) => void; onCancel: () => void; className?: string }) {
  const [value, setValue] = useState(initial)
  const done = useRef(false)
  const finish = (save: boolean) => {
    if (done.current) return
    done.current = true
    const name = value.trim()
    if (save && name && name !== initial) onSubmit(name)
    else onCancel()
  }
  return (
    <input
      autoFocus
      aria-label={label}
      value={value}
      maxLength={80}
      placeholder="Folder name"
      onChange={(e) => setValue(e.target.value)}
      onFocus={(e) => e.target.select()}
      onKeyDown={(e) => {
        // Typing must not trigger the page's "/" and drag shortcuts.
        e.stopPropagation()
        if (e.key === 'Enter') finish(true)
        else if (e.key === 'Escape') finish(false)
      }}
      onBlur={() => finish(true)}
      className={`border border-accent bg-card text-sm font-medium outline-none ${className}`}
    />
  )
}

const SORTS: [Settings['linkSort'], string][] = [['saved', 'Saved order'], ['used', 'Most used'], ['az', 'A to Z']]

function FolderHeader({ folder, sort, onSort, onOpenAll, onRename, onDelete, onNew }: { folder: Folder; sort: Settings['linkSort']; onSort: (sort: Settings['linkSort']) => void; onOpenAll: (folder: Folder) => void; onRename: (folder: Folder, name: string) => void; onDelete: (folder: Folder) => void; onNew: () => void }) {
  const [renaming, setRenaming] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [openingAll, setOpeningAll] = useState(false)
  const count = folder.bookmarks.length
  const tool = 'grid size-8 place-items-center rounded-lg text-muted hover:bg-hover hover:text-ink'
  return (
    <div className="flex items-center gap-3 px-1 pb-3">
      <span className="folder-tile grid size-9 shrink-0 place-items-center rounded-xl text-accent-ink">
        <Icon name={folderIcon(folder.name)} className="size-[18px]" />
      </span>
      {renaming ? (
        <NameInput initial={folder.name} label="Folder name" onSubmit={(name) => { onRename(folder, name); setRenaming(false) }} onCancel={() => setRenaming(false)} className="h-9 min-w-0 flex-1 rounded-lg px-2.5" />
      ) : (
        <h3 className="min-w-0 flex-1 truncate text-[15px] leading-tight font-semibold">
          {folder.locked ? (
            folder.name
          ) : (
            // Click the name to change it; the label keeps this out of the folder cards' names.
            <button type="button" aria-label={`Folder name: ${folder.name}. Click to rename`} title="Click to rename" onClick={() => setRenaming(true)} className="-mx-2 max-w-full cursor-text truncate rounded-lg px-2 py-1 text-left hover:bg-hover">
              {folder.name}
            </button>
          )}
        </h3>
      )}
      <p className="text-xs text-muted tabular-nums">
        {count} {count === 1 ? 'link' : 'links'}
      </p>
      {openingAll ? (
        <div role="alertdialog" aria-label={`Open ${count} tabs?`} className="flex items-center gap-1.5 text-xs">
          <span className="text-muted">Open {count} tabs as a group?</span>
          <button type="button" autoFocus onClick={() => { setOpeningAll(false); onOpenAll(folder) }} className="rounded-lg bg-accent px-2.5 py-1.5 font-medium text-accent-ink">
            Open
          </button>
          <button type="button" onClick={() => setOpeningAll(false)} className="rounded-lg px-2.5 py-1.5 text-muted hover:bg-hover hover:text-ink">
            Cancel
          </button>
        </div>
      ) : confirming ? (
        <div role="alertdialog" aria-label={`Delete ${folder.name}?`} className="flex items-center gap-1.5 text-xs">
          <span className="text-muted">{count ? `Delete with ${count} ${count === 1 ? 'link' : 'links'}?` : 'Delete?'}</span>
          <button type="button" autoFocus onClick={() => { setConfirming(false); onDelete(folder) }} className="rounded-lg bg-accent px-2.5 py-1.5 font-medium text-accent-ink">
            Delete
          </button>
          <button type="button" onClick={() => setConfirming(false)} className="rounded-lg px-2.5 py-1.5 text-muted hover:bg-hover hover:text-ink">
            Cancel
          </button>
        </div>
      ) : (
        <div className="flex items-center">
          {count > 1 && (
            <label className="mr-1 flex items-center text-muted" title="Sort the links">
              <Icon name="sort" className="pointer-events-none -mr-5 ml-2 size-3.5" />
              <select aria-label="Sort links" value={sort} onChange={(e) => onSort(e.target.value as Settings['linkSort'])} className="h-8 cursor-pointer appearance-none rounded-lg border border-transparent bg-transparent pr-2 pl-7 text-xs hover:bg-hover">
                {SORTS.map(([id, label]) => (
                  <option key={id} value={id}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
          )}
          {count > 0 && (
            <button type="button" aria-label={`Open all ${count} links in ${folder.name} as a tab group`} title="Open all as a tab group" onClick={() => (count > 8 ? setOpeningAll(true) : onOpenAll(folder))} className={tool}>
              <Icon name="tabs" className="size-4" />
            </button>
          )}
          <button type="button" aria-label="New folder" title="New folder" onClick={onNew} className={tool}>
            <Icon name="plus" className="size-4" />
          </button>
          {!folder.locked && (
            <>
              <button type="button" aria-label={`Rename ${folder.name}`} title="Rename" onClick={() => setRenaming(true)} className={tool}>
                <Icon name="edit" className="size-4" />
              </button>
              <button type="button" aria-label={`Delete ${folder.name}`} title="Delete" onClick={() => (count ? setConfirming(true) : onDelete(folder))} className={tool}>
                <Icon name="trash" className="size-4" />
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}

interface BrowserProps {
  folders: Folder[]
  slots: Slots
  selectedId: string
  onSelect: (id: string) => void
  onMove: (id: string, slot: number) => void
  onCreate: (name: string, slot: number) => void
  onRename: (folder: Folder, name: string) => void
  onDelete: (folder: Folder) => void
  openCounts: Map<string, number>
  linkSort: Settings['linkSort']
  onSort: (sort: Settings['linkSort']) => void
  onOpenAll: (folder: Folder, bookmarks: Bookmark[]) => void
}

/** The links in the order asked for; ties keep the saved order. */
export function sortLinks(bookmarks: Bookmark[], sort: Settings['linkSort'], openCounts: Map<string, number>): Bookmark[] {
  if (sort === 'used') return [...bookmarks].sort((a, b) => (openCounts.get(b.url) ?? 0) - (openCounts.get(a.url) ?? 0))
  if (sort === 'az') return [...bookmarks].sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }))
  return bookmarks
}

/** Folders on a grid of slots you can drag them between, and the links of the chosen one in a panel below. */
export function FolderBrowser({ folders, slots, selectedId, onSelect, onMove, onCreate, onRename, onDelete, openCounts, linkSort, onSort, onOpenAll, ...list }: BrowserProps & Omit<ListProps, 'bookmarks' | 'badges'>) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    // Space picks a folder up, arrows carry it between slots, Space drops it; Enter still opens it.
    useSensor(KeyboardSensor, { coordinateGetter: slotKeyboard, keyboardCodes: { start: ['Space'], cancel: ['Escape'], end: ['Space'] } }),
  )
  const columns = useColumns()
  const [dragging, setDragging] = useState<string | null>(null)
  const [creating, setCreating] = useState<number | null>(null)
  const current = folders.find((f) => f.id === selectedId) ?? folders[0]
  const bySlot = new Map(folders.map((f) => [slots[f.id], f]))
  const count = slotCount(slots, columns)
  const firstFree = Array.from({ length: count }, (_, i) => i).find((i) => !bySlot.has(i)) ?? count
  const dragged = folders.find((f) => f.id === dragging)
  const links = current ? sortLinks(current.bookmarks, linkSort, openCounts) : []
  // The three busiest links in the open folder wear a tag with how often they are opened.
  const badges = new Map(
    (current?.bookmarks ?? [])
      .map((b) => [b, openCounts.get(b.url) ?? 0] as const)
      .filter(([, n]) => n > 0)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([b, n]) => [b.id, `${n} ${n === 1 ? 'open' : 'opens'}`] as const),
  )

  function onDragEnd(e: DragEndEvent) {
    setDragging(null)
    const over = e.over && String(e.over.id)
    if (over?.startsWith('slot-')) onMove(String(e.active.id), Number(over.slice(5)))
  }

  return (
    <section aria-labelledby="folders-heading" className="flex min-h-0 flex-1 flex-col gap-3">
      <h2 id="folders-heading" className="sr-only">
        Folders
      </h2>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={(e) => setDragging(String(e.active.id))} onDragEnd={onDragEnd} onDragCancel={() => setDragging(null)}>
        <ul className="grid gap-2.5 overflow-y-auto p-1" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`, maxHeight: `calc(${GRID_ROWS_VISIBLE} * 3rem + ${GRID_ROWS_VISIBLE - 1} * 0.625rem + 0.5rem)` }}>
          {Array.from({ length: count }, (_, slot) => (
            <SlotCell key={slot} slot={slot} folder={bySlot.get(slot)} selected={bySlot.get(slot)?.id === current?.id} creating={creating === slot} onSelect={onSelect} onStartCreate={setCreating} onCreate={(name, s) => { setCreating(null); onCreate(name, s) }} onCancelCreate={() => setCreating(null)} />
          ))}
        </ul>
        {/* The lifted card glides into the slot it is dropped on. */}
        <DragOverlay dropAnimation={{ duration: 220, easing: 'cubic-bezier(0.3, 1.4, 0.5, 1)' }}>{dragged ? <FolderFace folder={dragged} selected lifted /> : null}</DragOverlay>
      </DndContext>
      {!current && <p className="text-center text-muted">No bookmarks yet. Save a page in Chrome, or make a folder above, and it will show up here.</p>}
      {current && (
        <div style={{ '--i': 10 } as React.CSSProperties} className="enter flex min-h-0 flex-1 flex-col">
        <section
          key={current.id}
          aria-label={current.name}
          style={{ '--fh': (hue(current.name) % 8) * 45 } as React.CSSProperties}
          className="folder surface pane-in relative isolate flex min-h-[14rem] flex-1 flex-col overflow-hidden rounded-2xl border border-line bg-card p-4 lg:min-h-0"
        >
          <FolderHeader folder={current} sort={linkSort} onSort={onSort} onOpenAll={(f) => onOpenAll(f, links)} onRename={onRename} onDelete={onDelete} onNew={() => setCreating(firstFree)} />
          <div aria-hidden="true" className="folder-rule mx-1 mb-2 h-px" />
          <div className="-mx-1 min-h-0 flex-1 overflow-y-auto px-1">
            {current.bookmarks.length ? <Links key={linkSort} bookmarks={links} badges={badges} {...list} /> : <p className="py-6 text-center text-sm text-muted">This folder is empty. Save a page into it in Chrome and it will show up here.</p>}
          </div>
        </section>
        </div>
      )}
    </section>
  )
}
