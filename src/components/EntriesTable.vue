<script setup>
import { computed, ref } from 'vue'
import { formatDisplayDate } from '@/utils/date'

const props = defineProps({
  entries: {
    type: Array,
    default: () => [],
  },
  readonly: {
    type: Boolean,
    default: false,
  },
  loading: {
    type: Boolean,
    default: false,
  },
  emptyMessage: {
    type: String,
    default: 'No time entries found for this day.',
  },
  showDate: {
    type: Boolean,
    default: false,
  },
  showDescription: {
    type: Boolean,
    default: false,
  },
})

const emit = defineEmits(['edit', 'delete'])
const pendingDeleteId = ref('')

const columnCount = computed(() => {
  let count = 7

  if (props.showDate) count += 1
  if (props.showDescription) count += 1
  if (!props.readonly) count += 1

  return count
})

function displayValue(value, fallback = '—') {
  const text = String(value ?? '').trim()
  return text || fallback
}

function normaliseLabel(value) {
  const text = displayValue(value, '')

  if (!text) {
    return '—'
  }

  return text
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function projectName(entry) {
  return displayValue(entry.project_name || entry.projects?.name || entry.project?.name)
}

function moduleName(entry) {
  return displayValue(entry.module_name || entry.modules?.name || entry.module?.name)
}

function formatHours(value) {
  const number = Number(value)

  if (!Number.isFinite(number)) {
    return '0.0'
  }

  return Number.isInteger(number) ? number.toFixed(1) : number.toFixed(2).replace(/0$/, '')
}

function keyFor(entry, index) {
  return entry.id || `${entry.work_date || 'date'}-${entry.jira_ticket || 'ticket'}-${index}`
}

function requestDelete(entry) {
  pendingDeleteId.value = entry.id || ''
}

function cancelDelete() {
  pendingDeleteId.value = ''
}

function confirmDelete(entry) {
  pendingDeleteId.value = ''
  emit('delete', entry)
}
</script>

<template>
  <div class="entries-table-wrap">
    <div v-if="loading" class="entries-skeleton" aria-hidden="true">
      <div v-for="n in 4" :key="n" class="entries-skeleton-row">
        <span class="skel skel-md"></span>
        <span class="skel skel-sm"></span>
        <span class="skel skel-sm"></span>
        <span class="skel skel-sm"></span>
        <span class="skel skel-sm"></span>
        <span class="skel skel-xs"></span>
        <span class="skel skel-xs"></span>
        <span class="skel skel-xs"></span>
      </div>
    </div>

    <div v-else-if="!entries.length" class="table-state table-state--empty">
      {{ emptyMessage }}
    </div>

    <table v-else class="entries-table">
      <thead>
        <tr>
          <th v-if="showDate">Date</th>
          <th>Project</th>
          <th>Role</th>
          <th>Work Type</th>
          <th>Task Nature</th>
          <th>Module</th>
          <th>Ticket</th>
          <th class="num">Hours</th>
          <th v-if="showDescription">Description</th>
          <th v-if="!readonly" class="entries-actions-head">Action</th>
        </tr>
      </thead>

      <tbody>
        <template v-for="(entry, index) in entries" :key="keyFor(entry, index)">
          <tr class="entries-row" :class="{ 'entries-row--clickable': !readonly }">
            <td v-if="showDate">{{ formatDisplayDate(entry.work_date) }}</td>
            <td>{{ projectName(entry) }}</td>
            <td>{{ normaliseLabel(entry.role_in_project) }}</td>
            <td>{{ normaliseLabel(entry.work_type) }}</td>
            <td>{{ normaliseLabel(entry.task_nature) }}</td>
            <td>{{ moduleName(entry) }}</td>
            <td>
              <code v-if="entry.jira_ticket" class="kbd">{{ entry.jira_ticket }}</code>
              <span v-else>—</span>
            </td>
            <td class="num entries-hours">{{ formatHours(entry.hours) }}</td>
            <td v-if="showDescription" class="entries-description" :title="displayValue(entry.description)">
              {{ displayValue(entry.description) }}
            </td>
            <td v-if="!readonly" class="entries-actions">
              <button class="text-button" type="button" @click="emit('edit', entry)">Edit</button>
              <button class="text-button text-button--danger" type="button" @click="requestDelete(entry)">Delete</button>
            </td>
          </tr>

          <tr v-if="!readonly && pendingDeleteId && pendingDeleteId === entry.id" class="delete-confirm-row">
            <td :colspan="columnCount">
              <div class="delete-confirm">
                <span>Delete this time entry? This action cannot be undone.</span>
                <span class="delete-confirm-actions">
                  <button class="btn btn-small" type="button" @click="cancelDelete">Cancel</button>
                  <button class="btn btn-small danger-solid" type="button" @click="confirmDelete(entry)">Delete entry</button>
                </span>
              </div>
            </td>
          </tr>
        </template>
      </tbody>
    </table>
  </div>
</template>
