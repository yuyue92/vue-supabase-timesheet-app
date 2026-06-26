<script setup>
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { getSupabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth'
import { useTimesheetStore } from '@/stores/timesheet'
import {
  formatDisplayDate,
  getWeekEnd,
  getWeekStart,
  isDateInWeek,
  parseLocalDate,
  toIsoDate,
  addDays,
} from '@/utils/date'

const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()
const timesheetStore = useTimesheetStore()

const pageLoading = ref(true)
const optionsLoading = ref(false)
const modulesLoading = ref(false)
const pageError = ref('')
const saveError = ref('')
const projectOptions = ref([])
const moduleOptions = ref([])

const form = ref(createEmptyForm())

const workTypes = [
  { value: 'project', label: 'Project' },
  { value: 'bau', label: 'BAU' },
  { value: 'internal', label: 'Internal' },
  { value: 'leave', label: 'Leave' },
]

const taskNatures = [
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

const routeWeekStart = computed(() => {
  const week = typeof route.query.week === 'string' ? route.query.week : ''
  const date = typeof route.query.date === 'string' ? route.query.date : ''
  const parsed = parseLocalDate(week || date)

  return parsed ? getWeekStart(parsed) : getWeekStart(new Date())
})

const entryId = computed(() => {
  const id = typeof route.query.id === 'string' ? route.query.id.trim() : ''
  return id || ''
})

const isEditing = computed(() => Boolean(entryId.value))
const pageTitle = computed(() => (isEditing.value ? 'Edit Time Entry' : 'Add Time Entry'))
const selectedProject = computed(() =>
  projectOptions.value.find((item) => item.project_id === form.value.project_id) || null,
)
const isLocked = computed(() => timesheetStore.isLocked)
const weekStartLabel = computed(() => formatDisplayDate(timesheetStore.currentWeekStart))
const weekEndLabel = computed(() => formatDisplayDate(getWeekEnd(timesheetStore.currentWeekStart)))

const existingDayHours = computed(() => {
  const targetDate = form.value.work_date

  if (!targetDate) {
    return 0
  }

  return timesheetStore.entries
    .filter((entry) => entry.work_date === targetDate && entry.id !== form.value.id)
    .reduce((total, entry) => total + numberOrZero(entry.hours), 0)
})

const projectedDayHours = computed(() => existingDayHours.value + numberOrZero(form.value.hours))
const hasDailyHoursWarning = computed(() => projectedDayHours.value > 8)

function createEmptyForm() {
  return {
    id: '',
    work_date: '',
    project_id: '',
    role_in_project: '',
    work_type: 'project',
    task_nature: 'development',
    module_id: '',
    jira_ticket: '',
    hours: '1',
    description: '',
  }
}

function numberOrZero(value) {
  const number = Number(value)
  return Number.isFinite(number) ? number : 0
}

function formatHours(value) {
  const number = numberOrZero(value)

  if (Number.isInteger(number)) {
    return number.toFixed(1)
  }

  return number.toFixed(2).replace(/0$/, '')
}

function normaliseLabel(value) {
  return String(value || '')
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function setFormFromEntry(entry) {
  form.value = {
    id: entry.id || '',
    work_date: entry.work_date || timesheetStore.selectedDate || timesheetStore.currentWeekStart,
    project_id: entry.project_id || '',
    role_in_project: entry.role_in_project || '',
    work_type: entry.work_type || 'project',
    task_nature: entry.task_nature || 'development',
    module_id: entry.module_id || '',
    jira_ticket: entry.jira_ticket || '',
    hours: String(entry.hours ?? '1'),
    description: entry.description || '',
  }
}

async function loadProjectOptions() {
  optionsLoading.value = true

  try {
    const client = getSupabase()
    const { data, error } = await client
      .from('project_members')
      .select(`
        project_id,
        role_in_project,
        projects:project_id ( id, name, code, status )
      `)
      .eq('profile_id', authStore.user.id)
      .order('created_at', { ascending: true })

    if (error) {
      throw error
    }

    projectOptions.value = (data || [])
      .map((membership) => ({
        project_id: membership.project_id,
        role_in_project: membership.role_in_project,
        project: Array.isArray(membership.projects)
          ? membership.projects[0]
          : membership.projects,
      }))
      .filter((membership) => membership.project?.id && membership.project.status === 'active')
      .sort((left, right) => left.project.name.localeCompare(right.project.name))
  } catch (error) {
    throw new Error(error?.message || 'Unable to load your project assignments.')
  } finally {
    optionsLoading.value = false
  }
}

async function loadModules(projectId = form.value.project_id, resetSelection = true) {
  moduleOptions.value = []

  if (resetSelection) {
    form.value.module_id = ''
  }

  if (!projectId) {
    return
  }

  modulesLoading.value = true

  try {
    const client = getSupabase()
    const { data, error } = await client
      .from('modules')
      .select('id, project_id, name')
      .eq('project_id', projectId)
      .order('name', { ascending: true })

    if (error) {
      throw error
    }

    moduleOptions.value = data || []
  } catch (error) {
    throw new Error(error?.message || 'Unable to load project modules.')
  } finally {
    modulesLoading.value = false
  }
}

// 生成本周 7 天的选项列表
const weekDayOptions = computed(() => {
  const start = timesheetStore.currentWeekStart
  if (!start) return []
  return Array.from({ length: 7 }, (_, i) => {
    const iso = addDays(start, i)
    return { value: iso, label: formatDisplayDate(iso) }
  })
})

function applyProjectMembership() {
  const membership = selectedProject.value

  form.value.role_in_project = membership?.role_in_project || ''
}

async function handleProjectChange() {
  pageError.value = ''
  applyProjectMembership()

  if (form.value.project_id && !form.value.role_in_project) {
    pageError.value = 'Your account is not listed as a member of this project. Contact an administrator to add your project role before recording time.'
  }

  try {
    await loadModules()
  } catch (error) {
    pageError.value = error.message || 'Unable to load project modules.'
  }
}

function validateForm() {
  const payload = form.value

  if (!payload.work_date || !isDateInWeek(payload.work_date, timesheetStore.currentWeekStart)) {
    return 'Choose a work date inside the current weekly timesheet.'
  }

  if (!payload.project_id || !selectedProject.value) {
    return 'Choose a project assigned to you.'
  }

  if (!payload.role_in_project) {
    return 'A project role is required.'
  }

  if (!payload.work_type || !payload.task_nature) {
    return 'Work type and task nature are required.'
  }

  const hours = Number(payload.hours)

  if (!Number.isFinite(hours) || hours <= 0 || hours > 24) {
    return 'Hours must be greater than 0 and no more than 24.'
  }

  if (Math.abs(hours * 4 - Math.round(hours * 4)) > 0.00001) {
    return 'Hours must be recorded in 0.25-hour increments.'
  }

  if (payload.description && payload.description.trim().length > 2000) {
    return 'Description cannot exceed 2,000 characters.'
  }

  return ''
}

async function saveEntry() {
  saveError.value = ''
  const validationError = validateForm()

  if (validationError) {
    saveError.value = validationError
    return
  }

  try {
    await timesheetStore.saveEntry({
      ...form.value,
      project_id: selectedProject.value.project_id,
      role_in_project: selectedProject.value.role_in_project,
      module_id: form.value.module_id || null,
      hours: Number(form.value.hours),
    })

    timesheetStore.setSelectedDate(form.value.work_date)

    await router.replace({
      name: 'timesheet',
      query: {
        week: timesheetStore.currentWeekStart,
      },
    })
  } catch (error) {
    saveError.value = error.message || 'Unable to save the time entry.'
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

async function initialisePage() {
  pageLoading.value = true
  pageError.value = ''
  saveError.value = ''

  try {
    await authStore.initialize()
    await timesheetStore.fetchWeek(routeWeekStart.value)

    if (isLocked.value) {
      return
    }

    await loadProjectOptions()

    if (isEditing.value) {
      const entry = timesheetStore.entries.find((item) => item.id === entryId.value)

      if (!entry) {
        throw new Error('This time entry was not found in the selected weekly timesheet.')
      }

      setFormFromEntry(entry)
      applyProjectMembership()
      await loadModules(form.value.project_id, false)

      if (form.value.module_id && !moduleOptions.value.some((module) => module.id === form.value.module_id)) {
        form.value.module_id = ''
      }
    } else {
      form.value = createEmptyForm()
      const requestedDate = typeof route.query.date === 'string' ? route.query.date : ''
      form.value.work_date = isDateInWeek(requestedDate, timesheetStore.currentWeekStart)
        ? toIsoDate(requestedDate)
        : timesheetStore.selectedDate || timesheetStore.currentWeekStart
    }

  } catch (error) {
    pageError.value = error.message || 'Unable to load the time entry form.'
  } finally {
    pageLoading.value = false
  }
}

watch(
  () => `${route.query.week || ''}|${route.query.date || ''}|${route.query.id || ''}`,
  async () => {
    await initialisePage()
  },
  { immediate: true },
)

</script>

<template>
  <section class="page-section entry-page">
    <div class="page-head">
      <div>
        <h1>{{ pageTitle }}</h1>
        <p>Record work against a project, task category and selected working day.</p>
      </div>

      <div class="page-head-actions">
        <button class="btn" type="button" :disabled="timesheetStore.saving" @click="goBack">
          Back to Timesheet
        </button>
      </div>
    </div>

    <div v-if="pageError" class="message message-error" role="alert">
      {{ pageError }}
    </div>

    <section v-else-if="pageLoading" class="card entry-loading-card" role="status">
      Loading time entry form…
    </section>

    <section v-else-if="isLocked" class="card entry-locked-card">
      <h2>This weekly timesheet is read-only</h2>
      <p>
        Submitted and approved timesheets cannot be changed. Return to your weekly timesheet to review its current status.
      </p>
      <button class="btn primary" type="button" @click="goBack">Return to My Timesheet</button>
    </section>

    <form v-else class="card entry-form-card" @submit.prevent="saveEntry">
      <div v-if="saveError" class="message message-error" role="alert">
        {{ saveError }}
      </div>

      <div v-if="!projectOptions.length && !optionsLoading" class="message message-warning" role="status">
        No active project assignments are available for your account. Ask an administrator to add you to a project before recording time.
      </div>

      <div class="entry-period-note">
        <span class="pill">Weekly period: {{ weekStartLabel }} - {{ weekEndLabel }}</span>
        <span class="hint">The work date is limited to this weekly timesheet.</span>
      </div>

      <div class="entry-form-grid">
        <div class="field">
          <label for="work-date">Work Date <span class="required">*</span></label>
          <select
            id="work-date"
            v-model="form.work_date"
            class="select"
            :disabled="timesheetStore.saving"
          >
            <option value="" disabled>Select a date</option>
            <option
              v-for="day in weekDayOptions"
              :key="day.value"
              :value="day.value"
            >
              {{ day.label }}
            </option>
          </select>
        </div>

        <div class="field">
          <label for="project-id">Project <span class="required">*</span></label>
          <select
            id="project-id"
            v-model="form.project_id"
            class="select"
            :disabled="optionsLoading || !projectOptions.length || timesheetStore.saving"
            @change="handleProjectChange"
          >
            <option value="">{{ optionsLoading ? 'Loading projects…' : 'Select a project' }}</option>
            <option v-for="membership in projectOptions" :key="membership.project_id" :value="membership.project_id">
              {{ membership.project.name }} ({{ membership.project.code }})
            </option>
          </select>
        </div>

        <div class="field">
          <label for="role-in-project">Role <span class="required">*</span></label>
          <select id="role-in-project" v-model="form.role_in_project" class="select" disabled>
            <option value="">{{ form.project_id && !form.role_in_project ? 'No role assigned — contact admin' : 'Select a project first' }}</option>
            <option v-if="form.role_in_project" :value="form.role_in_project">
              {{ normaliseLabel(form.role_in_project) }}
            </option>
          </select>
          <span v-if="form.project_id && !form.role_in_project" class="hint" style="color: var(--red)">
            You have no assigned role for this project. Ask an administrator to add you as a project member.
          </span>
          <span v-else class="hint">Your project assignment determines the role used for this entry.</span>
        </div>

        <div class="field">
          <label for="work-type">Work Type <span class="required">*</span></label>
          <select id="work-type" v-model="form.work_type" class="select" :disabled="timesheetStore.saving">
            <option v-for="type in workTypes" :key="type.value" :value="type.value">{{ type.label }}</option>
          </select>
        </div>

        <div class="field">
          <label for="task-nature">Task Nature <span class="required">*</span></label>
          <select id="task-nature" v-model="form.task_nature" class="select" :disabled="timesheetStore.saving">
            <option v-for="task in taskNatures" :key="task.value" :value="task.value">{{ task.label }}</option>
          </select>
        </div>

        <div class="field">
          <label for="module-id">Module</label>
          <select id="module-id" v-model="form.module_id" class="select" :disabled="!form.project_id || modulesLoading || timesheetStore.saving">
            <option value="">{{ modulesLoading ? 'Loading modules…' : 'No module / Not applicable' }}</option>
            <option v-for="module in moduleOptions" :key="module.id" :value="module.id">{{ module.name }}</option>
          </select>
        </div>

        <div class="field">
          <label for="jira-ticket">Jira Ticket</label>
          <input id="jira-ticket" v-model.trim="form.jira_ticket" class="input" type="text" maxlength="120" placeholder="For example: CRM-1023" :disabled="timesheetStore.saving" />
        </div>

        <div class="field">
          <label for="hours">Hours <span class="required">*</span></label>
          <input
            id="hours"
            v-model="form.hours"
            class="input"
            type="number"
            inputmode="decimal"
            min="0.25"
            max="24"
            step="0.25"
            :disabled="timesheetStore.saving"
          />
          <span class="hint">Use 0.25-hour increments. Maximum: 24 hours.</span>
        </div>
      </div>

      <div v-if="hasDailyHoursWarning" class="message message-warning entry-hours-warning" role="status">
        This entry would bring {{ formatDisplayDate(form.work_date) }} to {{ formatHours(projectedDayHours) }} hours.
        The system allows more than 8 hours, but please confirm the entry is correct.
      </div>

      <div class="field entry-description-field">
        <label for="description">Description</label>
        <textarea
          id="description"
          v-model="form.description"
          class="textarea"
          maxlength="2000"
          placeholder="Briefly describe the work completed…"
          :disabled="timesheetStore.saving"
        ></textarea>
        <span class="hint">{{ form.description.length }}/2000 characters</span>
      </div>

      <div class="entry-form-actions">
        <button class="btn" type="button" :disabled="timesheetStore.saving" @click="goBack">Cancel</button>
        <button class="btn primary" type="submit" :disabled="timesheetStore.saving || !projectOptions.length">
          <span v-if="timesheetStore.saving" class="btn-spinner"></span>
          {{ timesheetStore.saving ? 'Saving…' : isEditing ? 'Save Changes' : 'Save Entry' }}
        </button>
      </div>
    </form>
  </section>
</template>
