import { useEffect, useMemo, useState } from 'react'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { apiFetch } from '../lib/api'
import { isExtension } from '../lib/platform'
import { computeInsights } from '../lib/stats'
import type { Bookmark, Settings, UsageEvent } from '../lib/types'
import { Card, Favicon } from './ui'

const pct = (x: number) => `${Math.round(x * 100)}%`

interface ServerInsights {
  link_health: Record<string, number>
  nearDuplicates: number
}

function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="surface rise rounded-2xl border border-line bg-card p-4">
      <div className="text-xs text-muted">{label}</div>
      <div className="mt-1 font-display text-3xl">{value}</div>
      {note && <div className="mt-1 text-xs text-muted">{note}</div>}
    </div>
  )
}

function ChartTooltip({ active, payload, unit }: { active?: boolean; payload?: { value: number; payload: { label: string } }[]; unit: string }) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg border border-line bg-card px-2.5 py-1.5 text-xs shadow-md">
      <div className="text-muted">{payload[0].payload.label}</div>
      <div className="font-semibold">
        {payload[0].value} {unit}
      </div>
    </div>
  )
}

function OpensChart({ data, tickEvery, name }: { data: { label: string; opens: number }[]; tickEvery: number; name: string }) {
  return (
    <>
      <div className="h-44" role="img" aria-label={name}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -24 }} barCategoryGap="22%">
            <CartesianGrid vertical={false} stroke="var(--line)" />
            <XAxis dataKey="label" interval={tickEvery - 1} tickLine={false} axisLine={{ stroke: 'var(--line)' }} tick={{ fill: 'var(--muted)', fontSize: 11 }} />
            <YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={{ fill: 'var(--muted)', fontSize: 11 }} />
            <Tooltip cursor={{ fill: 'var(--hover)' }} content={<ChartTooltip unit="opens" />} isAnimationActive={false} />
            <Bar dataKey="opens" fill="var(--series-1)" radius={[4, 4, 0, 0]} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <details className="mt-2 text-xs text-muted">
        <summary className="cursor-pointer">View as table</summary>
        <table className="mt-2 w-full tabular-nums">
          <tbody>
            {data.filter((d) => d.opens > 0).map((d) => (
              <tr key={d.label} className="border-t border-line">
                <th scope="row" className="py-1 text-left font-normal">{d.label}</th>
                <td className="py-1 text-right">{d.opens}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </>
  )
}

function LinkList({ items, empty, onOpen }: { items: Bookmark[]; empty: string; onOpen: (b: Bookmark) => void }) {
  if (!items.length) return <p className="text-sm text-muted">{empty}</p>
  return (
    <ul className="-mx-2">
      {items.map((b) => (
        <li key={b.id}>
          <a href={b.url} onClick={() => onOpen(b)} className="flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm hover:bg-hover">
            <Favicon url={b.url} />
            <span className="min-w-0 flex-1 truncate">{b.title}</span>
            <span className="shrink-0 text-xs text-muted">{b.folderName}</span>
          </a>
        </li>
      ))}
    </ul>
  )
}

export function Insights({ bookmarks, events, settings, signedIn, onOpen }: { bookmarks: Bookmark[]; events: UsageEvent[]; settings: Settings; signedIn: boolean; onOpen: (b: Bookmark, source: string) => void }) {
  const [visited, setVisited] = useState<Set<string>>(new Set())
  const [server, setServer] = useState<ServerInsights | 'error' | null>(null)

  useEffect(() => {
    if (!isExtension || !settings.useHistory) return
    chrome.permissions.contains({ permissions: ['history'] }).then(async (granted) => {
      if (!granted) return
      const items = await chrome.history.search({ text: '', startTime: 0, maxResults: 100_000 })
      setVisited(new Set(items.map((i) => i.url ?? '')))
    })
  }, [settings.useHistory])

  useEffect(() => {
    if (!signedIn) return
    Promise.all([
      apiFetch<{ link_health: Record<string, number> }>('/stats'),
      apiFetch<{ pairs: unknown[] }>('/duplicates'),
    ])
      .then(([stats, dupes]) => setServer({ link_health: stats.link_health, nearDuplicates: dupes.pairs.length }))
      .catch(() => setServer('error'))
  }, [signedIn])

  const s = useMemo(() => computeInsights(bookmarks, events, new Date(), visited), [bookmarks, events, visited])
  const maxDomain = s.topDomains[0]?.bookmarks ?? 1

  return (
    <div className="space-y-4">
      {!isExtension && <p className="rounded-lg bg-accent-soft px-3 py-2 text-sm">Demo mode: these charts are drawn from made-up sample activity, not real usage.</p>}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Bookmarks" value={s.total.toLocaleString()} />
        <Stat label="Opens logged" value={s.opens.toLocaleString()} note="since Homebase was installed" />
        <Stat label="Never opened" value={pct(s.neverOpened.share)} note={`95% interval ${pct(s.neverOpened.ci[0])} to ${pct(s.neverOpened.ci[1])}`} />
        <Stat label="Exact duplicates" value={String(s.duplicates.reduce((n, g) => n + g.length - 1, 0))} note="same page saved more than once" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Links opened per day" aside="last 30 days">
          <OpensChart data={s.opensByDay} tickEvery={5} name="Bar chart of links opened per day over the last 30 days" />
        </Card>
        <Card title="When you open links" aside="by hour of day">
          <OpensChart data={s.opensByHour} tickEvery={3} name="Bar chart of links opened by hour of day" />
        </Card>
      </div>

      <Card title="Where your bookmarks live" aside="bookmarks per site">
        <ul className="space-y-2">
          {s.topDomains.map((d) => (
            <li key={d.domain} className="grid grid-cols-[minmax(0,11rem)_1fr_2rem] items-center gap-3 text-sm">
              <span className="truncate">{d.domain}</span>
              <span className="h-2 rounded-full bg-hover">
                <span className="bar-grow block h-2 rounded-full" style={{ width: `${(d.bookmarks / maxDomain) * 100}%`, background: 'var(--series-1)' }} />
              </span>
              <span className="text-right text-xs text-muted tabular-nums">{d.bookmarks}</span>
            </li>
          ))}
        </ul>
      </Card>

      <Card title="Weekly digest">
        <div className="grid gap-6 lg:grid-cols-2">
          <div>
            <h3 className="mb-1 text-xs font-semibold tracking-wide text-muted uppercase">Consider archiving</h3>
            <LinkList items={s.archive} empty="Nothing old and untouched. Tidy." onOpen={(b) => onOpen(b, 'digest')} />
          </div>
          <div>
            <h3 className="mb-1 text-xs font-semibold tracking-wide text-muted uppercase">Worth revisiting</h3>
            <LinkList items={s.revisit} empty="Nothing has been neglected for long." onOpen={(b) => onOpen(b, 'digest')} />
          </div>
        </div>
      </Card>

      <Card title="From your server" aside="link health">
        {!signedIn ? (
          <p className="text-sm text-muted">Turn on sync in Settings to check for dead links and find near duplicates.</p>
        ) : server === 'error' ? (
          <p className="text-sm text-muted">Could not reach the server.</p>
        ) : !server ? (
          <p className="text-sm text-muted">Loading…</p>
        ) : (
          <div className="grid gap-6 text-sm lg:grid-cols-2">
            <dl className="grid grid-cols-2 gap-y-1">
              {(['ok', 'dead', 'unclear', 'unchecked'] as const).map((state) => (
                <div key={state} className="contents">
                  <dt className="text-muted">{{ ok: 'Working links', dead: 'Dead links', unclear: 'Could not tell', unchecked: 'Not checked yet' }[state]}</dt>
                  <dd className="tabular-nums">{server.link_health[state] ?? 0}</dd>
                </div>
              ))}
              <dt className="text-muted">Near duplicates</dt>
              <dd className="tabular-nums">{server.nearDuplicates}</dd>
            </dl>
          </div>
        )}
      </Card>
    </div>
  )
}
