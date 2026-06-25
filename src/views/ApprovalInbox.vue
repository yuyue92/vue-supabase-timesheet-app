<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import StatusBadge from '@/components/StatusBadge.vue'
import { getSupabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth'
import { formatDisplayDate, formatWeekRange } from '@/utils/date'

const router = useRouter()
const authStore = useAuthStore()

const pageSize = 20
const rows = ref([])
const departments = ref([])
const loading = ref(true)
const filterLoading = ref(false)
const batchLoading = ref(false)
const pageError = ref('')
const actionError = ref('')
const actionSuccess = ref('')
const totalCount = ref(0)
const currentPage = ref(1)
const selectedIds = ref([])
const batchComment = ref('')

const filters = reactive({
  tab: 'pending',
  departmentId: '',
  employeeKeyword: '',
  startDate: '',
  endDate: '',
})

const statusTabs = [
  { value: 'pending', label: 'Action Required' },
  { value: 'submitted', label: 'Pending L1' },
  { value: 'approved_l1', label: 'Pending L2' },
  { value: 'approved_l2', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
]

const totalPages = computed(() => Math.max(1, Math.ceil(totalCount.value / pageSize)))
const pageStart = computed(() => (totalCount.value === 0 ? 0 : (currentPage.value - 1) * pageSize + 1))
const pageEnd = computed(() => Math.min(currentPage.value * pageSize, totalCount.value))

const selectedRows = computed(() => rows.value.filter((row) => selectedIds.value.includes(row.id)))
const selectableRows = computed(() => rows.value.filter((row) => isActionable(row)))
const allSelectableSelected = computed(
  () => selectableRows.value.length > 0 && selectableRows.value.every((row) => selectedIds.value.includes(row.id)),
)

function employeeOf(row) {
  if (Array.isArray(row?.employee)) {
    return row.employee[0] || {}
  }

  return row?.employee || {}
}

function departmentOf(row) {
  const employee = employeeOf(row)
  if (Array.isArray(employee.department)) {
    return employee.department[0] || {}
  }

  return employee.department || {}
}

function formatHours(value) {
  const number = Number(value)
  if (!Number.isFinite(number)) return '0.0'
  return Number.isInteger(number) ? number.toFixed(1) : number.toFixed(2).replace(/0$/, '')
}

function formatSubmittedAt(value) {
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

function statusValues() {
  if (filters.tab === 'pending') {
    return ['submitted', 'approved_l1']
  }

  return [filters.tab]
}

function currentUserId() {
  return authStore.user?.id || ''
}

function isActionable(row) {
  const employee = employeeOf(row)
  const userId = currentUserId()

  if (!row?.id || !userId) return false

  if (authStore.isAdmin) {
    return ['submitted', 'approved_l1'].includes(row.status)
  }

  if (row.status === 'submitted') {
    return employee.supervisor_id === userId
  }

  if (row.status === 'approved_l1') {
    return employee.second_supervisor_id === userId
  }

  return false
}

function actionLabel(row) {
  if (!isActionable(row)) return 'View'
  return row.status === 'approved_l1' ? 'Review L2' : 'Review L1'
}

function rowStatusHint(row) {
  if (isActionable(row)) {
    return row.status === 'approved_l1'
      ? 'You are the second-level approver.'
      : 'You are the first-level approver.'
  }

  if (row.status === 'approved_l2') return 'Final approval complete.'
  if (row.status === 'rejected') return 'Returned to the employee for changes.'
  if (row.status === 'approved_l1') return 'Waiting for the assigned second-level approver.'
  return 'Waiting for the assigned first-level approver.'
}

function clearMessages() {
  pageError.value = ''
  actionError.value = ''
  actionSuccess.value = ''
}

async function loadDepartments() {
  const client = getSupabase()
  const { data, error } = await client
    .from('departments')
    .select('id, name')
    .order('name', { ascending: true })

  if (error) {
    throw new Error(error.message || 'Unable to load departments.')
  }

  departments.value = data || []
}

async function loadRows({ preservePage = true } = {}) {
  filterLoading.value = true
  pageError.value = ''
  actionError.value = ''

  try {
    await authStore.initialize()

    const client = getSupabase()
    const offset = (currentPage.value - 1) * pageSize

    let query = client
      .from('timesheets')
      .select(
        `
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
        `,
        { count: 'exact' },
      )
      .in('status', statusValues())

    if (filters.departmentId) {
      query = query.eq('employee.department_id', filters.departmentId)
    }

    if (filters.employeeKeyword.trim()) {
      query = query.ilike('employee.full_name', `%${filters.employeeKeyword.trim()}%`)
    }

    if (filters.startDate) {
      query = query.gte('week_start', filters.startDate)
    }

    if (filters.endDate) {
      query = query.lte('week_end', filters.endDate)
    }

    const { data, error, count } = await query
      .order('submitted_at', { ascending: false, nullsFirst: false })
      .order('week_start', { ascending: false })
      .range(offset, offset + pageSize - 1)

    if (error) {
      throw new Error(error.message || 'Unable to load approval records.')
    }

    totalCount.value = count || 0

    if (preservePage && currentPage.value > totalPages.value) {
      currentPage.value = totalPages.value
      return await loadRows({ preservePage: false })
    }

    rows.value = data || []
    selectedIds.value = []
  } catch (error) {
    rows.value = []
    totalCount.value = 0
    selectedIds.value = []
    pageError.value = error.message || 'Unable to load the approval inbox.'
  } finally {
    filterLoading.value = false
    loading.value = false
  }
}

async function applyFilters() {
  currentPage.value = 1
  await loadRows({ preservePage: false })
}

async function resetFilters() {
  filters.tab = 'pending'
  filters.departmentId = ''
  filters.employeeKeyword = ''
  filters.startDate = ''
  filters.endDate = ''
  currentPage.value = 1
  await loadRows({ preservePage: false })
}

async function setTab(tab) {
  if (filters.tab === tab) return
  filters.tab = tab
  currentPage.value = 1
  await loadRows({ preservePage: false })
}

function isSelected(id) {
  return selectedIds.value.includes(id)
}

function toggleRow(id, checked) {
  if (!id) return

  if (checked) {
    selectedIds.value = [...new Set([...selectedIds.value, id])]
  } else {
    selectedIds.value = selectedIds.value.filter((selectedId) => selectedId !== id)
  }
}

function toggleAllSelectable(checked) {
  selectedIds.value = checked ? selectableRows.value.map((row) => row.id) : []
}

async function goToPage(page) {
  const target = Math.min(Math.max(1, page), totalPages.value)
  if (target === currentPage.value || filterLoading.value || batchLoading.value) return
  currentPage.value = target
  await loadRows()
}

async function reviewTimesheet(row) {
  if (!row?.id) return

  await router.push({
    name: 'approval-detail',
    params: { id: row.id },
  })
}

async function approveSelected() {
  clearMessages()

  if (!selectedIds.value.length) {
    actionError.value = 'Select one or more timesheets that you are allowed to approve.'
    return
  }

  batchLoading.value = true

  try {
    const client = getSupabase()
    const { data, error } = await client.rpc('bulk_approve_timesheets', {
      p_timesheet_ids: selectedIds.value,
      p_comment: batchComment.value.trim() || null,
    })

    if (error) {
      throw new Error(error.message || 'Unable to approve the selected timesheets.')
    }

    actionSuccess.value = `${Number(data || selectedIds.value.length)} timesheet(s) approved successfully.`
    batchComment.value = ''
    await loadRows()
  } catch (error) {
    actionError.value = error.message || 'Unable to approve the selected timesheets.'
  } finally {
    batchLoading.value = false
  }
}

onMounted(async () => {
  loading.value = true

  try {
    await authStore.initialize()
    await loadDepartments()
  } catch (error) {
    pageError.value = error.message || 'Unable to prepare the approval inbox.'
  }

  await loadRows({ preservePage: false })
})
</script>

<template>
  <section class="page-section approval-inbox-page">
    <div class="page-head">
      <div>
        <h1>Approval Inbox</h1>
        <p>Review weekly timesheets that are visible to your approval role.</p>
      </div>
    </div>

    <div v-if="pageError" class="message message-error" role="alert">
      {{ pageError }}
    </div>
    <div v-if="actionError" class="message message-error" role="alert">
      {{ actionError }}
    </div>
    <div v-if="actionSuccess" class="message message-success" role="status">
      {{ actionSuccess }}
    </div>

    <section class="card approval-filter-card" :aria-busy="filterLoading">
      <div class="approval-tabs" role="tablist" aria-label="Approval status">
        <button
          v-for="tab in statusTabs"
          :key="tab.value"
          class="approval-tab"
          :class="{ 'is-active': filters.tab === tab.value }"
          type="button"
          role="tab"
          :aria-selected="filters.tab === tab.value"
          :disabled="filterLoading || batchLoading"
          @click="setTab(tab.value)"
        >
          {{ tab.label }}
        </button>
      </div>

      <form class="approval-filter-grid" @submit.prevent="applyFilters">
        <div class="field">
          <label for="approval-start-date">Start date</label>
          <input id="approval-start-date" v-model="filters.startDate" class="input" type="date" :disabled="filterLoading || batchLoading" />
        </div>

        <div class="field">
          <label for="approval-end-date">End date</label>
          <input id="approval-end-date" v-model="filters.endDate" class="input" type="date" :disabled="filterLoading || batchLoading" />
        </div>

        <div class="field">
          <label for="approval-department">Department</label>
          <select id="approval-department" v-model="filters.departmentId" class="select" :disabled="filterLoading || batchLoading">
            <option value="">All departments</option>
            <option v-for="department in departments" :key="department.id" :value="department.id">
              {{ department.name }}
            </option>
          </select>
        </div>

        <div class="field">
          <label for="approval-employee">Employee</label>
          <input
            id="approval-employee"
            v-model="filters.employeeKeyword"
            class="input"
            type="search"
            placeholder="Search employee name..."
            :disabled="filterLoading || batchLoading"
          />
        </div>

        <div class="approval-filter-actions">
          <button class="btn" type="button" :disabled="filterLoading || batchLoading" @click="resetFilters">Reset</button>
          <button class="btn primary" type="submit" :disabled="filterLoading || batchLoading">
            {{ filterLoading ? 'Loading...' : 'Apply Filters' }}
          </button>
        </div>
      </form>
    </section>

    <section class="card approval-list-card">
      <div class="approval-list-heading">
        <div>
          <h2>Timesheets</h2>
          <p>Only timesheets permitted by your current role are returned.</p>
        </div>
        <span class="pill">{{ totalCount }} record{{ totalCount === 1 ? '' : 's' }}</span>
      </div>

      <div class="approval-table-wrap">
        <div v-if="loading || filterLoading" class="table-state" role="status">Loading approval inbox…</div>

        <div v-else-if="!rows.length" class="table-state table-state--empty">
          No timesheets match the selected status and filters.
        </div>

        <table v-else class="approval-table">
          <thead>
            <tr>
              <th class="approval-checkbox-cell">
                <input
                  type="checkbox"
                  :checked="allSelectableSelected"
                  :disabled="!selectableRows.length || batchLoading"
                  aria-label="Select all actionable timesheets on this page"
                  @change="toggleAllSelectable($event.target.checked)"
                />
              </th>
              <th>Employee</th>
              <th>Department</th>
              <th>Period</th>
              <th class="num">Hours</th>
              <th>Submitted</th>
              <th>Status</th>
              <th class="approval-action-head">Action</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in rows" :key="row.id">
              <td class="approval-checkbox-cell">
                <input
                  type="checkbox"
                  :checked="isSelected(row.id)"
                  :disabled="!isActionable(row) || batchLoading"
                  :aria-label="`Select ${employeeOf(row).full_name || 'timesheet'}`"
                  @change="toggleRow(row.id, $event.target.checked)"
                />
              </td>
              <td>
                <strong class="approval-employee-name">{{ employeeOf(row).full_name || 'Unknown employee' }}</strong>
                <small>{{ employeeOf(row).employee_code || '—' }}</small>
              </td>
              <td>{{ departmentOf(row).name || 'Not assigned' }}</td>
              <td>{{ formatWeekRange(row.week_start) }}</td>
              <td class="num approval-hours">{{ formatHours(row.total_hours) }}</td>
              <td>{{ formatSubmittedAt(row.submitted_at) }}</td>
              <td>
                <StatusBadge :status="row.status" compact />
                <small class="approval-status-hint">{{ rowStatusHint(row) }}</small>
              </td>
              <td class="approval-action-cell">
                <button class="text-button" type="button" :disabled="batchLoading" @click="reviewTimesheet(row)">
                  {{ actionLabel(row) }}
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="approval-list-footer">
        <div class="approval-batch-tools">
          <strong>Selected: {{ selectedRows.length }}</strong>
          <input
            v-model="batchComment"
            class="input approval-batch-comment"
            type="text"
            maxlength="1000"
            placeholder="Optional approval comment for all selected..."
            :disabled="!selectedRows.length || batchLoading"
          />
          <button
            class="btn primary"
            type="button"
            :disabled="!selectedRows.length || batchLoading"
            @click="approveSelected"
          >
            {{ batchLoading ? 'Approving...' : 'Approve Selected' }}
          </button>
        </div>

        <div class="pagination" aria-label="Approval inbox pagination">
          <span>{{ pageStart }}–{{ pageEnd }} of {{ totalCount }}</span>
          <button class="btn btn-small" type="button" :disabled="currentPage <= 1 || filterLoading || batchLoading" @click="goToPage(currentPage - 1)">
            Previous
          </button>
          <span>Page {{ currentPage }} / {{ totalPages }}</span>
          <button class="btn btn-small" type="button" :disabled="currentPage >= totalPages || filterLoading || batchLoading" @click="goToPage(currentPage + 1)">
            Next
          </button>
        </div>
      </div>
    </section>
  </section>
</template>
