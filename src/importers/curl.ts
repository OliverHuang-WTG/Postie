import { newRequest, type KeyValue, type SavedRequest } from '../types'

const SEP = Symbol('command separator')
type Token = string | typeof SEP

// Flags whose value we don't use but must skip so it isn't mistaken for the URL.
const IGNORED_VALUE_FLAGS = new Set([
  '-o', '--output', '-m', '--max-time', '--connect-timeout', '-x', '--proxy', '-U', '--proxy-user',
  '-w', '--write-out', '-c', '--cookie-jar', '-T', '--upload-file', '-E', '--cert', '--key', '--cacert',
  '-r', '--range', '--retry', '-K', '--config', '--resolve', '--limit-rate', '--max-redirs', '--interface',
])

// Accepts bash-style commands and Chrome's "Copy as cURL (cmd)"; several commands may be pasted at once.
export function parseCurl(text: string): SavedRequest[] {
  // cmd escapes every special char with ^; once stripped, the remaining quoting is MSVCRT-style, which the bash tokenizer handles.
  if (text.includes('^"')) text = text.replace(/\^\r?\n/g, '').replace(/\^(.)/g, '$1')

  const commands: string[][] = [[]]
  for (const t of tokenize(text)) {
    if (t === SEP) commands.push([])
    else commands[commands.length - 1].push(t)
  }
  return commands.filter(c => /^curl(\.exe)?$/i.test(c[0] ?? '')).map(c => fromArgs(c.slice(1)))
}

function tokenize(s: string): Token[] {
  const out: Token[] = []
  let cur = ''
  let inToken = false
  const flush = () => {
    if (inToken) out.push(cur)
    cur = ''
    inToken = false
  }

  let i = 0
  while (i < s.length) {
    const c = s[i]
    if (c === '\\' && (s[i + 1] === '\n' || s[i + 1] === '\r')) {
      i += s[i + 1] === '\r' && s[i + 2] === '\n' ? 3 : 2
    } else if (c === ' ' || c === '\t') {
      flush()
      i++
    } else if ('\r\n;&|'.includes(c)) {
      flush()
      out.push(SEP)
      i++
    } else if (c === "'") {
      inToken = true
      const end = s.indexOf("'", i + 1)
      cur += s.slice(i + 1, end < 0 ? s.length : end)
      i = end < 0 ? s.length : end + 1
    } else if (c === '$' && s[i + 1] === "'") {
      inToken = true
      i += 2
      while (i < s.length && s[i] !== "'") {
        if (s[i] === '\\' && i + 1 < s.length) {
          const [ch, len] = ansiEscape(s, i + 1)
          cur += ch
          i += 1 + len
        } else {
          cur += s[i++]
        }
      }
      i++
    } else if (c === '"') {
      inToken = true
      i++
      while (i < s.length && s[i] !== '"') {
        if (s[i] === '\\' && '"\\$`'.includes(s[i + 1])) i++
        cur += s[i++]
      }
      i++
    } else if (c === '\\' && i + 1 < s.length) {
      inToken = true
      cur += s[i + 1]
      i += 2
    } else {
      inToken = true
      cur += c
      i++
    }
  }
  flush()
  return out
}

// $'...' escapes as emitted by Chrome's "Copy as cURL (bash)". Returns the char and how many source chars it consumed.
function ansiEscape(s: string, i: number): [string, number] {
  const c = s[i]
  const hex = (len: number) => {
    const m = new RegExp(`^[0-9a-fA-F]{1,${len}}`).exec(s.slice(i + 1))
    return m ? ([String.fromCodePoint(parseInt(m[0], 16)), 1 + m[0].length] as [string, number]) : null
  }
  if (c === 'x') return hex(2) ?? [c, 1]
  if (c === 'u') return hex(4) ?? [c, 1]
  const simple: Record<string, string> = { n: '\n', r: '\r', t: '\t', a: '\x07', b: '\b', e: '\x1b', f: '\f', v: '\v' }
  return [simple[c] ?? c, 1]
}

function fromArgs(args: string[]): SavedRequest {
  const headers: KeyValue[] = []
  const data: string[] = []
  let url = ''
  let method = ''
  let user = ''
  let get = false
  const header = (key: string, value: string) => headers.push({ enabled: true, key, value })

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    // Short flags may carry their value inline, e.g. -XPOST or -H'Accept: */*'.
    const inline = /^-[XHdbuAe]./.test(arg) ? arg.slice(2) : undefined
    const flag = inline === undefined ? arg : arg.slice(0, 2)
    const value = () => inline ?? args[++i] ?? ''

    switch (flag) {
      case '-X': case '--request':
        method = value().toUpperCase()
        break
      case '-H': case '--header': {
        const h = value()
        const colon = h.indexOf(':')
        if (colon > 0) header(h.slice(0, colon).trim(), h.slice(colon + 1).trim())
        break
      }
      case '-d': case '--data': case '--data-raw': case '--data-binary': case '--data-ascii':
        data.push(value())
        break
      case '--data-urlencode':
        data.push(urlencodeArg(value()))
        break
      case '--json':
        data.push(value())
        header('Content-Type', 'application/json')
        header('Accept', 'application/json')
        break
      case '-u': case '--user':
        user = value()
        break
      case '-b': case '--cookie':
        header('Cookie', value())
        break
      case '-A': case '--user-agent':
        header('User-Agent', value())
        break
      case '-e': case '--referer':
        header('Referer', value())
        break
      case '-G': case '--get':
        get = true
        break
      case '-I': case '--head':
        method = 'HEAD'
        break
      case '--url':
        url = value()
        break
      default:
        if (IGNORED_VALUE_FLAGS.has(flag)) i++
        else if (!flag.startsWith('-') && !url) url = flag
    }
  }

  let body = data.join('&')
  if (get && body) {
    url += (url.includes('?') ? '&' : '?') + body
    body = ''
  }

  const request = newRequest({ method: method || (body ? 'POST' : 'GET'), url, headers })
  if (user) {
    const colon = user.indexOf(':')
    request.auth = {
      ...request.auth,
      mode: 'basic',
      username: colon < 0 ? user : user.slice(0, colon),
      password: colon < 0 ? '' : user.slice(colon + 1),
    }
  }
  if (body) Object.assign(request, bodyFields(body, headers))
  return request
}

// --data-urlencode encodes only the part after the first '='.
function urlencodeArg(v: string) {
  const eq = v.indexOf('=')
  return eq < 0 ? encodeURIComponent(v) : v.slice(0, eq + 1) + encodeURIComponent(v.slice(eq + 1))
}

// curl sends -d as x-www-form-urlencoded unless told otherwise, so such bodies become editable form fields.
function bodyFields(body: string, headers: KeyValue[]): Partial<SavedRequest> {
  const contentType = headers.find(h => h.key.toLowerCase() === 'content-type')?.value ?? ''
  const isForm = contentType ? contentType.includes('x-www-form-urlencoded') : !/^\s*[[{]/.test(body)
  if (!isForm) return { bodyMode: 'raw', rawBody: body }
  return {
    bodyMode: 'form',
    formBody: [...new URLSearchParams(body)].map(([key, value]) => ({ enabled: true, key, value })),
  }
}
