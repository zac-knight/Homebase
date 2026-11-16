import { DndContext, type DragEndEvent, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors } from '@dnd-kit/core'
import { SortableContext, arrayMove, rectSortingStrategy, sortableKeyboardCoordinates, useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useVirtualizer } from '@tanstack/react-virtual'
import { useRef } from 'react'
import type { Bookmark } from '../lib/types'
import { BookmarkRow, Favicon, Icon, type IconName, hue } from './ui'

export interface Folder {
  id: string
  name: string
  bookmarks: Bookmark[]
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

function FavouriteTile({ bookmark, index, onOpen, onUnpin, newTab }: { bookmark: Bookmark; index: number; onOpen: (b: Bookmark) => void; onUnpin: (b: Bookmark) => void; newTab: boolean }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: bookmark.id, attributes: { role: 'link', roleDescription: 'sortable link' } })
  const dragged = useRef(false)
  if (isDragging) dragged.current = true
  return (
    <li ref={setNodeRef} style={{ transform: CSS.Translate.toString(transform), transition, '--i': index } as React.CSSProperties} className={`rise group relative ${isDragging ? 'z-10 opacity-80' : ''}`}>
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
        className="surface lift glow-hover flex h-11 items-center gap-2.5 rounded-full border border-line bg-card pr-5 pl-3 text-sm hover:-translate-y-0.5"
      >
        <Favicon url={bookmark.url} size={22} />
        <span className="max-w-[11rem] truncate">{bookmark.title}</span>
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
      <h2 id="favourites-heading" className="sr-only">
        Favourites
      </h2>
      {favourites.length === 0 ? (
        <p className="text-center text-sm text-muted">Pin a bookmark with its star and it will stay here.</p>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={(e) => { const next = reorder(ids, e); if (next) onReorder(next) }}>
          <SortableContext items={ids} strategy={rectSortingStrategy}>
            <ul className="flex flex-wrap justify-center gap-3">
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
}

/** Only the rows in view are in the DOM, so a folder with thousands of links costs the same as one with twelve. */
function VirtualList({ bookmarks, pinned, onOpen, onTogglePin, onRemove, rowHeight, newTab }: ListProps) {
  const scroller = useRef<HTMLDivElement>(null)
  const virtual = useVirtualizer({ count: bookmarks.length, getScrollElement: () => scroller.current, estimateSize: () => rowHeight, overscan: 8 })
  return (
    <div ref={scroller} className="overflow-y-auto" style={{ maxHeight: rowHeight * VIRTUALISE_ABOVE }}>
      <ul className="relative" style={{ height: virtual.getTotalSize() }}>
        {virtual.getVirtualItems().map((item) => {
          const b = bookmarks[item.index]
          return <BookmarkRow key={b.id} bookmark={b} pinned={pinned.has(b.id)} onOpen={onOpen} onTogglePin={onTogglePin} onRemove={onRemove} newTab={newTab} height={rowHeight} style={{ position: 'absolute', top: 0, left: 0, right: 0, transform: `translateY(${item.start}px)` }} />
        })}
      </ul>
    </div>
  )
}

const VIRTUALISE_ABOVE_COLUMNS = 300

function Links({ bookmarks, ...list }: ListProps) {
  // Only a folder with hundreds of links needs virtualising; the rest flow into columns.
  if (bookmarks.length > VIRTUALISE_ABOVE_COLUMNS) return <VirtualList bookmarks={bookmarks} {...list} />
  return (
    <ul className="columns-1 gap-x-8 md:columns-2 xl:columns-3 [&>li]:break-inside-avoid">
      {bookmarks.map((b) => (
        <BookmarkRow key={b.id} bookmark={b} pinned={list.pinned.has(b.id)} onOpen={list.onOpen} onTogglePin={list.onTogglePin} onRemove={list.onRemove} newTab={list.newTab} height={list.rowHeight} />
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

function FolderChip({ folder, selected, onSelect }: { folder: Folder; selected: boolean; onSelect: (id: string) => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: folder.id, attributes: { roleDescription: 'sortable folder' } })
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
      // Each folder gets its own colour: the theme's accent, turned around the colour wheel by a
      // step picked from the folder's name, so it stays the same from one visit to the next.
      style={{ transform: CSS.Translate.toString(transform), transition, '--fh': (hue(folder.name) % 8) * 45 } as React.CSSProperties}
      className={`folder-hue surface lift flex h-12 shrink-0 items-center gap-2.5 rounded-xl border pr-3.5 pl-2 ${selected ? 'border-accent bg-hover' : 'border-line bg-card hover:bg-hover'} ${isDragging ? 'z-10 opacity-80' : ''}`}
    >
      <span className="folder-tile grid size-8 shrink-0 place-items-center rounded-lg text-accent-ink">
        <Icon name={folderIcon(folder.name)} className="size-4" />
      </span>
      <span data-folder-name className="max-w-[9rem] truncate text-sm font-medium">
        {folder.name}
      </span>
      <span className="text-xs text-muted tabular-nums">{folder.bookmarks.length}</span>
    </button>
  )
}

/** Folders as tabs along the top, and the links of the chosen one in a panel of fixed size below. */
export function FolderBrowser({ folders, selectedId, onSelect, onReorder, ...list }: { folders: Folder[]; selectedId: string; onSelect: (id: string) => void; onReorder: (ids: string[]) => void } & Omit<ListProps, 'bookmarks'>) {
  const sensors = useDragSensors()
  const ids = folders.map((f) => f.id)
  const current = folders.find((f) => f.id === selectedId) ?? folders[0]
  return (
    <section aria-labelledby="folders-heading" className="flex min-h-0 flex-1 flex-col gap-3">
      <h2 id="folders-heading" className="sr-only">
        Folders
      </h2>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={(e) => { const next = reorder(ids, e); if (next) onReorder(next) }}>
        <SortableContext items={ids} strategy={rectSortingStrategy}>
          <div className="flex flex-wrap justify-center gap-2.5">
            {folders.map((folder) => (
              <FolderChip key={folder.id} folder={folder} selected={folder.id === current.id} onSelect={onSelect} />
            ))}
          </div>
        </SortableContext>
      </DndContext>
      <section
        key={current.id}
        aria-label={current.name}
        style={{ '--fh': (hue(current.name) % 8) * 45 } as React.CSSProperties}
        className="folder surface pane-in relative isolate flex min-h-[14rem] flex-1 flex-col overflow-hidden rounded-2xl border border-line bg-card p-4 lg:min-h-0"
      >
        <div className="flex items-center gap-3 px-1 pb-3">
          <span className="folder-tile grid size-9 shrink-0 place-items-center rounded-xl text-accent-ink">
            <Icon name={folderIcon(current.name)} className="size-[18px]" />
          </span>
          <h3 className="min-w-0 flex-1 truncate text-[15px] leading-tight font-semibold">{current.name}</h3>
          <p className="text-xs text-muted tabular-nums">
            {current.bookmarks.length} {current.bookmarks.length === 1 ? 'link' : 'links'}
          </p>
        </div>
        <div aria-hidden="true" className="folder-rule mx-1 mb-2 h-px" />
        <div className="-mx-1 min-h-0 flex-1 overflow-y-auto px-1">
          <Links bookmarks={current.bookmarks} {...list} />
        </div>
      </section>
    </section>
  )
}
