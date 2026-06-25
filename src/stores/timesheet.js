import { defineStore } from 'pinia'
import { getSupabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth'
import { pinia } from '@/stores/pinia'
import {
  addDays,
  getWeekEnd,
  getWeekStart,
  isDateInWeek,
  toIsoDate,
} from '@/utils/date'

function toFriendlyDataError(error, fallbackMessage) {
  const message = String(error?.message || '').trim()
  return message || fallbackMessage
}

function normalizeRpcRecord(data) {
  if (Array.isArray(data)) {
    return data[0] || null
  }

  return data || null
}

function toNumericHours(value) {
  const hours = Number(value)
  return Number.isFinite(hours) ? hours : 0
}

export const useTimesheetStore = defineStore('timesheet', {
  state: () => ({
    currentWeekStart: getWeekStart(new Date()),
    timesheetRecord: null,
    entries: [],
    selectedDate: getWeekStart(new Date()),
    loading: false,
    saving: false,
    error: '',
  }),

  getters: {
    weekEnd: (state) => getWeekEnd(state.currentWeekStart),

    entriesForSelectedDate: (state) =>
      state.entries.filter((entry) => entry.work_date === state.selectedDate),

    dailyTotals: (state) => {
      const totals = {}
      const start = getWeekStart(state.currentWeekStart)

      for (let index = 0; index < 7; index += 1) {
        totals[addDays(start, index)] = 0
      }

      state.entries.forEach((entry) => {
        if (Object.prototype.hasOwnProperty.call(totals, entry.work_date)) {
          totals[entry.work_date] += toNumericHours(entry.hours)
        }
      })

      return totals
    },

    weekTotal: (state) =>
      state.entries.reduce((sum, entry) => sum + toNumericHours(entry.hours), 0),

    selectedDayTotal() {
      return this.dailyTotals[this.selectedDate] || 0
    },

    isLocked: (state) =>
      Boolean(
        state.timesheetRecord &&
          !['draft', 'rejected'].includes(state.timesheetRecord.status),
      ),
  },

  actions: {
    clearWeek() {
      this.timesheetRecord = null
      this.entries = []
      this.error = ''
    },

    setSelectedDate(value) {
      const date = toIsoDate(value)

      if (!date || !isDateInWeek(date, this.currentWeekStart)) {
        return
      }

      this.selectedDate = date
    },

    async requireCurrentUser() {
      const authStore = useAuthStore(pinia)

      await authStore.initialize()

      if (!authStore.user) {
        throw new Error('Your login session has expired. Please sign in again.')
      }

      return authStore.user
    },

    async fetchWeek(weekStart) {
      const normalizedWeekStart = getWeekStart(weekStart)

      if (!normalizedWeekStart) {
        this.error = 'Choose a valid week start date.'
        throw new Error(this.error)
      }

      this.loading = true
      this.error = ''

      try {
        await this.requireCurrentUser()
        this.currentWeekStart = normalizedWeekStart

        if (!isDateInWeek(this.selectedDate, normalizedWeekStart)) {
          this.selectedDate = normalizedWeekStart
        }

        const timesheet = await this.createDraftIfNeeded(normalizedWeekStart)
        await this.fetchEntries(timesheet.id)

        return timesheet
      } catch (error) {
        this.error = toFriendlyDataError(error, 'Unable to load the selected week.')
        throw new Error(this.error)
      } finally {
        this.loading = false
      }
    },

    async createDraftIfNeeded(weekStart = this.currentWeekStart) {
      const normalizedWeekStart = getWeekStart(weekStart)

      if (!normalizedWeekStart) {
        throw new Error('Choose a valid week start date.')
      }

      await this.requireCurrentUser()

      const client = getSupabase()
      const { data, error } = await client.rpc('get_or_create_timesheet', {
        p_week_start: normalizedWeekStart,
      })

      if (error) {
        throw new Error(toFriendlyDataError(error, 'Unable to load or create the weekly timesheet.'))
      }

      const record = normalizeRpcRecord(data)

      if (!record?.id) {
        throw new Error('Supabase did not return a valid timesheet record.')
      }

      this.timesheetRecord = record
      this.currentWeekStart = record.week_start

      if (!isDateInWeek(this.selectedDate, record.week_start)) {
        this.selectedDate = record.week_start
      }

      return record
    },

    async fetchEntries(timesheetId = this.timesheetRecord?.id) {
      if (!timesheetId) {
        this.entries = []
        return []
      }

      const client = getSupabase()
      const { data, error } = await client
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
        .eq('timesheet_id', timesheetId)
        .order('work_date', { ascending: true })
        .order('created_at', { ascending: true })

      if (error) {
        throw new Error(toFriendlyDataError(error, 'Unable to load time entries.'))
      }

      this.entries = data || []
      return this.entries
    },

    async refreshTimesheetRecord() {
      if (!this.timesheetRecord?.id) {
        return null
      }

      const client = getSupabase()
      const { data, error } = await client
        .from('timesheets')
        .select('*')
        .eq('id', this.timesheetRecord.id)
        .single()

      if (error) {
        throw new Error(toFriendlyDataError(error, 'Unable to refresh weekly totals.'))
      }

      this.timesheetRecord = data
      return data
    },

    async saveEntry(entry) {
      if (!this.timesheetRecord?.id) {
        throw new Error('Load a timesheet before saving an entry.')
      }

      const user = await this.requireCurrentUser()
      const client = getSupabase()
      this.saving = true
      this.error = ''

      try {
        const payload = {
          id: entry.id || undefined,
          profile_id: user.id,
          work_date: toIsoDate(entry.work_date),
          project_id: entry.project_id,
          role_in_project: entry.role_in_project,
          work_type: entry.work_type,
          task_nature: entry.task_nature,
          module_id: entry.module_id || null,
          jira_ticket: entry.jira_ticket?.trim() || null,
          hours: toNumericHours(entry.hours),
          description: entry.description?.trim() || null,
          timesheet_id: this.timesheetRecord.id,
        }

        if (!payload.work_date || !payload.project_id) {
          throw new Error('Work date and project are required.')
        }

        const { data, error } = await client
          .from('time_entries')
          .upsert(payload, { onConflict: 'id' })
          .select('id')
          .single()

        if (error) {
          throw error
        }

        await Promise.all([
          this.fetchEntries(this.timesheetRecord.id),
          this.refreshTimesheetRecord(),
        ])

        return data
      } catch (error) {
        this.error = toFriendlyDataError(error, 'Unable to save the time entry.')
        throw new Error(this.error)
      } finally {
        this.saving = false
      }
    },

    async deleteEntry(entryId) {
      if (!entryId) {
        throw new Error('Choose a time entry to delete.')
      }

      const client = getSupabase()
      this.saving = true
      this.error = ''

      try {
        const { error } = await client
          .from('time_entries')
          .delete()
          .eq('id', entryId)

        if (error) {
          throw error
        }

        await Promise.all([
          this.fetchEntries(this.timesheetRecord?.id),
          this.refreshTimesheetRecord(),
        ])
      } catch (error) {
        this.error = toFriendlyDataError(error, 'Unable to delete the time entry.')
        throw new Error(this.error)
      } finally {
        this.saving = false
      }
    },

    async submitTimesheet(employeeNote = '') {
      if (!this.timesheetRecord?.id) {
        throw new Error('Load a timesheet before submitting it.')
      }

      this.saving = true
      this.error = ''

      try {
        await this.requireCurrentUser()

        const client = getSupabase()
        const { data, error } = await client.rpc('submit_timesheet', {
          p_timesheet_id: this.timesheetRecord.id,
          p_employee_note: employeeNote.trim() || null,
        })

        if (error) {
          throw error
        }

        const record = normalizeRpcRecord(data)

        if (!record?.id) {
          throw new Error('Supabase did not return the submitted timesheet.')
        }

        this.timesheetRecord = record
        return record
      } catch (error) {
        this.error = toFriendlyDataError(error, 'Unable to submit this timesheet.')
        throw new Error(this.error)
      } finally {
        this.saving = false
      }
    },
  },
})
