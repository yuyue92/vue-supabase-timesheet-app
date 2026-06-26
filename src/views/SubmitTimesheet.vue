<script setup>
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import StatusBadge from '@/components/StatusBadge.vue'
import { useAuthStore } from '@/stores/auth'
import { useTimesheetStore } from '@/stores/timesheet'
import { DAILY_HOURS_TARGET } from '@/utils/constants'

import {
  addDays,
  formatDisplayDate,
  formatWeekRange,
  getWeekStart,
  parseLocalDate,
} from '@/utils/date'

const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()
const timesheetStore = useTimesheetStore()

const pageLoading = ref(true)
const pageError = ref('')
const submitError = ref('')
const submitSuccess = ref('')
const employeeNote = ref('')
const departmentName = ref('Not assigned')

const routeWeekStart = computed(() => {
  const value = typeof route.query.week === 'string' ? route.query.week : ''
  const parsed = parseLocalDate(value)

  return parsed ? getWeekStart(parsed) : getWeekStart(new Date())
})

const timesheet = computed(() => timesheetStore.timesheetRecord)
const currentStatus = computed(() => timesheet.value?.status || 'draft')
const isAlreadySubmitted = computed(() => !['draft', 'rejected'].includes(currentStatus.value))
const canSubmit = computed(() => Boolean(timesheet.value?.id) && !pageLoading.value && !timesheetStore.saving && !isAlreadySubmitted.value)
const weekRange = computed(() => formatWeekRange(timesheetStore.currentWeekStart))
const weeklyHours = computed(() => timesheetStore.weekTotal)
const workdayTarget = DAILY_HOURS_TARGET

const dailyRows = computed(() => {
  const start = timesheetStore.currentWeekStart

  return Array.from({ length: 7 }, (_, index) => {
    const date = addDays(start, index)
    const total = Number(timesheetStore.dailyTotals[date] || 0)
    const localDate = parseLocalDate(date)
    const isWeekend = [0, 6].includes(localDate?.getDay())

    let validation = {
      status: 'warning',
      label: 'Missing hours',
      message: 'No hours recorded',
    }

    if (total >= workdayTarget) {
      validation = {
        status: 'complete',
        label: 'Complete',
        message: 'Meets daily target',
      }
    } else if (total > 0) {
      validation = {
        status: 'incomplete',
        label: 'Below standard hours',
        message: 'Below daily target',
      }
    } else if (isWeekend) {
      validation = {
        status: 'neutral',
        label: 'No hours recorded',
        message: 'Weekend / no entry',
      }
    }

    return {
      date,
      label: formatLongDate(date),
      total,
      validation,
    }
  })
})

const dailyCompleteCount = computed(() =>
  dailyRows.value.filter((row) => row.validation.status === 'complete').length,
)

const dailyNeedsAttentionCount = computed(() =>
  dailyRows.value.filter((row) => ['incomplete', 'warning'].includes(row.validation.status)).length,
)

const statusMessage = computed(() => {
  if (currentStatus.value === 'submitted') {
    return 'This timesheet was submitted and is waiting for first-level approval. It is now read-only.'
  }

  if (currentStatus.value === 'approved_l1') {
    return 'This timesheet passed first-level approval and is waiting for second-level approval. It is now read-only.'
  }

  if (currentStatus.value === 'approved_l2') {
    return 'This timesheet has received final approval and is read-only.'
  }

  if (currentStatus.value === 'rejected') {
    return 'This timesheet was rejected. You may submit it again after reviewing the entries and note.'
  }

  return ''
})

function formatHours(value) {
  const number = Number(value)

  if (!Number.isFinite(number)) {
    return '0.0'
  }

  return Number.isInteger(number) ? number.toFixed(1) : number.toFixed(2).replace(/0$/, '')
}

function formatLongDate(value) {
  const date = parseLocalDate(value)

  if (!date) {
    return ''
  }

  const weekday = new Intl.DateTimeFormat('en-GB', { weekday: 'long' }).format(date)
  return `${weekday}, ${formatDisplayDate(value)}`
}

async function loadDepartmentName() {
  if (!authStore.profile?.department_id) {
    departmentName.value = 'Not assigned'
    return
  }

  try {
    const { getSupabase } = await import('@/lib/supabase')
    const client = getSupabase()
    const { data, error } = await client
      .from('departments')
      .select('name')
      .eq('id', authStore.profile.department_id)
      .maybeSingle()

    if (error) {
      throw error
    }

    departmentName.value = data?.name || 'Not assigned'
  } catch {
    departmentName.value = 'Not assigned'
  }
}

async function loadPage() {
  pageLoading.value = true
  pageError.value = ''
  submitError.value = ''
  submitSuccess.value = ''

  try {
    await authStore.initialize()
    await timesheetStore.fetchWeek(routeWeekStart.value)
    employeeNote.value = timesheetStore.timesheetRecord?.employee_note || ''
    await loadDepartmentName()
  } catch (error) {
    pageError.value = error.message || 'Unable to load this weekly timesheet.'
  } finally {
    pageLoading.value = false
  }
}

async function goBack() {
  await router.push({
    name: 'timesheet',
    query: {
      week: timesheetStore.currentWeekStart || routeWeekStart.value,
    },
  })
}

async function submitWeek() {
  submitError.value = ''
  submitSuccess.value = ''

  if (!canSubmit.value) {
    return
  }

  try {
    await timesheetStore.submitTimesheet(employeeNote.value)
    submitSuccess.value = 'Timesheet submitted successfully. Redirecting to your weekly view…'

    window.setTimeout(() => {
      router.replace({
        name: 'timesheet',
        query: {
          week: timesheetStore.currentWeekStart,
        },
      })
    }, 700)
  } catch (error) {
    submitError.value = error.message || 'Unable to submit this timesheet.'
  }
}

watch(routeWeekStart, async () => {
  await loadPage()
}, { immediate: true })
</script>

<template>
  <section class="page-section submit-page">
    <div class="page-head">
      <div>
        <h1>Submit Timesheet</h1>
        <p>Review your weekly time entries before sending them for approval.</p>
      </div>

      <div class="page-head-actions">
        <button class="btn" type="button" :disabled="timesheetStore.saving" @click="goBack">
          Back to Edit
        </button>
      </div>
    </div>

    <div v-if="pageError" class="message message-error" role="alert">
      {{ pageError }}
    </div>

    <section v-else-if="pageLoading" class="card submit-loading-card" role="status">
      Loading weekly submission review…
    </section>

    <section v-else class="card submit-card">
      <div v-if="submitError" class="message message-error" role="alert">{{ submitError }}</div>
      <div v-if="submitSuccess" class="message message-success" role="status">{{ submitSuccess }}</div>
      <div v-if="statusMessage" class="message message-info" role="status">
        <StatusBadge :status="currentStatus" compact />
        <span>{{ statusMessage }}</span>
      </div>

      <div class="submit-summary-grid">
        <div>
          <span>Employee</span>
          <strong>{{ authStore.displayName }}</strong>
        </div>
        <div>
          <span>Department</span>
          <strong>{{ departmentName }}</strong>
        </div>
        <div>
          <span>Period</span>
          <strong>{{ weekRange }}</strong>
        </div>
        <div>
          <span>Weekly Total</span>
          <strong>{{ formatHours(weeklyHours) }} Hours</strong>
        </div>
      </div>

      <section class="submit-daily-section">
        <div class="submit-section-heading">
          <div>
            <h2>Daily Summary</h2>
            <p>{{ dailyCompleteCount }} complete day{{ dailyCompleteCount === 1 ? '' : 's' }} · {{ dailyNeedsAttentionCount }} day{{ dailyNeedsAttentionCount === 1 ? '' : 's' }} needing attention</p>
          </div>
          <span class="pill">Target: {{ workdayTarget }}h per day</span>
        </div>

        <div class="submit-daily-table-wrap">
          <table class="submit-daily-table">
            <thead>
              <tr>
                <th>Date</th>
                <th class="num">Total Hours</th>
                <th>Validation</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in dailyRows" :key="row.date">
                <td>{{ row.label }}</td>
                <td class="num submit-hours">{{ formatHours(row.total) }}</td>
                <td>
                  <div class="daily-validation">
                    <StatusBadge :status="row.validation.status" :label="row.validation.label" compact />
                    <small>{{ row.validation.message }}</small>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section class="submit-route-section">
        <h2>Approval Route</h2>
        <div class="approval-route" aria-label="Two-level approval route">
          <span class="route-node route-node--employee">{{ authStore.displayName }}</span>
          <span class="route-arrow" aria-hidden="true">→</span>
          <span class="route-node">Direct Supervisor</span>
          <span class="route-arrow" aria-hidden="true">→</span>
          <span class="route-node">Second-level Approver</span>
        </div>
        <p class="hint">Approver names are resolved by the approval workflow after submission.</p>
      </section>

      <div class="field submit-note-field">
        <label for="employee-note">Submission Note</label>
        <textarea
          id="employee-note"
          v-model="employeeNote"
          class="textarea"
          maxlength="2000"
          placeholder="Optional note to your supervisor…"
          :readonly="isAlreadySubmitted"
        ></textarea>
        <span class="hint">{{ employeeNote.length }}/2000 characters</span>
      </div>

      <div class="submit-actions">
        <button class="btn" type="button" :disabled="timesheetStore.saving" @click="goBack">
          {{ isAlreadySubmitted ? 'Back to Timesheet' : 'Back to Edit' }}
        </button>
        <button v-if="canSubmit" class="btn primary" type="button" @click="submitWeek">
          <span v-if="timesheetStore.saving" class="btn-spinner"></span>
          {{ timesheetStore.saving ? 'Submitting…' : 'Submit for Approval' }}
        </button>
      </div>
    </section>
  </section>
</template>
