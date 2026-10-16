<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import ImportDialog from './components/ImportDialog.vue'
import KeyValueTable from './components/KeyValueTable.vue'
import ResponseView from './components/ResponseView.vue'
import { cancelRequest, loadHistory, saveHistory, sendRequest, type Settings } from './http'
import { newRequest, type HttpResponse, type KeyValue, type SavedRequest } from './types'
import { parseQuery, withQuery } from './url'

const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']
const TABS = ['Params', 'Headers', 'Body', 'Auth'] as const

const saved = ref<SavedRequest[]>([])
const current = ref<SavedRequest>(newRequest())
const tab = ref<(typeof TABS)[number]>('Params')
const search = ref('')
const showImport = ref(false)
const response = ref<HttpResponse | null>(null)
const error = ref('')
const inFlightId = ref<number | null>(null)
let nextRequestId = 1

const settings = reactive<Settings>({ timeoutMs: 30000, ignoreSsl: false, ...JSON.parse(localStorage.getItem('settings') ?? '{}') })
watch(settings, s => localStorage.setItem('settings', JSON.stringify(s)))

const responseHeight = ref(Number(localStorage.getItem('responseHeight')) || 360)
watch(responseHeight, h => localStorage.setItem('responseHeight', String(h)))

onMounted(async () => {
  window.addEventListener('keydown', onKey)
  saved.value = await loadHistory()
  // Registered after loading so the initial empty list never overwrites the file.
  watch(saved, items => saveHistory(items), { deep: true })
})

const visible = computed(() => {
  const q = search.value.toLowerCase()
  return saved.value.filter(r => `${r.method} ${r.name} ${r.url}`.toLowerCase().includes(q))
})

const params = computed<KeyValue[]>({
  get: () => parseQuery(current.value.url),
  set: rows => {
    current.value.url = withQuery(current.value.url, rows)
  },
})

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value))
}

function open(r: SavedRequest) {
  cancel()
  current.value = clone(r)
  response.value = null
  error.value = ''
}

function save() {
  saved.value = [clone(current.value), ...saved.value.filter(r => r.id !== current.value.id)]
}

function remove(r: SavedRequest) {
  saved.value = saved.value.filter(x => x.id !== r.id)
}

function imported(requests: SavedRequest[]) {
  saved.value = [...requests, ...saved.value]
  showImport.value = false
  open(requests[0])
}

async function send() {
  if (inFlightId.value !== null || !current.value.url.trim()) return
  save()
  const id = nextRequestId++
  const requestId = current.value.id
  inFlightId.value = id
  response.value = null
  error.value = ''
  try {
    const result = await sendRequest(current.value, id, settings)
    if (current.value.id === requestId) response.value = result
  } catch (e) {
    if (current.value.id === requestId) error.value = String(e)
  } finally {
    inFlightId.value = null
  }
}

function cancel() {
  if (inFlightId.value !== null) cancelRequest(inFlightId.value)
}

function startResize(e: PointerEvent) {
  e.preventDefault()
  const handle = e.currentTarget as HTMLElement
  const startY = e.clientY
  const startHeight = responseHeight.value
  // Pointer capture keeps the drag going when the cursor leaves the thin handle.
  handle.setPointerCapture(e.pointerId)
  const move = (ev: PointerEvent) => {
    responseHeight.value = Math.min(Math.max(startHeight + startY - ev.clientY, 120), window.innerHeight - 160)
  }
  handle.addEventListener('pointermove', move)
  handle.addEventListener('pointerup', () => handle.removeEventListener('pointermove', move), { once: true })
}

function onKey(e: KeyboardEvent) {
  if (!e.ctrlKey) return
  if (e.key === 'Enter') {
    e.preventDefault()
    send()
  } else if (e.key === 's') {
    e.preventDefault()
    save()
  }
}
</script>

<template>
  <div class="app">
    <aside class="sidebar">
      <div class="sidebar-actions">
        <button class="primary" @click="open(newRequest())">New</button>
        <button @click="showImport = true">Import</button>
      </div>
      <input v-model="search" placeholder="Search" spellcheck="false" />
      <ul class="saved">
        <li v-for="r in visible" :key="r.id" :class="{ active: r.id === current.id }" :title="r.url" @click="open(r)">
          <span class="method" :class="`m-${r.method}`">{{ r.method }}</span>
          <span class="label">{{ r.name || r.url || 'Untitled' }}</span>
          <button class="icon" title="Delete" @click.stop="remove(r)">×</button>
        </li>
      </ul>
      <div class="settings">
        <label>Timeout (ms) <input v-model.number="settings.timeoutMs" type="number" min="0" /></label>
        <label><input v-model="settings.ignoreSsl" type="checkbox" /> Ignore SSL errors</label>
      </div>
    </aside>

    <main>
      <section class="request">
        <div class="name-bar">
          <input v-model="current.name" class="name" placeholder="Untitled request" spellcheck="false" />
          <button title="Add to the list without sending (Ctrl+S)" @click="save">Save</button>
        </div>
        <div class="url-bar">
          <select v-model="current.method" :class="`m-${current.method}`">
            <option v-for="m in METHODS" :key="m">{{ m }}</option>
          </select>
          <input v-model="current.url" class="code" placeholder="https://api.example.com/resource" spellcheck="false" @keydown.enter="send" />
          <button v-if="inFlightId === null" class="primary" @click="send">Send</button>
          <button v-else @click="cancel">Cancel</button>
        </div>

        <nav class="tabs">
          <button v-for="t in TABS" :key="t" :class="{ active: tab === t }" @click="tab = t">{{ t }}</button>
        </nav>

        <div class="tab-body">
          <KeyValueTable v-if="tab === 'Params'" v-model="params" :checkable="false" />
          <KeyValueTable v-else-if="tab === 'Headers'" v-model="current.headers" />
          <template v-else-if="tab === 'Body'">
            <div class="radio-row">
              <label><input v-model="current.bodyMode" type="radio" value="none" /> None</label>
              <label><input v-model="current.bodyMode" type="radio" value="raw" /> Raw</label>
              <label><input v-model="current.bodyMode" type="radio" value="form" /> x-www-form-urlencoded</label>
            </div>
            <textarea v-if="current.bodyMode === 'raw'" v-model="current.rawBody" class="code" spellcheck="false" />
            <KeyValueTable v-else-if="current.bodyMode === 'form'" v-model="current.formBody" />
          </template>
          <div v-else class="auth">
            <label>Type</label>
            <select v-model="current.auth.mode">
              <option value="none">None</option>
              <option value="bearer">Bearer token</option>
              <option value="basic">Basic</option>
            </select>
            <template v-if="current.auth.mode === 'bearer'">
              <label>Token</label>
              <input v-model="current.auth.token" class="code" spellcheck="false" />
            </template>
            <template v-else-if="current.auth.mode === 'basic'">
              <label>Username</label>
              <input v-model="current.auth.username" spellcheck="false" />
              <label>Password</label>
              <input v-model="current.auth.password" type="password" />
            </template>
          </div>
        </div>
      </section>

      <div class="splitter" @pointerdown="startResize" />
      <ResponseView :response="response" :error="error" :sending="inFlightId !== null" :style="{ height: `${responseHeight}px` }" />
    </main>

    <ImportDialog v-if="showImport" @imported="imported" @close="showImport = false" />
  </div>
</template>
