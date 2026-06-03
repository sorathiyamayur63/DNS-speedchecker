import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

const api_base = import.meta.env.VITE_API_BASE || 'http://127.0.0.1:8787'
const theme_key = 'dns-benchmark-theme-v4'
const hosts_key = 'dns-benchmark-hosts-v4'

const default_hosts = [
  'google.com',
  'youtube.com',
  'github.com',
  'wikipedia.org',
  'cloudflare.com',
  'openai.com',
]

const fallback_providers = [
  { id: 'cloudflare', name: 'cloudflare (1.1.1.1)', endpoint: 'https://cloudflare-dns.com/dns-query', note: 'fast public resolver' },
  { id: 'google', name: 'google (8.8.8.8)', endpoint: 'https://dns.google/dns-query', note: 'widely reachable resolver' },
  { id: 'quad9', name: 'quad9 (9.9.9.9)', endpoint: 'https://dns.quad9.net/dns-query', note: 'security focused resolver' },
  { id: 'adguard', name: 'adguard (94.140.14.14)', endpoint: 'https://dns.adguard-dns.com/dns-query', note: 'privacy and filtering focused' },
  { id: 'opendns', name: 'opendns (208.67.222.222)', endpoint: 'https://doh.opendns.com/dns-query', note: 'popular public resolver' },
]

const record_types = ['a', 'aaaa', 'cname', 'mx', 'txt', 'ns']

function safe_number(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function format_ms(value) {
  if (value == null) return '—'
  return `${Math.round(value)} ms`
}

function format_pct(value) {
  if (value == null) return '—'
  return `${value.toFixed(1)}%`
}

function avg(values) {
  const nums = values.filter((v) => typeof v === 'number' && Number.isFinite(v))
  if (!nums.length) return null
  return nums.reduce((a, b) => a + b, 0) / nums.length
}

async function safe_json(response) {
  const text = await response.text()

  if (!text || !text.trim()) {
    throw new Error('empty response from api')
  }

  try {
    return JSON.parse(text)
  } catch {
    throw new Error(`invalid json returned by api: ${text.slice(0, 250)}`)
  }
}

async function api_fetch(path, body) {
  const response = await fetch(`${api_base}${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  const data = await safe_json(response)

  if (!response.ok) {
    throw new Error(data?.error || 'request failed')
  }

  return data
}

function badge({ children, tone = 'slate' }) {
  const tones = {
    slate: 'bg-slate-100 text-slate-700 ring-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:ring-slate-700',
    green: 'bg-emerald-100 text-emerald-700 ring-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:ring-emerald-500/20',
    amber: 'bg-amber-100 text-amber-700 ring-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:ring-amber-500/20',
    red: 'bg-rose-100 text-rose-700 ring-rose-200 dark:bg-rose-500/15 dark:text-rose-300 dark:ring-rose-500/20',
    blue: 'bg-sky-100 text-sky-700 ring-sky-200 dark:bg-sky-500/15 dark:text-sky-300 dark:ring-sky-500/20',
    violet: 'bg-violet-100 text-violet-700 ring-violet-200 dark:bg-violet-500/15 dark:text-violet-300 dark:ring-violet-500/20',
  }

  return <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ring-1 ${tones[tone]}`}>{children}</span>
}

function card({ children, className = '' }) {
  return (
    <div className={`rounded-[1.75rem] border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950 ${className}`}>
      {children}
    </div>
  )
}
 function SectionTitle({
  eyebrow,
  title,
  description
}) {
  return (
    <div>
      <div className="text-sm font-semibold uppercase tracking-[0.18em] text-sky-500">
        {eyebrow}
      </div>

      <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900 dark:text-white">
        {title}
      </h2>

      <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
        {description}
      </p>
    </div>
  )
}
function stat_card({ label, value, hint }) {
  return (
    <card className="backdrop-blur">
      <div className="text-sm font-medium text-slate-500 dark:text-slate-400">{label}</div>
      <div className="mt-2 text-2xl font-semibold tracking-tight text-slate-900 dark:text-white">{value}</div>
      {hint ? <div className="mt-2 text-sm text-slate-500 dark:text-slate-400">{hint}</div> : null}
    </card>
  )
}

function resolver_card({ item }) {

  const good = item.avg != null
  const tone = item.ok ? 'green' : 'red'

  return (
    <card className="transition hover:-translate-y-0.5 hover:shadow-lg">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold uppercase tracking-[0.16em] text-slate-400">{item.label}</div>
          <div className="mt-1 text-xl font-semibold text-slate-900 dark:text-white">{format_ms(item.avg)}</div>
        </div>
        <badge tone={tone}>{item.ok ? 'live' : 'failed'}</badge>
      </div>

      <div className="mt-4 space-y-3 text-sm text-slate-600 dark:text-slate-300">
        <div className="rounded-2xl bg-slate-50 p-3 dark:bg-slate-900/80">
          <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">status</div>
          <div className="mt-1 font-medium text-slate-800 dark:text-slate-200">{item.ok ? `dns response ${item.status}` : item.error || item.note}</div>
        </div>
        <div className="rounded-2xl bg-slate-50 p-3 dark:bg-slate-900/80">
          <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">endpoint</div>
          <div className="mt-1 break-all font-medium text-slate-800 dark:text-slate-200">{item.endpoint}</div>
        </div>
        <div className="flex flex-wrap gap-2">
          {item.success_rate != null ? <badge tone="violet">success {format_pct(item.success_rate)}</badge> : null}
          {good ? <badge tone={item.avg <= 100 ? 'green' : 'amber'}>avg {Math.round(item.avg)} ms</badge> : null}
        </div>
      </div>
    </card>
  )
}

function normalize_host(input) {
  const value = input.trim().toLowerCase()
  if (!value) return ''

  try {
    const url = value.startsWith('http://') || value.startsWith('https://') ? new URL(value) : new URL(`https://${value}`)
    return url.hostname.replace(/\.$/, '')
  } catch {
    return value.replace(/^https?:\/\//, '').split('/')[0].replace(/\.$/, '')
  }
}

function is_valid_host(host) {
  if (!host || host.length > 253) return false
  const parts = host.split('.')
  if (parts.length < 2) return false
  return parts.every((part) => /^[a-z0-9-]{1,63}$/.test(part) && !part.startsWith('-') && !part.endsWith('-'))
}

export default function App() {
  const [theme, set_theme] = useState('dark')
  const [providers, set_providers] = useState([])
  const [hosts, set_hosts] = useState(default_hosts)
  const [new_host, set_new_host] = useState('')
  const [domain, set_domain] = useState('example.com')
  const [record_type, set_record_type] = useState('a')
  const [selected_resolver, set_selected_resolver] = useState('cloudflare')
  const [benchmark, set_benchmark] = useState(null)
  const [single, set_single] = useState(null)
  const [loading_benchmark, set_loading_benchmark] = useState(false)
  const [loading_single, set_loading_single] = useState(false)
  const [error, set_error] = useState('')
  const [mode, set_mode] = useState('benchmark')
  const [toast, set_toast] = useState('')
  const [ready, set_ready] = useState(false)
  const toast_timer = useRef(null)

  useEffect(() => {
    try {
      const saved_theme = localStorage.getItem(theme_key)
      const saved_hosts = localStorage.getItem(hosts_key)

      if (saved_theme === 'light' || saved_theme === 'dark') {
        set_theme(saved_theme)
      } else if (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) {
        set_theme('light')
      }

      if (saved_hosts) {
        const parsed = JSON.parse(saved_hosts)
        if (Array.isArray(parsed) && parsed.length) set_hosts(parsed)
      }
    } catch {}

    document.documentElement.classList.toggle('dark', theme === 'dark')
    set_ready(true)
  }, [])

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
    localStorage.setItem(theme_key, theme)
  }, [theme])

  useEffect(() => {
    localStorage.setItem(hosts_key, JSON.stringify(hosts))
  }, [hosts])

  function push_toast(message) {
    set_toast(message)
    if (toast_timer.current) clearTimeout(toast_timer.current)
    toast_timer.current = setTimeout(() => set_toast(''), 2200)
  }

  useEffect(() => {
    async function load_meta() {
      try {
        const data = await api_fetch('/api/meta', {})
        set_providers(Array.isArray(data.providers) && data.providers.length ? data.providers : fallback_providers)
        if (!selected_resolver && data.providers?.[0]?.id) set_selected_resolver(data.providers[0].id)
      } catch {
        set_providers(fallback_providers)
      }
    }

    load_meta()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function run_benchmark(next_hosts = hosts) {
    set_loading_benchmark(true)
    set_error('')

    try {
      const data = await api_fetch('/api/benchmark', {
        hosts: next_hosts,
        resolvers: providers.length ? providers.map((item) => item.id) : fallback_providers.map((item) => item.id),
      })

      set_benchmark(data)
      set_mode('benchmark')
      push_toast('benchmark complete')
    } catch (err) {
      set_error(err?.message || 'benchmark failed')
    } finally {
      set_loading_benchmark(false)
    }
  }

  async function run_single() {
    const normalized = normalize_host(domain)
    if (!is_valid_host(normalized)) {
      set_error('please enter a valid domain like example.com')
      return
    }

    set_loading_single(true)
    set_error('')

    try {
      const data = await api_fetch('/api/resolve', {
        resolver: selected_resolver,
        name: normalized,
        type: record_type,
      })

      set_single(data)
      set_mode('single')
      push_toast('single domain test complete')
    } catch (err) {
      set_error(err?.message || 'single lookup failed')
    } finally {
      set_loading_single(false)
    }
  }

  function add_host() {
    const normalized = normalize_host(new_host)
    if (!is_valid_host(normalized)) {
      set_error('enter a valid hostname like example.com')
      return
    }
    if (hosts.includes(normalized)) return
    set_hosts((prev) => [...prev, normalized])
    set_new_host('')
    set_error('')
    push_toast(`added ${normalized}`)
  }

  function remove_host(host) {
    set_hosts((prev) => prev.filter((item) => item !== host))
  }

  useEffect(() => {
    if (!ready) return
    if (!providers.length) return
    if (benchmark) return
    run_benchmark(hosts)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, providers])

  const resolver_rows = useMemo(() => {
    const rows = benchmark?.summary?.byResolver || []
    return [...rows]
      .filter((item) => item.avg != null)
      .sort((a, b) => a.avg - b.avg)
  }, [benchmark])

const chart_data = resolver_rows.map((item) => ({
  name: item.name
    .replace(/\s*\(.*?\)/g, '')
    .replace('cloudflare', 'Cloudflare DNS')
    .replace('google', 'Google DNS')
    .replace('opendns', 'OpenDNS')
    .replace('adguard', 'AdGuard DNS')
    .replace('quad9', 'Quad9 DNS'),
  avg: item.avg,
}))

  const site_rows = benchmark?.summary?.bySite || []
  const best_resolver = benchmark?.summary?.best_resolver || null
  const overall_avg = benchmark?.summary?.overall_avg ?? null

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(14,165,233,0.16),_transparent_32%),linear-gradient(180deg,#f8fafc_0%,#eef2ff_100%)] text-slate-900 dark:bg-[radial-gradient(circle_at_top,_rgba(56,189,248,0.14),_transparent_32%),linear-gradient(180deg,#020617_0%,#0f172a_100%)] dark:text-white">
      <div className="mx-auto flex min-h-screen max-w-[1700px] flex-col px-4 py-6 sm:px-6 lg:px-8">
        <header className="rounded-[2rem] border border-white/70 bg-white/75 px-6 py-6 shadow-glow backdrop-blur md:px-8 dark:border-slate-800/80 dark:bg-slate-950/70">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-4xl">
              <badge tone="blue">dns benchmark studio</badge>
              <h1 className="mt-4 text-4xl font-bold tracking-tight sm:text-6xl">DNS speed and availability</h1>
              <p className="mt-4 text-sm leading-7 text-slate-600 dark:text-slate-300 sm:text-base">
              
              </p>
            </div>

           
          </div>
        </header>

        <main className="mt-6 grid flex-1 gap-6 2xl:grid-cols-[1.3fr_0.7fr]">
          <section className="space-y-6">
            <card className="border-white/70 bg-white/85 backdrop-blur dark:border-slate-800 dark:bg-slate-950/80">
              <div className="flex flex-wrap gap-3 border-b border-slate-100 pb-4 dark:border-slate-800">
                <button onClick={() => set_mode('benchmark')} className={`rounded-full px-4 py-2 text-sm font-medium transition ${mode === 'benchmark' ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-950' : 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800'}`}>
                  benchmark mode
                </button>
                <button onClick={() => set_mode('single')} className={`rounded-full px-4 py-2 text-sm font-medium transition ${mode === 'single' ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-950' : 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800'}`}>
                  single domain mode
                </button>

                <div className="ml-auto flex items-center gap-2">
                  <button onClick={() => set_theme(theme === 'dark' ? 'light' : 'dark')} className="rounded-full bg-slate-100 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-200 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800">
                    {theme === 'dark' ? 'light theme' : 'dark theme'}
                  </button>
                  <button
                    onClick={() => run_benchmark(hosts)}
                    disabled={loading_benchmark}
                    className="rounded-full bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-lg shadow-emerald-600/20 transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {loading_benchmark ? 'benchmarking...' : 'refresh benchmark'}
                  </button>
                </div>
              </div>

              {mode === 'single' ? (
                <div className="mt-6 grid gap-4 lg:grid-cols-[1.2fr_0.6fr_0.6fr]">
                  <div>
                    <label className="mb-2 block text-sm font-medium text-slate-600 dark:text-slate-400">domain</label>
                    <input
                      value={domain}
                      onChange={(e) => set_domain(e.target.value)}
                      placeholder="example.com"
                      className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-sky-400 focus:ring-4 focus:ring-sky-100 dark:border-slate-800 dark:bg-slate-950 dark:text-white dark:placeholder:text-slate-500 dark:focus:border-sky-500 dark:focus:ring-sky-500/20"
                    />
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-medium text-slate-600 dark:text-slate-400">resolver</label>
                    <select
                      value={selected_resolver}
                      onChange={(e) => set_selected_resolver(e.target.value)}
                      className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-slate-900 outline-none focus:border-sky-400 focus:ring-4 focus:ring-sky-100 dark:border-slate-800 dark:bg-slate-950 dark:text-white dark:focus:border-sky-500 dark:focus:ring-sky-500/20"
                    >
                      {(providers.length ? providers : fallback_providers).map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="flex items-end">
                    <button
                      onClick={run_single}
                      disabled={loading_single}
                      className="w-full rounded-2xl bg-slate-900 px-5 py-3 font-medium text-white shadow-lg shadow-slate-900/20 transition hover:-translate-y-0.5 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-100"
                    >
                      {loading_single ? 'checking...' : 'run dns check'}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="mt-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <div className="text-sm font-medium text-slate-600 dark:text-slate-400">popular websites included in the average</div>
                    <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-500 dark:text-slate-400">
                      {hosts.map((site) => (
                        <span key={site} className="rounded-full bg-slate-100 px-2.5 py-1 dark:bg-slate-900">
                          {site}
                        </span>
                      ))}
                    </div>
                  </div>
                  <button
                    onClick={() => run_benchmark(hosts)}
                    disabled={loading_benchmark}
                    className="rounded-2xl bg-slate-900 px-5 py-3 font-medium text-white shadow-lg shadow-slate-900/20 transition hover:-translate-y-0.5 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-100"
                  >
                    {loading_benchmark ? 'benchmarking...' : 'run full benchmark'}
                  </button>
                </div>
              )}

              {error ? <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-200">{error}</div> : null}
            </card>

            <div className="grid gap-4 md:grid-cols-4">
              {mode === 'single' ? (
                <>
                  <stat_card label="resolved by" value={single?.provider?.name || (providers[0]?.name || '—')} hint="cloudflare worker backend" />
                  <stat_card label="answer latency" value={format_ms(single?.result?.elapsed)} hint="resolver round trip" />
                  <stat_card label="rcode" value={single?.result?.rcode == null ? '—' : String(single.result.rcode)} hint="dns result code" />
                  <stat_card label="answers" value={String(single?.result?.answers?.length || 0)} hint="top records returned" />
                </>
              ) : (
                <>
                  <stat_card label="best resolver" value={best_resolver?.name || '—'} hint={best_resolver ? format_ms(best_resolver.avg) : 'run benchmark'} />
                  <stat_card label="overall average" value={format_ms(overall_avg)} hint="all successful site tests" />
                  <stat_card label="popular sites" value={String(hosts.length)} hint="included in the average" />
                  <stat_card label="resolvers" value={String((benchmark?.summary?.byResolver || []).length)} hint="public dns providers" />
                </>
              )}
            </div>

            <card>
              <SectionTitle
                eyebrow="resolver comparison"
                title="which dns is fastest"
                description="only successful resolvers are shown here. failed servers are excluded."
              />

<div className="mt-6 h-[460px] w-full">                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chart_data} margin={{ top: 10, right: 20, left: 10, bottom: 5 }} layout="vertical">
                    <defs>
                      <linearGradient id="dnsBar" x1="0" y1="0" x2="1" y2="0">
                        <stop offset="0%" stopColor="#0f172a" />
                        <stop offset="60%" stopColor="#2563eb" />
                        <stop offset="100%" stopColor="#14b8a6" />
                      </linearGradient>
                    </defs>
                   <CartesianGrid
  stroke="#334155"
  strokeDasharray="4 4"
  horizontal={false}
/>

<XAxis
  type="number"
  tick={{
    fill: '#94a3b8',
    fontSize: 12
  }}
  tickFormatter={(v) => `${v} ms`}
/>

<YAxis
  type="category"
  dataKey="name"
  tick={{
    fill: '#94a3b8',
    fontSize: 12
  }}
  width={160}
/>

<Tooltip
  formatter={(value) => `${value} ms`}
  contentStyle={{
    background: '#020617',
    border: '1px solid #1e293b',
    borderRadius: '14px',
    color: '#fff'
  }}
  labelStyle={{
    color: '#fff'
  }}
/>
                    <Bar dataKey="avg" radius={[0, 14, 14, 0]} fill="url(#dnsBar)">
                      {chart_data.map((entry) => (
                        <Cell key={entry.name} fill="url(#dnsBar)" />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </card>

            <div className="grid gap-6 lg:grid-cols-2">
              <card>
                <SectionTitle
                  eyebrow="site averages"
                  title="popular websites benchmark"
                  description="each row shows the average dns response time across all resolvers for one popular website."
                />
                <div className="mt-6 overflow-hidden rounded-3xl border border-slate-200 dark:border-slate-800">
                  <table className="min-w-full divide-y divide-slate-200 text-left text-sm dark:divide-slate-800">
                    <thead className="bg-slate-50 text-slate-500 dark:bg-slate-900/80 dark:text-slate-400">
                      <tr>
                        <th className="px-4 py-3 font-medium">website</th>
                        <th className="px-4 py-3 font-medium">average</th>
                        <th className="px-4 py-3 font-medium">best resolver</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white dark:divide-slate-800 dark:bg-slate-950">
                      {(site_rows.length ? site_rows : hosts.map((site) => ({ site, avg: null, best: '—' }))).map((row) => (
                        <tr key={row.site}>
                          <td className="px-4 py-3 font-medium text-slate-900 dark:text-slate-100">{row.site}</td>
                          <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{format_ms(row.avg)}</td>
                          <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{row.best}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </card>

              <card>
                <SectionTitle
                  eyebrow="site trend"
                  title="average latency by site"
                  description="a compact view of how your network treats each popular website across the resolver catalog."
                />
                <div className="mt-6 h-[300px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart
  data={site_rows.map((row) => ({
    name: row.site,
    avg: safe_number(row.avg) || 0
  }))}
  margin={{
    top: 20,
    right: 20,
    left: 10,
    bottom: 10
  }}
>
  <defs>
    <linearGradient
      id="siteTrend"
      x1="0"
      y1="0"
      x2="1"
      y2="0"
    >
      <stop
        offset="0%"
        stopColor="#3b82f6"
      />
      <stop
        offset="100%"
        stopColor="#14b8a6"
      />
    </linearGradient>
  </defs>

  <CartesianGrid
    stroke="#334155"
    strokeDasharray="4 4"
  />

  <XAxis
    dataKey="name"
    tick={{
      fill: '#94a3b8',
      fontSize: 12
    }}
  />

  <YAxis
    tick={{
      fill: '#94a3b8',
      fontSize: 12
    }}
  />

  <Tooltip
    formatter={(value) => `${value} ms`}
    contentStyle={{
      background: '#020617',
      border: '1px solid #1e293b',
      borderRadius: '14px',
      color: '#fff'
    }}
    labelStyle={{
      color: '#fff'
    }}
  />

  <Line
    type="monotone"
    dataKey="avg"
    stroke="url(#siteTrend)"
    strokeWidth={4}
    dot={{
      r: 5,
      fill: '#14b8a6'
    }}
    activeDot={{
      r: 8
    }}
  />
</LineChart>
                  </ResponsiveContainer>
                </div>
              </card>
            </div>

            {mode === 'single' ? (
              <card>
                <div className="flex items-center justify-between gap-6">
                  <div>
                    <div className="text-sm font-semibold uppercase tracking-[0.18em] text-sky-500">result</div>
                    <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900 dark:text-white">lookup details</h2>
                  </div>
                  <badge tone={single?.result?.ok ? 'green' : 'red'}>{single?.result?.ok ? 'success' : 'failed'}</badge>
                </div>

                <div className="mt-6 grid gap-4 md:grid-cols-2">
                  <resolver_card
                    item={{
                      label: single?.provider?.name || (providers[0]?.name || 'cloudflare (1.1.1.1)'),
                      avg: single?.result?.elapsed,
                      ok: !!single?.result?.ok,
                      status: single?.result?.status,
                      rcode: single?.result?.rcode,
                      endpoint: 'cloudflare worker backend',
                      note: single?.result?.error || 'single request complete',
                      success_rate: single?.result?.answers?.length ? 100 : 0,
                    }}
                  />
                  <card className="bg-slate-50 dark:bg-slate-900/80">
                    <div className="text-sm font-semibold uppercase tracking-[0.16em] text-slate-400">answers</div>
                    <div className="mt-3 space-y-2">
                      {(single?.result?.answers || []).length ? (
                        single.result.answers.map((answer, index) => (
                          <div key={`${answer}-${index}`} className="rounded-2xl bg-white px-4 py-3 text-sm text-slate-700 shadow-sm dark:bg-slate-950 dark:text-slate-200">
                            {answer}
                          </div>
                        ))
                      ) : (
                        <div className="rounded-2xl bg-white px-4 py-3 text-sm text-slate-500 shadow-sm dark:bg-slate-950 dark:text-slate-400">
                          no answers returned
                        </div>
                      )}
                    </div>
                  </card>
                </div>
              </card>
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                {resolver_rows.map((item) => (
                  <resolver_card
                    key={item.id}
                    item={{
                      ...item,
                      label: item.name,
                      endpoint: item.endpoint || '',
                      ok: item.avg != null,
                    }}
                  />
                ))}
              </div>
            )}
          </section>

          <aside className="space-y-6">
            

            <card>
              <div className="text-sm font-semibold text-slate-900 dark:text-white">popular websites</div>
              <div className="mt-4 flex gap-2">
                <input
                  value={new_host}
                  onChange={(e) => set_new_host(e.target.value)}
                  placeholder="add website"
                  className="flex-1 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-sky-400 focus:ring-4 focus:ring-sky-100 dark:border-slate-800 dark:bg-slate-950 dark:text-white dark:placeholder:text-slate-500 dark:focus:border-sky-500 dark:focus:ring-sky-500/20"
                />
                <button onClick={add_host} className="rounded-2xl bg-slate-900 px-4 py-3 text-sm font-medium text-white dark:bg-white dark:text-slate-950">
                  add
                </button>
              </div>
              <div className="mt-4 space-y-2">
                {hosts.map((host) => (
                  <div key={host} className="flex items-center justify-between gap-3 rounded-2xl bg-slate-50 px-4 py-3 text-sm dark:bg-slate-900/80">
                    <span className="truncate text-slate-700 dark:text-slate-300">{host}</span>
                    <button onClick={() => remove_host(host)} className="text-slate-400 hover:text-rose-500">
                      remove
                    </button>
                  </div>
                ))}
              </div>
            </card>

            <card>
              <div className="text-sm font-semibold text-slate-900 dark:text-white">resolver summary</div>
              <div className="mt-4 space-y-3">
                {(benchmark?.summary?.byResolver || []).map((item) => (
                  <div key={item.id} className="rounded-2xl bg-slate-50 p-4 dark:bg-slate-900/80">
                    <div className="flex items-center justify-between gap-3">
                      <div className="font-medium text-slate-900 dark:text-slate-100">{item.name}</div>
                      <badge tone={item.avg == null ? 'red' : 'green'}>{item.avg == null ? 'failed' : 'ok'}</badge>
                    </div>
                    <div className="mt-2 text-sm text-slate-600 dark:text-slate-300">
                      {item.avg == null ? item.note : `${format_ms(item.avg)} average`}
                    </div>
                    <div className="mt-2 text-xs text-slate-500 dark:text-slate-400">{format_pct(item.success_rate)} success rate</div>
                  </div>
                ))}
              </div>
            </card>

            <card>
              <div className="text-sm font-semibold text-slate-900 dark:text-white">best result</div>
              <div className="mt-4 rounded-2xl bg-slate-50 p-4 dark:bg-slate-900/80">
                <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">current winner</div>
                <div className="mt-1 text-lg font-semibold text-slate-900 dark:text-slate-100">{best_resolver?.name || 'not ready yet'}</div>
                <div className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                  {best_resolver ? `${format_ms(best_resolver.avg)} average across ${hosts.length} sites` : 'run the benchmark to see the winner'}
                </div>
              </div>
            </card>
          </aside>
        </main>
      </div>

      {toast ? (
        <div className="pointer-events-none fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-full bg-slate-950 px-4 py-2 text-sm text-white shadow-xl shadow-slate-950/30">
          {toast}
        </div>
      ) : null}
    </div>
  )
}
