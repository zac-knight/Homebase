export interface Bookmark {
  id: string
  url: string
  title: string
  /** Folder path below the browser's root folders, e.g. "Dev/Rust". Empty when unfiled. */
  folder: string
  folderId: string
  /** What to show on the card: the last path segment, or the root folder's own name. */
  folderName: string
  addedAt: number
}

export type Variant = 'recommended' | 'recent'

export interface UsageEvent {
  id: string
  type: 'open' | 'search' | 'impression'
  url?: string
  /** Where the click came from: folder, favourites, rightnow, search, digest. */
  source?: string
  query?: string
  variant?: Variant
  ts: number
  /** Local hour and weekday, recorded here because the server does not know the time zone. */
  hour: number
  dow: number
}

export interface Settings {
  theme: 'system' | 'light' | 'dark'
  /** Colour theme id from lib/themes.ts. */
  palette: string
  /** Custom accent as #rrggbb, or null to use the theme's own. */
  accent: string | null
  background: 'plain' | 'glow' | 'aurora' | 'gradient' | 'dots' | 'grid' | 'stars' | 'psp' | 'beach' | 'network' | 'image'
  cardStyle: 'solid' | 'glass' | 'outline'
  radius: 'sharp' | 'rounded' | 'soft'
  font: 'classic' | 'modern' | 'editorial' | 'rounded' | 'mono'
  motion: 'off' | 'subtle' | 'lively'
  density: 'comfortable' | 'compact'
  showGreeting: boolean
  showClock: boolean
  /** Shown after the greeting, e.g. "Good evening, Sam". */
  name: string
  showFavourites: boolean
  /** "Pick up where you left off": recently closed tabs and recent history. Needs permission. */
  showRecent: boolean
  /** A persistent scratchpad on the home page. */
  showNote: boolean
  /** Current weather for one place, fetched from Open-Meteo. Off means no request is ever made. */
  weather: boolean
  weatherPlace: string
  weatherLat: number
  weatherLon: number
  /** Order of the links inside a folder. */
  linkSort: 'saved' | 'used' | 'az'
  /** Animated waves drifting along the bottom of the page. */
  waves: boolean
  /** Open bookmarks in a new tab so this page stays where it is. */
  openInNewTab: boolean
  syncEnabled: boolean
  serverUrl: string
  googleClientId: string
  capturePageText: boolean
  useHistory: boolean
}

export const DEFAULT_SETTINGS: Settings = {
  theme: 'system',
  palette: 'paper',
  accent: null,
  background: 'aurora',
  cardStyle: 'glass',
  radius: 'rounded',
  font: 'classic',
  motion: 'lively',
  density: 'comfortable',
  showGreeting: true,
  showClock: false,
  name: '',
  showFavourites: true,
  showRecent: true,
  showNote: true,
  weather: true,
  weatherPlace: 'North Lakes',
  weatherLat: -27.2333,
  weatherLon: 153.0167,
  linkSort: 'saved',
  waves: true,
  openInNewTab: true,
  syncEnabled: false,
  serverUrl: 'http://localhost:8000',
  googleClientId: '',
  capturePageText: false,
  useHistory: false,
}
