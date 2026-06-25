<script setup>
import { computed } from 'vue'
import { addDays, formatDisplayDate, getWeekStart, parseLocalDate } from '@/utils/date'
import { DAILY_HOURS_TARGET } from '@/utils/constants'

const props = defineProps({
  entries: {
    type: Array,
    default: () => [],
  },
  weekStart: {
    type: [String, Date],
    required: true,
  },
  selectedDate: {
    type: String,
    default: '',
  },
})

const emit = defineEmits(['select'])

function normaliseDate(value) {
  const date = parseLocalDate(value)

  if (!date) {
    return ''
  }

  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function toNumber(value) {
  const number = Number(value)
  return Number.isFinite(number) ? number : 0
}

function formatHours(value) {
  const rounded = Math.round(toNumber(value) * 100) / 100
  return Number.isInteger(rounded) ? `${rounded.toFixed(1)}h` : `${rounded.toFixed(2).replace(/0$/, '')}h`
}

function shortWeekday(dateValue) {
  const date = parseLocalDate(dateValue)
  return date
    ? new Intl.DateTimeFormat('en-GB', { weekday: 'short' }).format(date)
    : ''
}

function shortDate(dateValue) {
  const date = parseLocalDate(dateValue)
  return date
    ? new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short' }).format(date)
    : ''
}

const days = computed(() => {
  const start = getWeekStart(props.weekStart)

  return Array.from({ length: 7 }, (_, index) => {
    const date = addDays(start, index)
    const dayEntries = props.entries.filter((entry) => normaliseDate(entry.work_date) === date)
    const total = Math.round(dayEntries.reduce((sum, entry) => sum + toNumber(entry.hours), 0) * 100) / 100

    let state = 'zero'
    if (total >= DAILY_HOURS_TARGET) {
      state = 'ok'
    } else if (total > 0) {
      state = 'warn'
    }

    return {
      date,
      label: `${shortWeekday(date)} ${shortDate(date)}`,
      displayDate: formatDisplayDate(date),
      total,
      totalLabel: formatHours(total),
      state,
      entryCount: dayEntries.length,
    }
  })
})
</script>

<template>
  <div class="daybar" role="group" aria-label="Select a day in the current week">
    <button
      v-for="day in days"
      :key="day.date"
      class="day"
      :class="[{ active: day.date === selectedDate }, `day--${day.state}`]"
      type="button"
      :aria-pressed="day.date === selectedDate"
      :title="`${day.displayDate}: ${day.totalLabel}, ${day.entryCount} entr${day.entryCount === 1 ? 'y' : 'ies'}`"
      @click="emit('select', day.date)"
    >
      <span class="day-label">{{ day.label }}</span>
      <strong class="day-hours" :class="day.state">{{ day.totalLabel }}</strong>
      <span class="day-entry-count">{{ day.entryCount }} {{ day.entryCount === 1 ? 'entry' : 'entries' }}</span>
    </button>
  </div>
</template>
