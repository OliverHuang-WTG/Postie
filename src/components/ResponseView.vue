<script setup lang="ts">
import { computed, ref } from 'vue'
import type { HttpResponse } from '../types'

const props = defineProps<{ response: HttpResponse | null; error: string; sending: boolean }>()
const tab = ref<'Body' | 'Headers'>('Body')

const body = computed(() => {
  const body = props.response?.body ?? ''
  try {
    return JSON.stringify(JSON.parse(body), null, 2)
  } catch {
    return body
  }
})

function copy() {
  navigator.clipboard.writeText(body.value)
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}
</script>

<template>
  <section class="response">
    <div v-if="sending" class="placeholder">Sending…</div>
    <pre v-else-if="error" class="error">{{ error }}</pre>
    <div v-else-if="!response" class="placeholder">Ctrl+Enter to send · Ctrl+S to save</div>
    <template v-else>
      <div class="response-bar">
        <span class="status" :class="`s${Math.floor(response.status / 100)}xx`">{{ response.status }} {{ response.statusText }}</span>
        <span>{{ response.elapsedMs }} ms</span>
        <span>{{ formatSize(response.size) }}</span>
        <nav class="tabs">
          <button :class="{ active: tab === 'Body' }" @click="tab = 'Body'">Body</button>
          <button :class="{ active: tab === 'Headers' }" @click="tab = 'Headers'">Headers ({{ response.headers.length }})</button>
        </nav>
        <button @click="copy">Copy</button>
      </div>
      <pre v-if="tab === 'Body'" class="code response-body">{{ body }}</pre>
      <div v-else class="response-body">
        <table class="headers">
          <tbody>
            <tr v-for="(h, i) in response.headers" :key="i">
              <td>{{ h.name }}</td>
              <td>{{ h.value }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>
  </section>
</template>
