<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { getSupabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth'
import { formatDisplayDate, toIsoDate } from '@/utils/date'

const EXPORT_WARN_THRESHOLD = 10000
const authStore = useAuthStore()
const pageSize = 20

function firstDayOfCurrentMonth() {
  const today = new Date()
  return toIsoDate(new Date(today.getFullYear(), today.getMonth(), 1))
}

function lastDayOfCurrentMonth() {
  const today = new Date()
  return toIsoDate(new Date(today.getFullYear(), today.getMonth() + 1, 0))
}

const filters = reactive({
  startDate: firstDayOfCurrentMonth(),
  endDate: lastDayOfCurrentMonth(),
  projectId: '',
  departmentId: '',
  profileId: '',
  moduleId: '',
  workType: '',
  taskNature: '',
  ticketKeyword: '',
})

const projects = ref([])
const departments = ref([])
const profiles = ref([])
const modules = ref([])
const summary = ref({
  total_hours: 0,
  project_hours: 0,
  internal_hours: 0,
  employee_count: 0,
})
const projectSummary = ref([])
const rows = ref([])
const totalCount = ref(0)
const currentPage = ref(1)
const loading = ref(true)
const filterLoading = ref(false)
const exportLoading = ref(false)
const pageError = ref('')
const exportError = ref('')
const exportSuccess = ref('')

const workTypeOptions = [
  { value: 'project', label: 'Project' },
  { value: 'bau', label: 'BAU' },
  { value: 'internal', label: 'Internal' },
  { value: 'leave', label: 'Leave' },
]

const taskNatureOptions = [
  { value: 'development', label: 'Development' },
  { value: 'bug_fix', label: 'Bug Fix' },
  { value: 'testing', label: 'Testing' },
  { value: 'meeting', label: 'Meeting' },
  { value: 'analysis', label: 'Analysis' },
  { value: 'support', label: 'Support' },
  { value: 'documentation', label: 'Documentation' },
  { value: 'training', label: 'Training' },
  { value: 'leave', label: 'Leave' },
]

const selectedProjectModules = computed(() => {
  if (!filters.projectId) return modules.value
  return modules.value.filter((module) => module.project_id === filters.projectId)
})

const maxProjectHours = computed(() => {
  const values = projectSummary.value.map((item) => Number(item.total_hours) || 0)
  return Math.max(1, ...values)
})

const totalPages = computed(() => Math.max(1, Math.ceil(totalCount.value / pageSize)))
const pageStart = computed(() => (totalCount.value === 0 ? 0 : (currentPage.value - 1) * pageSize + 1))
const pageEnd = computed(() => Math.min(currentPage.value * pageSize, totalCount.value))

function number(value) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function formatHours(value) {
  const valueAsNumber = number(value)
  return valueAsNumber.toLocaleString('en-GB', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 2,
  })
}

function labelFor(options, value) {
  return options.find((option) => option.value === value)?.label || value || '—'
}

function buildRpcArgs() {
  return {
    p_start: filters.startDate,
    p_end: filters.endDate,
    p_project_id: filters.projectId || null,
    p_dept_id: filters.departmentId || null,
    p_profile_id: filters.profileId || null,
    p_module_id: filters.moduleId || null,
    p_work_type: filters.workType || null,
    p_task_nature: filters.taskNature || null,
    p_ticket_keyword: filters.ticketKeyword.trim() || null,
  }
}

function validateDateRange() {
  if (!filters.startDate || !filters.endDate) {
    throw new Error('Select both a start date and an end date.')
  }

  if (filters.startDate > filters.endDate) {
    throw new Error('The start date cannot be later than the end date.')
  }
}

function loadVisibleProfiles(client) {
  const query = client
    .from('profiles')
    .select('id, full_name, employee_code, department_id, role, status')
    .eq('status', 'active')
    .order('full_name', { ascending: true })

  // 普通员工只能按自己筛选，无需展示全员下拉
  if (authStore.role === 'employee') {
    return query.eq('id', authStore.user.id)
  }

  // 主管只能查看直接下属（如需更严格可扩展为 supervisor_id = authStore.user.id）
  // admin / project_manager 保留全员可见
  return query
}

async function loadFilterOptions() {
  const client = getSupabase()

  const [projectsResponse, departmentsResponse, profilesResponse, modulesResponse] = await Promise.all([
    client.from('projects').select('id, name, code, status').order('name', { ascending: true }),
    client.from('departments').select('id, name, parent_id').order('name', { ascending: true }),
    loadVisibleProfiles(client),
    client.from('modules').select('id, project_id, name').order('name', { ascending: true }),
  ])

  const firstError = [
    projectsResponse.error,
    departmentsResponse.error,
    profilesResponse.error,
    modulesResponse.error,
  ].find(Boolean)

  if (firstError) {
    throw new Error(firstError.message || 'Unable to load report filters.')
  }

  projects.value = projectsResponse.data || []
  departments.value = departmentsResponse.data || []
  profiles.value = profilesResponse.data || []
  modules.value = modulesResponse.data || []
}

async function loadSummary() {
  const client = getSupabase()
  const args = buildRpcArgs()

  const [kpiResponse, projectResponse] = await Promise.all([
    client.rpc('get_report_kpis', args),
    client.rpc('get_report_project_summary', args),
  ])

  if (kpiResponse.error) {
    throw new Error(
      kpiResponse.error.message ||
        'Unable to load report KPI data. Run the Step 8 report SQL migration first.',
    )
  }

  if (projectResponse.error) {
    throw new Error(
      projectResponse.error.message ||
        'Unable to load project summary data. Run the Step 8 report SQL migration first.',
    )
  }

  summary.value = kpiResponse.data?.[0] || {
    total_hours: 0,
    project_hours: 0,
    internal_hours: 0,
    employee_count: 0,
  }
  projectSummary.value = projectResponse.data || []
}

async function loadRows({ preservePage = true } = {}) {
  const client = getSupabase()
  const offset = (currentPage.value - 1) * pageSize
  const { data, error, count } = await client
    .rpc('get_approved_time_entry_details', buildRpcArgs(), { count: 'exact' })
    .range(offset, offset + pageSize - 1)

  if (error) {
    throw new Error(error.message || 'Unable to load approved time-entry records.')
  }

  totalCount.value = count || 0

  if (preservePage && currentPage.value > totalPages.value) {
    currentPage.value = totalPages.value
    return loadRows({ preservePage: false })
  }

  rows.value = data || []
}

async function loadReport({ preservePage = true } = {}) {
  filterLoading.value = true
  pageError.value = ''
  exportError.value = ''
  exportSuccess.value = ''

  try {
    validateDateRange()
    await Promise.all([loadSummary(), loadRows({ preservePage })])
  } catch (error) {
    summary.value = {
      total_hours: 0,
      project_hours: 0,
      internal_hours: 0,
      employee_count: 0,
    }
    projectSummary.value = []
    rows.value = []
    totalCount.value = 0
    pageError.value = error.message || 'Unable to load the report.'
  } finally {
    filterLoading.value = false
    loading.value = false
  }
}

async function applyFilters() {
  currentPage.value = 1
  await loadReport({ preservePage: false })
}

async function resetFilters() {
  filters.startDate = firstDayOfCurrentMonth()
  filters.endDate = lastDayOfCurrentMonth()
  filters.projectId = ''
  filters.departmentId = ''
  filters.profileId = ''
  filters.moduleId = ''
  filters.workType = ''
  filters.taskNature = ''
  filters.ticketKeyword = ''
  currentPage.value = 1
  await loadReport({ preservePage: false })
}

function onProjectChange() {
  if (
    filters.moduleId &&
    !selectedProjectModules.value.some((module) => module.id === filters.moduleId)
  ) {
    filters.moduleId = ''
  }
}

async function goToPage(page) {
  const target = Math.min(Math.max(1, page), totalPages.value)

  if (target === currentPage.value || filterLoading.value) return

  currentPage.value = target
  await loadReport()
}

function escapeCsv(value) {
  const text = String(value ?? '')
  return `"${text.replace(/"/g, '""')}"`
}

function buildCsv(rowsToExport) {
  const headers = [
    'Employee',
    'Employee Code',
    'Department',
    'Date',
    'Project',
    'Module',
    'Role',
    'Work Type',
    'Task Nature',
    'Jira Ticket',
    'Hours',
    'Description',
  ]

  const lines = rowsToExport.map((row) => [
    row.employee_name,
    row.employee_code,
    row.department_name,
    formatDisplayDate(row.work_date),
    row.project_name,
    row.module_name || '',
    row.role_in_project,
    labelFor(workTypeOptions, row.work_type),
    labelFor(taskNatureOptions, row.task_nature),
    row.jira_ticket || '',
    formatHours(row.hours),
    row.description || '',
  ])

  return [headers, ...lines].map((line) => line.map(escapeCsv).join(',')).join('\r\n')
}

async function fetchAllRowsForExport() {
  const client = getSupabase()
  const batchSize = 1000
  const maxRows = 50000
  const exportedRows = []
  let from = 0

  while (from < maxRows) {
    const { data, error } = await client
      .rpc('get_approved_time_entry_details', buildRpcArgs())
      .range(from, from + batchSize - 1)

    if (error) {
      throw new Error(error.message || 'Unable to load report records for export.')
    }

    const batch = data || []
    exportedRows.push(...batch)

    if (batch.length < batchSize) {
      return exportedRows
    }

    from += batchSize
  }

  throw new Error(
    `Export stopped: result set exceeds 50,000 rows (current filter returns ${totalCount.value.toLocaleString()} records). ` +
    'Narrow the date range, project or department filter and try again.',
  )
}

async function exportCsv() {
  exportLoading.value = true
  exportError.value = ''
  exportSuccess.value = ''

  try {
    validateDateRange()
    const records = await fetchAllRowsForExport()
    const csv = `\uFEFF${buildCsv(records)}`
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    const filename = `project-hours-${filters.startDate}-to-${filters.endDate}.csv`

    link.href = url
    link.download = filename
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)

    exportSuccess.value = `${records.length} approved record(s) exported to ${filename}.`
  } catch (error) {
    exportError.value = error.message || 'Unable to export the report.'
  } finally {
    exportLoading.value = false
  }
}

onMounted(async () => {
  loading.value = true

  try {
    await authStore.initialize()
    await loadFilterOptions()
  } catch (error) {
    pageError.value = error.message || 'Unable to prepare report filters.'
    loading.value = false
    return
  }

  await loadReport({ preservePage: false })
})
</script>

<template>
  <section class="page-section report-page">
    <div class="page-head">
      <div>
        <h1>Project Hours Report</h1>
        <p>Analyse approved working hours by project, team, employee and task category.</p>
      </div>
      <div class="head-actions">
        <span v-if="totalCount > EXPORT_WARN_THRESHOLD" class="hint" style="color: var(--amber)">
        {{ totalCount.toLocaleString() }} records — consider narrowing filters before exporting.
      </span>
      <span v-else-if="totalCount > 0" class="hint">
        {{ totalCount.toLocaleString() }} records ready to export.
      </span>
        <button class="btn" type="button" :disabled="exportLoading || filterLoading" @click="exportCsv">
          {{ exportLoading ? 'Preparing CSV…' : 'Export CSV' }}
        </button>
      </div>
    </div>

    <div v-if="pageError" class="message message-error" role="alert">
      {{ pageError }}
    </div>
    <div v-if="exportError" class="message message-error" role="alert">
      {{ exportError }}
    </div>
    <div v-if="exportSuccess" class="message message-success" role="status">
      {{ exportSuccess }}
    </div>

    <section class="card report-filters-card" aria-label="Report filters">
      <div class="report-filter-grid">
        <div class="field">
          <label for="report-start-date">Start date</label>
          <input id="report-start-date" v-model="filters.startDate" class="input" type="date" />
        </div>

        <div class="field">
          <label for="report-end-date">End date</label>
          <input id="report-end-date" v-model="filters.endDate" class="input" type="date" />
        </div>

        <div class="field">
          <label for="report-project">Project</label>
          <select id="report-project" v-model="filters.projectId" class="select" @change="onProjectChange">
            <option value="">All projects</option>
            <option v-for="project in projects" :key="project.id" :value="project.id">
              {{ project.name }} ({{ project.code }})
            </option>
          </select>
        </div>

        <div class="field">
          <label for="report-department">Department</label>
          <select id="report-department" v-model="filters.departmentId" class="select">
            <option value="">All departments</option>
            <option v-for="department in departments" :key="department.id" :value="department.id">
              {{ department.name }}
            </option>
          </select>
        </div>

        <div class="field">
          <label for="report-employee">Employee</label>
          <select id="report-employee" v-model="filters.profileId" class="select">
            <option value="">{{ authStore.role === 'employee' ? 'Only your own records' : 'All employees visible to you' }}</option>
            <option v-for="profile in profiles" :key="profile.id" :value="profile.id">
              {{ profile.full_name }} · {{ profile.employee_code }}
            </option>
          </select>
        </div>

        <div class="field">
          <label for="report-module">Module</label>
          <select id="report-module" v-model="filters.moduleId" class="select">
            <option value="">All modules</option>
            <option v-for="module in selectedProjectModules" :key="module.id" :value="module.id">
              {{ module.name }}
            </option>
          </select>
        </div>

        <div class="field">
          <label for="report-work-type">Work type</label>
          <select id="report-work-type" v-model="filters.workType" class="select">
            <option value="">All work types</option>
            <option v-for="option in workTypeOptions" :key="option.value" :value="option.value">
              {{ option.label }}
            </option>
          </select>
        </div>

        <div class="field">
          <label for="report-task-nature">Task nature</label>
          <select id="report-task-nature" v-model="filters.taskNature" class="select">
            <option value="">All task natures</option>
            <option v-for="option in taskNatureOptions" :key="option.value" :value="option.value">
              {{ option.label }}
            </option>
          </select>
        </div>

        <div class="field report-ticket-field">
          <label for="report-ticket">Jira ticket</label>
          <input
            id="report-ticket"
            v-model="filters.ticketKeyword"
            class="input"
            type="search"
            placeholder="Search ticket number..."
            @keyup.enter="applyFilters"
          />
        </div>
      </div>

      <div class="report-filter-actions">
        <button class="btn primary" type="button" :disabled="filterLoading" @click="applyFilters">
          {{ filterLoading ? 'Loading…' : 'Apply filters' }}
        </button>
        <button class="btn ghost" type="button" :disabled="filterLoading" @click="resetFilters">
          Reset
        </button>
      </div>
    </section>

    <div v-if="loading" class="report-loading" role="status">Loading approved-hours report…</div>

    <template v-else>
      <section class="report-kpi-grid" aria-label="Report summary">
        <article class="summary-stat">
          <div class="label">Total Approved Hours</div>
          <div class="value">{{ formatHours(summary.total_hours) }}h</div>
          <div class="small">{{ formatDisplayDate(filters.startDate) }} – {{ formatDisplayDate(filters.endDate) }}</div>
        </article>
        <article class="summary-stat">
          <div class="label">Project Hours</div>
          <div class="value">{{ formatHours(summary.project_hours) }}h</div>
          <div class="small">
            {{ summary.total_hours ? `${((number(summary.project_hours) / number(summary.total_hours)) * 100).toFixed(1)}% of total` : '0.0% of total' }}
          </div>
        </article>
        <article class="summary-stat">
          <div class="label">Internal Hours</div>
          <div class="value">{{ formatHours(summary.internal_hours) }}h</div>
          <div class="small">
            {{ summary.total_hours ? `${((number(summary.internal_hours) / number(summary.total_hours)) * 100).toFixed(1)}% of total` : '0.0% of total' }}
          </div>
        </article>
        <article class="summary-stat">
          <div class="label">Employees</div>
          <div class="value">{{ number(summary.employee_count) }}</div>
          <div class="small">Approved data only</div>
        </article>
      </section>

      <section class="card report-chart-card">
        <div class="section-heading">
          <div>
            <h2>Hours by Project</h2>
            <p>Only final, second-level approved entries are included.</p>
          </div>
        </div>

        <div v-if="filterLoading" class="report-chart-empty">Refreshing project summary…</div>
        <div v-else-if="!projectSummary.length" class="report-chart-empty">
          No approved hours match the selected filters.
        </div>
        <div v-else class="project-chart-list">
          <div v-for="item in projectSummary" :key="item.project_id" class="chart-row">
            <div class="chart-project-label">
              <strong>{{ item.project_name }}</strong>
              <span>{{ number(item.employee_count) }} employee(s)</span>
            </div>
            <div class="bar" :aria-label="`${item.project_name}: ${formatHours(item.total_hours)} hours`">
              <span :style="{ width: `${Math.max(3, (number(item.total_hours) / maxProjectHours) * 100)}%` }"></span>
            </div>
            <strong class="chart-hours">{{ formatHours(item.total_hours) }}h</strong>
          </div>
        </div>
      </section>

      <section class="card report-detail-card">
        <div class="section-heading report-detail-heading">
          <div>
            <h2>Detailed Records</h2>
            <p>{{ totalCount }} approved time-entry record(s) match the current filters.</p>
          </div>
        </div>

        <div v-if="filterLoading" class="report-chart-empty">Refreshing detailed records…</div>
        <div v-else-if="!rows.length" class="report-chart-empty">No records found for the selected filters.</div>
        <div v-else class="table-scroll">
          <table class="report-table">
            <thead>
              <tr>
                <th>Employee</th>
                <th>Date</th>
                <th>Department</th>
                <th>Project</th>
                <th>Module</th>
                <th>Ticket</th>
                <th>Work Type</th>
                <th>Task Nature</th>
                <th class="num">Hours</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in rows" :key="row.entry_id">
                <td>
                  <strong>{{ row.employee_name }}</strong>
                  <small>{{ row.employee_code }}</small>
                </td>
                <td>{{ formatDisplayDate(row.work_date) }}</td>
                <td>{{ row.department_name || '—' }}</td>
                <td>{{ row.project_name }}</td>
                <td>{{ row.module_name || '—' }}</td>
                <td><span v-if="row.jira_ticket" class="kbd">{{ row.jira_ticket }}</span><span v-else>—</span></td>
                <td>{{ labelFor(workTypeOptions, row.work_type) }}</td>
                <td>{{ labelFor(taskNatureOptions, row.task_nature) }}</td>
                <td class="num report-hours-cell">{{ formatHours(row.hours) }}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div class="report-pagination">
          <span>Showing {{ pageStart }}–{{ pageEnd }} of {{ totalCount }}</span>
          <div class="pagination">
            <button class="btn btn-small" type="button" :disabled="currentPage <= 1 || filterLoading" @click="goToPage(currentPage - 1)">
              Previous
            </button>
            <span>Page {{ currentPage }} / {{ totalPages }}</span>
            <button class="btn btn-small" type="button" :disabled="currentPage >= totalPages || filterLoading" @click="goToPage(currentPage + 1)">
              Next
            </button>
          </div>
        </div>
      </section>
    </template>
  </section>
</template>
