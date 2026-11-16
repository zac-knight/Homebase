import { demoEvents, isExtension, kv, loadBookmarks } from './platform'
import { DEFAULT_SETTINGS, type Settings, type Task, type UsageEvent } from './types'

const MAX_EVENTS = 20_000

export async function getSettings(): Promise<Settings> {
  return { ...DEFAULT_SETTINGS, ...(await kv.get<Partial<Settings>>('settings', {})) }
}

export async function saveSettings(patch: Partial<Settings>): Promise<Settings> {
  const next = { ...(await getSettings()), ...patch }
  await kv.set('settings', next)
  return next
}

export async function getEvents(): Promise<UsageEvent[]> {
  const stored = await kv.get<UsageEvent[] | null>('events', null)
  if (stored) return stored
  if (isExtension) return []
  const seeded = demoEvents(await loadBookmarks())
  await kv.set('events', seeded)
  return seeded
}

// Writes are chained so two events logged in the same tick cannot overwrite each other.
let queue: Promise<unknown> = Promise.resolve()

export function logEvent(event: Omit<UsageEvent, 'id' | 'ts' | 'hour' | 'dow'>): Promise<UsageEvent> {
  const now = new Date()
  const full: UsageEvent = { ...event, id: crypto.randomUUID(), ts: now.getTime(), hour: now.getHours(), dow: now.getDay() }
  const write = queue.then(async () => {
    const events = await getEvents()
    events.push(full)
    await kv.set('events', events.length > MAX_EVENTS ? events.slice(-MAX_EVENTS) : events)
    return full
  })
  queue = write.catch(() => {})
  return write
}

export const getFavourites = () => kv.get<string[]>('favourites', [])
export const setFavourites = (ids: string[]) => kv.set('favourites', ids)
export const getFolderOrder = () => kv.get<string[]>('folderOrder', [])
export const setFolderOrder = (ids: string[]) => kv.set('folderOrder', ids)
export const getTasks = () => kv.get<Task[]>('tasks', [])
export const setTasks = (tasks: Task[]) => kv.set('tasks', tasks)
