<script setup lang="ts">
import { onMounted, ref } from 'vue'
import type { SavedRequest } from '../types'
import { parseCurl } from '../importers/curl'
import { parsePostman } from '../importers/postman'

const emit = defineEmits<{ imported: [requests: SavedRequest[]]; close: [] }>()
const text = ref('')
const error = ref('')
const textarea = ref<HTMLTextAreaElement>()

// The autofocus attribute only applies on page load, not when the dialog is mounted later.
onMounted(() => textarea.value?.focus())

async function pickFile(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (file) text.value = await file.text()
}

function submit() {
  try {
    const t = text.value.trim()
    const requests = t.startsWith('{') ? parsePostman(JSON.parse(t)) : parseCurl(t)
    if (!requests.length) throw new Error('Nothing to import: paste curl command(s) or a Postman collection (v2.1) JSON.')
    emit('imported', requests)
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  }
}
</script>

<template>
  <div class="modal-backdrop" @click.self="emit('close')" @keydown.esc="emit('close')">
    <div class="modal">
      <h3>Import</h3>
      <p class="hint">Paste curl command(s) (bash or Chrome "Copy as cURL (cmd)") or a Postman collection v2.1 JSON, or pick a file.</p>
      <textarea ref="textarea" v-model="text" class="code" spellcheck="false" />
      <input type="file" accept=".json,.txt,.sh,.cmd,.curl" @change="pickFile" />
      <p v-if="error" class="error">{{ error }}</p>
      <div class="modal-actions">
        <button @click="emit('close')">Cancel</button>
        <button class="primary" :disabled="!text.trim()" @click="submit">Import</button>
      </div>
    </div>
  </div>
</template>
