<script setup>
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import ApprovalStepper from '@/components/ApprovalStepper.vue'
import EntriesTable from '@/components/EntriesTable.vue'
import StatusBadge from '@/components/StatusBadge.vue'
import { getSupabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth'
import { addDays, formatDisplayDate, formatWeekRange } from '@/utils/date'
import { useToastStore } from '@/stores/toast'
const toast = useToastStore()

const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()

const loading = ref(true)
const actionLoading = ref(false)
const pageError = ref('')
const actionError = ref('')
const actionSuccess = ref('')
const timesheet = ref(null)
const entries = ref([])
const records = ref([])
const approvalComment = ref('')

const timesheetId = computed(() => String(route.params.id || ''))
const employee = computed(() => {
  if (Array.isArray(timesheet.value?.employee)) return timesheet.value.employee[0] || {}
  return timesheet.value?.employee || {}
})
const department = computed(() => {
  if (Array.isArray(employee.value.department)) return employee.value.department[0] || {}
  return employee.value.department || {}
})
const currentStatus = computed(() => timesheet.value?.status || 'draft')
const weekRange = computed(() => formatWeekRange(timesheet.value?.week_start || ''))
const isMissing = computed(() => !loading.value && !timesheet.value && !pageError.value)

const currentAction = computed(() => {
  const userId = authStore.user?.id || ''
  if (!timesheet.value?.id || !userId) return null

  if (authStore.isAdmin && currentStatus.value === 'submitted') {
    return {
      level: 1,
      approveLabel: 'Approve as Level 1',
      intro: 'You are acting as the first-level approver for this timesheet.',
    }
  }

  if (authStore.isAdmin && currentStatus.value === 'approved_l1') {
    return {
      level: 2,
      approveLabel: 'Approve as Level 2',
      intro: 'You are acting as the second-level approver for this timesheet.',
    }
  }

  if (currentStatus.value === 'submitted' && employee.value.supervisor_id === userId) {
    return {
      level: 1,
      approveLabel: 'Approve as Level 1',
      intro: 'You are the assigned first-level approver for this employee.',
    }
  }

  if (currentStatus.value === 'approved_l1' && employee.value.second_supervisor_id === userId) {
    return {
      level: 2,
      approveLabel: 'Approve as Level 2',
      intro: 'You are the assigned second-level approver for this employee.',
    }
  }

  return null
})

const actionUnavailableMessage = computed(() => {
  if (currentAction.value) return ''
  if (currentStatus.value === 'approved_l2') return 'This timesheet has been finally approved and is read-only.'
  if (currentStatus.value === 'rejected') return 'This timesheet was rejected and returned to the employee for revision.'
  if (currentStatus.value === 'approved_l1') return 'This timesheet is waiting for the assigned second-level approver.'
  if (currentStatus.value === 'submitted') return 'This timesheet is waiting for the assigned first-level approver.'
  return 'This timesheet is not currently available for approval.'
})

const dailyGroups = computed(() => {
  if (!timesheet.value?.week_start) return []

  return Array.from({ length: 7 }, (_, index) => {
    const date = addDays(timesheet.value.week_start, index)
    const dayEntries = entries.value.filter((entry) => entry.work_date === date)
    const total = dayEntries.reduce((sum, entry) => sum + Number(entry.hours || 0), 0)

    return {
      date,
      entries: dayEntries,
      total,
    }
  })
})

const approvers = computed(() => {
  const emp = employee.value
  return {
    l1Name: emp?._supervisorName || 'First-level approver',
    l2Name: emp?._secondSupervisorName || 'Second-level approver',
  }
})

function formatHours(value) {
  const number = Number(value)
  if (!Number.isFinite(number)) return '0.0'
  return Number.isInteger(number) ? number.toFixed(1) : number.toFixed(2).replace(/0$/, '')
}

function formatAction(value) {
  return value === 'approved' ? 'Approved' : 'Rejected'
}

function formatDateTime(value) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'

  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

function approverName(record) {
  const approver = Array.isArray(record?.approver) ? record.approver[0] : record?.approver
  return approver?.full_name || 'Approver'
}

function clearMessages() {
  pageError.value = ''
  actionError.value = ''
  actionSuccess.value = ''
}

async function loadDetail() {
  loading.value = true
  pageError.value = ''
  actionError.value = ''

  try {
    await authStore.initialize()

    if (!timesheetId.value) {
      throw new Error('No timesheet id was provided.')
    }

    const client = getSupabase()
    const { data: timesheetData, error: timesheetError } = await client
      .from('timesheets')
      .select(`
        id,
        profile_id,
        week_start,
        week_end,
        status,
        submitted_at,
        employee_note,
        total_hours,
        created_at,
        updated_at,
        employee:profiles!timesheets_profile_id_fkey (
          id,
          full_name,
          employee_code,
          department_id,
          supervisor_id,
          second_supervisor_id,
          department:departments!profiles_department_id_fkey (
            id,
            name
          )
        )
      `)
      .eq('id', timesheetId.value)
      .maybeSingle()

    if (timesheetError) {
      throw new Error(timesheetError.message || 'Unable to load the timesheet.')
    }

    if (!timesheetData) {
      timesheet.value = null
      entries.value = []
      records.value = []
      return
    }

    // 单独查询主管姓名，避免 profiles 自连接歧义
    const emp = timesheetData.employee
    const supervisorIds = [emp?.supervisor_id, emp?.second_supervisor_id].filter(Boolean)
    let supervisorMap = {}

    if (supervisorIds.length) {
      const { data: supData } = await client
        .from('profiles')
        .select('id, full_name')
        .in('id', supervisorIds)

      if (supData) {
        supervisorMap = Object.fromEntries(supData.map((p) => [p.id, p.full_name]))
      }
    }

    // 将主管姓名挂到 employee 对象上，供 approvers computed 使用
    if (timesheetData.employee) {
      timesheetData.employee._supervisorName =
        supervisorMap[emp.supervisor_id] || null
      timesheetData.employee._secondSupervisorName =
        supervisorMap[emp.second_supervisor_id] || null
    }

    const [entriesResult, recordsResult] = await Promise.all([
      client
        .from('time_entries')
        .select(`
          id,
          profile_id,
          work_date,
          project_id,
          role_in_project,
          work_type,
          task_nature,
          module_id,
          jira_ticket,
          hours,
          description,
          timesheet_id,
          created_at,
          updated_at,
          projects:project_id ( id, name, code ),
          modules:module_id ( id, name )
        `)
        .eq('timesheet_id', timesheetData.id)
        .order('work_date', { ascending: true })
        .order('created_at', { ascending: true }),
      client
        .from('approval_records')
        .select(`
          id,
          timesheet_id,
          approver_id,
          level,
          action,
          comment,
          acted_at,
          approver:profiles!approval_records_approver_id_fkey (
            id,
            full_name,
            employee_code
          )
        `)
        .eq('timesheet_id', timesheetData.id)
        .order('acted_at', { ascending: true }),
    ])

    if (entriesResult.error) {
      throw new Error(entriesResult.error.message || 'Unable to load the time entries.')
    }

    if (recordsResult.error) {
      throw new Error(recordsResult.error.message || 'Unable to load approval history.')
    }

    timesheet.value = timesheetData
    entries.value = entriesResult.data || []
    records.value = recordsResult.data || []
  } catch (error) {
    timesheet.value = null
    entries.value = []
    records.value = []
    pageError.value = error.message || 'Unable to load approval detail.'
  } finally {
    loading.value = false
  }
}

async function returnToInbox() {
  await router.push({ name: 'approval-inbox' })
}

async function act(action) {
  clearMessages()

  if (!timesheet.value?.id || !currentAction.value) return

  if (action === 'rejected' && !approvalComment.value.trim()) {
    actionError.value = 'A rejection comment is required before rejecting this timesheet.'
    return
  }

  actionLoading.value = true

  try {
    const client = getSupabase()
    const { data, error } = await client.rpc('act_on_timesheet', {
      p_timesheet_id: timesheet.value.id,
      p_action: action,
      p_comment: approvalComment.value.trim() || null,
    })

    if (error) {
      throw new Error(error.message || 'Unable to record this approval action.')
    }

    const updated = Array.isArray(data) ? data[0] : data
    const nextStatus = updated?.status || (action === 'rejected' ? 'rejected' : 'approved_l1')

    actionSuccess.value = action === 'rejected'
      ? 'Timesheet rejected and returned to the employee.'
      : nextStatus === 'approved_l2'
        ? 'Final approval recorded. This timesheet is complete.'
        : 'First-level approval recorded. The timesheet now awaits second-level review.'

    // toast.success(`Timesheet ${action === 'approved' ? 'approved' : 'rejected'} successfully.`)

    approvalComment.value = ''
    await loadDetail()
  } catch (error) {
    actionError.value = error.message || 'Unable to record this approval action.'
  } finally {
    actionLoading.value = false
  }
}

watch(timesheetId, async () => {
  await loadDetail()
}, { immediate: true })
</script>

<template>
  <section class="page-section approval-detail-page">
    <div class="page-head">
      <div>
        <h1>Timesheet Approval Detail</h1>
        <p>Review weekly entries, approval history and supporting comments.</p>
      </div>

      <div class="page-head-actions">
        <button class="btn" type="button" :disabled="actionLoading" @click="returnToInbox">Back to Inbox</button>
      </div>
    </div>

    <div v-if="pageError" class="message message-error" role="alert">{{ pageError }}</div>

    <section v-else-if="loading" class="card approval-detail-loading" role="status">
      Loading timesheet approval detail…
    </section>

    <section v-else-if="isMissing" class="card approval-detail-empty">
      <h2>Timesheet unavailable</h2>
      <p>This timesheet does not exist or your role is not allowed to view it.</p>
      <button class="btn primary" type="button" @click="returnToInbox">Return to Inbox</button>
    </section>

    <template v-else>
      <div v-if="actionError" class="message message-error" role="alert">{{ actionError }}</div>
      <div v-if="actionSuccess" class="message message-success" role="status">{{ actionSuccess }}</div>

      <section class="card approval-detail-card">
        <div class="approval-detail-summary">
          <div>
            <span>Employee</span>
            <strong>{{ employee.full_name || 'Unknown employee' }}</strong>
            <small>{{ employee.employee_code || '—' }}</small>
          </div>
          <div>
            <span>Department</span>
            <strong>{{ department.name || 'Not assigned' }}</strong>
          </div>
          <div>
            <span>Period</span>
            <strong>{{ weekRange }}</strong>
          </div>
          <div>
            <span>Weekly Total</span>
            <strong>{{ formatHours(timesheet.total_hours) }} Hours</strong>
          </div>
          <div class="approval-detail-status">
            <span>Current Status</span>
            <StatusBadge :status="currentStatus" />
          </div>
        </div>

        <ApprovalStepper :timesheet="timesheet" :records="records" :approvers="approvers" />
      </section>

      <section class="card approval-detail-entries-card">
        <div class="approval-detail-section-heading">
          <div>
            <h2>Weekly Time Entries</h2>
            <p>Entries are grouped by work date and are read-only during review.</p>
          </div>
          <span class="pill">{{ formatHours(timesheet.total_hours) }} Hours</span>
        </div>

        <div class="approval-day-groups">
          <section v-for="group in dailyGroups" :key="group.date" class="approval-day-group">
            <div class="approval-day-heading">
              <h3>{{ formatDisplayDate(group.date) }}</h3>
              <span class="pill">{{ formatHours(group.total) }} Hours</span>
            </div>
            <EntriesTable
              :entries="group.entries"
              :readonly="true"
              :show-description="true"
              :empty-message="'No time entries recorded for this date.'"
            />
          </section>
        </div>
      </section>

      <section class="approval-detail-lower-grid">
        <section class="card approval-note-card">
          <h2>Employee Note</h2>
          <p>{{ timesheet.employee_note || 'No submission note was provided.' }}</p>
        </section>

        <section class="card approval-history-card">
          <h2>Approval History</h2>
          <div v-if="!records.length" class="approval-history-empty">No approval action has been recorded yet.</div>
          <ol v-else class="approval-history-list">
            <li v-for="record in records" :key="record.id">
              <div class="approval-history-title">
                <StatusBadge :status="record.action === 'approved' ? 'approved' : 'rejected'" compact />
                <strong>Level {{ record.level }} · {{ formatAction(record.action) }}</strong>
              </div>
              <span>{{ approverName(record) }} · {{ formatDateTime(record.acted_at) }}</span>
              <p>{{ record.comment || 'No comment recorded.' }}</p>
            </li>
          </ol>
        </section>
      </section>

      <section class="card approval-action-card">
        <template v-if="currentAction">
          <div class="approval-action-heading">
            <div>
              <h2>Approval Decision</h2>
              <p>{{ currentAction.intro }}</p>
            </div>
            <StatusBadge :status="currentStatus" />
          </div>

          <div class="field">
            <label for="approval-comment">Approval comment</label>
            <textarea
              id="approval-comment"
              v-model="approvalComment"
              class="textarea"
              maxlength="1000"
              placeholder="Optional for approval; required when rejecting."
              :disabled="actionLoading"
            ></textarea>
            <span class="hint">Comments become part of the permanent approval history.</span>
          </div>

          <div class="approval-action-buttons">
            <button class="btn danger" type="button" :disabled="actionLoading" @click="act('rejected')">
              <span v-if="actionLoading" class="btn-spinner"></span>
              Reject Timesheet
            </button>
            <button class="btn primary" type="button" :disabled="actionLoading" @click="act('approved')">
              <span v-if="actionLoading" class="btn-spinner"></span>
              {{ actionLoading ? 'Saving...' : currentAction.approveLabel }}
            </button>
          </div>
        </template>

        <template v-else>
          <div class="approval-action-heading">
            <div>
              <h2>Approval Decision</h2>
              <p>{{ actionUnavailableMessage }}</p>
            </div>
            <StatusBadge :status="currentStatus" />
          </div>
        </template>
      </section>
    </template>
  </section>
</template>
