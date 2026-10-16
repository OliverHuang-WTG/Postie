import type { KeyValue } from './types'

// Query strings are kept exactly as typed (no decode/encode) so editing the table never rewrites what the user entered in the URL.
function splitUrl(url: string) {
  const hashAt = url.indexOf('#')
  const hash = hashAt >= 0 ? url.slice(hashAt) : ''
  const rest = hashAt >= 0 ? url.slice(0, hashAt) : url
  const q = rest.indexOf('?')
  return q >= 0 ? { base: rest.slice(0, q), query: rest.slice(q + 1), hash } : { base: rest, query: '', hash }
}

export function parseQuery(url: string): KeyValue[] {
  return splitUrl(url)
    .query.split('&')
    .filter(Boolean)
    .map(pair => {
      const eq = pair.indexOf('=')
      return eq < 0
        ? { enabled: true, key: pair, value: '' }
        : { enabled: true, key: pair.slice(0, eq), value: pair.slice(eq + 1) }
    })
}

export function withQuery(url: string, rows: KeyValue[]): string {
  const { base, hash } = splitUrl(url)
  const query = rows
    .filter(r => r.key || r.value)
    .map(r => (r.value ? `${r.key}=${r.value}` : r.key))
    .join('&')
  return base + (query ? `?${query}` : '') + hash
}
