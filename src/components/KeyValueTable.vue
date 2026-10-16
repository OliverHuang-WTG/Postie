<script setup lang="ts">
import type { KeyValue } from '../types'

const rows = defineModel<KeyValue[]>({ required: true })
withDefaults(defineProps<{ checkable?: boolean }>(), { checkable: true })

// A trailing blank row lets the user add entries just by typing.
function update(i: number, field: 'key' | 'value', e: Event) {
  const next = rows.value.map(r => ({ ...r }))
  if (i === next.length) next.push({ enabled: true, key: '', value: '' })
  next[i][field] = (e.target as HTMLInputElement).value
  rows.value = next
}

function setEnabled(i: number, e: Event) {
  const enabled = (e.target as HTMLInputElement).checked
  rows.value = rows.value.map((r, j) => (j === i ? { ...r, enabled } : r))
}

function remove(i: number) {
  rows.value = rows.value.filter((_, j) => j !== i)
}
</script>

<template>
  <table class="kv">
    <tbody>
      <tr v-for="(row, i) in [...rows, { enabled: true, key: '', value: '' }]" :key="i" :class="{ disabled: !row.enabled }">
        <td v-if="checkable" class="kv-check">
          <input v-if="i < rows.length" type="checkbox" :checked="row.enabled" @change="setEnabled(i, $event)" />
        </td>
        <td><input :value="row.key" placeholder="Key" spellcheck="false" @input="update(i, 'key', $event)" /></td>
        <td><input :value="row.value" placeholder="Value" spellcheck="false" @input="update(i, 'value', $event)" /></td>
        <td class="kv-remove">
          <button v-if="i < rows.length" class="icon" title="Remove" @click="remove(i)">×</button>
        </td>
      </tr>
    </tbody>
  </table>
</template>
