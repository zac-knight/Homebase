// Current weather from Open-Meteo: free, no account, no key, and the only thing sent is the
// coordinates of the place you chose. Cached for 20 minutes so a new tab never waits on it.

import { kv } from './platform'

export interface Weather {
  temp: number
  feelsLike: number
  high: number
  low: number
  code: number
  isDay: boolean
}

export type WeatherKind = 'clear' | 'partly' | 'cloud' | 'fog' | 'rain' | 'storm' | 'snow'

/** WMO weather codes, grouped into the handful of looks the page has an icon for. */
export function weatherKind(code: number): { kind: WeatherKind; label: string } {
  if (code === 0) return { kind: 'clear', label: 'Clear' }
  if (code <= 2) return { kind: 'partly', label: 'Partly cloudy' }
  if (code === 3) return { kind: 'cloud', label: 'Overcast' }
  if (code === 45 || code === 48) return { kind: 'fog', label: 'Fog' }
  if (code >= 51 && code <= 57) return { kind: 'rain', label: 'Drizzle' }
  if (code >= 61 && code <= 67) return { kind: 'rain', label: 'Rain' }
  if (code >= 71 && code <= 77) return { kind: 'snow', label: 'Snow' }
  if (code >= 80 && code <= 82) return { kind: 'rain', label: 'Showers' }
  if (code >= 85 && code <= 86) return { kind: 'snow', label: 'Snow showers' }
  if (code >= 95) return { kind: 'storm', label: 'Thunderstorm' }
  return { kind: 'cloud', label: 'Cloudy' }
}

const TTL = 20 * 60_000

interface Cached {
  at: number
  key: string
  data: Weather
}

export async function loadWeather(lat: number, lon: number, signal?: AbortSignal): Promise<Weather | null> {
  const key = `${lat.toFixed(3)},${lon.toFixed(3)}`
  const cached = await kv.get<Cached | null>('weatherCache', null)
  if (cached && cached.key === key && Date.now() - cached.at < TTL) return cached.data
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,apparent_temperature,weather_code,is_day&daily=temperature_2m_max,temperature_2m_min&timezone=auto&forecast_days=1`
  try {
    const res = await fetch(url, { signal })
    if (!res.ok) throw new Error(String(res.status))
    const j = await res.json()
    const data: Weather = {
      temp: j.current.temperature_2m,
      feelsLike: j.current.apparent_temperature,
      high: j.daily.temperature_2m_max[0],
      low: j.daily.temperature_2m_min[0],
      code: j.current.weather_code,
      isDay: j.current.is_day === 1,
    }
    await kv.set('weatherCache', { at: Date.now(), key, data } satisfies Cached)
    return data
  } catch {
    // Offline or blocked: show the last good reading if there is one, otherwise nothing.
    return cached && cached.key === key ? cached.data : null
  }
}
