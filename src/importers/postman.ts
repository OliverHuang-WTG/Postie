import { newRequest, type Auth, type KeyValue, type SavedRequest } from '../types'

interface PmKeyValue {
  key: string
  value?: string
  disabled?: boolean
  type?: string
}

interface PmAuth {
  type: string
  bearer?: PmKeyValue[]
  basic?: PmKeyValue[]
}

interface PmRequest {
  method?: string
  url?: string | { raw?: string }
  header?: PmKeyValue[]
  body?: { mode?: string; raw?: string; urlencoded?: PmKeyValue[]; formdata?: PmKeyValue[] }
  auth?: PmAuth
}

interface PmItem {
  name?: string
  item?: PmItem[]
  request?: PmRequest | string
  auth?: PmAuth
}

export interface PmCollection {
  item: PmItem[]
  auth?: PmAuth
  variable?: PmKeyValue[]
}

// Folders are flattened into "Folder / Request" names; collection variables are resolved at import time.
export function parsePostman(collection: PmCollection): SavedRequest[] {
  if (!Array.isArray(collection.item)) throw new Error('Not a Postman collection (v2.1): missing "item".')

  const vars = new Map((collection.variable ?? []).filter(v => !v.disabled).map(v => [v.key, String(v.value ?? '')]))
  const sub = (s: string) => s.replace(/\{\{([^{}]+)\}\}/g, (m, k: string) => vars.get(k.trim()) ?? m)

  const out: SavedRequest[] = []
  const walk = (items: PmItem[], path: string[], inheritedAuth?: PmAuth) => {
    for (const it of items) {
      const names = [...path, it.name ?? '']
      // Postman inherits auth from the nearest folder/collection that defines one.
      const auth = it.auth && it.auth.type !== 'inherit' ? it.auth : inheritedAuth
      if (it.item) walk(it.item, names, auth)
      else if (it.request) out.push(toRequest(it.request, names.filter(Boolean).join(' / '), auth, sub))
    }
  }
  walk(collection.item, [], collection.auth)
  return out
}

function toRequest(r: PmRequest | string, name: string, inheritedAuth: PmAuth | undefined, sub: (s: string) => string) {
  if (typeof r === 'string') return newRequest({ name, url: sub(r) })

  const request = newRequest({
    name,
    method: (r.method ?? 'GET').toUpperCase(),
    url: sub(typeof r.url === 'string' ? r.url : r.url?.raw ?? ''),
    headers: toKeyValues(r.header, sub),
    auth: toAuth(r.auth && r.auth.type !== 'inherit' ? r.auth : inheritedAuth, sub),
  })

  const body = r.body
  if (body?.mode === 'raw' && body.raw) {
    request.bodyMode = 'raw'
    request.rawBody = sub(body.raw)
  } else if (body?.mode === 'urlencoded' || body?.mode === 'formdata') {
    // Multipart isn't supported: text fields are sent urlencoded and file fields are dropped.
    request.bodyMode = 'form'
    request.formBody = toKeyValues(body[body.mode]?.filter(f => f.type !== 'file'), sub)
  }
  return request
}

function toKeyValues(items: PmKeyValue[] | undefined, sub: (s: string) => string): KeyValue[] {
  return (items ?? []).map(h => ({ enabled: !h.disabled, key: sub(h.key), value: sub(h.value ?? '') }))
}

function toAuth(a: PmAuth | undefined, sub: (s: string) => string): Auth {
  const auth: Auth = { mode: 'none', token: '', username: '', password: '' }
  const param = (params: PmKeyValue[] | undefined, key: string) => sub(String(params?.find(p => p.key === key)?.value ?? ''))
  if (a?.type === 'bearer') {
    auth.mode = 'bearer'
    auth.token = param(a.bearer, 'token')
  } else if (a?.type === 'basic') {
    auth.mode = 'basic'
    auth.username = param(a.basic, 'username')
    auth.password = param(a.basic, 'password')
  }
  return auth
}
