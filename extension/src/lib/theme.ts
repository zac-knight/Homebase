import { resolveTokens } from './themes'
import { DEFAULT_SETTINGS, type Settings } from './types'

const KEY = 'homebase:appearance'
export const BACKGROUND_IMAGE_KEY = 'homebase:background-image'
const media = window.matchMedia('(prefers-color-scheme: dark)')

const FIELDS = ['theme', 'palette', 'accent', 'background', 'cardStyle', 'radius', 'font', 'motion'] as const
type Appearance = Pick<Settings, (typeof FIELDS)[number]>

function stored(): Appearance {
  try {
    return { ...DEFAULT_SETTINGS, ...(JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<Appearance>) }
  } catch {
    return DEFAULT_SETTINGS
  }
}

/**
 * Applies the look to <html>: colour tokens as CSS variables, everything else as data attributes
 * that index.css keys off. The choices are mirrored in localStorage because that can be read
 * synchronously before first paint; chrome.storage is async and would flash the default theme.
 */
export function applyAppearance(next?: Settings): void {
  if (next) {
    const subset = Object.fromEntries(FIELDS.map((f) => [f, next[f]]))
    try {
      localStorage.setItem(KEY, JSON.stringify(subset))
    } catch {
      // storage full or blocked: the look still applies for this page view
    }
  }
  const a = next ?? stored()
  const mode = a.theme === 'system' ? (media.matches ? 'dark' : 'light') : a.theme
  const root = document.documentElement
  Object.assign(root.dataset, { theme: mode, bg: a.background, cards: a.cardStyle, radius: a.radius, font: a.font, motion: a.motion })
  const tokens = resolveTokens(a.palette, mode, a.accent)
  const vars: Record<string, string> = {
    '--bg': tokens.bg, '--card': tokens.card, '--ink': tokens.ink, '--muted': tokens.muted, '--line': tokens.line,
    '--hover': tokens.hover, '--accent': tokens.accent, '--accent-ink': tokens.accentInk, '--accent-soft': tokens.accentSoft,
  } // prettier-ignore
  for (const [name, value] of Object.entries(vars)) root.style.setProperty(name, value)
  const image = a.background === 'image' ? localStorage.getItem(BACKGROUND_IMAGE_KEY) : null
  root.style.setProperty('--bg-image', image ? `url("${image}")` : 'none')
}

/** Shrinks a chosen picture so it fits comfortably in local storage, then keeps it on this device only. */
export async function saveBackgroundImage(file: File): Promise<void> {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, 1920 / bitmap.width, 1200 / bitmap.height)
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  localStorage.setItem(BACKGROUND_IMAGE_KEY, canvas.toDataURL('image/jpeg', 0.82))
}

export const hasBackgroundImage = () => localStorage.getItem(BACKGROUND_IMAGE_KEY) !== null
export const clearBackgroundImage = () => localStorage.removeItem(BACKGROUND_IMAGE_KEY)

media.addEventListener('change', () => applyAppearance())
