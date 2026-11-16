import { useRef, useState } from 'react'
import { clearBackgroundImage, hasBackgroundImage, saveBackgroundImage } from '../lib/theme'
import { ACCENTS, LOOKS, PAIR_COLOURS, PALETTES, paletteById } from '../lib/themes'
import type { Settings } from '../lib/types'
import { Card, Toggle } from './ui'

type Change = (patch: Partial<Settings>) => void

/** A row of mutually exclusive choices, announced as a radio group. */
function Choice<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 py-2.5">
      <span className="text-sm font-medium">{label}</span>
      <div role="radiogroup" aria-label={label} className="inline-flex flex-wrap rounded-lg border border-line p-0.5">
        {options.map(([id, text]) => (
          <button key={id} type="button" role="radio" aria-checked={value === id} onClick={() => onChange(id)} className={`h-8 rounded-md px-3 text-sm transition-colors ${value === id ? 'bg-accent text-accent-ink' : 'hover:bg-hover'}`}>
            {text}
          </button>
        ))}
      </div>
    </div>
  )
}

export function Appearance({ settings, onChange }: { settings: Settings; onChange: Change }) {
  const file = useRef<HTMLInputElement>(null)
  const [hasImage, setHasImage] = useState(hasBackgroundImage)
  const [error, setError] = useState('')
  const dark = document.documentElement.dataset.theme === 'dark'

  async function pickImage(chosen: File | undefined) {
    if (!chosen) return
    setError('')
    try {
      await saveBackgroundImage(chosen)
      setHasImage(true)
      onChange({ background: 'image' })
    } catch {
      setError('That picture could not be used. Try a smaller JPEG or PNG.')
    }
  }

  return (
    <>
      <Card title="Looks" aside="One click sets the theme, background, cards and type">
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          {LOOKS.map((look, i) => {
            const c = paletteById(look.settings.palette)[look.settings.theme]
            return (
              <button
                key={look.id}
                type="button"
                onClick={() => onChange({ ...look.settings, accent: null })}
                className="lift rise overflow-hidden rounded-xl border-2 border-line text-left hover:border-accent"
                style={{ '--i': i } as React.CSSProperties}
              >
                <span aria-hidden="true" className="relative block h-16 overflow-hidden" style={{ background: `radial-gradient(120% 140% at 15% 0%, ${c.accent}, transparent 60%), radial-gradient(120% 140% at 100% 100%, ${c.accentSoft}, transparent 65%), ${c.bg}` }}>
                  <span className="absolute right-2.5 bottom-2.5 left-2.5 block rounded-md p-1.5" style={{ background: `color-mix(in srgb, ${c.card} 70%, transparent)`, border: `1px solid ${c.line}` }}>
                    <span className="block h-1.5 w-2/3 rounded-full" style={{ background: c.ink, opacity: 0.85 }} />
                    <span className="mt-1 block h-1.5 w-2/5 rounded-full" style={{ background: c.accent }} />
                  </span>
                </span>
                <span className="block bg-card px-2.5 py-1.5 text-xs font-medium">{look.name}</span>
              </button>
            )
          })}
        </div>
      </Card>

      <Card title="Colour pairs" aside="A black or white base with one strong colour">
        <div role="radiogroup" aria-label="Colour pair" className="space-y-3">
          {(['dark', 'light'] as const).map((mode) => {
            const base = paletteById('black')[mode]
            const baseName = mode === 'dark' ? 'Black' : 'White'
            return (
              <div key={mode} className="grid grid-cols-4 gap-2 sm:grid-cols-8">
                {PAIR_COLOURS.map((colour) => {
                  const accent = mode === 'dark' ? colour.onBlack : colour.onWhite
                  const selected = settings.palette === 'black' && settings.accent === accent && dark === (mode === 'dark')
                  return (
                    <button
                      key={colour.name}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      aria-label={`${baseName} and ${colour.name}`}
                      title={`${baseName} and ${colour.name}`}
                      onClick={() => onChange({ theme: mode, palette: 'black', accent })}
                      className={`lift overflow-hidden rounded-xl border-2 ${selected ? 'border-accent' : 'border-line hover:border-muted'}`}
                    >
                      {/* Half base, half colour, split on the diagonal. */}
                      <span aria-hidden="true" className="block h-11" style={{ background: `linear-gradient(135deg, ${base.bg} 50%, ${accent} 50%)` }} />
                      <span className="block bg-card px-1 py-1 text-center text-[11px] font-medium capitalize">{colour.name}</span>
                    </button>
                  )
                })}
              </div>
            )
          })}
        </div>
      </Card>

      <Card title="Theme">
        <Choice label="Mode" value={settings.theme} onChange={(theme) => onChange({ theme })} options={[['system', 'Match system'], ['light', 'Light'], ['dark', 'Dark']]} />

        <div role="radiogroup" aria-label="Colour theme" className="mt-2 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          {PALETTES.map((p) => {
            const c = dark ? p.dark : p.light
            const selected = settings.palette === p.id
            return (
              <button
                key={p.id}
                type="button"
                role="radio"
                aria-checked={selected}
                aria-label={p.name}
                onClick={() => onChange({ palette: p.id, accent: null })}
                className={`lift overflow-hidden rounded-xl border-2 text-left ${selected ? 'border-accent' : 'border-line hover:border-muted'}`}
              >
                {/* A miniature of the page in this theme's own colours. */}
                <span aria-hidden="true" className="block p-2.5" style={{ background: c.bg }}>
                  <span className="flex items-center gap-1.5">
                    <span className="h-2 w-8 rounded-full" style={{ background: c.accent }} />
                    <span className="h-2 w-5 rounded-full" style={{ background: c.line }} />
                  </span>
                  <span className="mt-2 block rounded-md p-1.5" style={{ background: c.card, border: `1px solid ${c.line}` }}>
                    <span className="block h-1.5 w-3/4 rounded-full" style={{ background: c.ink, opacity: 0.8 }} />
                    <span className="mt-1 block h-1.5 w-1/2 rounded-full" style={{ background: c.muted, opacity: 0.6 }} />
                  </span>
                </span>
                <span className="block bg-card px-2.5 py-1.5 text-xs font-medium">{p.name}</span>
              </button>
            )
          })}
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
          <span className="text-sm font-medium">Accent colour</span>
          <div role="radiogroup" aria-label="Accent colour" className="flex flex-wrap items-center gap-1.5">
            <button type="button" role="radio" aria-checked={settings.accent === null} onClick={() => onChange({ accent: null })} className={`h-7 rounded-full border px-2.5 text-xs ${settings.accent === null ? 'border-accent bg-accent-soft' : 'border-line hover:bg-hover'}`}>
              From theme
            </button>
            {ACCENTS.map((colour) => (
              <button
                key={colour}
                type="button"
                role="radio"
                aria-checked={settings.accent === colour}
                aria-label={`Accent ${colour}`}
                onClick={() => onChange({ accent: colour })}
                className={`size-7 rounded-full transition-transform hover:scale-110 ${settings.accent === colour ? 'ring-2 ring-ink ring-offset-2 ring-offset-card' : ''}`}
                style={{ background: colour }}
              />
            ))}
            <label className="relative grid size-7 cursor-pointer place-items-center rounded-full border border-dashed border-muted text-xs text-muted" title="Pick any colour">
              +
              <input type="color" aria-label="Custom accent colour" value={settings.accent ?? '#0f6b5c'} onChange={(e) => onChange({ accent: e.target.value })} className="absolute inset-0 cursor-pointer opacity-0" />
            </label>
          </div>
        </div>
      </Card>

      <Card title="Look and feel">
        <div className="divide-y divide-line">
          <Choice label="Background" value={settings.background} onChange={(background) => (background === 'image' && !hasImage ? file.current?.click() : onChange({ background }))} options={[['plain', 'Plain'], ['glow', 'Glow'], ['aurora', 'Aurora'], ['gradient', 'Gradient'], ['dots', 'Dots'], ['grid', 'Grid'], ['stars', 'Stars'], ['image', 'Picture']]} />
          {(settings.background === 'image' || hasImage) && (
            <div className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
              <span className="text-muted">Your picture is stored on this device only and is never synced.</span>
              <span className="flex gap-2">
                <button type="button" className="h-8 rounded-lg border border-line px-2.5 hover:bg-hover" onClick={() => file.current?.click()}>
                  Choose picture
                </button>
                {hasImage && (
                  <button type="button" className="h-8 rounded-lg border border-line px-2.5 hover:bg-hover" onClick={() => { clearBackgroundImage(); setHasImage(false); onChange({ background: 'glow' }) }}>
                    Remove picture
                  </button>
                )}
              </span>
            </div>
          )}
          <input ref={file} type="file" accept="image/*" hidden aria-label="Background picture" onChange={(e) => void pickImage(e.target.files?.[0])} />
          <Choice label="Cards" value={settings.cardStyle} onChange={(cardStyle) => onChange({ cardStyle })} options={[['solid', 'Solid'], ['glass', 'Glass'], ['outline', 'Outline']]} />
          <Choice label="Corners" value={settings.radius} onChange={(radius) => onChange({ radius })} options={[['sharp', 'Sharp'], ['rounded', 'Rounded'], ['soft', 'Extra round']]} />
          <Choice label="Typeface" value={settings.font} onChange={(font) => onChange({ font })} options={[['classic', 'Classic'], ['modern', 'Modern'], ['editorial', 'Editorial'], ['rounded', 'Rounded'], ['mono', 'Mono']]} />
          <Choice label="Animations" value={settings.motion} onChange={(motion) => onChange({ motion })} options={[['off', 'Off'], ['subtle', 'Subtle'], ['lively', 'Lively']]} />
        </div>
        {error && <p className="mt-2 text-sm text-danger">{error}</p>}
        <p className="mt-2 text-xs text-muted">Animations are always off when your system is set to reduce motion.</p>
      </Card>

      <Card title="Layout">
        <div className="divide-y divide-line">
          <Choice label="Spacing" value={settings.density} onChange={(density) => onChange({ density })} options={[['comfortable', 'Comfortable'], ['compact', 'Compact']]} />
          <Toggle label="Show greeting" checked={settings.showGreeting} onChange={(showGreeting) => onChange({ showGreeting })} />
          <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 py-2.5">
            <label htmlFor="greeting-name" className="text-sm font-medium">
              Your name in the greeting
            </label>
            <input id="greeting-name" className="h-9 w-48 rounded-lg border border-line bg-bg px-3 text-sm" placeholder="Optional" maxLength={30} value={settings.name} disabled={!settings.showGreeting} onChange={(e) => onChange({ name: e.target.value })} />
          </div>
          <Toggle label="Show a clock" checked={settings.showClock} onChange={(showClock) => onChange({ showClock })} />
          <Toggle label="Animated waves" description="Waves drift along the bottom of the page. They stay still when motion is off." checked={settings.waves} onChange={(waves) => onChange({ waves })} />
          <Toggle label="Open links in a new tab" description="Keeps this page open behind the site you chose." checked={settings.openInNewTab} onChange={(openInNewTab) => onChange({ openInNewTab })} />
          <Toggle label="Show favourites row" checked={settings.showFavourites} onChange={(showFavourites) => onChange({ showFavourites })} />
        </div>
      </Card>
    </>
  )
}
