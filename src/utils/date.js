const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

function pad(value) {
  return String(value).padStart(2, '0')
}

export function parseLocalDate(value) {
  if (value instanceof Date) {
    return new Date(value.getFullYear(), value.getMonth(), value.getDate(), 12)
  }

  if (typeof value !== 'string' || !value) {
    return null
  }

  if (ISO_DATE_PATTERN.test(value)) {
    const [year, month, day] = value.split('-').map(Number)
    return new Date(year, month - 1, day, 12)
  }

  const parsed = new Date(value)

  if (Number.isNaN(parsed.getTime())) {
    return null
  }

  return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate(), 12)
}

export function toIsoDate(value) {
  const date = parseLocalDate(value)

  if (!date) {
    return ''
  }

  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

export function addDays(value, amount) {
  const date = parseLocalDate(value)

  if (!date) {
    return ''
  }

  date.setDate(date.getDate() + amount)
  return toIsoDate(date)
}

export function getWeekStart(value = new Date()) {
  const date = parseLocalDate(value)

  if (!date) {
    return ''
  }

  const day = date.getDay() === 0 ? 7 : date.getDay()
  date.setDate(date.getDate() - day + 1)

  return toIsoDate(date)
}

export function getWeekEnd(weekStart) {
  return addDays(weekStart, 6)
}

export function isDateInWeek(dateValue, weekStart) {
  const date = toIsoDate(dateValue)
  const start = getWeekStart(weekStart)
  const end = getWeekEnd(start)

  return Boolean(date && start && end && date >= start && date <= end)
}

export function formatDisplayDate(value) {
  const date = parseLocalDate(value)

  if (!date) {
    return ''
  }

  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date)
}

export function formatWeekRange(weekStart) {
  const start = formatDisplayDate(weekStart)
  const end = formatDisplayDate(getWeekEnd(weekStart))

  return start && end ? `${start} - ${end}` : ''
}
