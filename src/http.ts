import { invoke } from '@tauri-apps/api/core'
import type { Header, HttpResponse, SavedRequest } from './types'

export interface Settings {
  timeoutMs: number
  ignoreSsl: boolean
}

export function sendRequest(request: SavedRequest, id: number, settings: Settings) {
  return invoke<HttpResponse>('send_request', { req: toWire(request, id, settings) })
}

export function cancelRequest(id: number) {
  return invoke('cancel_request', { id })
}

export async function loadHistory(): Promise<SavedRequest[]> {
  return JSON.parse(await invoke<string>('load_history'))
}

export function saveHistory(items: SavedRequest[]) {
  return invoke('save_history', { json: JSON.stringify(items, null, 2) })
}

function toWire(r: SavedRequest, id: number, settings: Settings) {
  const headers: Header[] = r.headers
    .filter(h => h.enabled && h.key.trim())
    .map(h => ({ name: h.key.trim(), value: h.value }))
  const has = (name: string) => headers.some(h => h.name.toLowerCase() === name)

  // An explicit Authorization header wins over the Auth tab.
  if (r.auth.mode === 'bearer' && !has('authorization')) {
    headers.push({ name: 'Authorization', value: `Bearer ${r.auth.token}` })
  }
  if (r.auth.mode === 'basic' && !has('authorization')) {
    headers.push({ name: 'Authorization', value: `Basic ${base64(`${r.auth.username}:${r.auth.password}`)}` })
  }

  let body: string | null = null
  if (r.bodyMode === 'raw') {
    body = r.rawBody
    // The raw editor has no content-type selector; JSON is the common case, so infer it.
    if (!has('content-type') && /^\s*[[{]/.test(body)) {
      headers.push({ name: 'Content-Type', value: 'application/json' })
    }
  } else if (r.bodyMode === 'form') {
    body = new URLSearchParams(r.formBody.filter(f => f.enabled && f.key).map(f => [f.key, f.value])).toString()
    if (!has('content-type')) {
      headers.push({ name: 'Content-Type', value: 'application/x-www-form-urlencoded' })
    }
  }

  const url = r.url.trim()
  return {
    id,
    method: r.method,
    url: /^[a-z][a-z0-9+.-]*:\/\//i.test(url) ? url : `http://${url}`,
    headers,
    body,
    timeoutMs: settings.timeoutMs,
    ignoreSsl: settings.ignoreSsl,
  }
}

// btoa only accepts Latin-1, so encode to UTF-8 bytes first.
function base64(s: string) {
  return btoa(String.fromCharCode(...new TextEncoder().encode(s)))
}
