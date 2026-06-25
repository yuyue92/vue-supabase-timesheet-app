<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import OrgTree from '@/components/OrgTree.vue'
import StatusBadge from '@/components/StatusBadge.vue'
import { getSupabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth'

const authStore = useAuthStore()

const departments = ref([])
const profiles = ref([])
const emailsByProfileId = ref({})
const selectedDepartmentId = ref('')
const selectedEmployeeId = ref('')
const searchKeyword = ref('')
const loading = ref(true)
const saving = ref(false)
const creating = ref(false)
const loadingEmails = ref(false)
const pageError = ref('')
const formError = ref('')
const formSuccess = ref('')
const addEmployeeOpen = ref(false)
const emailDirectoryError = ref('')

const roleOptions = [
  { value: 'employee', label: 'Employee' },
  { value: 'supervisor', label: 'Supervisor' },
  { value: 'project_manager', label: 'Project Manager' },
  { value: 'admin', label: 'System Administrator' },
]

const statusOptions = [
  { value: 'active', label: 'Active' },
  { value: 'suspended', label: 'Suspended' },
]

const emptyEmployeeForm = () => ({
  id: '',
  full_name: '',
  employee_code: '',
  department_id: '',
  supervisor_id: '',
  second_supervisor_id: '',
  role: 'employee',
  status: 'active',
})

const editForm = reactive(emptyEmployeeForm())
const createForm = reactive({
  email: '',
  password: '',
  full_name: '',
  employee_code: '',
  department_id: '',
  supervisor_id: '',
  second_supervisor_id: '',
  role: 'employee',
  status: 'active',
})

const selectedDepartment = computed(
  () => departments.value.find((department) => department.id === selectedDepartmentId.value) || null,
)

const selectedEmployee = computed(
  () => profiles.value.find((profile) => profile.id === selectedEmployeeId.value) || null,
)

const visibleProfiles = computed(() => {
  const keyword = searchKeyword.value.trim().toLowerCase()

  return profiles.value.filter((profile) => {
    const departmentMatches = !selectedDepartmentId.value || profile.department_id === selectedDepartmentId.value
    if (!departmentMatches) return false

    if (!keyword) return true

    return [profile.full_name, profile.employee_code, profile.email]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(keyword))
  })
})

const eligibleSupervisors = computed(() =>
  profiles.value.filter((profile) => profile.status === 'active' && profile.id !== editForm.id),
)

const eligibleNewEmployeeSupervisors = computed(() =>
  profiles.value.filter((profile) => profile.status === 'active'),
)

function roleLabel(value) {
  return roleOptions.find((item) => item.value === value)?.label || value || '—'
}

function profileDepartment(profile) {
  return departments.value.find((department) => department.id === profile?.department_id) || null
}

function profileSupervisor(profile) {
  return profiles.value.find((candidate) => candidate.id === profile?.supervisor_id) || null
}

function profileSecondSupervisor(profile) {
  return profiles.value.find((candidate) => candidate.id === profile?.second_supervisor_id) || null
}

function getEmail(profileId) {
  return emailsByProfileId.value[profileId] || '—'
}

function resetMessages() {
  pageError.value = ''
  formError.value = ''
  formSuccess.value = ''
}

function normalizeNullable(value) {
  const normalized = String(value || '').trim()
  return normalized || null
}

function validateHierarchy(form) {
  if (form.supervisor_id && form.supervisor_id === form.id) {
    throw new Error('An employee cannot be their own direct supervisor.')
  }

  if (form.second_supervisor_id && form.second_supervisor_id === form.id) {
    throw new Error('An employee cannot be their own second-level supervisor.')
  }

  if (
    form.supervisor_id &&
    form.second_supervisor_id &&
    form.supervisor_id === form.second_supervisor_id
  ) {
    throw new Error('Direct supervisor and second-level supervisor must be different people.')
  }
}

async function loadOrganisation() {
  const client = getSupabase()
  const [departmentsResponse, profilesResponse] = await Promise.all([
    client.from('departments').select('id, name, parent_id, created_at').order('name', { ascending: true }),
    client
      .from('profiles')
      .select(
        'id, full_name, employee_code, department_id, supervisor_id, second_supervisor_id, role, status, created_at, updated_at',
      )
      .order('full_name', { ascending: true }),
  ])

  const error = departmentsResponse.error || profilesResponse.error
  if (error) {
    throw new Error(error.message || 'Unable to load organisation data.')
  }

  departments.value = departmentsResponse.data || []
  profiles.value = profilesResponse.data || []

  if (selectedEmployeeId.value && !profiles.value.some((profile) => profile.id === selectedEmployeeId.value)) {
    selectedEmployeeId.value = ''
    Object.assign(editForm, emptyEmployeeForm())
  }
}

async function loadEmails() {
  loadingEmails.value = true
  emailDirectoryError.value = ''

  try {
    const client = getSupabase()
    const { data, error } = await client.functions.invoke('manage-employees', {
      body: { action: 'list' },
    })

    if (error) {
      throw new Error(error.message || 'Unable to load employee email addresses.')
    }

    const emailMap = {}
    ;(data?.users || []).forEach((user) => {
      if (user?.id && user?.email) {
        emailMap[user.id] = user.email
      }
    })

    emailsByProfileId.value = emailMap
  } catch (error) {
    emailDirectoryError.value =
      'Employee emails are unavailable until the manage-employees Edge Function is deployed. Profile management remains available.'
  } finally {
    loadingEmails.value = false
  }
}

function selectDepartment(department) {
  selectedDepartmentId.value = department?.id || ''
}

function clearDepartment() {
  selectedDepartmentId.value = ''
}

function selectEmployee(profile) {
  if (!profile) return

  selectedEmployeeId.value = profile.id
  addEmployeeOpen.value = false
  formError.value = ''
  formSuccess.value = ''

  Object.assign(editForm, {
    id: profile.id,
    full_name: profile.full_name || '',
    employee_code: profile.employee_code || '',
    department_id: profile.department_id || '',
    supervisor_id: profile.supervisor_id || '',
    second_supervisor_id: profile.second_supervisor_id || '',
    role: profile.role || 'employee',
    status: profile.status || 'active',
  })
}

function openAddEmployee() {
  selectedEmployeeId.value = ''
  Object.assign(editForm, emptyEmployeeForm())
  Object.assign(createForm, {
    email: '',
    password: '',
    full_name: '',
    employee_code: '',
    department_id: selectedDepartmentId.value || '',
    supervisor_id: '',
    second_supervisor_id: '',
    role: 'employee',
    status: 'active',
  })
  addEmployeeOpen.value = true
  formError.value = ''
  formSuccess.value = ''
}

function closeAddEmployee() {
  addEmployeeOpen.value = false
  formError.value = ''
}

async function saveEmployee() {
  resetMessages()

  try {
    if (!editForm.id) {
      throw new Error('Select an employee before saving changes.')
    }

    if (!editForm.full_name.trim() || !editForm.employee_code.trim()) {
      throw new Error('Full name and employee code are required.')
    }

    validateHierarchy(editForm)

    saving.value = true
    const client = getSupabase()
    const { error } = await client
      .from('profiles')
      .update({
        full_name: editForm.full_name.trim(),
        employee_code: editForm.employee_code.trim(),
        department_id: normalizeNullable(editForm.department_id),
        supervisor_id: normalizeNullable(editForm.supervisor_id),
        second_supervisor_id: normalizeNullable(editForm.second_supervisor_id),
        role: editForm.role,
        status: editForm.status,
      })
      .eq('id', editForm.id)

    if (error) {
      throw new Error(error.message || 'Unable to update this employee.')
    }

    await loadOrganisation()
    const updatedEmployee = profiles.value.find((profile) => profile.id === editForm.id)
    if (updatedEmployee) selectEmployee(updatedEmployee)
    formSuccess.value = 'Employee profile updated successfully.'
  } catch (error) {
    formError.value = error.message || 'Unable to update this employee.'
  } finally {
    saving.value = false
  }
}

async function createEmployee() {
  resetMessages()

  try {
    if (!createForm.email.trim() || !createForm.password || !createForm.full_name.trim() || !createForm.employee_code.trim()) {
      throw new Error('Email, temporary password, full name and employee code are required.')
    }

    if (createForm.password.length < 8) {
      throw new Error('Temporary password must contain at least 8 characters.')
    }

    validateHierarchy({ ...createForm, id: '' })

    creating.value = true
    const client = getSupabase()
    const { data, error } = await client.functions.invoke('manage-employees', {
      body: {
        action: 'create',
        employee: {
          email: createForm.email.trim().toLowerCase(),
          password: createForm.password,
          full_name: createForm.full_name.trim(),
          employee_code: createForm.employee_code.trim(),
          department_id: normalizeNullable(createForm.department_id),
          supervisor_id: normalizeNullable(createForm.supervisor_id),
          second_supervisor_id: normalizeNullable(createForm.second_supervisor_id),
          role: createForm.role,
          status: createForm.status,
        },
      },
    })

    if (error) {
      throw new Error(error.message || 'Unable to create the employee account.')
    }

    if (!data?.profile?.id) {
      throw new Error('The Edge Function returned an incomplete employee profile.')
    }

    await loadOrganisation()
    await loadEmails()
    const createdEmployee = profiles.value.find((profile) => profile.id === data.profile.id)

    addEmployeeOpen.value = false
    if (createdEmployee) selectEmployee(createdEmployee)
    formSuccess.value = `Employee account created for ${data.profile.full_name}.`
  } catch (error) {
    formError.value = error.message || 'Unable to create the employee account.'
  } finally {
    creating.value = false
  }
}

onMounted(async () => {
  loading.value = true

  try {
    await authStore.initialize()
    await loadOrganisation()
    await loadEmails()
  } catch (error) {
    pageError.value = error.message || 'Unable to load organisation data.'
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <section class="page-section organisation-page">
    <div class="page-head">
      <div>
        <h1>Organisation &amp; Users</h1>
        <p>Manage organisation units, reporting lines and system access.</p>
      </div>
      <div class="head-actions">
        <button class="btn primary" type="button" @click="openAddEmployee">+ Add Employee</button>
      </div>
    </div>

    <div v-if="pageError" class="message message-error" role="alert">
      {{ pageError }}
    </div>
    <div v-if="formError" class="message message-error" role="alert">
      {{ formError }}
    </div>
    <div v-if="formSuccess" class="message message-success" role="status">
      {{ formSuccess }}
    </div>

    <div v-if="loading" class="organisation-loading" role="status">Loading organisation and employee records…</div>

    <div v-else class="organisation-layout">
      <aside class="tree card">
        <div class="org-tree-heading">
          <div>
            <h2>Organisation Tree</h2>
            <p>Select a unit to filter employees.</p>
          </div>
          <button v-if="selectedDepartmentId" class="btn btn-small ghost" type="button" @click="clearDepartment">
            All
          </button>
        </div>
        <OrgTree
          :departments="departments"
          :selected-id="selectedDepartmentId"
          @select="selectDepartment"
        />
      </aside>

      <section class="organisation-content">
        <div class="card employee-list-card">
          <div class="employee-list-heading">
            <div>
              <h2>Employees</h2>
              <p>
                {{ selectedDepartment ? `Department: ${selectedDepartment.name}` : 'All organisation units' }}
                · {{ visibleProfiles.length }} record(s)
              </p>
            </div>
            <input
              v-model="searchKeyword"
              class="input employee-search"
              type="search"
              placeholder="Search name, code or email..."
            />
          </div>

          <div v-if="emailDirectoryError" class="inline-notice">
            {{ emailDirectoryError }}
          </div>

          <div v-if="!visibleProfiles.length" class="organisation-empty">
            No employee profiles match this filter.
          </div>
          <div v-else class="table-scroll">
            <table class="organisation-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Department</th>
                  <th>Supervisor</th>
                  <th>Second-level</th>
                  <th>Role</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="profile in visibleProfiles"
                  :key="profile.id"
                  class="employee-row"
                  :class="{ 'is-selected': profile.id === selectedEmployeeId }"
                  tabindex="0"
                  @click="selectEmployee(profile)"
                  @keyup.enter="selectEmployee(profile)"
                >
                  <td>
                    <strong>{{ profile.full_name }}</strong>
                    <small>{{ profile.employee_code }}</small>
                  </td>
                  <td>{{ getEmail(profile.id) }}</td>
                  <td>{{ profileDepartment(profile)?.name || '—' }}</td>
                  <td>{{ profileSupervisor(profile)?.full_name || '—' }}</td>
                  <td>{{ profileSecondSupervisor(profile)?.full_name || '—' }}</td>
                  <td>{{ roleLabel(profile.role) }}</td>
                  <td><StatusBadge :status="profile.status" /></td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <section v-if="addEmployeeOpen" class="drawer card employee-editor-card">
          <div class="editor-heading">
            <div>
              <h2>Add Employee</h2>
              <p>Create the Auth account and employee profile together through the secured Edge Function.</p>
            </div>
            <button class="btn btn-small ghost" type="button" :disabled="creating" @click="closeAddEmployee">Close</button>
          </div>

          <div class="employee-editor-grid">
            <div class="field">
              <label for="new-email">Company email <span class="required">*</span></label>
              <input id="new-email" v-model="createForm.email" class="input" type="email" autocomplete="off" placeholder="name@company.com" />
            </div>
            <div class="field">
              <label for="new-password">Temporary password <span class="required">*</span></label>
              <input id="new-password" v-model="createForm.password" class="input" type="password" autocomplete="new-password" placeholder="At least 8 characters" />
            </div>
            <div class="field">
              <label for="new-full-name">Full name <span class="required">*</span></label>
              <input id="new-full-name" v-model="createForm.full_name" class="input" type="text" />
            </div>
            <div class="field">
              <label for="new-employee-code">Employee code <span class="required">*</span></label>
              <input id="new-employee-code" v-model="createForm.employee_code" class="input" type="text" placeholder="EMP-005" />
            </div>
            <div class="field">
              <label for="new-department">Organisation unit</label>
              <select id="new-department" v-model="createForm.department_id" class="select">
                <option value="">No department assigned</option>
                <option v-for="department in departments" :key="department.id" :value="department.id">{{ department.name }}</option>
              </select>
            </div>
            <div class="field">
              <label for="new-role">Primary system role</label>
              <select id="new-role" v-model="createForm.role" class="select">
                <option v-for="role in roleOptions" :key="role.value" :value="role.value">{{ role.label }}</option>
              </select>
            </div>
            <div class="field">
              <label for="new-supervisor">Direct supervisor</label>
              <select id="new-supervisor" v-model="createForm.supervisor_id" class="select">
                <option value="">Not assigned</option>
                <option v-for="profile in eligibleNewEmployeeSupervisors" :key="profile.id" :value="profile.id">{{ profile.full_name }} · {{ profile.employee_code }}</option>
              </select>
            </div>
            <div class="field">
              <label for="new-second-supervisor">Second-level supervisor</label>
              <select id="new-second-supervisor" v-model="createForm.second_supervisor_id" class="select">
                <option value="">Not assigned</option>
                <option v-for="profile in eligibleNewEmployeeSupervisors" :key="profile.id" :value="profile.id">{{ profile.full_name }} · {{ profile.employee_code }}</option>
              </select>
            </div>
            <div class="field">
              <label for="new-status">Account status</label>
              <select id="new-status" v-model="createForm.status" class="select">
                <option v-for="status in statusOptions" :key="status.value" :value="status.value">{{ status.label }}</option>
              </select>
            </div>
          </div>

          <div class="employee-editor-actions">
            <button class="btn" type="button" :disabled="creating" @click="closeAddEmployee">Cancel</button>
            <button class="btn primary" type="button" :disabled="creating" @click="createEmployee">
              {{ creating ? 'Creating…' : 'Create Employee' }}
            </button>
          </div>
        </section>

        <section v-else-if="selectedEmployee" class="drawer card employee-editor-card">
          <div class="editor-heading">
            <div>
              <h2>Employee Details</h2>
              <p>{{ getEmail(selectedEmployee.id) }}</p>
            </div>
            <StatusBadge :status="editForm.status" />
          </div>

          <div class="employee-editor-grid">
            <div class="field">
              <label for="edit-full-name">Full name <span class="required">*</span></label>
              <input id="edit-full-name" v-model="editForm.full_name" class="input" type="text" />
            </div>
            <div class="field">
              <label for="edit-employee-code">Employee code <span class="required">*</span></label>
              <input id="edit-employee-code" v-model="editForm.employee_code" class="input" type="text" />
            </div>
            <div class="field">
              <label for="edit-department">Organisation unit</label>
              <select id="edit-department" v-model="editForm.department_id" class="select">
                <option value="">No department assigned</option>
                <option v-for="department in departments" :key="department.id" :value="department.id">{{ department.name }}</option>
              </select>
            </div>
            <div class="field">
              <label for="edit-role">Primary system role</label>
              <select id="edit-role" v-model="editForm.role" class="select">
                <option v-for="role in roleOptions" :key="role.value" :value="role.value">{{ role.label }}</option>
              </select>
            </div>
            <div class="field">
              <label for="edit-supervisor">Direct supervisor</label>
              <select id="edit-supervisor" v-model="editForm.supervisor_id" class="select">
                <option value="">Not assigned</option>
                <option v-for="profile in eligibleSupervisors" :key="profile.id" :value="profile.id">{{ profile.full_name }} · {{ profile.employee_code }}</option>
              </select>
            </div>
            <div class="field">
              <label for="edit-second-supervisor">Second-level supervisor</label>
              <select id="edit-second-supervisor" v-model="editForm.second_supervisor_id" class="select">
                <option value="">Not assigned</option>
                <option v-for="profile in eligibleSupervisors" :key="profile.id" :value="profile.id">{{ profile.full_name }} · {{ profile.employee_code }}</option>
              </select>
            </div>
            <div class="field">
              <label for="edit-status">Account status</label>
              <select id="edit-status" v-model="editForm.status" class="select">
                <option v-for="status in statusOptions" :key="status.value" :value="status.value">{{ status.label }}</option>
              </select>
            </div>
          </div>

          <div class="employee-editor-actions">
            <span class="hint">Email address changes intentionally require a separate Auth administration workflow.</span>
            <button class="btn primary" type="button" :disabled="saving" @click="saveEmployee">
              {{ saving ? 'Saving…' : 'Save Changes' }}
            </button>
          </div>
        </section>

        <section v-else class="drawer card organisation-empty-editor">
          <h2>Employee Details</h2>
          <p>Select an employee from the table, or add a new employee account.</p>
        </section>
      </section>
    </div>
  </section>
</template>
