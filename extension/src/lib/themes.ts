// Colour themes. Each has a light and a dark variant; every muted/ink colour is chosen to keep
// at least 4.5:1 contrast on its own background and card (checked by the axe tests).

export interface Tokens {
  bg: string
  card: string
  ink: string
  muted: string
  line: string
  hover: string
  accent: string
  accentInk: string
  accentSoft: string
}

export interface Palette {
  id: string
  name: string
  light: Tokens
  dark: Tokens
}

const t = (bg: string, card: string, ink: string, muted: string, line: string, hover: string, accent: string, accentInk: string, accentSoft: string): Tokens => ({ bg, card, ink, muted, line, hover, accent, accentInk, accentSoft })

export const PALETTES: Palette[] = [
  { id: 'paper', name: 'Paper', light: t('#f5f4ef', '#ffffff', '#1b1a17', '#5d5b54', '#e2e0d8', '#efede6', '#0f6b5c', '#ffffff', '#dcefea'), dark: t('#141412', '#1d1d1a', '#efeee8', '#a9a79e', '#33322d', '#292924', '#62c7b2', '#0a1f1b', '#1c3530') },
  { id: 'ocean', name: 'Ocean', light: t('#eef3f8', '#ffffff', '#14202b', '#4c5a68', '#d6dfe8', '#e3eaf2', '#1d5fbf', '#ffffff', '#dbe7f8'), dark: t('#0d1420', '#151e2c', '#e8eef6', '#9aa8b8', '#263244', '#1d2838', '#6ea8ff', '#08182e', '#17294a') },
  { id: 'forest', name: 'Forest', light: t('#f0f3ec', '#ffffff', '#18201a', '#515c4b', '#d9dfd2', '#e5eadf', '#2a6535', '#ffffff', '#dcebdd'), dark: t('#0f1511', '#171f19', '#e9efe8', '#9fad9f', '#29352b', '#1f2a22', '#7fcf8c', '#0a1f0f', '#1a3320') },
  { id: 'rose', name: 'Rose', light: t('#f8f1f1', '#ffffff', '#241a1c', '#665155', '#ead9db', '#f1e4e6', '#a8355a', '#ffffff', '#f7dfe5'), dark: t('#171113', '#20181b', '#f3e9eb', '#b5a2a6', '#3a2b2f', '#2b2024', '#f08aa6', '#2a0b15', '#3a1a25') },
  { id: 'sunset', name: 'Sunset', light: t('#f9f3ea', '#fffdf9', '#261c12', '#665543', '#eadcc8', '#f2e7d6', '#a84a16', '#ffffff', '#f8e3d2'), dark: t('#17120d', '#201912', '#f4ebe0', '#b8a792', '#3a2e21', '#2b2218', '#f2a65a', '#2a1705', '#3b2812') },
  { id: 'lavender', name: 'Lavender', light: t('#f3f1f9', '#ffffff', '#1c1a29', '#56526c', '#dedaee', '#e9e6f4', '#5540c4', '#ffffff', '#e4dffa'), dark: t('#121019', '#1a1724', '#ecebf5', '#a5a1ba', '#2d2940', '#231f31', '#a594ff', '#140c3a', '#251f4a') },
  { id: 'neon', name: 'Neon', light: t('#faf5fc', '#ffffff', '#1d1024', '#5f4c6a', '#ead9f0', '#f2e6f6', '#a3158f', '#ffffff', '#f9dcf4'), dark: t('#0a0a14', '#12121f', '#eeeeff', '#9c9cc2', '#2a2a45', '#1b1b2e', '#ff5fdc', '#2a0022', '#33103a') },
  { id: 'graphite', name: 'Graphite', light: t('#f4f4f4', '#ffffff', '#151515', '#575757', '#dedede', '#eaeaea', '#1f1f1f', '#ffffff', '#e6e6e6'), dark: t('#0e0e0e', '#171717', '#f2f2f2', '#a3a3a3', '#2c2c2c', '#212121', '#f2f2f2', '#111111', '#2a2a2a') },
  { id: 'midnight', name: 'Midnight', light: t('#eef0fa', '#ffffff', '#141833', '#4d5273', '#d7daee', '#e3e6f5', '#3346c8', '#ffffff', '#dde1fa'), dark: t('#0a0d1f', '#11152b', '#e9ecff', '#9aa1c9', '#252a4a', '#191e3a', '#7cc4ff', '#06162b', '#15274a') },
  { id: 'ember', name: 'Ember', light: t('#f8f1ee', '#ffffff', '#26150f', '#69514a', '#ecd9d2', '#f3e5df', '#b3361a', '#ffffff', '#f9ddd3'), dark: t('#150e0c', '#1f1512', '#f6ebe6', '#bba39b', '#3b2924', '#2b1d19', '#ff8a5c', '#2b0d02', '#3d1c10') },
  { id: 'matcha', name: 'Matcha', light: t('#f3f5ea', '#fdfef8', '#1c2114', '#555e45', '#dde2cc', '#e8ecda', '#4a6a14', '#ffffff', '#e2ecc9'), dark: t('#11140c', '#191d12', '#edf1e2', '#a5ad92', '#2d3422', '#222818', '#b8d86a', '#172004', '#28341a') },
  { id: 'sakura', name: 'Sakura', light: t('#fcf2f5', '#ffffff', '#2a1620', '#6d4f5c', '#f0d9e1', '#f6e5eb', '#b02a6b', '#ffffff', '#fadce8'), dark: t('#191016', '#22171e', '#f8eaf0', '#bfa3b0', '#3d2a34', '#2d1f27', '#ff9cc4', '#33081c', '#40192c') },
  { id: 'arctic', name: 'Arctic', light: t('#eef5f7', '#ffffff', '#10222a', '#48606a', '#d3e2e7', '#e1ecf0', '#0a6a80', '#ffffff', '#d6edf2'), dark: t('#0a1418', '#111d22', '#e6f3f6', '#94aeb6', '#22363d', '#19292f', '#62d6ee', '#03202a', '#123540') },
  { id: 'mocha', name: 'Mocha', light: t('#f5eee6', '#fffcf8', '#2a1d13', '#6a5747', '#e6d8c8', '#eee2d4', '#7c4718', '#ffffff', '#f1dfcb'), dark: t('#17110d', '#201813', '#f3e8dc', '#b9a694', '#3a2d23', '#2b211a', '#e3b184', '#2c1704', '#3b2a1a') },
  { id: 'cosmos', name: 'Cosmos', light: t('#f4f1fb', '#ffffff', '#1d1430', '#5a4f73', '#e0d9f0', '#eae4f6', '#6a2cc2', '#ffffff', '#e8dcfa'), dark: t('#0b0816', '#130f22', '#efeaff', '#a39bc4', '#2b2445', '#1d1832', '#c59bff', '#1d0a3d', '#2a1b4d') },
  { id: 'citrus', name: 'Citrus', light: t('#f9f8e8', '#fffffa', '#22210f', '#5f5d3f', '#e6e3c4', '#efedd5', '#7a6200', '#ffffff', '#f2ebbd'), dark: t('#131309', '#1c1c0f', '#f3f2df', '#b0ae8e', '#34331f', '#272616', '#f0d23c', '#262000', '#38330f') },
  // True black and pure white: the base for the two-colour pairs below.
  { id: 'black', name: 'Black', light: t('#ffffff', '#f6f6f7', '#0a0a0a', '#55555c', '#e2e2e6', '#ececef', '#1d5fbf', '#ffffff', '#dbe7f8'), dark: t('#000000', '#0c0c0e', '#f5f5f7', '#a1a1aa', '#26262b', '#18181c', '#4d9fff', '#04101f', '#0d2038') },
]

/** Two-colour themes: a black or white base with one strong colour. Each colour has a bright
    version that reads on black and a deep version that reads on white. */
export const PAIR_COLOURS: { name: string; onBlack: string; onWhite: string }[] = [
  { name: 'blue', onBlack: '#4d9fff', onWhite: '#1d5fbf' },
  { name: 'purple', onBlack: '#a78bfa', onWhite: '#5b3fd0' },
  { name: 'pink', onBlack: '#ff6bd0', onWhite: '#b0178f' },
  { name: 'red', onBlack: '#ff6b6b', onWhite: '#c02a2a' },
  { name: 'orange', onBlack: '#ff9a3d', onWhite: '#b8440c' },
  { name: 'gold', onBlack: '#f5c842', onWhite: '#8a6500' },
  { name: 'green', onBlack: '#4ade80', onWhite: '#1f7a3a' },
  { name: 'cyan', onBlack: '#22d3ee', onWhite: '#0b6f85' },
]

/** One-click combinations of theme, mode, background, cards, corners and typeface. */
export interface Look {
  id: string
  name: string
  settings: { theme: 'light' | 'dark'; palette: string; background: 'glow' | 'aurora' | 'gradient' | 'dots' | 'grid' | 'stars'; cardStyle: 'solid' | 'glass' | 'outline'; radius: 'sharp' | 'rounded' | 'soft'; font: 'classic' | 'modern' | 'editorial' | 'rounded' | 'mono' }
}

export const LOOKS: Look[] = [
  { id: 'northern', name: 'Northern lights', settings: { theme: 'dark', palette: 'midnight', background: 'aurora', cardStyle: 'glass', radius: 'soft', font: 'modern' } },
  { id: 'synthwave', name: 'Synthwave', settings: { theme: 'dark', palette: 'neon', background: 'grid', cardStyle: 'glass', radius: 'sharp', font: 'mono' } },
  { id: 'stargazer', name: 'Stargazer', settings: { theme: 'dark', palette: 'cosmos', background: 'stars', cardStyle: 'glass', radius: 'rounded', font: 'rounded' } },
  { id: 'campfire', name: 'Campfire', settings: { theme: 'dark', palette: 'ember', background: 'glow', cardStyle: 'outline', radius: 'rounded', font: 'classic' } },
  { id: 'blossom', name: 'Blossom', settings: { theme: 'light', palette: 'sakura', background: 'aurora', cardStyle: 'glass', radius: 'soft', font: 'editorial' } },
  { id: 'glacier', name: 'Glacier', settings: { theme: 'light', palette: 'arctic', background: 'gradient', cardStyle: 'glass', radius: 'rounded', font: 'modern' } },
  { id: 'teahouse', name: 'Tea house', settings: { theme: 'light', palette: 'matcha', background: 'dots', cardStyle: 'outline', radius: 'sharp', font: 'editorial' } },
  { id: 'espresso', name: 'Espresso', settings: { theme: 'dark', palette: 'mocha', background: 'gradient', cardStyle: 'solid', radius: 'soft', font: 'classic' } },
]

export const ACCENTS = ['#0f6b5c', '#1d5fbf', '#5540c4', '#a3158f', '#c02a4b', '#c2410c', '#a16207', '#2a6535']

export function paletteById(id: string): Palette {
  return PALETTES.find((p) => p.id === id) ?? PALETTES[0]
}

/** Relative luminance (WCAG) of a #rrggbb colour, used to pick readable text on a custom accent. */
export function luminance(hex: string): number {
  const n = parseInt(hex.replace('#', ''), 16)
  const channel = (v: number) => {
    const c = v / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255)
}

export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

/** Tokens for a theme and mode, with an optional custom accent layered on top. */
export function resolveTokens(paletteId: string, mode: 'light' | 'dark', accent: string | null): Tokens {
  const tokens = { ...paletteById(paletteId)[mode] }
  if (accent && /^#[0-9a-f]{6}$/i.test(accent)) {
    tokens.accent = accent
    tokens.accentInk = contrast(accent, '#111111') >= contrast(accent, '#ffffff') ? '#111111' : '#ffffff'
    tokens.accentSoft = `color-mix(in srgb, ${accent} 18%, ${tokens.card})`
  }
  return tokens
}
