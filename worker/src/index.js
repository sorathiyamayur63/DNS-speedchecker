const providers = [
  {
    id: 'cloudflare',
    name: 'cloudflare (1.1.1.1)',
    endpoint: 'https://cloudflare-dns.com/dns-query',
    note: 'fast public resolver',
  },
  {
    id: 'google',
    name: 'google (8.8.8.8)',
    endpoint: 'https://dns.google/dns-query',
    note: 'widely reachable resolver',
  },
  {
    id: 'quad9',
    name: 'quad9 (9.9.9.9)',
    endpoint: 'https://dns.quad9.net/dns-query',
    note: 'security focused resolver',
  },
  {
    id: 'adguard',
    name: 'adguard (94.140.14.14)',
    endpoint: 'https://dns.adguard-dns.com/dns-query',
    note: 'privacy and filtering focused',
  },
  {
    id: 'opendns',
    name: 'opendns (208.67.222.222)',
    endpoint: 'https://doh.opendns.com/dns-query',
    note: 'popular public resolver',
  },
]

const defaultHosts = [
  'google.com',
  'youtube.com',
  'github.com',
  'wikipedia.org',
  'cloudflare.com',
  'openai.com',
]

function cors_headers(origin = '*') {
  return {
    'access-control-allow-origin': origin,
    'access-control-allow-methods': 'GET,POST,OPTIONS',
    'access-control-allow-headers': 'content-type',
    'cache-control': 'no-store',
  }
}

function json(data, init = {}) {
  return new Response(JSON.stringify(data, null, 2), {
    status: init.status || 200,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      ...cors_headers(init.origin || '*'),
    },
  })
}

function normalize_host(input) {
  const value = String(input || '').trim().toLowerCase()
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

function encode_name(name) {
  const labels = name.split('.')
  const bytes = []
  for (const label of labels) {
    bytes.push(label.length)
    for (let i = 0; i < label.length; i += 1) bytes.push(label.charCodeAt(i))
  }
  bytes.push(0)
  return new Uint8Array(bytes)
}

function build_dns_query(name, type) {
  const qname = encode_name(name)
  const type_map = { a: 1, aaaa: 28, cname: 5, mx: 15, txt: 16, ns: 2 }
  const qtype = type_map[type] || 1
  const buffer = new ArrayBuffer(12 + qname.length + 4)
  const view = new DataView(buffer)
  const bytes = new Uint8Array(buffer)

  view.setUint16(0, Math.floor(Math.random() * 65535))
  view.setUint16(2, 0x0100)
  view.setUint16(4, 1)
  view.setUint16(6, 0)
  view.setUint16(8, 0)
  view.setUint16(10, 0)
  bytes.set(qname, 12)
  view.setUint16(12 + qname.length, qtype)
  view.setUint16(12 + qname.length + 2, 1)
  return buffer
}

function read_name(view, offset, depth = 0) {
  if (depth > 20) throw new Error('dns pointer loop')
  const labels = []
  let cursor = offset
  let next_offset = offset

  while (true) {
    const len = view.getUint8(cursor)

    if ((len & 0xc0) === 0xc0) {
      const pointer = ((len & 0x3f) << 8) | view.getUint8(cursor + 1)
      const result = read_name(view, pointer, depth + 1)
      labels.push(result.name)
      next_offset = cursor + 2
      break
    }

    if (len === 0) {
      next_offset = cursor + 1
      break
    }

    cursor += 1
    let label = ''
    for (let i = 0; i < len; i += 1) label += String.fromCharCode(view.getUint8(cursor + i))
    labels.push(label)
    cursor += len
  }

  return { name: labels.filter(Boolean).join('.'), offset: next_offset }
}

function parse_rdata(view, bytes, type, offset, length) {
  if (type === 1 && length === 4) {
    return `${bytes[offset]}.${bytes[offset + 1]}.${bytes[offset + 2]}.${bytes[offset + 3]}`
  }

  if (type === 28 && length === 16) {
    const parts = []
    for (let i = 0; i < 16; i += 2) parts.push(((bytes[offset + i] << 8) | bytes[offset + i + 1]).toString(16))
    return parts.join(':')
  }

  if (type === 5 || type === 2 || type === 12) {
    return read_name(view, offset).name
  }

  if (type === 15 && length >= 3) {
    const preference = view.getUint16(offset)
    const exchange = read_name(view, offset + 2).name
    return `${preference} ${exchange}`
  }

  if (type === 16 && length > 0) {
    const parts = []
    let cursor = offset
    const end = offset + length
    while (cursor < end) {
      const len = bytes[cursor]
      cursor += 1
      let text = ''
      for (let i = 0; i < len && cursor < end; i += 1) {
        text += String.fromCharCode(bytes[cursor])
        cursor += 1
      }
      if (text) parts.push(text)
    }
    return parts.join(' ')
  }

  const raw = []
  for (let i = 0; i < Math.min(length, 12); i += 1) raw.push(bytes[offset + i].toString(16).padStart(2, '0'))
  return raw.join(' ')
}

function parse_dns_message(buffer) {
  const view = new DataView(buffer)
  const bytes = new Uint8Array(buffer)
  const qdcount = view.getUint16(4)
  const ancount = view.getUint16(6)
  const rcode = view.getUint16(2) & 0x000f
  let offset = 12

  for (let i = 0; i < qdcount; i += 1) {
    const question = read_name(view, offset)
    offset = question.offset + 4
  }

  const answers = []
  for (let i = 0; i < ancount; i += 1) {
    const name_result = read_name(view, offset)
    offset = name_result.offset
    const type = view.getUint16(offset)
    const klass = view.getUint16(offset + 2)
    const ttl = view.getUint32(offset + 4)
    const rdlength = view.getUint16(offset + 8)
    const rdata_offset = offset + 10
    const data = parse_rdata(view, bytes, type, rdata_offset, rdlength)
    answers.push({
      name: name_result.name,
      type,
      klass,
      ttl,
      data,
    })
    offset = rdata_offset + rdlength
  }

  return { rcode, answers }
}

async function query_provider(provider, host, type = 'a', timeout_ms = 7000) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeout_ms)
  const started = performance.now()

  try {
    const response = await fetch(provider.endpoint, {
      method: 'POST',
      headers: {
        accept: 'application/dns-message',
        'content-type': 'application/dns-message',
      },
      body: build_dns_query(host, type),
      signal: controller.signal,
    })

    const elapsed = performance.now() - started
    const parsed = parse_dns_message(await response.arrayBuffer())

    return {
      ok: response.ok && parsed.rcode === 0,
      status: response.status,
      rcode: parsed.rcode,
      elapsed: Math.round(elapsed),
      answers: parsed.answers.slice(0, 5).map((item) => item.data),
    }
  } finally {
    clearTimeout(timer)
  }
}

async function read_json(request) {
  try {
    return await request.json()
  } catch {
    return {}
  }
}

async function handle_meta() {
  return json({
    providers: providers.map((item) => ({
      id: item.id,
      name: item.name,
      endpoint: item.endpoint,
      note: item.note,
    })),
    defaultHosts,
  })
}

async function handle_resolve(request) {
  const body = await read_json(request)
  const resolver = String(body.resolver || 'cloudflare')
  const name = normalize_host(body.name || 'example.com')
  const type = String(body.type || 'a').toLowerCase()
  const provider = providers.find((item) => item.id === resolver) || providers[0]

  if (!is_valid_host(name)) {
    return json({ error: 'invalid hostname' }, { status: 400 })
  }

  if (!provider) {
    return json({ error: 'no resolver configured' }, { status: 500 })
  }

  try {
    const result = await query_provider(provider, name, type)
    return json({
      provider: {
        id: provider.id,
        name: provider.name,
        endpoint: provider.endpoint,
      },
      input: { resolver: provider.id, name, type },
      result,
    })
  } catch (error) {
    return json(
      {
        error: error?.message || 'resolver request failed',
      },
      { status: 500 }
    )
  }
}

async function handle_benchmark(request) {
  const body = await read_json(request)
  const hosts = Array.isArray(body.hosts) && body.hosts.length ? body.hosts : defaultHosts
  const resolver_ids = Array.isArray(body.resolvers) && body.resolvers.length
    ? body.resolvers
    : providers.map((item) => item.id)

  const normalized_hosts = hosts.map(normalize_host).filter(is_valid_host).slice(0, 12)
  const selected = providers.filter((item) => resolver_ids.includes(item.id))

  if (!selected.length) {
    return json({ error: 'no dns providers selected' }, { status: 400 })
  }

  const rows = []

  for (const host of normalized_hosts) {
    const results = await Promise.all(
      selected.map(async (provider) => {
        try {
          const result = await query_provider(provider, host, 'a')
          return {
            site: host,
            resolver_id: provider.id,
            resolver_label: provider.name,
            endpoint: provider.endpoint,
            ok: result.ok,
            status: result.status,
            rcode: result.rcode,
            elapsed: result.elapsed,
            answers: result.answers,
            error: result.ok ? '' : `rcode ${result.rcode}`,
          }
        } catch (error) {
          return {
            site: host,
            resolver_id: provider.id,
            resolver_label: provider.name,
            endpoint: provider.endpoint,
            ok: false,
            status: 0,
            rcode: -1,
            elapsed: null,
            answers: [],
            error: error?.name === 'AbortError' ? 'request timed out' : 'network error',
          }
        }
      })
    )

    rows.push(...results)
  }

  const byResolver = selected.map((provider) => {
    const resolver_rows = rows.filter((item) => item.resolver_id === provider.id)
    const success_rows = resolver_rows.filter((item) => item.ok)
    const times = success_rows.map((item) => item.elapsed).filter((value) => typeof value === 'number')
    const avg = times.length ? times.reduce((a, b) => a + b, 0) / times.length : null
    const min = times.length ? Math.min(...times) : null
    const median = times.length
      ? [...times].sort((a, b) => a - b)[Math.floor(times.length / 2)]
      : null
    const max = times.length ? Math.max(...times) : null

    return {
      id: provider.id,
      name: provider.name,
      endpoint: provider.endpoint,
      note: provider.note,
      total: resolver_rows.length,
      success: success_rows.length,
      success_rate: resolver_rows.length ? (success_rows.length / resolver_rows.length) * 100 : 0,
      avg: avg == null ? null : Math.round(avg),
      min: min == null ? null : Math.round(min),
      median: median == null ? null : Math.round(median),
      max: max == null ? null : Math.round(max),
      ok: success_rows.length > 0,
    }
  })

  const bySite = normalized_hosts.map((site) => {
    const site_rows = rows.filter((item) => item.site === site)
    const success_rows = site_rows.filter((item) => item.ok)
    const times = success_rows.map((item) => item.elapsed).filter((value) => typeof value === 'number')
    const avg = times.length ? times.reduce((a, b) => a + b, 0) / times.length : null
    const best = success_rows.length
      ? [...success_rows].sort((a, b) => a.elapsed - b.elapsed)[0]
      : null

    return {
      site,
      avg: avg == null ? null : Math.round(avg),
      best: best ? best.resolver_label : '—',
    }
  })

  const overall_times = rows.filter((item) => item.ok && typeof item.elapsed === 'number').map((item) => item.elapsed)
  const overall_avg = overall_times.length ? overall_times.reduce((a, b) => a + b, 0) / overall_times.length : null
  const best_resolver = [...byResolver].sort((a, b) => {
    if (a.avg == null && b.avg == null) return 0
    if (a.avg == null) return 1
    if (b.avg == null) return -1
    return a.avg - b.avg
  })[0] || null

  return json({
    hosts: normalized_hosts,
    providers: selected.map((provider) => ({
      id: provider.id,
      name: provider.name,
      endpoint: provider.endpoint,
      note: provider.note,
    })),
    rows,
    summary: {
      overall_avg: overall_avg == null ? null : Math.round(overall_avg),
      best_resolver,
      byResolver,
      bySite,
    },
  })
}

export default {
  async fetch(request) {
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: cors_headers('*'),
      })
    }

    const url = new URL(request.url)
    const path = url.pathname.replace(/\/+$/, '') || '/'

    try {
      if (path.endsWith('/api/meta')) {
        return await handle_meta()
      }

      if (path.endsWith('/api/resolve')) {
        return await handle_resolve(request)
      }

      if (path.endsWith('/api/benchmark')) {
        return await handle_benchmark(request)
      }

      return json({
        ok: true,
        name: 'dns benchmark pro api',
        routes: ['/api/meta', '/api/resolve', '/api/benchmark'],
      })
    } catch (error) {
      return json(
        {
          error: error?.message || 'unexpected server error',
        },
        { status: 500 }
      )
    }
  },
}
