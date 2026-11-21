import { useEffect, useState } from 'react'
import { type Weather as WeatherData, loadWeather, weatherKind } from '../lib/weather'
import type { Settings } from '../lib/types'
import { Icon, type IconName } from './ui'

const ICONS: Record<string, IconName> = { clear: 'sun', partly: 'partly', cloud: 'cloud', fog: 'cloud', rain: 'rain', storm: 'bolt', snow: 'snow' }

/** Weather and the time at one place, as a small pill beside the date. Nothing is fetched when it is off. */
export function WeatherChip({ settings }: { settings: Pick<Settings, 'weather' | 'weatherPlace' | 'weatherLat' | 'weatherLon' | 'showClock'> }) {
  const [data, setData] = useState<WeatherData | null>(null)
  const [time, setTime] = useState(() => new Date())
  const { weather, weatherLat, weatherLon, weatherPlace } = settings

  useEffect(() => {
    if (!weather) return
    const controller = new AbortController()
    void loadWeather(weatherLat, weatherLon, controller.signal).then(setData)
    return () => controller.abort()
  }, [weather, weatherLat, weatherLon])

  useEffect(() => {
    if (!weather) return
    const timer = setInterval(() => setTime(new Date()), 30_000)
    return () => clearInterval(timer)
  }, [weather])

  if (!weather || !data) return null
  const { kind, label } = weatherKind(data.code)
  const icon: IconName = kind === 'clear' && !data.isDay ? 'moon' : ICONS[kind]
  return (
    <p
      className="enter inline-flex flex-wrap items-center gap-x-2.5 gap-y-1 rounded-full border border-line px-3 py-1 text-xs text-muted"
      title={`Feels like ${Math.round(data.feelsLike)}°`}
      aria-label={`${weatherPlace}: ${Math.round(data.temp)} degrees, ${label}, high ${Math.round(data.high)}, low ${Math.round(data.low)}`}
    >
      <Icon name={icon} className="size-4 text-accent" />
      <span className="font-medium text-ink tabular-nums">{Math.round(data.temp)}°</span>
      <span>{label}</span>
      <span aria-hidden="true" className="tabular-nums">H {Math.round(data.high)}° · L {Math.round(data.low)}°</span>
      <span aria-hidden="true" className="opacity-50">|</span>
      <span>{weatherPlace}</span>
      {/* The page's own clock setting shows the time already; do not say it twice. */}
      {!settings.showClock && <span className="tabular-nums">{time.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}</span>}
    </p>
  )
}
