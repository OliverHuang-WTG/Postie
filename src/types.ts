export interface KeyValue {
  enabled: boolean
  key: string
  value: string
}

export type BodyMode = 'none' | 'raw' | 'form'
export type AuthMode = 'none' | 'bearer' | 'basic'

export interface Auth {
  mode: AuthMode
  token: string
  username: string
  password: string
}

export interface SavedRequest {
  id: string
  name: string
  method: string
  url: string
  headers: KeyValue[]
  bodyMode: BodyMode
  rawBody: string
  formBody: KeyValue[]
  auth: Auth
}

export interface Header {
  name: string
  value: string
}

export interface HttpResponse {
  status: number
  statusText: string
  headers: Header[]
  body: string
  size: number
  elapsedMs: number
}

export function newRequest(patch: Partial<SavedRequest> = {}): SavedRequest {
  return {
    id: crypto.randomUUID(),
    name: '',
    method: 'GET',
    url: '',
    headers: [],
    bodyMode: 'none',
    rawBody: '',
    formBody: [],
    auth: { mode: 'none', token: '', username: '', password: '' },
    ...patch,
  }
}
