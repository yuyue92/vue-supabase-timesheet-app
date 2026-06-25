<script setup>
import { computed, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import DayBar from '@/components/DayBar.vue'
import EntriesTable from '@/components/EntriesTable.vue'
import StatusBadge from '@/components/StatusBadge.vue'
import { useTimesheetStore } from '@/stores/timesheet'
import { WEEKLY_HOURS_TARGET } from '@/utils/constants'

import {
  addDays,
  formatDisplayDate,
  formatWeekRange,
  getWeekStart,
  parseLocalDate,
} from '@/utils/date'

const route = useRoute()
const router = useRouter()
const timesheetStore = useTimesheetStore()

const pageError = computed(() => timesheetStore.error)

const isCurrentWeek = computed(
  () => timesheetStore.currentWeekStart >= getWeekStart(new Date()),
)

const routeWeekStart = computed(() => {
  const queryValue = typeof route.query.week === 'string' ? route.query.week : ''
  const parsed = parseLocalDate(queryValue)

  return parsed ? getWeekStart(parsed) : getWeekStart(new Date())
})

const weekRange = computed(() => formatWeekRange(timesheetStore.currentWeekStart))
const selectedDateLabel = computed(() => formatDisplayDate(timesheetStore.selectedDate))
const selectedEntries = computed(() => timesheetStore.entriesForSelectedDate)
const selectedDayTotal = computed(() => timesheetStore.selectedDayTotal)
const weekTotal = computed(() => timesheetStore.weekTotal)
const weekTarget = WEEKLY_HOURS_TARGET
const weekProgress = computed(() => Math.min(100, Math.round((weekTotal.value / weekTarget) * 100)))
const isLocked = computed(() => timesheetStore.isLocked)
const currentStatus = computed(() => timesheetStore.timesheetRecord?.status || 'draft')

const selectedDayStatus = computed(() => {
  const total = selectedDayTotal.value

  if (total >= 8) {
    return {
      status: 'complete',
      label: 'Complete day',
      message: 'This day meets the standard 8-hour target.',
    }
  }

  if (total > 0) {
    return {
      status: 'incomplete',
      label: 'Below 8 hours',
      message: 'You can still save and submit this week, but the day is below the standard target.',
    }
  }

  return {
    status: 'warning',
    label: 'No hours',
    message: 'No time entries have been recorded for this day.',
  }
})

const lockMessage = computed(() => {
  if (currentStatus.value === 'submitted') {
    return 'This timesheet has been submitted and is now read-only while first-level approval is pending.'
  }

  if (currentStatus.value === 'approved_l1') {
    return 'This timesheet passed first-level approval and is locked while second-level approval is pending.'
  }

  if (currentStatus.value === 'approved_l2') {
    return 'This timesheet is fully approved and can no longer be changed.'
  }

  return ''
})

function formatHours(value) {
  const number = Number(value)

  if (!Number.isFinite(number)) {
    return '0.0'
  }

  return Number.isInteger(number)
    ? number.toFixed(1)
    : number.toFixed(2).replace(/0$/, '')
}

function getRouteQueryForWeek(weekStart, extra = {}) {
  return {
    ...route.query,
    ...extra,
    week: getWeekStart(weekStart),
  }
}

async function loadWeek(weekStart) {
  try {
    await timesheetStore.fetchWeek(weekStart)

    const canonicalWeekStart = timesheetStore.currentWeekStart
    if (route.query.week !== canonicalWeekStart) {
      await router.replace({
        name: 'timesheet',
        query: getRouteQueryForWeek(canonicalWeekStart),
      })
    }
  } catch {
    // The store already exposes a friendly error message for the page.
  }
}

async function goToWeek(weekStart) {
  if (timesheetStore.loading || timesheetStore.saving) {
    return
  }

  await router.push({
    name: 'timesheet',
    query: getRouteQueryForWeek(weekStart),
  })
}

async function goToPreviousWeek() {
  await goToWeek(addDays(timesheetStore.currentWeekStart, -7))
}

async function goToNextWeek() {
  const nextWeekStart = addDays(timesheetStore.currentWeekStart, 7)
  const thisWeekStart = getWeekStart(new Date())
  if (nextWeekStart > thisWeekStart) return
  await goToWeek(nextWeekStart)
}

function selectDate(date) {
  timesheetStore.setSelectedDate(date)
}

async function goToAddEntry() {
  if (isLocked.value) {
    return
  }

  await router.push({
    name: 'add-entry',
    query: {
      week: timesheetStore.currentWeekStart,
      date: timesheetStore.selectedDate,
    },
  })
}

async function editEntry(entry) {
  if (!entry?.id || isLocked.value) {
    return
  }

  await router.push({
    name: 'add-entry',
    query: {
      id: entry.id,
      week: timesheetStore.currentWeekStart,
      date: timesheetStore.selectedDate,
    },
  })
}

async function deleteEntry(entry) {
  try {
    await timesheetStore.deleteEntry(entry.id)
  } catch {
    // The store exposes the friendly message in the page-level error block.
  }
}

async function goToSubmit() {
  if (isLocked.value || !timesheetStore.timesheetRecord?.id) {
    return
  }

  await router.push({
    name: 'submit-timesheet',
    query: {
      week: timesheetStore.currentWeekStart,
    },
  })
}

watch(
  routeWeekStart,
  async (weekStart) => {
    await loadWeek(weekStart)
  },
  { immediate: true },
)
</script>

<template>
  <section class="page-section timesheet-page">
    <div class="page-head">
      <div>
        <h1>My Timesheet</h1>
        <p>Record and submit your weekly working hours.</p>
      </div>

      <div class="page-head-actions">
        <button
          v-if="!isLocked"
          class="btn ghost"
          type="button"
          :disabled="timesheetStore.loading || timesheetStore.saving || !timesheetStore.timesheetRecord"
          @click="goToSubmit"
        >
          Submit Week
        </button>
        <button
          v-if="!isLocked"
          class="btn primary"
          type="button"
          :disabled="timesheetStore.loading || timesheetStore.saving || !timesheetStore.timesheetRecord"
          @click="goToAddEntry"
        >
          + Add Time Entry
        </button>
      </div>
    </div>

    <div v-if="pageError" class="message message-error" role="alert">
      {{ pageError }}
    </div>

    <section class="card timesheet-overview-card" :aria-busy="timesheetStore.loading">
      <div class="week-toolbar">
        <div class="week-navigation" aria-label="Week navigation">
          <button
            class="btn"
            type="button"
            :disabled="timesheetStore.loading || timesheetStore.saving"
            @click="goToPreviousWeek"
          >
            ‹ Previous Week
          </button>

          <strong class="week-range">{{ weekRange }}</strong>

          <button
            class="btn"
            type="button"
            :disabled="timesheetStore.loading || timesheetStore.saving ||isCurrentWeek"
            @click="goToNextWeek"
          >
            Next Week ›
          </button>
        </div>

        <div class="week-toolbar-summary">
          <StatusBadge :status="currentStatus" />
          <span class="pill">Weekly Total: {{ formatHours(weekTotal) }} / {{ weekTarget }} Hours</span>
        </div>
      </div>

      <div class="week-progress" aria-hidden="true">
        <span :style="{ width: `${weekProgress}%` }"></span>
      </div>

      <div v-if="timesheetStore.loading" class="timesheet-loading" role="status">
        Loading weekly timesheet…
      </div>

      <DayBar
        v-else
        :entries="timesheetStore.entries"
        :week-start="timesheetStore.currentWeekStart"
        :selected-date="timesheetStore.selectedDate"
        @select="selectDate"
      />
    </section>

    <section v-if="lockMessage" class="message message-info timesheet-lock-notice" role="status">
      <StatusBadge :status="currentStatus" compact />
      <span>{{ lockMessage }}</span>
    </section>

    <section v-if="currentStatus === 'rejected'" class="message message-warning timesheet-rejected-notice" role="status">
      This timesheet was rejected. Update the entries as needed, then submit the week again.
    </section>

    <section class="card entries-card">
      <div class="entries-card-heading">
        <div>
          <div class="entries-heading-line">
            <h2>Entries for {{ selectedDateLabel }}</h2>
            <StatusBadge :status="selectedDayStatus.status" :label="selectedDayStatus.label" compact />
          </div>
          <p>{{ selectedDayStatus.message }}</p>
        </div>

        <button
          v-if="!isLocked"
          class="btn"
          type="button"
          :disabled="timesheetStore.loading || timesheetStore.saving || !timesheetStore.timesheetRecord"
          @click="goToAddEntry"
        >
          + Add Time Entry
        </button>
      </div>

      <EntriesTable
        :entries="selectedEntries"
        :readonly="isLocked"
        :loading="timesheetStore.loading"
        :empty-message="`No time entries recorded for ${selectedDateLabel}.`"
        @edit="editEntry"
        @delete="deleteEntry"
      />

      <div class="entries-card-footer">
        <strong>Total for selected day: {{ formatHours(selectedDayTotal) }} Hours</strong>
        <div class="entries-card-footer-actions">
          <button
            v-if="!isLocked"
            class="btn primary"
            type="button"
            :disabled="timesheetStore.loading || timesheetStore.saving || !timesheetStore.timesheetRecord"
            @click="goToSubmit"
          >
            Submit Week
          </button>
        </div>
      </div>
    </section>
  </section>
</template>
